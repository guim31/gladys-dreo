// -----------------------------------------------------------------------------
// The integration end to end, on the SDK's fake Gladys and the fake Dreo
// cloud: discovery, live states, the container's own refresh (no onPoll from
// the core, GladysAssistant/Gladys#3198), heartbeat, commands and their
// acknowledgement, heater safety, devices going offline, quiet logs, secrets.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { ACCOUNT, FakeDreoCloud, MemoryStore } from './helpers/fakeDreo.js';
import { createWorld, deviceOf, featureOf, settle } from './helpers/world.js';
import { MESSAGES } from '../src/i18n.js';

const TIMERS = { apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 };

/** Captures every log line (all levels) for the duration of a test. */
function captureLogs(t, level = 'debug') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  const lines = [];
  for (const stream of ['log', 'error']) {
    t.mock.method(console, stream, (...args) => lines.push(args.join(' ')));
  }
  return {
    lines,
    at: (lvl) => lines.filter((line) => line.includes(`[${lvl.toUpperCase()}]`)),
    clear: () => lines.splice(0),
  };
}

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const pollRequests = (gladys) => gladys.fake.wsMessages.filter((m) => /poll/i.test(m.type));

test('start: login, every device discovered, states and badges of the added ones', async (t) => {
  captureLogs(t, 'silent');
  const { gladys, cloud } = await world(t);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(gladys.fake.discoveredDevices.length, 19);
  const fan = deviceOf(gladys, 'HTF017S_1');
  assert.equal(fan.name, 'Tower Fan (DR-HTF017S)');
  assert.equal(fan.should_poll, false);
  assert.equal(gladys.fake.lastState(featureOf(fan, 'speed').external_id), 4);
  assert.equal(gladys.fake.lastState(featureOf(fan, 'mode').external_id), 'normal');
  assert.ok(
    gladys.fake.transports.some(
      (e) => e.device_external_id === fan.external_id && e.transport === 'cloud',
    ),
  );
  assert.equal(cloud.socket.readyState, 1, 'the live link is open');
});

test('nothing is published for devices the user did not add', async (t) => {
  captureLogs(t, 'silent');
  const { gladys } = await world(t, { created: false });
  assert.equal(gladys.fake.states.length, 0);
  assert.equal(gladys.fake.discoveredDevices.length, 19);
});

test('a state the device reports over the WebSocket is published at once', async (t) => {
  captureLogs(t, 'silent');
  const { gladys, cloud } = await world(t);
  const fan = deviceOf(gladys, 'HTF017S_1');
  cloud.report('HTF017S_1', { poweron: true, windlevel: 2 });
  await settle();
  assert.equal(gladys.fake.lastState(featureOf(fan, 'power').external_id), 1);
  assert.equal(gladys.fake.lastState(featureOf(fan, 'speed').external_id), 2);
  // control-reply is what the cloud accepted, never applied as a state.
  cloud.socket.receive({
    devicesn: 'HTF017S_1',
    method: 'control-reply',
    reported: { windlevel: 3 },
  });
  await settle();
  assert.equal(gladys.fake.lastState(featureOf(fan, 'speed').external_id), 2);
});

test('the container refreshes the states by itself, without any onPoll (Gladys#3198)', async (t) => {
  captureLogs(t, 'silent');
  t.mock.timers.enable(TIMERS);
  const { gladys, cloud } = await world(t);
  const fan = deviceOf(gladys, 'HTF017S_1');
  // A change the WebSocket missed.
  cloud.set('HTF017S_1', { windlevel: 1, temperature: 68 });
  t.mock.timers.tick(10 * 60_000 - 1);
  await settle();
  assert.equal(gladys.fake.lastState(featureOf(fan, 'speed').external_id), 4);
  t.mock.timers.tick(1);
  await settle(60);
  assert.equal(gladys.fake.lastState(featureOf(fan, 'speed').external_id), 1);
  assert.equal(gladys.fake.lastState(featureOf(fan, 'temperature').external_id), 20);
  assert.deepEqual(pollRequests(gladys), [], 'the core never polled');
});

test('only the changes are published, and a heartbeat every 6 hours', async (t) => {
  captureLogs(t, 'silent');
  t.mock.timers.enable(TIMERS);
  const { gladys } = await world(t);
  const fan = deviceOf(gladys, 'HTF017S_1');
  const speedId = featureOf(fan, 'speed').external_id;
  const count = () =>
    gladys.fake.states.filter((s) => s.device_feature_external_id === speedId).length;
  const first = count();
  for (let i = 0; i < 35; i += 1) {
    t.mock.timers.tick(10 * 60_000);
    await settle(60);
  }
  assert.equal(count(), first, 'nothing sent again while the value holds, under 6 hours');
  t.mock.timers.tick(10 * 60_000);
  await settle(60);
  assert.equal(count(), first + 1, 'the heartbeat, 6 hours later');
});

test("the core's onPoll is a fallback: skipped when the timer read the device lately", async (t) => {
  captureLogs(t, 'silent');
  t.mock.timers.enable(TIMERS);
  const { gladys, cloud } = await world(t);
  const fan = deviceOf(gladys, 'HTF017S_1');
  const reads = () => cloud.calls.filter((c) => c.query.deviceSn === 'HTF017S_1').length;
  const before = reads();
  assert.deepEqual(await gladys.fake.poll(fan), { success: true });
  assert.equal(reads(), before);
  t.mock.timers.tick(5 * 60_000);
  cloud.set('HTF017S_1', { windlevel: 3 });
  assert.deepEqual(await gladys.fake.poll(fan), { success: true });
  assert.equal(reads(), before + 1);
  assert.equal(gladys.fake.lastState(featureOf(fan, 'speed').external_id), 3);
});

test('a command goes over the WebSocket and its report updates Gladys', async (t) => {
  const logs = captureLogs(t, 'info');
  const { gladys, cloud } = await world(t);
  const fan = deviceOf(gladys, 'HTF017S_1');
  logs.clear();
  const ack = await gladys.fake.setValue(fan, featureOf(fan, 'mode'), 'sleep');
  assert.deepEqual(ack, { success: true });
  assert.deepEqual(cloud.commands.at(-1).params, { windtype: 3 });
  assert.equal(cloud.commands.at(-1).devicesn, 'HTF017S_1');
  await settle();
  assert.equal(gladys.fake.lastState(featureOf(fan, 'mode').external_id), 'sleep');
  assert.equal(logs.at('info').length, 1, 'one info line per user action');
});

test('a command the device refuses fails, in the configured language', async (t) => {
  captureLogs(t, 'silent');
  const { gladys, cloud } = await world(t, { config: { language: 'fr' } });
  cloud.commandBehavior = 'reject';
  const fan = deviceOf(gladys, 'HTF017S_1');
  const ack = await gladys.fake.setValue(fan, featureOf(fan, 'speed'), 2);
  assert.equal(ack.success, false);
  assert.equal(ack.error, MESSAGES.rejected.fr);
});

test('a command never acknowledged fails after 4 seconds', async (t) => {
  captureLogs(t, 'silent');
  t.mock.timers.enable(TIMERS);
  const { gladys, cloud } = await world(t, { config: { language: 'en' } });
  cloud.commandBehavior = 'silent';
  const fan = deviceOf(gladys, 'HTF017S_1');
  const pending = gladys.fake.setValue(fan, featureOf(fan, 'speed'), 2);
  await settle();
  t.mock.timers.tick(4_000);
  const ack = await pending;
  assert.equal(ack.success, false);
  assert.equal(ack.error, MESSAGES.noAck.en);
  // The next command is not blocked by the lost one.
  cloud.commandBehavior = 'ack';
  assert.deepEqual(await gladys.fake.setValue(fan, featureOf(fan, 'speed'), 3), { success: true });
});

test('heaters: turning on from Gladys is refused by default, off always works', async (t) => {
  captureLogs(t, 'silent');
  const { gladys, cloud } = await world(t, { config: { language: 'de' } });
  const heater = deviceOf(gladys, 'HSH004S_1');
  cloud.report('HSH004S_1', { poweron: false });
  await settle();
  const before = cloud.commands.length;
  const ack = await gladys.fake.setValue(heater, featureOf(heater, 'power'), 1);
  assert.equal(ack.success, false);
  assert.equal(ack.error, MESSAGES.heaterPowerOnRefused.de);
  assert.equal(cloud.commands.length, before, 'nothing sent to the heater');

  // The user opts in.
  await gladys.fake.configUpdated({ ...ACCOUNT, language: 'de', heater_remote_power_on: true });
  assert.deepEqual(await gladys.fake.setValue(heater, featureOf(heater, 'power'), 1), {
    success: true,
  });
  assert.deepEqual(await gladys.fake.setValue(heater, featureOf(heater, 'power'), 0), {
    success: true,
  });
  assert.deepEqual(
    cloud.commands.slice(before).map((c) => c.params),
    [{ poweron: true }, { poweron: false }],
  );
});

test('a device going offline: unreachable badge, trigger, commands refused, and back', async (t) => {
  captureLogs(t, 'silent');
  const { gladys, cloud } = await world(t, { config: { language: 'es' } });
  const fan = deviceOf(gladys, 'HAF004S_1');
  cloud.socket.receive({ devicesn: 'HAF004S_1', method: 'device-offline' });
  await settle();
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: fan.external_id,
    transport: 'unreachable',
  });
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: 'connection_changed',
    data: { device: fan.external_id, state: 'offline', device_name: fan.name },
  });
  const ack = await gladys.fake.setValue(fan, featureOf(fan, 'power'), 1);
  assert.equal(ack.error, MESSAGES.offline.es);

  cloud.socket.receive({
    devicesn: 'HAF004S_1',
    method: 'device-online',
    reported: { poweron: true },
  });
  await settle();
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
  assert.equal(gladys.fake.sceneEvents.at(-1).data.state, 'online');
  assert.equal(gladys.fake.lastState(featureOf(fan, 'power').external_id), 1);
});

test('quiet logs: a normal cycle writes nothing at the info level', async (t) => {
  t.mock.timers.enable(TIMERS);
  const { gladys, cloud } = await world(t);
  const logs = captureLogs(t, 'info');
  for (let i = 0; i < 40; i += 1) {
    cloud.report('HTF017S_1', { windlevel: (i % 4) + 1 });
    t.mock.timers.tick(10 * 60_000);
    await settle(60);
  }
  // The cloud closes an idle link: it comes back without a word.
  cloud.socket.close(1000);
  t.mock.timers.tick(5_000);
  await settle(60);
  assert.equal(cloud.socket.readyState, 1);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(logs.lines, []);
});

test('no secret in the logs, even at the debug level and through failures', async (t) => {
  const logs = captureLogs(t, 'debug');
  t.mock.timers.enable(TIMERS);
  const cloud = new FakeDreoCloud();
  const { gladys } = await world(t, { cloud });
  const fan = deviceOf(gladys, 'HTF017S_1');
  await gladys.fake.setValue(fan, featureOf(fan, 'speed'), 2);
  cloud.expireToken();
  cloud.socket.close(1006);
  t.mock.timers.tick(10 * 60_000);
  await settle(60);
  cloud.unreachable = true;
  t.mock.timers.tick(10 * 60_000);
  await settle(60);
  await gladys.fake.configUpdated({ ...ACCOUNT, password: 'another secret password' });
  await settle(60);
  const all = logs.lines.join('\n');
  assert.ok(logs.lines.length > 5, 'the scenario logs something at the debug level');
  for (const secret of [ACCOUNT.password, 'another secret password', ACCOUNT.email, 'secret']) {
    assert.ok(!all.includes(secret), `"${secret}" leaked into the logs`);
  }
  assert.ok(!/token-\d/.test(all), 'a token leaked into the logs');
});

test('a refused account: status in Gladys, one error line, no login loop', async (t) => {
  const logs = captureLogs(t, 'info');
  t.mock.timers.enable(TIMERS);
  const cloud = new FakeDreoCloud();
  const { gladys } = await world(t, { cloud, config: { password: 'wrong' } });
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.authRefused,
  });
  t.mock.timers.tick(24 * 60 * 60_000);
  await settle(60);
  assert.equal(cloud.calls.filter((c) => c.path === '/api/oauth/login').length, 1);
  assert.equal(logs.at('error').length, 1);
  // The user fixes the password.
  await gladys.fake.configUpdated({ ...ACCOUNT });
  await settle();
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(gladys.fake.discoveredDevices.length, 19);
});

test('an unreachable cloud at start: retried, one line when it starts, one when it ends', async (t) => {
  const logs = captureLogs(t, 'info');
  t.mock.timers.enable(TIMERS);
  const cloud = new FakeDreoCloud();
  cloud.unreachable = true;
  const { gladys } = await world(t, { cloud });
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.unreachable,
  });
  for (const delay of [60_000, 120_000]) {
    t.mock.timers.tick(delay);
    await settle(60);
  }
  assert.equal(logs.at('warn').length, 1, 'the failure, once');
  cloud.unreachable = false;
  t.mock.timers.tick(240_000);
  await settle(60);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(logs.lines.filter((l) => l.includes('reachable again')).length, 1);
});

test('without an account: a status asks for it, nothing is called', async (t) => {
  captureLogs(t, 'silent');
  const cloud = new FakeDreoCloud();
  const { gladys } = await world(t, { cloud, config: { email: '', password: '' } });
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.notConfigured,
  });
  assert.equal(cloud.calls.length, 0);
});

test('the session is stored and reused at the next start', async (t) => {
  captureLogs(t, 'silent');
  const cloud = new FakeDreoCloud();
  const store = new MemoryStore();
  const first = await world(t, { cloud, store });
  first.app.stop();
  assert.equal(store.session.token, cloud.validToken);
  cloud.calls.length = 0;
  await world(t, { cloud, store });
  assert.equal(cloud.calls.filter((c) => c.path === '/api/oauth/login').length, 0);
});

test('an expired token: the live link comes back with a new one', async (t) => {
  captureLogs(t, 'silent');
  t.mock.timers.enable(TIMERS);
  const { cloud } = await world(t);
  cloud.expireToken();
  cloud.socket.close(1006);
  await settle();
  // First attempt with the old token fails, the REST call logs in again.
  t.mock.timers.tick(5_000);
  await settle(60);
  t.mock.timers.tick(10_000);
  await settle(60);
  assert.equal(cloud.socket.readyState, 1);
  assert.ok(cloud.socket.url.includes(encodeURIComponent(cloud.validToken)));
});

test('the "Refresh the devices" action lists every device, supported or not', async (t) => {
  captureLogs(t, 'silent');
  const { gladys } = await world(t);
  const ack = await gladys.fake.action('refresh_devices');
  assert.equal(ack.success, true);
  const report = ack.data.message ?? ack.data;
  assert.match(report.fr, /^21 appareil\(s\) Dreo :/);
  assert.match(report.fr, /Tower Fan \(DR-HTF017S\)/);
  assert.match(report.en, /DR-HAC005S\), not supported yet/);
  assert.deepEqual(Object.keys(report), ['en', 'fr', 'de', 'es']);
});

test('widget: every device on one card, and "Turn all off"', async (t) => {
  captureLogs(t, 'silent');
  const { gladys, cloud } = await world(t);
  const ack = await gladys.fake.widgetGet('overview', { language: 'fr' });
  assert.equal(ack.success, true);
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items.length, 10);
  const hap = status.items.find((item) => item.label === 'Air Purifier (DR-HAP003S)');
  assert.ok(!hap || hap.value.startsWith('allumé'));

  const on = [...cloud.commands];
  const result = await gladys.fake.widgetAction('overview', 'all_off');
  assert.equal(result.success, true);
  const sent = cloud.commands.slice(on.length);
  assert.ok(sent.length >= 5, `devices turned off: ${sent.length}`);
  assert.match(result.data.message?.fr ?? result.data.fr, /appareil\(s\) éteint\(s\)/);
  for (const command of sent) {
    assert.ok(Object.values(command.params).every((v) => v === false));
  }
});

test('scene action: turn off the heaters only', async (t) => {
  captureLogs(t, 'silent');
  const { gladys, cloud } = await world(t);
  const before = cloud.commands.length;
  const ack = await gladys.fake.sceneAction('turn_off_all', { kinds: ['heaters'] });
  assert.equal(ack.success, true);
  const sent = cloud.commands.slice(before);
  assert.ok(sent.every((c) => c.devicesn.startsWith('HSH')));
  assert.equal(ack.data.count ?? ack.data.outputs?.count, sent.length);
  assert.ok(sent.length >= 2);
});
