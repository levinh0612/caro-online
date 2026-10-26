import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, parseLevel, newBody, step, pressedPlates, isDead, atExit, collectGems, countGems } from './engine.js';
import { LEVELS } from './levels.js';
import { solve } from './solver.js';

// Màn mẫu cố định cho các test vật lý (không phụ thuộc màn thật trong levels.js, vốn được chỉnh độ khó thường xuyên)
const FIXTURE = [
  [
    '################',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..........gh..#',
    '#.........####.#',
    '#..............#',
    '#.............##',
    '#FI.......fi..##',
    '####LL#WW#######',
    '################',
  ],
  [
    '################',
    '#.......#......#',
    '#.......#......#',
    '#.......#......#',
    '#.......#......#',
    '#.......#......#',
    '#..g.h..#..g.h.#',
    '#.......A......#',
    '#.FI.a..A..a.fi#',
    '################',
    '################',
  ],
];

const none = { left: false, right: false, jump: false };
const noPlates = new Set();

// chạy `seconds` giây với input cố định
function run(lv, b, input, seconds, plates = () => noPlates) {
  for (let t = 0; t < seconds; t += DT) step(lv, b, input, plates(), DT);
}

const level = (i) => parseLevel(FIXTURE[i]);
const spawnOf = (lv, who) => newBody(lv.spawn[who]);

test('mọi màn: kích thước đúng, đủ chỗ xuất hiện và cửa thoát', () => {
  for (const { name, rows } of LEVELS) {
    assert.ok(rows.every((r) => r.length === rows[0].length), `${name}: hàng lệch độ dài`);
    const flat = rows.join('');
    for (const ch of 'FIfi') assert.equal([...flat].filter((c) => c === ch).length, 1, `${name}: ký hiệu ${ch}`);
  }
});

test('rơi xuống rồi đứng yên trên sàn', () => {
  const lv = level(0);
  const b = spawnOf(lv, 'fire');
  run(lv, b, none, 1);
  assert.equal(b.onGround, true);
  const y = b.y;
  run(lv, b, none, 1);
  assert.ok(Math.abs(b.y - y) < 1e-3);
});

test('nhảy được ~2 ô nhưng không quá 3 ô', () => {
  const lv = level(0);
  const b = spawnOf(lv, 'fire');
  run(lv, b, none, 0.5);
  const floorY = b.y;
  let top = floorY;
  for (let t = 0; t < 1.2; t += DT) {
    step(lv, b, { ...none, jump: t < 0.05 }, noPlates, DT);
    top = Math.min(top, b.y);
  }
  const height = floorY - top;
  assert.ok(height > 2 && height < 3, `cao ${height}`);
});

test('đi sang phải bị tường chặn, không xuyên', () => {
  const lv = level(0);
  const b = spawnOf(lv, 'fire');
  run(lv, b, { ...none, right: true }, 6);
  assert.ok(b.x + 0.7 <= lv.w - 1 + 1e-6);
});

test('Lửa chết ở nước, sống ở dung nham; Băng ngược lại', () => {
  const lv = level(0);
  const inLava = { x: 4.15, y: 9.1 };
  const inWater = { x: 7.15, y: 9.1 };
  assert.equal(isDead(lv, newBody(inLava), 'ice'), true);
  assert.equal(isDead(lv, newBody(inLava), 'fire'), false);
  assert.equal(isDead(lv, newBody(inWater), 'fire'), true);
  assert.equal(isDead(lv, newBody(inWater), 'ice'), false);
});

test('cửa thoát chỉ nhận đúng nhân vật', () => {
  const lv = level(0);
  const onFireExit = newBody({ x: 10.15, y: 8.1 });
  assert.equal(atExit(lv, onFireExit, 'fire'), true);
  assert.equal(atExit(lv, onFireExit, 'ice'), false);
});

test('nút đạp: có người đứng thì cửa mở, hết thì đóng', () => {
  const lv = level(1);
  const fire = spawnOf(lv, 'fire');
  // đứng lên nút 'a' ở cột 5
  Object.assign(fire, { x: 5.15, y: 8.1 });
  assert.deepEqual([...pressedPlates(lv, [fire])], ['a']);
  assert.deepEqual([...pressedPlates(lv, [spawnOf(lv, 'ice')])], []);
});

test('cửa đóng chặn đường, mở thì đi qua được', () => {
  const lv = level(1);

  const closed = spawnOf(lv, 'fire');
  Object.assign(closed, { x: 6.5, y: 8.1 });
  run(lv, closed, { ...none, right: true }, 2, () => noPlates);
  assert.ok(closed.x < 8, `đã xuyên cửa đóng: x=${closed.x}`);

  const open = spawnOf(lv, 'fire');
  Object.assign(open, { x: 6.5, y: 8.1 });
  run(lv, open, { ...none, right: true }, 2, () => new Set(['a']));
  assert.ok(open.x > 9, `không qua được cửa mở: x=${open.x}`);
});

test('màn 2: giải được theo đúng ý đồ (một người giữ nút, người kia qua rồi giữ nút bên phải)', () => {
  const lv = level(1);
  const fire = spawnOf(lv, 'fire');
  const ice = spawnOf(lv, 'ice');
  run(lv, fire, none, 0.5);
  run(lv, ice, none, 0.5);

  // Băng đi sang phải 2 ô, đạp nút a bên trái (cột 5)
  while (!pressedPlates(lv, [ice]).has('a')) step(lv, ice, { ...none, right: true }, noPlates, DT);
  // Lửa chạy qua cửa (đang mở nhờ Băng) tới nút a bên phải (cột 11)
  for (let t = 0; t < 6 && fire.x < 11.2; t += DT) {
    step(lv, fire, { ...none, right: true }, pressedPlates(lv, [ice, fire]), DT);
  }
  assert.ok(pressedPlates(lv, [fire]).has('a'), 'Lửa không tới được nút bên phải');
  assert.ok(fire.x > 9);

  // Băng rời nút, đi qua cửa (vẫn mở nhờ Lửa), tới cửa thoát
  for (let t = 0; t < 8; t += DT) {
    step(lv, ice, { ...none, right: true }, pressedPlates(lv, [ice, fire]), DT);
  }
  assert.ok(ice.x > 12, `Băng chưa qua được: x=${ice.x}`);
});

test('gem: chỉ nhặt đúng loại, mỗi viên một lần', () => {
  const lv = level(0);
  assert.equal(countGems(lv, 'fire'), 1);
  assert.equal(countGems(lv, 'ice'), 1);
  const onGem = newBody({ x: 11.15, y: 4.1 }); // gem 'g' ở ô (11, 4)
  const got = new Set();
  assert.deepEqual(collectGems(lv, onGem, 'ice', got), [], 'Băng không nhặt gem của Lửa');
  assert.deepEqual(collectGems(lv, onGem, 'fire', got), [[11, 4]]);
  assert.deepEqual(collectGems(lv, onGem, 'fire', got), [], 'không nhặt lần hai');
});

test('mọi gem đều với tới được: nhảy từ sàn lên bậc thang rồi lên bệ (màn 1)', () => {
  // bậc 2 ô ở cột 14 (mặt trên y=7), bệ ở cột 10-13 (mặt trên y=5)
  const lv = level(0);
  const b = spawnOf(lv, 'fire');
  Object.assign(b, { x: 12.65, y: 8.1 });
  const climb = (input, done) => {
    for (let t = 0; t < 2; t += DT) {
      step(lv, b, input, noPlates, DT);
      if (b.onGround && done()) return true;
    }
    return false;
  };
  assert.ok(climb({ right: true, jump: true }, () => b.y < 6.2), `không lên được bậc: x=${b.x} y=${b.y}`);
  run(lv, b, { ...none, right: true }, 0.2); // nhích sát tường phải để đầu không vướng gầm bệ
  // nhảy thẳng lên (cột 14 trống phía trên) tới đỉnh nhảy (cao hơn bệ), rồi mới trôi sang trái
  for (let t = 0; t < 1 && !(b.vy >= 0 && !b.onGround && t > 0.1); t += DT) step(lv, b, { ...none, jump: true }, noPlates, DT);
  assert.ok(climb({ left: true }, () => b.y < 4.2), `không lên được bệ: x=${b.x} y=${b.y}`);
  assert.ok(b.x > 10 && b.x < 14, `lạc khỏi bệ: x=${b.x}`);
});

test('đúng 10 màn, tên không trùng', () => {
  assert.equal(LEVELS.length, 10);
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, 10);
});

// Bộ giải chạy lại vật lý thật của engine: mỗi màn phải có đường thắng và nhặt được mọi gem
for (const [i, { name, rows }] of LEVELS.entries()) {
  test(`màn ${i + 1} (${name}): qua được và gem đều với tới`, () => {
    const r = solve(rows);
    assert.ok(r.solvable, 'không có đường thắng');
    assert.deepEqual(r.gems.fire[0], r.gems.fire[1], 'có gem Lửa không với tới');
    assert.deepEqual(r.gems.ice[0], r.gems.ice[1], 'có gem Băng không với tới');
  });
}

const flat = (floor) => parseLevel([
  '################',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  `#F${floor}fi#`.padEnd(16, '#'),
  '################',
  '################',
]);

test('lò xo: đáp lên là bị hất cao hơn nhiều lần nhảy thường (~5 ô)', () => {
  const lv = flat('..s........');
  const b = newBody({ x: 4.15, y: 8.1 });
  let top = b.y;
  for (let t = 0; t < 1.5; t += DT) { step(lv, b, none, noPlates, DT); top = Math.min(top, b.y); }
  assert.ok(8.1 - top > 4.5, `chỉ bật cao ${(8.1 - top).toFixed(2)} ô`);
  assert.ok(8.1 - top < 6.5, `bật quá cao ${(8.1 - top).toFixed(2)} ô`);
});

test('băng chuyền: đứng yên vẫn bị kéo theo chiều mũi tên, đi ngược thì chậm lại', () => {
  const right = flat('.>>>>>>>>..');
  const a = newBody({ x: 3.15, y: 8.1 });
  run(right, a, none, 1);
  assert.ok(a.x - 3.15 > 2.5, `không bị kéo: dx=${a.x - 3.15}`);
  const left = flat('.<<<<<<<<<.');
  const b = newBody({ x: 10.15, y: 8.1 });
  run(left, b, none, 1);
  assert.ok(10.15 - b.x > 2.5);
  const c = newBody({ x: 10.15, y: 8.1 });
  run(left, c, { ...none, right: true }, 0.5); // đi ngược chiều: 6 - 3.5 = 2.5 ô/giây
  assert.ok(c.x - 10.15 > 0.9 && c.x - 10.15 < 1.7, `dx=${c.x - 10.15}`);
});
