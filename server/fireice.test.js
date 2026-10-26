import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io as connect } from 'socket.io-client';

const PORT = 4700 + Math.floor(Math.random() * 200);
const PIN = 'test-pin';
let proc;
const sockets = [];

before(async () => {
  proc = spawn(process.execPath, ['index.js'], {
    cwd: import.meta.dirname,
    env: { ...process.env, PORT: String(PORT), ROOM_PIN: PIN },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res) => proc.stdout.on('data', (d) => String(d).includes('listening') && res()));
});
after(() => {
  sockets.forEach((s) => s.disconnect());
  proc.kill();
});

const until = async (fn, ms = 1500) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail('hết thời gian chờ');
};

async function client(id, pin = PIN) {
  const s = connect(`http://localhost:${PORT}/fireice`, { forceNew: true });
  sockets.push(s);
  s.latest = null;
  s.positions = [];
  s.on('state', (st) => (s.latest = st));
  s.on('joined', ({ seat }) => (s.seat = seat));
  s.on('pos', (p) => s.positions.push(p));
  await new Promise((r) => s.on('connect', r));
  s.ack = (event, payload) => new Promise((r) => s.emit(event, payload, r));
  s.joinRes = await s.ack('join', { playerId: id, pin });
  return s;
}

test('sai PIN bị từ chối', async () => {
  const s = await client('bad', 'nope');
  assert.equal(s.joinRes.ok, false);
  assert.equal(s.joinRes.badPin, true);
});

test('một ván: chọn vai, sẵn sàng, chuyển vị trí, chết, qua màn, về sảnh', async () => {
  const a = await client('fi-a');
  const b = await client('fi-b');
  assert.equal(a.joinRes.ok, true);

  assert.equal((await a.ack('pick', { side: 'fire' })).ok, true);
  assert.equal((await b.ack('pick', { side: 'fire' })).ok, false, 'trùng vai phải bị từ chối');
  assert.equal((await b.ack('pick', { side: 'ice' })).ok, true);

  a.emit('ready', true);
  b.emit('ready', true);
  await until(() => a.latest?.phase === 'playing');
  const n0 = a.latest.nonce;
  assert.equal(a.latest.level, 0);

  // vị trí của Lửa tới được Băng, và ngược lại không
  a.emit('pos', { x: 3.5, y: 8, face: -1 });
  a.emit('pos', { x: 'abc', y: 1 }); // rác thì bỏ
  await until(() => b.positions.length > 0);
  assert.deepEqual(b.positions[0], { x: 3.5, y: 8, face: -1 });
  assert.equal(a.positions.length, 0);

  // chết: nonce tăng; tin "chết" cũ (nonce lệch) bị bỏ
  a.emit('died', { nonce: n0 });
  await until(() => a.latest.nonce === n0 + 1);
  assert.deepEqual(a.latest.event, { type: 'died', by: 'fire' });
  b.emit('died', { nonce: n0 });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(a.latest.nonce, n0 + 1, 'tin chết trễ không được tính lần hai');

  // qua màn: cần cả hai cùng đứng ở cửa thoát
  const n1 = a.latest.nonce;
  a.emit('exit', { value: true, nonce: n1 });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(a.latest.level, 0, 'một mình chưa qua màn');
  b.emit('exit', { value: true, nonce: n1 });
  await until(() => a.latest.level === 1);
  assert.equal(a.latest.event.type, 'win');
  assert.equal(a.latest.nonce, n1 + 1);

  b.emit('backToLobby');
  await until(() => a.latest.phase === 'lobby');
  assert.equal(a.latest.level, 0);

  // dọn phòng cho test sau (phòng dùng chung)
  a.disconnect();
  b.disconnect();
  await new Promise((r) => setTimeout(r, 100));
});

test('rớt mạng rồi vào lại cùng playerId thì giữ vai cũ', async () => {
  const a = await client('fi-c');
  await a.ack('pick', { side: 'ice' });
  a.disconnect();
  const again = await client('fi-c');
  await until(() => again.seat === 'ice');
});
