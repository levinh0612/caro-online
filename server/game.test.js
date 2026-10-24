import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io as connect } from 'socket.io-client';

// Chạy server thật ở cổng ngẫu nhiên, nói chuyện bằng socket.io-client (dev dep của client)
const PORT = 4100 + Math.floor(Math.random() * 500);
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

const client = async (id, pin = PIN) => {
  const s = connect(`http://localhost:${PORT}`, { forceNew: true });
  sockets.push(s);
  s.latest = null;
  s.on('state', (st) => (s.latest = st));
  await new Promise((r) => s.on('connect', r));
  s.call = (ev, p) => new Promise((r) => s.emit(ev, p, r));
  s.joinRes = await s.call('join', { playerId: id, pin });
  return s;
};
const tick = () => new Promise((r) => setTimeout(r, 60));

test('sai PIN bị từ chối', async () => {
  const s = await client('bad', 'nope');
  assert.equal(s.joinRes.ok, false);
  assert.equal(s.joinRes.badPin, true);
});

test('lobby → chọn phe → sẵn sàng → bắt đầu; chặn các trường hợp sai', async () => {
  const a = await client('a');
  const b = await client('b');
  assert.equal(a.latest.phase, 'lobby');

  // chưa chọn phe thì không đi cờ được
  a.emit('move', { row: 7, col: 7 });
  await tick();
  assert.equal(a.latest.board[7][7], null);

  assert.equal((await a.call('pick', { side: 'O' })).ok, true);
  const dup = await b.call('pick', { side: 'O' });
  assert.equal(dup.ok, false); // phe có người online
  assert.equal((await b.call('pick', { side: 'X' })).ok, true);

  a.emit('ready', true);
  await tick();
  assert.equal(a.latest.phase, 'lobby'); // mới 1 bên sẵn sàng
  b.emit('ready', true);
  await tick();
  assert.equal(a.latest.phase, 'playing');
  assert.equal(a.latest.turn, 'X');

  // đổi phe khi đang chơi bị từ chối
  assert.equal((await a.call('pick', { side: 'X' })).ok, false);

  // lượt: O không đi trước được, X đi được
  a.emit('move', { row: 0, col: 0 });
  b.emit('move', { row: 7, col: 7 });
  await tick();
  assert.equal(b.latest.board[0][0], null);
  assert.equal(b.latest.board[7][7], 'X');

  // ngắt kết nối rồi vào lại bằng cùng playerId → trả về đúng phe cũ
  a.disconnect();
  await tick();
  assert.equal(b.latest.players.O.online, false);
  const a2 = await client('a');
  await tick();
  assert.equal(a2.latest.players.O.online, true);
  assert.equal(a2.latest.board[7][7], 'X');

  // đầu hàng → đối thủ thắng; rematch đổi bên đi trước
  a2.emit('resign');
  await tick();
  assert.equal(b.latest.winner, 'X');
  b.emit('rematch');
  await tick();
  assert.equal(b.latest.winner, null);
  assert.equal(b.latest.turn, 'O');
});

test('máy mới ngồi thay phe đang vắng', async () => {
  // dựa trạng thái bài trước: a (O) và b (X) đang ở phòng; ngắt b rồi để máy mới ngồi thay
  const watcher = await client('c');
  const a = sockets.find((s) => s.latest && s.latest.players.O?.online && s !== watcher);
  assert.ok(a);
  assert.equal(watcher.latest.phase, 'playing');
  assert.equal((await watcher.call('pick', { side: 'X' })).ok, false); // X đang online
  sockets.filter((s) => s !== watcher && s !== a).forEach((s) => s.disconnect());
  await tick();
  assert.equal((await watcher.call('pick', { side: 'X' })).ok, true);
});

test('về sảnh: chặn giữa ván, sau ván kết thúc cả hai cùng về, giữ chỗ ngồi', async () => {
  // dựa trạng thái bài trước: c (X) online, phe O đang vắng => d ngồi thay
  const x = sockets.find((s) => s.connected);
  const o = await client('d');
  assert.equal((await o.call('pick', { side: 'O' })).ok, true);
  await tick();
  assert.equal(x.latest.phase, 'playing');

  x.emit('backToLobby');
  await tick();
  assert.equal(x.latest.phase, 'playing'); // đang chơi, cả hai online => bị chặn

  x.emit('resign');
  await tick();
  x.emit('backToLobby');
  await tick();
  for (const s of [x, o]) {
    assert.equal(s.latest.phase, 'lobby');
    assert.deepEqual(s.latest.ready, { X: false, O: false });
    assert.deepEqual(s.latest.score, { X: 0, O: 0 });
    assert.ok(s.latest.players.X && s.latest.players.O); // vẫn ngồi nguyên chỗ
  }
});
