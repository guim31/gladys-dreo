// -----------------------------------------------------------------------------
// A connected world for the tests: the SDK's fake Gladys, the fake Dreo cloud
// (fixtures of test/fixtures/dreo) and the integration wired between them.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { ACCOUNT, FakeDreoCloud, MemoryStore } from './fakeDreo.js';

/** Let the microtasks and the immediate callbacks run (fake socket, acks). */
export async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * @param {object} [options]
 * @param {object} [options.config] merged over the test account
 * @param {boolean} [options.created] the user added every discovered device
 * @param {FakeDreoCloud} [options.cloud]
 * @param {object} [options.store]
 * @param {object} [options.timings] hub timings
 */
export async function createWorld({
  config = {},
  created = true,
  cloud = new FakeDreoCloud(),
  store = new MemoryStore(),
  timings,
  socketTimings,
} = {}) {
  const gladys = createFakeGladys({ config: { ...ACCOUNT, ...config } });
  const app = registerHandlers(gladys, {
    fetch: cloud.fetch,
    createSocket: cloud.createSocket,
    store,
    timings,
    socketTimings,
  });
  await gladys.connect();
  await settle();
  if (created) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(device);
    }
    await settle();
  }
  return { gladys, app, hub: app.hub, cloud, store };
}

/** The discovered device built from a fixture serial number. */
export function deviceOf(gladys, sn) {
  return gladys.fake.discoveredDevices.find((device) => device.external_id.endsWith(`:dreo:${sn}`));
}

/** One feature of a discovered device, by key. */
export function featureOf(device, key) {
  return device.features.find((feature) => feature.external_id === `${device.external_id}:${key}`);
}
