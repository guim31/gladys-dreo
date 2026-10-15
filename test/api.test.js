// -----------------------------------------------------------------------------
// REST client of the Dreo cloud, against the fake cloud.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DreoApi, DreoAuthError, flattenMixed, hashPassword } from '../src/dreo/api.js';
import { ACCOUNT, FakeDreoCloud } from './helpers/fakeDreo.js';

function apiFor(cloud, options = {}) {
  return new DreoApi({ ...ACCOUNT, fetch: cloud.fetch, ...options });
}

test('the login sends the MD5 of the password, never the password', async () => {
  const cloud = new FakeDreoCloud();
  const api = apiFor(cloud);
  await api.login();
  const [login] = cloud.calls;
  assert.equal(login.method, 'POST');
  assert.equal(login.body.password, hashPassword(ACCOUNT.password));
  assert.equal(login.body.grant_type, 'email-password');
  assert.ok(!JSON.stringify(cloud.calls).includes(ACCOUNT.password));
  assert.match(login.query.timestamp, /^\d+$/);
});

test('an account of the other region is followed there, and the session saved', async () => {
  const cloud = new FakeDreoCloud({ region: 'us' });
  const saved = [];
  const api = apiFor(cloud, { region: 'eu', onSession: async (s) => saved.push(s) });
  assert.deepEqual(await api.login(), { region: 'us' });
  assert.deepEqual(
    cloud.calls.map((c) => c.host),
    ['app-api-eu.dreo-tech.com', 'app-api-us.dreo-tech.com'],
  );
  assert.deepEqual(saved, [{ token: cloud.validToken, region: 'us' }]);
  const devices = await api.listDevices();
  assert.ok(devices.length > 10);
  assert.equal(cloud.calls.at(-1).host, 'app-api-us.dreo-tech.com');
});

test('a refused account is a DreoAuthError, without the address in the message', async () => {
  const cloud = new FakeDreoCloud();
  const api = apiFor(cloud, { password: 'wrong' });
  await assert.rejects(api.listDevices(), (err) => {
    assert.ok(err instanceof DreoAuthError);
    assert.ok(!err.message.includes(ACCOUNT.email));
    assert.ok(!err.message.includes('wrong'));
    return true;
  });
});

test('an expired token logs in again once, transparently', async () => {
  const cloud = new FakeDreoCloud();
  const api = apiFor(cloud);
  await api.listDevices();
  cloud.expireToken();
  const state = await api.getState('HTF017S_1');
  assert.equal(state.windlevel, 4);
  assert.equal(cloud.calls.filter((c) => c.path === '/api/oauth/login').length, 2);
});

test('a stored session is reused without logging in', async () => {
  const cloud = new FakeDreoCloud();
  await apiFor(cloud).login();
  const token = cloud.validToken;
  cloud.calls.length = 0;
  const api = apiFor(cloud, { session: { token, region: 'eu' } });
  await api.listDevices();
  assert.deepEqual(
    cloud.calls.map((c) => c.path),
    ['/api/v2/user-device/device/list'],
  );
});

test('an unreachable cloud is an error naming the cause, nothing more', async () => {
  const cloud = new FakeDreoCloud();
  cloud.unreachable = true;
  await assert.rejects(apiFor(cloud).login(), /unreachable \(ECONNREFUSED\)/);
});

test('concurrent calls share one login', async () => {
  const cloud = new FakeDreoCloud();
  const api = apiFor(cloud);
  await Promise.all([api.getState('HTF017S_1'), api.getState('HAF004S_1'), api.listDevices()]);
  assert.equal(cloud.calls.filter((c) => c.path === '/api/oauth/login').length, 1);
});

test('the { state, timestamp } entries are flattened', () => {
  assert.deepEqual(
    flattenMixed({
      poweron: { state: true, timestamp: 1 },
      wifi: 'x',
      timer: { state: { du: 0 } },
    }),
    { poweron: true, wifi: 'x', timer: { du: 0 } },
  );
  assert.deepEqual(flattenMixed(null), {});
});
