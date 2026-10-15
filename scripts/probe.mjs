#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of the real Dreo cloud, with the integration's own client.
//
//   node scripts/probe.mjs                 a fake account: shows how Dreo refuses it
//   DREO_EMAIL=… DREO_PASSWORD=… node scripts/probe.mjs [eu|us]
//                                          a real account: lists the devices and the
//                                          keys of their states, opens the WebSocket
//                                          for 20 s and counts what it receives
//
// It never sends a command, never prints the password, the token nor the
// e-mail address, and prints the serial numbers shortened. The session is
// not stored.
// -----------------------------------------------------------------------------

import { DreoApi, DreoAuthError } from '../src/dreo/api.js';
import { modelProfile } from '../src/dreo/models.js';
import { capabilities } from '../src/devices.js';
import { socketUrl } from '../src/dreo/socket.js';

const region = process.argv[2] === 'us' ? 'us' : 'eu';
const email = process.env.DREO_EMAIL || 'gladys-probe@example.invalid';
const password = process.env.DREO_PASSWORD || 'not-a-real-password';
const real = Boolean(process.env.DREO_EMAIL && process.env.DREO_PASSWORD);
const short = (sn) => `${String(sn).slice(0, 4)}…`;

console.log(`Dreo probe, region tried first: ${region}, ${real ? 'real account' : 'fake account'}`);
const api = new DreoApi({ email, password, region });

try {
  const { region: actual } = await api.login();
  console.log(`Login accepted, account region: ${actual}`);
} catch (err) {
  const kind = err instanceof DreoAuthError ? 'refused' : 'failed';
  console.log(`Login ${kind}: ${err.message}`);
  process.exit(real ? 1 : 0);
}

const devices = await api.listDevices();
console.log(`${devices.length} device(s)`);
for (const entry of devices) {
  const profile = modelProfile(entry);
  if (!profile) {
    console.log(`- ${entry.model} (${short(entry.sn)}): not supported`);
    continue;
  }
  const state = await api.getState(entry.sn);
  const caps = capabilities(modelProfile(entry, state), state);
  console.log(`- ${entry.model} (${short(entry.sn)}): ${profile.kind}`);
  console.log(`  state keys: ${Object.keys(state).sort().join(', ')}`);
  console.log(
    `  features: ${Object.keys(caps)
      .filter((k) => k !== 'kind')
      .join(', ')}`,
  );
}

const ws = new WebSocket(socketUrl(api.region, api.token));
const methods = {};
ws.addEventListener('open', () =>
  console.log('WebSocket open, listening 20 s (change something in the app)'),
);
ws.addEventListener('message', (event) => {
  try {
    const { method } = JSON.parse(event.data);
    methods[method] = (methods[method] ?? 0) + 1;
  } catch {
    methods['(not JSON)'] = (methods['(not JSON)'] ?? 0) + 1;
  }
});
ws.addEventListener('close', (event) => console.log(`WebSocket closed (code ${event.code})`));
const keepalive = setInterval(() => ws.readyState === 1 && ws.send('2'), 15_000);
await new Promise((resolve) => setTimeout(resolve, 20_000));
clearInterval(keepalive);
console.log(`WebSocket messages by method: ${JSON.stringify(methods)}`);
ws.close();
