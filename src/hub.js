// -----------------------------------------------------------------------------
// The hub: one Dreo account, its devices, and everything between them and
// Gladys.
//
//   start        log in (or reuse the stored token), list the devices, read
//                their states, publish them, open the WebSocket
//   WebSocket    every state a device reports is published at once (only the
//                changes: publishChangedStates); device-online/-offline drive
//                the transport badge and the `connection_changed` trigger
//   refresh      the container's own timer re-reads the states of the devices
//                added to Gladys over REST every 10 minutes: Gladys does not
//                poll external devices reliably (GladysAssistant/Gladys#3198),
//                and a WebSocket can miss an event. onPoll stays a fallback.
//   heartbeat    an unchanged value is sent again every 6 hours, so Gladys
//                never shows "no recent value"
//   commands     sent over the WebSocket, one at a time, acknowledged by the
//                cloud's control-reply/control-report
//
// Quiet logs: nothing at the info level for a normal cycle. A failure that
// repeats is logged once when it starts and once when it ends (IssueLog).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { DreoApi, DreoAuthError } from './dreo/api.js';
import { modelProfile } from './dreo/models.js';
import { DreoSocket, socketUrl } from './dreo/socket.js';
import {
  buildCommand,
  buildDevice,
  capabilities,
  currentMode,
  deviceIds,
  featureValues,
  isOn,
} from './devices.js';
import { MESSAGES, UserError } from './i18n.js';
import { IssueLog } from './issues.js';

const logger = createLogger({ name: 'dreo' });

export const TIMINGS = {
  refreshMs: 10 * 60_000,
  heartbeatMs: 6 * 60 * 60_000,
  ackMs: 4_000,
  retryMinMs: 60_000,
  retryMaxMs: 30 * 60_000,
  // A WebSocket that comes back triggers a REST re-read, at most this often.
  resyncGapMs: 60_000,
};

export const WIDGET_KEY = 'overview';
export const TRIGGER_CONNECTION = 'connection_changed';

const STATE_METHODS = new Set(['report', 'control-report', 'device-online']);
const ACK_METHODS = new Set(['control-reply', 'control-report']);

export class DreoHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store SessionStore (src/store.js)
   * @param {typeof fetch} [options.fetch] test seam
   * @param {(url: string) => WebSocket} [options.createSocket] test seam
   * @param {Partial<typeof TIMINGS>} [options.timings]
   * @param {object} [options.socketTimings]
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, fetch, createSocket, timings, socketTimings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetch;
    this.createSocket = createSocket;
    this.timings = { ...TIMINGS, ...timings };
    this.socketTimings = socketTimings;
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.api = null;
    this.socket = null;
    /** @type {Map<string, object>} supported devices by serial number */
    this.devices = new Map();
    /** Devices of the account this integration does not drive (model, name). */
    this.unsupported = [];
    this.issues = new IssueLog(logger);
    this.refreshTimer = null;
    this.retryTimer = null;
    this.retryDelay = this.timings.retryMinMs;
    this.lastRefreshAt = 0;
    this.authRefused = false;
    this.started = false;
    /** The command waiting for its acknowledgement. */
    this.pendingAck = null;
    this.commandQueue = Promise.resolve();
    this.generation = 0;
  }

  // --- Lifecycle -------------------------------------------------------------

  /** First start, or a start again with a new account. */
  async start(config) {
    this.stop();
    this.generation += 1;
    this.config = config;
    this.started = true;
    this.authRefused = false;
    this.retryDelay = this.timings.retryMinMs;
    if (!isConfigured(config)) {
      logger.info('Waiting for the Dreo account in the configuration');
      await this.status(false, MESSAGES.notConfigured);
      return;
    }
    const session = await this.store.load(config.email);
    this.api = new DreoApi({
      email: config.email,
      password: config.password,
      region: config.region,
      session,
      fetch: this.fetch,
      onSession: (fresh) => this.store.save(config.email, fresh),
    });
    await this.connectCloud();
  }

  /** Lists the devices and opens the WebSocket; retries later on failure. */
  async connectCloud() {
    const generation = this.generation;
    try {
      await this.discover();
    } catch (err) {
      if (generation !== this.generation) {
        return;
      }
      if (err instanceof DreoAuthError) {
        // A refused account is not retried: a loop of failed logins could
        // lock it. A new configuration or a search tries again.
        this.authRefused = true;
        this.issues.fail('auth', `Dreo refused the account (${err.message})`, 'error');
        await this.status(false, MESSAGES.authRefused);
        return;
      }
      this.issues.fail('cloud', `Dreo cloud unreachable, retrying (${err.message})`);
      await this.status(false, MESSAGES.unreachable);
      this.scheduleRetry();
      return;
    }
    if (generation !== this.generation) {
      return;
    }
    this.issues.recover('auth');
    this.issues.recover('cloud', 'Dreo cloud reachable again');
    this.retryDelay = this.timings.retryMinMs;
    await this.status(true);
    this.openSocket();
    this.scheduleRefresh();
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, this.timings.retryMaxMs);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connectCloud().catch((err) => logger.error(`Dreo start failed: ${err.message}`));
    }, delay);
  }

  /** New configuration: a new account starts over, anything else applies at once. */
  async reconfigure(config) {
    const previous = this.config;
    const accountChanged =
      !previous ||
      previous.email !== config.email ||
      previous.password !== config.password ||
      previous.region !== config.region;
    if (accountChanged || this.authRefused || !this.api) {
      await this.start(config);
      return;
    }
    this.config = config;
    if (previous.language !== config.language) {
      // Names of devices not added yet follow the new language.
      await this.publishDiscovered();
    }
  }

  stop() {
    this.started = false;
    this.generation += 1;
    clearTimeout(this.refreshTimer);
    clearTimeout(this.retryTimer);
    this.refreshTimer = null;
    this.retryTimer = null;
    this.socket?.stop();
    this.socket = null;
    if (this.pendingAck) {
      this.pendingAck.reject(new UserError('linkDown'));
      this.pendingAck = null;
    }
  }

  async status(connected, message) {
    this.lastStatus = { connected, message };
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.debug(`Cannot set the connection status: ${err.message}`);
    }
  }

  /** Gladys restarted: it may have lost the connection status. */
  async resendStatus() {
    if (this.lastStatus) {
      await this.status(this.lastStatus.connected, this.lastStatus.message);
    }
  }

  // --- Discovery -------------------------------------------------------------

  /** Reads the device list and every state, then publishes the devices. */
  async discover() {
    const entries = await this.api.listDevices();
    const devices = new Map();
    const unsupported = [];
    for (const entry of entries) {
      const sn = entry?.sn;
      if (!sn) {
        continue;
      }
      if (!modelProfile(entry)) {
        unsupported.push({ name: entry.deviceName ?? sn, model: entry.model ?? '?' });
        continue;
      }
      const state = await this.api.getState(sn);
      const profile = modelProfile(entry, state);
      const known = this.devices.get(sn);
      devices.set(sn, {
        sn,
        name: entry.deviceName || entry.productName || sn,
        model: entry.model,
        profile,
        caps: capabilities(profile, state),
        state,
        connected: state.connected !== false,
        refreshedAt: this.now(),
      });
      if (known) {
        // A device keeps the structure Gladys knows across rediscoveries: a
        // key missing from one answer must not drop (or add) a feature.
        devices.get(sn).caps = known.caps;
      }
    }
    const before = this.devices.size;
    this.devices = devices;
    this.unsupported = unsupported;
    this.lastRefreshAt = this.now();
    if (devices.size !== before || !this.loggedCount) {
      this.loggedCount = true;
      logger.info(
        `Connected to the Dreo cloud: ${devices.size} device(s) handled` +
          (unsupported.length ? `, ${unsupported.length} not supported` : ''),
      );
    }
    await this.publishDiscovered();
    await this.publishAll();
  }

  async publishDiscovered() {
    const devices = [...this.devices.values()].map((dev) =>
      buildDevice(this.gladys, dev, this.config.language),
    );
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.issues.recover('discovery', 'Gladys accepts the Dreo devices again');
    } catch (err) {
      this.issues.fail('discovery', `Gladys refused the Dreo devices (${err.message})`);
    }
  }

  /** Search requested from the Discovery tab or the "Refresh" action. */
  async rediscover() {
    if (!this.api || this.authRefused) {
      await this.start(this.config);
      return;
    }
    await this.discover();
  }

  // --- Devices added in Gladys -----------------------------------------------

  createdIds() {
    return new Set((this.gladys.devices ?? []).map((device) => device.external_id));
  }

  isCreated(dev, created = this.createdIds()) {
    return created.has(deviceIds(this.gladys, dev.sn).device);
  }

  findByExternalId(externalId) {
    for (const dev of this.devices.values()) {
      if (deviceIds(this.gladys, dev.sn).device === externalId) {
        return dev;
      }
    }
    return null;
  }

  /** The states of one device, published if they changed (or for the heartbeat). */
  async publishValues(dev) {
    const ids = deviceIds(this.gladys, dev.sn);
    const states = Object.entries(featureValues(dev)).map(([key, value]) => ({
      device_feature_external_id: ids.feature(key),
      ...value,
    }));
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.issues.recover('states', 'Gladys accepts the Dreo states again');
    } catch (err) {
      this.issues.fail('states', `Gladys refused the Dreo states (${err.message})`);
    }
  }

  async publishTransport(devs) {
    const entries = devs.map((dev) => ({
      external_id: deviceIds(this.gladys, dev.sn).device,
      transport: dev.connected ? 'cloud' : 'unreachable',
    }));
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
    } catch (err) {
      logger.debug(`Cannot publish the transport badges: ${err.message}`);
    }
  }

  /** Every added device: states and transport badge. */
  async publishAll() {
    const created = this.createdIds();
    const devs = [...this.devices.values()].filter((dev) => this.isCreated(dev, created));
    for (const dev of devs) {
      await this.publishValues(dev);
    }
    await this.publishTransport(devs);
  }

  /** The user added a device: send everything now (Gladys dropped the earlier states). */
  async onDeviceCreated(device) {
    const dev = this.findByExternalId(device?.external_id);
    if (!dev) {
      return;
    }
    await this.publishValues(dev);
    await this.publishTransport([dev]);
    this.requestWidgetRefresh();
  }

  requestWidgetRefresh() {
    this.gladys.requestWidgetRefresh?.(WIDGET_KEY)?.catch?.(() => {});
  }

  // --- Refresh (the container's own poller) ----------------------------------

  scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    if (!this.started) {
      return;
    }
    this.refreshTimer = setTimeout(async () => {
      this.refreshTimer = null;
      try {
        await this.refresh();
      } finally {
        this.scheduleRefresh();
      }
    }, this.timings.refreshMs);
  }

  /** Re-reads the states of the added devices over REST. Never throws. */
  async refresh({ only } = {}) {
    if (!this.api || this.authRefused) {
      return;
    }
    const created = this.createdIds();
    const devs = [...this.devices.values()].filter(
      (dev) => this.isCreated(dev, created) && (!only || dev === only),
    );
    this.lastRefreshAt = this.now();
    for (const dev of devs) {
      try {
        const state = await this.api.getState(dev.sn);
        dev.refreshedAt = this.now();
        this.applyState(dev, state, { replace: true });
        this.issues.recover('refresh', 'Dreo states readable again');
      } catch (err) {
        if (err instanceof DreoAuthError) {
          this.authRefused = true;
          this.issues.fail('auth', `Dreo refused the account (${err.message})`, 'error');
          await this.status(false, MESSAGES.authRefused);
          return;
        }
        this.issues.fail('refresh', `Cannot read the Dreo states (${err.message})`);
        return;
      }
      await this.publishValues(dev);
    }
  }

  /** Gladys' onPoll, a fallback: skipped when the timer read the device lately. */
  async poll(device) {
    const dev = this.findByExternalId(device?.external_id);
    if (!dev) {
      return;
    }
    if (this.now() - (dev.refreshedAt ?? 0) < this.timings.refreshMs / 2) {
      logger.debug(`${dev.name}: read lately, poll skipped`);
      return;
    }
    await this.refresh({ only: dev });
  }

  // --- WebSocket ---------------------------------------------------------------

  openSocket() {
    this.socket?.stop();
    const socket = new DreoSocket({
      getUrl: async () => {
        if (!this.api.token) {
          await this.api.login();
        }
        return socketUrl(this.api.region, this.api.token);
      },
      createSocket: this.createSocket,
      timings: this.socketTimings,
    });
    let wasOpen = false;
    socket.on('open', () => {
      const recovered = this.issues.recover('socket', 'Dreo live link back');
      if (wasOpen || recovered) {
        this.resyncAfterGap();
      }
      wasOpen = true;
    });
    socket.on('close', ({ opened, reason }) => {
      if (opened) {
        // The cloud closes idle links from time to time: not a problem yet.
        logger.debug(`Dreo live link closed (${reason}), reconnecting`);
        return;
      }
      this.issues.fail('socket', `Dreo live link unavailable (${reason}), retrying`);
      // The token may have expired: a REST call logs in again when it is
      // refused, and the next connection takes the new token.
      this.api.listDevices().catch(() => {});
    });
    socket.on('message', (message) => this.onMessage(message));
    this.socket = socket;
    socket.start();
  }

  /** Events missed while the link was down: read the states again. */
  resyncAfterGap() {
    if (this.now() - this.lastRefreshAt >= this.timings.resyncGapMs) {
      this.refresh().catch(() => {});
    }
  }

  onMessage(message) {
    const sn = message?.devicesn;
    const method = message?.method;
    const reported = message?.reported;
    if (this.pendingAck && this.pendingAck.sn === sn && ACK_METHODS.has(method)) {
      const ack = this.pendingAck;
      this.pendingAck = null;
      if (reported && typeof reported === 'object' && 'error_code' in reported) {
        ack.reject(new UserError('rejected', `error ${reported.error_code}`));
      } else {
        ack.resolve();
      }
    }
    const dev = this.devices.get(sn);
    if (!dev) {
      return;
    }
    if (method === 'device-offline') {
      this.setConnected(dev, false);
      return;
    }
    if (method === 'device-online') {
      this.setConnected(dev, true);
    }
    // control-reply is what the cloud accepted, not what the device did.
    if (!STATE_METHODS.has(method) || !reported || typeof reported !== 'object') {
      return;
    }
    this.applyState(dev, reported);
    if (this.isCreated(dev)) {
      this.publishValues(dev).catch(() => {});
    }
  }

  /** Merges a state into a device; publishes the side effects of a change. */
  applyState(dev, state, { replace = false } = {}) {
    const wasOn = isOn(dev);
    const wasMode = currentMode(dev);
    dev.state = replace ? { ...state } : { ...dev.state, ...state };
    if (typeof state.connected === 'boolean' && state.connected !== dev.connected) {
      this.setConnected(dev, state.connected);
    }
    if (isOn(dev) !== wasOn || currentMode(dev) !== wasMode) {
      this.requestWidgetRefresh();
    }
  }

  setConnected(dev, connected) {
    if (dev.connected === connected) {
      return;
    }
    dev.connected = connected;
    if (connected) {
      logger.info(`${dev.name}: back online`);
    } else {
      logger.info(`${dev.name}: offline`);
    }
    if (!this.isCreated(dev)) {
      return;
    }
    const externalId = deviceIds(this.gladys, dev.sn).device;
    this.publishTransport([dev]).catch(() => {});
    this.gladys
      .publishSceneEvent(TRIGGER_CONNECTION, {
        device: externalId,
        state: connected ? 'online' : 'offline',
        device_name: dev.name,
      })
      .catch((err) => logger.debug(`Cannot fire ${TRIGGER_CONNECTION}: ${err.message}`));
    this.requestWidgetRefresh();
  }

  // --- Commands ----------------------------------------------------------------

  /** Gladys' onSetValue: one line at the info level per user action. */
  async setValue(device, feature, value) {
    const dev = this.findByExternalId(device?.external_id);
    const language = this.config?.language ?? 'en';
    try {
      if (!dev) {
        throw new UserError('unknownDevice');
      }
      const key = String(feature?.external_id ?? '').slice(
        deviceIds(this.gladys, dev.sn).device.length + 1,
      );
      const params = buildCommand(dev, key, value, this.config);
      logger.info(`${dev.name}: ${key} → ${value}`);
      await this.send(dev, params);
    } catch (err) {
      if (err instanceof UserError) {
        logger.info(`${dev?.name ?? device?.external_id}: command refused (${err.message})`);
        throw new Error(err.in(language), { cause: err });
      }
      throw err;
    }
  }

  /**
   * Sends Dreo parameters to a device and waits for the cloud's
   * acknowledgement. Commands go one at a time, like the app.
   */
  send(dev, params) {
    const run = this.commandQueue.then(() => this.sendNow(dev, params));
    this.commandQueue = run.catch(() => {});
    return run;
  }

  async sendNow(dev, params) {
    if (!dev.connected) {
      throw new UserError('offline');
    }
    if (!this.socket?.isOpen) {
      throw new UserError('linkDown');
    }
    const acked = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingAck?.timer === timer) {
          this.pendingAck = null;
        }
        reject(new UserError('noAck'));
      }, this.timings.ackMs);
      this.pendingAck = {
        sn: dev.sn,
        timer,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
    });
    try {
      this.socket.send({ devicesn: dev.sn, method: 'control', params, timestamp: this.now() });
    } catch {
      this.pendingAck?.reject(new UserError('linkDown'));
      this.pendingAck = null;
    }
    await acked;
  }

  /**
   * Turns off every added device of the given kinds that is on (scene
   * action, widget button). Resolves with the count of devices turned off.
   */
  async turnAllOff(kinds = null) {
    const created = this.createdIds();
    let count = 0;
    const failures = [];
    for (const dev of this.devices.values()) {
      if (!this.isCreated(dev, created) || (kinds && !kinds.includes(group(dev.caps.kind)))) {
        continue;
      }
      if (isOn(dev) !== true || !dev.connected) {
        continue;
      }
      try {
        await this.send(dev, buildCommand(dev, 'power', 0, this.config));
        count += 1;
      } catch (err) {
        failures.push(`${dev.name}: ${err.message}`);
      }
    }
    logger.info(
      `Turn all off: ${count} device(s)` + (failures.length ? `, ${failures.length} failed` : ''),
    );
    if (failures.length > 0 && count === 0) {
      throw new Error(failures.join('; '));
    }
    return count;
  }

  /** The devices added to Gladys, for the widget. */
  createdDevices() {
    const created = this.createdIds();
    return [...this.devices.values()].filter((dev) => this.isCreated(dev, created));
  }

  get cloudUp() {
    return Boolean(this.api && !this.authRefused && this.socket?.isOpen);
  }
}

/** Scene action groups: fans, heaters, purifiers, humidifiers. */
export function group(kind) {
  return ['tower_fan', 'air_circulator', 'ceiling_fan'].includes(kind) ? 'fans' : `${kind}s`;
}
