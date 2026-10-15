// -----------------------------------------------------------------------------
// REST client of the Dreo cloud: the API the Dreo mobile app uses, as
// documented by pydreo (JeffSteinbok/hass-dreo, MIT). Three calls only:
// login, device list, state of one device. Commands go through the WebSocket
// (src/dreo/socket.js), like the app.
//
// The account region is EU or NA; each has its own host. The login answer
// names the account's real region: when it differs from the one tried, the
// login is done again on the right host (pydreo does the same).
//
// Never log a token, a password or an e-mail address: the error messages
// built here carry the HTTP status or the Dreo code and message only.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

// Public constants of the Dreo app, the same for every user (pydreo,
// custom_components/dreo/pydreo/helpers.py). They identify the app, not the user.
const CLIENT_ID = '7de37c362ee54dcf9c4561812309347a';
const CLIENT_SECRET = '32dfa0764f25451d99f94e1693498791';
const HIMEI = 'faede31549d649f58864093158787ec9';

const PATHS = {
  login: '/api/oauth/login',
  devices: '/api/v2/user-device/device/list',
  state: '/api/user-device/device/state',
};

const REQUEST_TIMEOUT_MS = 15_000;

/** Host of the REST API of a region ('eu' | 'us'). */
export function apiBaseUrl(region) {
  return `https://app-api-${region === 'us' ? 'us' : 'eu'}.dreo-tech.com`;
}

/** The login answer says 'EU' or 'NA'. */
export function regionFromAuth(authRegion) {
  return String(authRegion).toUpperCase() === 'EU' ? 'eu' : 'us';
}

/** The Dreo app sends the MD5 of the password, never the password itself. */
export function hashPassword(password) {
  return createHash('md5').update(String(password)).digest('hex');
}

/** The account or the password was refused: retrying will not help. */
export class DreoAuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DreoAuthError';
    this.code = code;
  }
}

/** The cloud could not be reached, or answered with an error. */
export class DreoApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DreoApiError';
    this.status = status;
  }
}

export class DreoApi {
  /**
   * @param {object} options
   * @param {string} options.email
   * @param {string} options.password
   * @param {string} [options.region] 'eu' | 'us', the first one tried
   * @param {{ token: string, region: string } | null} [options.session] a stored session
   * @param {(session: { token: string, region: string }) => Promise<void>} [options.onSession]
   * @param {typeof fetch} [options.fetch] test seam
   */
  constructor({ email, password, region = 'eu', session = null, onSession, fetch: fetchFn }) {
    this.email = email;
    this.password = password;
    this.region = session?.region ?? region;
    this.token = session?.token ?? null;
    this.onSession = onSession ?? (async () => {});
    this.fetch = fetchFn ?? globalThis.fetch;
    /** The login in progress, shared by concurrent callers. */
    this.loggingIn = null;
  }

  headers() {
    const headers = {
      ua: 'dreo/2.8.2',
      lang: 'en',
      'content-type': 'application/json; charset=UTF-8',
      'user-agent': 'okhttp/4.9.1',
    };
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  /** One HTTP call; resolves with the `data` of a `code: 0` answer. */
  async request(method, path, { query = {}, body } = {}) {
    const url = new URL(path, apiBaseUrl(this.region));
    for (const [key, value] of Object.entries({ ...query, timestamp: Date.now() })) {
      url.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new DreoApiError(`Dreo cloud unreachable (${err.cause?.code ?? err.name})`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new DreoApiError(`Dreo cloud refused the session (HTTP ${response.status})`, 401);
    }
    if (!response.ok) {
      throw new DreoApiError(`Dreo cloud answered HTTP ${response.status}`, response.status);
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new DreoApiError('Dreo cloud answered something that is not JSON', response.status);
    }
    if (payload?.code !== 0) {
      const error = new DreoApiError(
        `Dreo cloud error ${payload?.code ?? '?'} (${String(payload?.msg ?? 'no message').slice(0, 80)})`,
        response.status,
      );
      error.code = payload?.code;
      throw error;
    }
    return payload.data;
  }

  /** Logs in (again), following the region the account belongs to. */
  login() {
    if (!this.loggingIn) {
      this.loggingIn = this.doLogin().finally(() => {
        this.loggingIn = null;
      });
    }
    return this.loggingIn;
  }

  async doLogin() {
    if (!this.email || !this.password) {
      throw new DreoAuthError('E-mail address or password missing');
    }
    this.token = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let data;
      try {
        data = await this.request('POST', PATHS.login, {
          body: {
            acceptLanguage: 'en',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            email: this.email,
            encrypt: 'ciphertext',
            grant_type: 'email-password',
            himei: HIMEI,
            password: hashPassword(this.password),
            scope: 'all',
          },
        });
      } catch (err) {
        // A Dreo error code on the login itself is a refusal of the account
        // (unknown address, wrong password, locked account): not retried.
        if (err.code !== undefined || err.status === 401) {
          throw new DreoAuthError(`Dreo refused the login: ${err.message}`, err.code);
        }
        throw err;
      }
      const region = regionFromAuth(data?.region);
      if (region !== this.region && attempt === 0) {
        // The account lives in the other region: its token is issued there.
        this.region = region;
        continue;
      }
      if (typeof data?.access_token !== 'string' || data.access_token === '') {
        throw new DreoApiError('Dreo login answer without a token');
      }
      this.token = data.access_token;
      await this.onSession({ token: this.token, region: this.region });
      return { region: this.region };
    }
    throw new DreoApiError('Dreo login kept switching regions');
  }

  /** A call with the session, logging in first or again (expired token) when needed. */
  async authed(method, path, options) {
    if (!this.token) {
      await this.login();
    }
    try {
      return await this.request(method, path, options);
    } catch (err) {
      if (err.status !== 401) {
        throw err;
      }
      await this.login();
      return this.request(method, path, options);
    }
  }

  /** The devices of the account (raw entries of the app API). */
  async listDevices() {
    const data = await this.authed('GET', PATHS.devices, {
      query: { acceptLanguage: 'en', method: 'devices', pageNo: 1, pageSize: 100 },
    });
    return Array.isArray(data?.list) ? data.list : [];
  }

  /**
   * The state of one device: `{ key: value }`, flattened from the
   * `{ key: { state, timestamp } }` the API answers.
   */
  async getState(sn) {
    const data = await this.authed('GET', PATHS.state, {
      query: { acceptLanguage: 'en', deviceSn: sn },
    });
    return flattenMixed(data?.mixed);
  }
}

/** `{ poweron: { state: true, timestamp } }` → `{ poweron: true }`. */
export function flattenMixed(mixed) {
  const state = {};
  if (!mixed || typeof mixed !== 'object') {
    return state;
  }
  for (const [key, entry] of Object.entries(mixed)) {
    if (entry && typeof entry === 'object' && 'state' in entry) {
      state[key] = entry.state;
    } else {
      state[key] = entry;
    }
  }
  return state;
}
