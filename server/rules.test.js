import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, checkWin } from './rules.js';

const put = (b, cells, v) => cells.forEach(([r, c]) => (b[r][c] = v));
const row = (r, from, n) => Array.from({ length: n }, (_, i) => [r, from + i]);

test('5 liên tiếp, hai đầu trống => thắng', () => {
  const b = emptyBoard(); put(b, row(7, 3, 5), 'X');
  assert.equal(checkWin(b, 7, 5).length, 5);
});

test('5 liên tiếp bị chặn cả 2 đầu => thắng (mặc định không áp dụng luật chặn)', () => {
  const b = emptyBoard(); put(b, row(7, 3, 5), 'X'); put(b, [[7, 2], [7, 8]], 'O');
  assert.ok(checkWin(b, 7, 5));
});

test('blockRule bật: 5 liên tiếp bị chặn cả 2 đầu => không thắng', () => {
  const b = emptyBoard(); put(b, row(7, 3, 5), 'X'); put(b, [[7, 2], [7, 8]], 'O');
  assert.equal(checkWin(b, 7, 5, { blockRule: true }), null);
});

test('5 liên tiếp bị chặn 1 đầu => thắng', () => {
  const b = emptyBoard(); put(b, row(7, 3, 5), 'X'); put(b, [[7, 2]], 'O');
  assert.ok(checkWin(b, 7, 5));
});

test('sát mép bàn cờ, đầu kia trống => thắng', () => {
  const b = emptyBoard(); put(b, row(7, 0, 5), 'X');
  assert.ok(checkWin(b, 7, 2));
});

test('sát mép, đầu kia bị chặn => thắng (mép không tính là chặn)', () => {
  const b = emptyBoard(); put(b, row(7, 0, 5), 'X'); put(b, [[7, 5]], 'O');
  assert.ok(checkWin(b, 7, 2));
});

test('chéo và dọc', () => {
  const b = emptyBoard(); put(b, [0, 1, 2, 3, 4].map((i) => [i + 2, i + 2]), 'O');
  assert.ok(checkWin(b, 4, 4));
  const d = emptyBoard(); put(d, [0, 1, 2, 3, 4].map((i) => [i + 5, 9]), 'X');
  assert.ok(checkWin(d, 7, 9));
});

test('4 quân => chưa thắng', () => {
  const b = emptyBoard(); put(b, row(7, 3, 4), 'X');
  assert.equal(checkWin(b, 7, 3), null);
});
