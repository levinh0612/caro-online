// Logic thuần của Lửa & Băng. Đơn vị là "ô" (tile), không đụng DOM nên test được bằng `node --test`.
//
// Ký hiệu bản đồ:
//   # tường   . trống   F/I chỗ xuất hiện của Lửa/Băng   f/i cửa thoát của Lửa/Băng
//   L dung nham (giết Băng)   W nước (giết Lửa)   P bùn độc (giết cả hai)
//   g/h gem của Lửa/Băng (chỉ đúng người nhặt được)
//   s lò xo: đáp lên là bị hất bay cao ~5 ô   > < băng chuyền: đứng lên bị kéo sang phải / trái
//   a/b nút đạp   A/B cửa chắn: mở khi có ai đó đang đứng trên nút cùng chữ (a mở A, b mở B)

export const DT = 1 / 60;
export const BODY = { w: 0.7, h: 0.9 };

const GRAVITY = 36;
const JUMP_V = 13.5; // nhảy cao ~2.5 ô, xa ~4 ô
const SPEED = 6;
const MAX_FALL = 18;
const COYOTE = 0.1; // vừa rời mép vẫn nhảy được
const BUFFER = 0.12; // bấm nhảy sớm một chút vẫn ăn khi chạm đất
const EPS = 1e-4;
const SPRING_V = 20; // ~5.5 ô cao
const BELT = 3.5; // tốc độ băng chuyền (ô/giây)

const SPAWN = { fire: 'F', ice: 'I' };
const EXIT = { fire: 'f', ice: 'i' };
const DEADLY = { fire: 'WP', ice: 'LP' };
const GEM = { fire: 'g', ice: 'h' };
const PLATES = 'ab';
const DOORS = 'AB';

export function parseLevel(rows) {
  const spawn = {};
  const grid = rows.map((row, r) =>
    [...row].map((ch, c) => {
      const who = Object.keys(SPAWN).find((k) => SPAWN[k] === ch);
      if (!who) return ch;
      spawn[who] = { x: c + (1 - BODY.w) / 2, y: r + 1 - BODY.h };
      return '.';
    }),
  );
  return { w: grid[0].length, h: grid.length, grid, spawn };
}

export function newBody(pos) {
  return { x: pos.x, y: pos.y, vy: 0, onGround: false, coyote: 0, buffer: 0, face: 1 };
}

export const tileAt = (lv, c, r) => lv.grid[r]?.[c] ?? '#';

const cellOverlap = (x, y, c, r) => c < x + BODY.w - EPS && c + 1 > x + EPS && r < y + BODY.h - EPS && r + 1 > y + EPS;

function anyCell(x, y, w, h, fn) {
  for (let r = Math.floor(y); r <= Math.floor(y + h - EPS); r++) {
    for (let c = Math.floor(x); c <= Math.floor(x + w - EPS); c++) if (fn(c, r)) return true;
  }
  return false;
}

const doorOpen = (ch, pressed) => pressed.has(ch.toLowerCase());

// Va chạm tại (x, y). Cửa đang đóng mà thân đã nằm trong ô cửa thì bỏ qua, để không bị kẹt khi nút vừa nhả.
function blocked(lv, pressed, b, x, y) {
  return anyCell(x, y, BODY.w, BODY.h, (c, r) => {
    const ch = tileAt(lv, c, r);
    if (ch === '#') return true;
    return DOORS.includes(ch) && !doorOpen(ch, pressed) && !cellOverlap(b.x, b.y, c, r);
  });
}

// Các nút đang bị đạp (bởi bất kỳ nhân vật nào): chữ thường 'a' | 'b'
export function pressedPlates(lv, bodies) {
  const set = new Set();
  for (const b of bodies) {
    const ch = tileAt(lv, Math.floor(b.x + BODY.w / 2), Math.floor(b.y + BODY.h - 0.05));
    if (PLATES.includes(ch)) set.add(ch);
  }
  return set;
}

// input: { left, right, jump }
export function step(lv, b, input, pressed, dt = DT) {
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) b.face = dir;

  b.buffer = input.jump ? BUFFER : Math.max(0, b.buffer - dt);
  if (b.buffer > 0 && (b.onGround || b.coyote > 0)) {
    b.vy = -JUMP_V;
    b.onGround = false;
    b.coyote = 0;
    b.buffer = 0;
  }
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);

  const belt = b.onGround ? beltUnder(lv, b) : 0;
  const vx = dir * SPEED + belt;
  let nx = b.x + vx * dt;
  if (vx && blocked(lv, pressed, b, nx, b.y)) {
    nx = vx > 0 ? Math.floor(nx + BODY.w) - BODY.w - EPS : Math.floor(nx) + 1 + EPS;
  }

  let ny = b.y + b.vy * dt;
  b.onGround = false;
  if (blocked(lv, pressed, b, nx, ny)) {
    if (b.vy > 0) {
      ny = Math.floor(ny + BODY.h) - BODY.h - EPS;
      b.onGround = true;
    } else {
      ny = Math.floor(ny) + 1 + EPS;
    }
    b.vy = 0;
  }
  b.x = nx;
  b.y = ny;
  b.coyote = b.onGround ? COYOTE : Math.max(0, b.coyote - dt);
  if (b.onGround && tileUnder(lv, b) === 's') { // lò xo: hất lên ngay khi chạm
    b.vy = -SPRING_V;
    b.onGround = false;
    b.coyote = 0;
    b.buffer = 0;
  }
}

// Ô nằm dưới chân (hàng chứa đáy thân, cột chứa tâm thân)
const tileUnder = (lv, b) => tileAt(lv, Math.floor(b.x + BODY.w / 2), Math.floor(b.y + BODY.h - 0.05));
const beltUnder = (lv, b) => ({ '>': BELT, '<': -BELT })[tileUnder(lv, b)] ?? 0;

// Chạm hố sai loại (thu nhỏ hộp va chạm một chút cho dễ tính)
export function isDead(lv, b, kind) {
  const m = 0.15;
  return anyCell(b.x + m, b.y + m, BODY.w - 2 * m, BODY.h - 2 * m, (c, r) => DEADLY[kind].includes(tileAt(lv, c, r)));
}

export function atExit(lv, b, kind) {
  return tileAt(lv, Math.floor(b.x + BODY.w / 2), Math.floor(b.y + BODY.h / 2)) === EXIT[kind];
}

export const countGems = (lv, kind) => lv.grid.flat().filter((ch) => ch === GEM[kind]).length;

// Nhặt gem đúng loại đang chạm; `got` là Set "c,r" đã nhặt. Trả về danh sách ô vừa nhặt.
export function collectGems(lv, b, kind, got) {
  const found = [];
  anyCell(b.x, b.y, BODY.w, BODY.h, (c, r) => {
    const key = `${c},${r}`;
    if (tileAt(lv, c, r) === GEM[kind] && !got.has(key)) {
      got.add(key);
      found.push([c, r]);
    }
    return false;
  });
  return found;
}
