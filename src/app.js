// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake
// Gladys) and returns the hub, so index.js stays a few lines and the tests
// drive the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DreoHub } from './hub.js';
import { MESSAGES, WORDS } from './i18n.js';
import { isConfigured, normalizeConfig } from './config.js';
import { SCENE_ACTIONS } from './scenes.js';
import { SessionStore } from './store.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'dreo-app' });

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, fetch, createSocket, timings, socketTimings, now
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new DreoHub({
    gladys,
    store: options.store ?? new SessionStore(),
    fetch: options.fetch,
    createSocket: options.createSocket,
    timings: options.timings,
    socketTimings: options.socketTimings,
    now: options.now,
  });

  // Resolved once the hub has started; every handler waits for it, so a
  // command arriving during the first discovery is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        // Gladys restarted: it may have lost states and statuses.
        await hub.resendStatus();
        await hub.publishDiscovered();
        await hub.publishAll();
        return;
      }
      started = true;
      await hub.start(config);
    } catch (err) {
      logger.error(`Initialization failed (${err.message})`);
      await gladys.setConnectionStatus(false, INIT_FAILED).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => hub.rediscover()));
  gladys.onSetValue(whenReady((device, feature, value) => hub.setValue(device, feature, value)));
  // Devices are published with should_poll: false; this only serves a Gladys
  // that would poll anyway (src/hub.js, refresh).
  gladys.onPoll(whenReady((device) => hub.poll(device)));
  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));
  gladys.onConfigUpdated(whenReady((config) => hub.reconfigure(normalizeConfig(config))));

  gladys.onAction(
    'refresh_devices',
    whenReady(async () => {
      logger.info('Refreshing the Dreo devices (user action)');
      await hub.rediscover();
      return refreshReport(hub);
    }),
  );

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => handler(hub, { fields })),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(hub, request)),
    );
    gladys.onWidgetAction(
      key,
      whenReady((actionKey, params, context = {}) =>
        widget.action(hub, { actionKey, params, ...context }),
      ),
    );
  }

  return { hub, ready, stop: () => hub.stop() };
}

/** The report shown under the "Refresh devices" button, in every language. */
export function refreshReport(hub) {
  if (!hub.config || !isConfigured(hub.config)) {
    return MESSAGES.notConfigured;
  }
  if (hub.authRefused) {
    return MESSAGES.authRefused;
  }
  const devices = [...hub.devices.values()];
  return Object.fromEntries(
    Object.entries(WORDS).map(([language, words]) => {
      if (devices.length === 0 && hub.unsupported.length === 0) {
        return [language, words.none];
      }
      const lines = [words.found(devices.length + hub.unsupported.length)];
      for (const dev of devices) {
        lines.push(`• ${dev.name} (${dev.model})${dev.connected ? '' : `, ${words.offline}`}`);
      }
      for (const dev of hub.unsupported) {
        lines.push(`• ${dev.name} (${dev.model}), ${words.unsupported}`);
      }
      return [language, lines.join('\n')];
    }),
  );
}
