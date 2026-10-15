// -----------------------------------------------------------------------------
// The Dreo session file under /data: private, bound to the account.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from '../src/store.js';

async function tempStore(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dreo-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { store: new SessionStore(join(directory, 'data')), directory };
}

test('the session is written privately, without the e-mail address', async (t) => {
  const { store } = await tempStore(t);
  await store.save('User@Example.com', { token: 'tok', region: 'us' });
  const text = await readFile(store.path, 'utf8');
  assert.ok(!text.toLowerCase().includes('user@example.com'));
  assert.equal((await stat(store.path)).mode & 0o777, 0o600);
  assert.deepEqual(await store.load('user@example.com '), { token: 'tok', region: 'us' });
});

test('another account never gets the stored token', async (t) => {
  const { store } = await tempStore(t);
  await store.save('a@example.com', { token: 'tok', region: 'eu' });
  assert.equal(await store.load('b@example.com'), null);
});

test('a missing or broken file is no session', async (t) => {
  const { store } = await tempStore(t);
  assert.equal(await store.load('a@example.com'), null);
});
