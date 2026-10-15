// -----------------------------------------------------------------------------
// The WebSocket of the Dreo cloud (wss://wsb-<region>.dreo-tech.com), the one
// the app uses: devices push their state changes there ("report",
// "control-report", "device-online", "device-offline"), and commands go
// through it ("control"). Protocol from pydreo (commandtransport.py): the
// access token in the URL, a "2" keepalive every 15 s.
//
// The link reconnects by itself, with a growing delay. Before each new
// connection it asks its owner for the URL again: the token may have been
// renewed in between (src/hub.js logs in again when the REST API refuses it).
// A link silent for 10 minutes is closed and opened again: a half-open TCP
// connection would otherwise never notice it lost the cloud.
//
// Node 22+ provides WebSocket as a global: no dependency.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';

export const SOCKET_TIMINGS = {
  keepaliveMs: 15_000,
  silenceMs: 10 * 60_000,
  retryMinMs: 5_000,
  retryMaxMs: 5 * 60_000,
};

/** URL of the WebSocket of a region, with the session token. */
export function socketUrl(region, token, now = Date.now()) {
  const host = `wsb-${region === 'us' ? 'us' : 'eu'}.dreo-tech.com`;
  return `wss://${host}/websocket?accessToken=${encodeURIComponent(token)}&timestamp=${now}`;
}

/**
 * Events: 'open', 'message' (parsed JSON object), 'close' ({ opened }).
 */
export class DreoSocket extends EventEmitter {
  /**
   * @param {object} options
   * @param {() => Promise<string>} options.getUrl the URL to connect to (fresh token)
   * @param {(url: string) => WebSocket} [options.createSocket] test seam
   * @param {Partial<typeof SOCKET_TIMINGS>} [options.timings]
   */
  constructor({ getUrl, createSocket, timings = {} }) {
    super();
    this.getUrl = getUrl;
    this.createSocket = createSocket ?? ((url) => new WebSocket(url));
    this.timings = { ...SOCKET_TIMINGS, ...timings };
    this.ws = null;
    this.isOpen = false;
    this.stopped = true;
    this.retryDelay = this.timings.retryMinMs;
    this.retryTimer = null;
    this.keepaliveTimer = null;
    this.silenceTimer = null;
  }

  start() {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.retryDelay = this.timings.retryMinMs;
    this.connect();
  }

  async connect() {
    this.retryTimer = null;
    if (this.stopped) {
      return;
    }
    let url;
    try {
      url = await this.getUrl();
    } catch (err) {
      this.emit('close', { opened: false, reason: err.message });
      this.scheduleRetry();
      return;
    }
    if (this.stopped) {
      return;
    }
    let ws;
    try {
      ws = this.createSocket(url);
    } catch (err) {
      this.emit('close', { opened: false, reason: err.message });
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    let opened = false;
    ws.addEventListener('open', () => {
      if (this.ws !== ws) {
        return;
      }
      opened = true;
      this.isOpen = true;
      this.retryDelay = this.timings.retryMinMs;
      this.keepaliveTimer = setInterval(() => this.sendRaw('2'), this.timings.keepaliveMs);
      this.armSilence();
      this.emit('open');
    });
    ws.addEventListener('message', (event) => {
      if (this.ws !== ws) {
        return;
      }
      this.armSilence();
      const text = typeof event.data === 'string' ? event.data : String(event.data);
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return; // keepalive answers and other non-JSON frames
      }
      if (message && typeof message === 'object') {
        this.emit('message', message);
      }
    });
    // 'error' is always followed by 'close': the close handler does the work.
    ws.addEventListener('error', () => {});
    ws.addEventListener('close', (event) => {
      if (this.ws !== ws) {
        return;
      }
      this.cleanup();
      this.emit('close', { opened, reason: `code ${event?.code ?? '?'}` });
      this.scheduleRetry();
    });
  }

  armSilence() {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      // Nothing heard for too long: start over on a new connection.
      try {
        this.ws?.close();
      } catch {
        // already closing
      }
    }, this.timings.silenceMs);
  }

  cleanup() {
    clearInterval(this.keepaliveTimer);
    clearTimeout(this.silenceTimer);
    this.keepaliveTimer = null;
    this.silenceTimer = null;
    this.isOpen = false;
    this.ws = null;
  }

  scheduleRetry() {
    if (this.stopped || this.retryTimer) {
      return;
    }
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, this.timings.retryMaxMs);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  sendRaw(text) {
    if (!this.isOpen || !this.ws) {
      return false;
    }
    try {
      this.ws.send(text);
      return true;
    } catch {
      return false;
    }
  }

  /** Sends a JSON message; throws when the link is down. */
  send(message) {
    if (!this.sendRaw(JSON.stringify(message))) {
      throw new Error('Dreo cloud link is down');
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.cleanup();
    try {
      ws?.close();
    } catch {
      // already closed
    }
  }
}
