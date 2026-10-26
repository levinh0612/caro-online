// Bộ giải: chứng minh một màn qua được bằng đúng vật lý của engine (dùng trong test, không đóng gói vào game).
//
// Mô hình hợp tác: mỗi lúc chỉ một người di chuyển, người kia đứng yên ở một "nút" (chỗ xuất hiện S,
// nút đạp a/b, hoặc cửa thoát X). Người đứng yên trên nút đạp thì giữ cửa mở cho người đang đi.
// Mỗi bước đi được tìm bằng BFS trên trạng thái thật của engine (không xấp xỉ vật lý), nên kết quả là chuỗi phím chạy lại được.
import { BODY, DT, atExit, collectGems, isDead, newBody, parseLevel, pressedPlates, step } from './engine.js';

const ACTIONS = [];
for (const dir of [0, -1, 1]) for (const jump of [false, true]) ACTIONS.push({ left: dir < 0, right: dir > 0, jump });
const MAX_STATES = 600000;

const key = (b) => `${Math.round(b.x * 20)},${Math.round(b.y * 20)},${Math.round(b.vy / 1.5)},${b.onGround ? 1 : 0}`;
const copy = (b) => ({ ...b });

function nodeOf(lv, b, kind) {
  if (!b.onGround) return null;
  if (atExit(lv, b, kind)) return 'X';
  const p = pressedPlates(lv, [b]);
  if (!p.size) return null;
  const ch = [...p][0];
  const c = Math.floor(b.x + BODY.w / 2);
  const r = Math.floor(b.y + BODY.h - 0.05);
  return `${ch}${c},${r}`; // mỗi ô nút đạp là một nút riêng
}

// BFS một người từ `start`; `held` là tập nút đạp đang được người kia giữ.
// Trả về { nodes: Map(node -> {state, inputs}), cells: Set các ô gem đã nhặt được }
function explore(lv, kind, start, held, HOLD) {
  const seen = new Map([[key(start), 0]]);
  const states = [copy(start)];
  const parent = [-1];
  const how = [null];
  const nodes = new Map();
  const gems = new Set();
  const trace = (i) => {
    const out = [];
    for (; parent[i] >= 0; i = parent[i]) out.push(how[i]);
    return out.reverse();
  };
  for (let i = 0; i < states.length && states.length < MAX_STATES; i++) {
    const s = states[i];
    collectGems(lv, s, kind, gems);
    const n = nodeOf(lv, s, kind);
    if (n && !nodes.has(n) && i > 0) nodes.set(n, { state: copy(s), inputs: trace(i) });
    for (const a of ACTIONS) {
      const b = copy(s);
      let dead = false;
      for (let f = 0; f < HOLD && !dead; f++) {
        const pressed = new Set([...held, ...pressedPlates(lv, [b])]);
        step(lv, b, a, pressed, DT);
        dead = isDead(lv, b, kind);
      }
      if (dead) continue;
      const k = key(b);
      if (seen.has(k)) continue;
      seen.set(k, states.length);
      states.push(b);
      parent.push(i);
      how.push(a);
    }
  }
  return { nodes, gems };
}

// hold: mỗi lựa chọn phím được giữ bao nhiêu khung hình (càng lớn càng khó điều khiển chính xác)
export function solve(rows, { hold: HOLD = 5 } = {}) {
  const lv = parseLevel(rows);
  const rest = { fire: newBody(lv.spawn.fire), ice: newBody(lv.spawn.ice) };
  // trạng thái chung = (nút của Lửa, nút của Băng)
  const start = { fire: 'S', ice: 'S' };
  const reps = { fire: new Map([['S', rest.fire]]), ice: new Map([['S', rest.ice]]) };
  const heldBy = (n) => (n[0] === 'a' || n[0] === 'b' ? new Set([n[0]]) : new Set());
  const seen = new Map([[`${start.fire}|${start.ice}`, null]]);
  const queue = [start];
  const gemsGot = { fire: new Set(), ice: new Set() };
  let win = null;
  while (queue.length && !win) {
    const cur = queue.shift();
    for (const who of ['fire', 'ice']) {
      const other = who === 'fire' ? 'ice' : 'fire';
      const from = reps[who].get(cur[who]);
      const { nodes, gems } = explore(lv, who, from, heldBy(cur[other]), HOLD);
      for (const g of gems) gemsGot[who].add(g);
      for (const [n, info] of nodes) {
        if (n === cur[who]) continue;
        const next = { ...cur, [who]: n };
        const k = `${next.fire}|${next.ice}`;
        if (seen.has(k)) continue;
        if (!reps[who].has(n)) reps[who].set(n, info.state);
        seen.set(k, { prev: cur, who, to: n, inputs: info.inputs });
        queue.push(next);
        if (next.fire === 'X' && next.ice === 'X') win = k;
      }
    }
  }
  const plan = [];
  for (let k = win; k && seen.get(k); k = `${seen.get(k).prev.fire}|${seen.get(k).prev.ice}`) {
    const { who, to, inputs } = seen.get(k);
    plan.unshift({ who, to, frames: inputs.length * HOLD, inputs, hold: HOLD, from: seen.get(k).prev });
  }
  const total = { fire: 0, ice: 0 };
  for (let r = 0; r < lv.h; r++) {
    for (let c = 0; c < lv.w; c++) {
      if (lv.grid[r][c] === 'g') total.fire++;
      if (lv.grid[r][c] === 'h') total.ice++;
    }
  }
  return { solvable: !!win, plan, gems: { fire: [gemsGot.fire.size, total.fire], ice: [gemsGot.ice.size, total.ice] } };
}
