// -----------------------------------------------------------------------------
// A fake Dreo cloud for the tests: the REST API (login, device list, state)
// as a `fetch` replacement, and the WebSocket as a `createSocket` replacement.
// It answers from test/fixtures/dreo (real answers published by pydreo,
// anonymized) and plays the cloud's side of a command: control-reply, then
// control-report with the new values. No network: tests never leave the process.
// -----------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const FIXTURES = new URL('../fixtures/dreo/', import.meta.url);

export const ACCOUNT = { email: 'user@example.com', password: 'correct horse battery staple' };

export function loadDeviceList() {
  return JSON.parse(readFileSync(new URL('devices.json', FIXTURES), 'utf8')).data.list;
}

export function loadStates() {
  const states = {};
  for (const file of readdirSync(new URL('states/', FIXTURES))) {
    const body = JSON.parse(readFileSync(new URL(`states/${file}`, FIXTURES), 'utf8'));
    states[body.data.sn] = body.data.mixed;
  }
  return states;
}

const json = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

class FakeSocket extends EventTarget {
  constructor(cloud, url) {
    super();
    this.cloud = cloud;
    this.url = url;
    this.sent = [];
    this.readyState = 0;
  }

  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }

  send(text) {
    if (this.readyState !== 1) {
      throw new Error('not open');
    }
    this.sent.push(text);
    if (text === '2') {
      return;
    }
    this.cloud.onCommand(this, JSON.parse(text));
  }

  receive(message) {
    const event = new Event('message');
    event.data = typeof message === 'string' ? message : JSON.stringify(message);
    this.dispatchEvent(event);
  }

  close(code = 1000) {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    const event = new Event('close');
    event.code = code;
    this.dispatchEvent(event);
  }
}

export class FakeDreoCloud {
  constructor({ region = 'eu', devices = loadDeviceList(), states = loadStates() } = {}) {
    this.accountRegion = region; // where the account lives
    this.devices = structuredClone(devices);
    this.states = structuredClone(states);
    this.tokenCount = 0;
    this.validToken = null;
    this.calls = [];
    this.sockets = [];
    this.unreachable = false;
    // 'ack' (reply + report), 'reject', 'silent'
    this.commandBehavior = 'ack';
    this.autoOpen = true;
    this.fetch = this.fetch.bind(this);
    this.createSocket = this.createSocket.bind(this);
  }

  get socket() {
    return this.sockets[this.sockets.length - 1];
  }

  /** The current state of a device in the `{ key: value }` form. */
  flat(sn) {
    return Object.fromEntries(
      Object.entries(this.states[sn] ?? {}).map(([key, entry]) => [
        key,
        entry && typeof entry === 'object' && 'state' in entry ? entry.state : entry,
      ]),
    );
  }

  set(sn, values) {
    for (const [key, value] of Object.entries(values)) {
      this.states[sn][key] = { state: value, timestamp: 1 };
    }
  }

  async fetch(input, init = {}) {
    const url = new URL(input);
    const call = {
      method: init.method,
      host: url.host,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    this.calls.push(call);
    if (this.unreachable) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    const hostRegion = url.host.startsWith('app-api-us') ? 'us' : 'eu';
    if (call.path === '/api/oauth/login') {
      const body = call.body;
      const md5 = createHash('md5').update(ACCOUNT.password).digest('hex');
      if (body.email !== ACCOUNT.email || body.password !== md5 || body.client_id === undefined) {
        return json(200, { code: 11013, msg: 'Incorrect email or password', data: null });
      }
      const region = this.accountRegion === 'us' ? 'NA' : 'EU';
      if (hostRegion !== this.accountRegion) {
        return json(200, { code: 0, msg: 'OK', data: { region, access_token: 'wrong-region' } });
      }
      this.tokenCount += 1;
      this.validToken = `token-${this.tokenCount}-secret`;
      return json(200, { code: 0, msg: 'OK', data: { region, access_token: this.validToken } });
    }
    if (
      call.headers.authorization !== `Bearer ${this.validToken}` ||
      hostRegion !== this.accountRegion
    ) {
      return json(401, { code: 401, msg: 'Unauthorized' });
    }
    if (call.path === '/api/v2/user-device/device/list') {
      return json(200, { code: 0, msg: 'OK', data: { list: structuredClone(this.devices) } });
    }
    if (call.path === '/api/user-device/device/state') {
      const mixed = this.states[call.query.deviceSn];
      if (!mixed) {
        return json(200, { code: 404, msg: 'device not found' });
      }
      return json(200, { code: 0, msg: 'OK', data: { mixed: structuredClone(mixed) } });
    }
    return json(404, { code: 404 });
  }

  /** Token expired at Dreo: the next REST call is refused. */
  expireToken() {
    this.validToken = 'expired';
  }

  createSocket(url) {
    const socket = new FakeSocket(this, url);
    this.sockets.push(socket);
    const token = new URL(url).searchParams.get('accessToken');
    queueMicrotask(() => {
      if (!this.autoOpen || this.unreachable || token !== this.validToken) {
        socket.close(1006);
        return;
      }
      socket.open();
    });
    return socket;
  }

  /** A device pushes a state change. */
  report(sn, reported, method = 'report') {
    this.set(sn, reported);
    this.socket.receive({ devicesn: sn, method, reported });
  }

  onCommand(socket, message) {
    if (message.method !== 'control' || this.commandBehavior === 'silent') {
      return;
    }
    const sn = message.devicesn;
    queueMicrotask(() => {
      if (this.commandBehavior === 'reject') {
        socket.receive({
          devicesn: sn,
          method: 'control-reply',
          reported: { error_code: 500003, error_msg: 'instruction validate failed' },
        });
        return;
      }
      socket.receive({ devicesn: sn, method: 'control-reply', reported: message.params });
      this.set(sn, message.params);
      socket.receive({ devicesn: sn, method: 'control-report', reported: message.params });
    });
  }

  /** The commands the integration sent: [{ devicesn, params }]. */
  get commands() {
    return this.sockets
      .flatMap((socket) => socket.sent)
      .filter((text) => text !== '2')
      .map((text) => JSON.parse(text))
      .filter((message) => message.method === 'control');
  }
}

/** A session store in memory (the real one writes under /data). */
export class MemoryStore {
  constructor(initial = null) {
    this.session = initial;
    this.saves = [];
  }

  async load() {
    return this.session;
  }

  async save(_email, session) {
    this.session = session.token ? { ...session } : null;
    this.saves.push(session);
  }
}
