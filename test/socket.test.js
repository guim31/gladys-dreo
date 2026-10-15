// -----------------------------------------------------------------------------
// The Dreo WebSocket link: keepalive, reconnection, silence watchdog.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DreoSocket, socketUrl } from '../src/dreo/socket.js';
import { FakeDreoCloud } from './helpers/fakeDreo.js';
import { settle } from './helpers/world.js';

test('the URL carries the token and the region host', () => {
  assert.equal(
    socketUrl('us', 'a b', 42),
    'wss://wsb-us.dreo-tech.com/websocket?accessToken=a%20b&timestamp=42',
  );
  assert.match(socketUrl('eu', 't'), /^wss:\/\/wsb-eu\.dreo-tech\.com\//);
});

test('keepalive "2" every 15 s, JSON messages emitted, other frames ignored', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const cloud = new FakeDreoCloud();
  cloud.validToken = 'tok';
  const socket = new DreoSocket({
    getUrl: async () => socketUrl('eu', 'tok'),
    createSocket: cloud.createSocket,
  });
  const messages = [];
  socket.on('message', (m) => messages.push(m));
  socket.start();
  await settle();
  assert.equal(socket.isOpen, true);
  t.mock.timers.tick(15_000);
  t.mock.timers.tick(15_000);
  assert.deepEqual(cloud.socket.sent, ['2', '2']);
  cloud.socket.receive('3');
  cloud.socket.receive({ devicesn: 'X', method: 'report', reported: { poweron: true } });
  assert.deepEqual(messages, [{ devicesn: 'X', method: 'report', reported: { poweron: true } }]);
  socket.stop();
});

test('a dropped link comes back, with a fresh URL each time', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const cloud = new FakeDreoCloud();
  cloud.validToken = 'tok';
  let urls = 0;
  const socket = new DreoSocket({
    getUrl: async () => {
      urls += 1;
      return socketUrl('eu', 'tok');
    },
    createSocket: cloud.createSocket,
  });
  const closes = [];
  socket.on('close', (c) => closes.push(c.opened));
  socket.start();
  await settle();
  cloud.socket.close(1001);
  assert.equal(socket.isOpen, false);
  t.mock.timers.tick(5_000);
  await settle();
  assert.equal(socket.isOpen, true);
  assert.equal(urls, 2);
  assert.deepEqual(closes, [true]);
  socket.stop();
});

test('failed connections back off up to 5 minutes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const cloud = new FakeDreoCloud();
  cloud.unreachable = true;
  const socket = new DreoSocket({
    getUrl: async () => socketUrl('eu', 'tok'),
    createSocket: cloud.createSocket,
  });
  socket.start();
  await settle();
  const delays = [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000];
  for (const delay of delays) {
    const before = cloud.sockets.length;
    t.mock.timers.tick(delay - 1);
    await settle();
    assert.equal(cloud.sockets.length, before, `no attempt before ${delay} ms`);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(cloud.sockets.length, before + 1, `an attempt after ${delay} ms`);
  }
  socket.stop();
});

test('a link silent for 10 minutes is opened again', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const cloud = new FakeDreoCloud();
  cloud.validToken = 'tok';
  const socket = new DreoSocket({
    getUrl: async () => socketUrl('eu', 'tok'),
    createSocket: cloud.createSocket,
    timings: { keepaliveMs: 60 * 60_000 },
  });
  socket.start();
  await settle();
  t.mock.timers.tick(10 * 60_000);
  await settle();
  assert.equal(cloud.sockets[0].readyState, 3);
  t.mock.timers.tick(5_000);
  await settle();
  assert.equal(cloud.sockets.length, 2);
  assert.equal(socket.isOpen, true);
  socket.stop();
});

test('sending on a closed link throws, stop closes for good', async () => {
  const cloud = new FakeDreoCloud();
  cloud.validToken = 'tok';
  const socket = new DreoSocket({
    getUrl: async () => socketUrl('eu', 'tok'),
    createSocket: cloud.createSocket,
  });
  assert.throws(() => socket.send({ a: 1 }), /link is down/);
  socket.start();
  await settle();
  socket.stop();
  await settle();
  assert.equal(cloud.sockets.length, 1);
  assert.throws(() => socket.send({ a: 1 }), /link is down/);
});
