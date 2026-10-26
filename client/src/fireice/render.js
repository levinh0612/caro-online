// Vẽ canvas cho Lửa & Băng: hang tối phát sáng, Lửa ấm đối Băng lạnh.
// Chỉ đọc state truyền vào; riêng lớp tường tĩnh được cache lên canvas phụ (theo cỡ ô) cho nhẹ máy yếu.
import { BODY, tileAt } from './engine.js';

const TAU = Math.PI * 2;

export const PAL = {
  fire: { main: '#ff7a2f', dark: '#c9321a', light: '#ffc46b', glow: '255,122,47', gem: '#ff5a3c' },
  ice: { main: '#6fd3ff', dark: '#3a7fdc', light: '#eafcff', glow: '127,220,255', gem: '#5ad0ff' },
};
const DOOR = { A: '#ffd23f', B: '#c77dff' };
const LIQUID = {
  L: { top: '#ffb04a', bot: '#c4261b', glow: '255,120,40' },
  W: { top: '#7fd8ff', bot: '#2a5fd0', glow: '80,170,255' },
  P: { top: '#c4f27a', bot: '#3f8f2a', glow: '150,230,80' },
};

// băm ổn định theo (a, b) -> [0, 1)
function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Cỡ ô và độ lệch: cắt nửa ô tường viền hai bên để màn chơi to hơn trên màn hình hẹp
export function layout(lv, W, H) {
  const ts = Math.max(8, Math.floor(Math.min(W / (lv.w - 1), H / (lv.h - 1))));
  return { ts, ox: Math.floor((W - ts * lv.w) / 2), oy: Math.floor((H - ts * lv.h) / 2) };
}

/* ---------------- hạt (particle) ---------------- */

const spark = (x, y, vx, vy, g, life, size, rgb) => ({ x, y, vx, vy, g, life, max: life, size, rgb });

export function burst(fx, x, y, rgb, n, speed = 4, life = 0.7) {
  for (let i = 0; i < n && fx.length < 400; i++) {
    const a = Math.random() * TAU;
    const v = speed * (0.3 + Math.random() * 0.7);
    fx.push(spark(x, y, Math.cos(a) * v, Math.sin(a) * v, 6, life * (0.6 + Math.random() * 0.6), 0.08 + Math.random() * 0.07, rgb));
  }
}

export function puff(fx, x, y, n) {
  for (let i = 0; i < n && fx.length < 400; i++) {
    const s = i % 2 ? 1 : -1;
    fx.push(spark(x + (Math.random() - 0.5) * 0.4, y, s * (0.5 + Math.random() * 1.5), -0.3 - Math.random() * 0.8, 3, 0.4, 0.08, '220,210,255'));
  }
}

export function confetti(fx, w) {
  const rgbs = ['255,122,47', '127,220,255', '255,210,63', '199,125,255', '120,230,150'];
  for (let i = 0; i < 90 && fx.length < 500; i++) {
    fx.push(spark(Math.random() * w, -1 - Math.random() * 3, (Math.random() - 0.5) * 2, 1 + Math.random() * 3, 3, 2 + Math.random(), 0.1, rgbs[i % rgbs.length]));
  }
}

// Tàn lửa bay lên từ Lửa, tinh thể tuyết lấp lánh quanh Băng
export function ambient(fx, b, kind, dt) {
  if (fx.length > 300 || Math.random() >= dt * 22) return;
  const cx = b.x + BODY.w / 2 + (Math.random() - 0.5) * BODY.w * 0.6;
  if (kind === 'fire') fx.push(spark(cx, b.y + 0.1, (Math.random() - 0.5) * 0.6, -1.6 - Math.random(), -0.5, 0.55 + Math.random() * 0.3, 0.07, '255,170,70'));
  else fx.push(spark(cx, b.y + 0.1 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, 0, 0.8, 0.05, '210,245,255'));
}

export function updateFx(fx, dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    p.life -= dt;
    if (p.life <= 0) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.g * dt;
  }
}

function drawFx(ctx, ts, fx) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fx) {
    const a = Math.max(0, p.life / p.max);
    ctx.fillStyle = `rgba(${p.rgb},${a * 0.9})`;
    ctx.beginPath();
    ctx.arc(p.x * ts, p.y * ts, Math.max(1, p.size * ts * (0.4 + 0.6 * a)), 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------------- nền hang ---------------- */

function drawBackground(ctx, W, H, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1233');
  g.addColorStop(1, '#2d1f4a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // hai vầng sáng: ấm bên trái (Lửa), lạnh bên phải (Băng)
  const glow = (x, rgb, a) => {
    const r = ctx.createRadialGradient(x, H * 0.85, 0, x, H * 0.85, Math.max(W, H) * 0.7);
    r.addColorStop(0, `rgba(${rgb},${a})`);
    r.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.1, '255,110,50', 0.2);
  glow(W * 0.9, '80,170,255', 0.22);

  // đom đóm lơ lửng
  for (let i = 0; i < 26; i++) {
    const x = (((hash(i, 1) * W + t * 6 * (hash(i, 2) - 0.5)) % W) + W) % W;
    const y = (((hash(i, 3) * H - t * 10 * (0.3 + hash(i, 4))) % H) + H) % H;
    const a = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.5 + i));
    ctx.fillStyle = i % 2 ? `rgba(255,190,120,${a})` : `rgba(160,220,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + hash(i, 5) * 1.6, 0, TAU);
    ctx.fill();
  }
}

/* ---------------- tường (vẽ một lần rồi cache) ---------------- */

function drawWall(g, lv, c, r, ts) {
  const x = c * ts;
  const y = r * ts;
  const v = hash(c, r);
  const open = (dc, dr) => tileAt(lv, c + dc, r + dr) !== '#';
  g.fillStyle = `hsl(${258 + v * 12} 30% ${21 + v * 6}%)`;
  g.fillRect(x, y, ts + 0.5, ts + 0.5);

  // vạch vữa kiểu gạch, lệch theo hàng
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y + ts / 2);
  g.lineTo(x + ts, y + ts / 2);
  const vx = x + ts * (r % 2 ? 0.3 : 0.7);
  g.moveTo(vx, y);
  g.lineTo(vx, y + ts / 2);
  g.moveTo(vx + (r % 2 ? 0.4 : -0.4) * ts, y + ts / 2);
  g.lineTo(vx + (r % 2 ? 0.4 : -0.4) * ts, y + ts);
  g.stroke();

  // vân đá
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.fillRect(x + ts * (0.15 + v * 0.5), y + ts * (0.15 + hash(r, c) * 0.5), ts * 0.18, ts * 0.1);

  const e = Math.max(2, ts * 0.14);
  if (open(0, -1)) { g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x, y, ts, e); }
  if (open(0, 1)) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + ts - e, ts, e); }
  if (open(-1, 0)) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y, e * 0.6, ts); }
  if (open(1, 0)) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + ts - e * 0.6, y, e * 0.6, ts); }
}

function wallLayer(lv, ts, dpr) {
  const key = `${ts}@${dpr}`;
  if (lv._layer?.key === key) return lv._layer.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(lv.w * ts * dpr);
  canvas.height = Math.ceil(lv.h * ts * dpr);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  for (let r = 0; r < lv.h; r++) for (let c = 0; c < lv.w; c++) if (lv.grid[r][c] === '#') drawWall(g, lv, c, r, ts);
  lv._layer = { key, canvas };
  return canvas;
}

/* ---------------- ô động ---------------- */

function liquid(ctx, lv, ch, c, r, ts, t) {
  const L = LIQUID[ch];
  const x = c * ts;
  const y = r * ts;
  const surface = tileAt(lv, c, r - 1) !== ch;
  const wave = surface ? Math.sin(t * 2.5 + c * 1.7) * ts * 0.05 : 0;
  const y0 = y + (surface ? ts * 0.2 : 0) + wave;
  const g = ctx.createLinearGradient(0, y0, 0, y + ts);
  g.addColorStop(0, L.top);
  g.addColorStop(1, L.bot);
  ctx.fillStyle = g;
  ctx.fillRect(x, y0, ts + 0.5, y + ts - y0 + 0.5);

  const h = hash(c, r);
  for (let k = 0; k < 2; k++) { // bong bóng nổi lên
    const ph = (t * 0.55 + h * 7 + k * 0.5) % 1;
    ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - ph)})`;
    ctx.beginPath();
    ctx.arc(x + ts * (0.25 + 0.5 * hash(c + k, r)), y + ts * (1 - ph * 0.8), ts * 0.06, 0, TAU);
    ctx.fill();
  }
  if (surface) {
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(x, y0, ts, Math.max(1.5, ts * 0.07));
    ctx.globalCompositeOperation = 'lighter'; // ánh sáng toả lên phía trên mặt chất lỏng
    const up = ctx.createLinearGradient(0, y0 - ts * 0.7, 0, y0);
    up.addColorStop(0, `rgba(${L.glow},0)`);
    up.addColorStop(1, `rgba(${L.glow},.28)`);
    ctx.fillStyle = up;
    ctx.fillRect(x, y0 - ts * 0.7, ts, ts * 0.7);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function plate(ctx, ch, c, r, ts, pressed, t) {
  const x = c * ts;
  const y = r * ts;
  const down = pressed.has(ch);
  const h = ts * (down ? 0.12 : 0.24);
  const col = DOOR[ch.toUpperCase()];
  ctx.fillStyle = '#1d1630';
  ctx.fillRect(x + ts * 0.04, y + ts - ts * 0.1, ts * 0.92, ts * 0.1);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.roundRect(x + ts * 0.1, y + ts - ts * 0.1 - h, ts * 0.8, h, ts * 0.08);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x + ts / 2, y + ts, 0, x + ts / 2, y + ts, ts * (down ? 1.1 : 0.7));
  g.addColorStop(0, `${col}${down ? '88' : '33'}`);
  g.addColorStop(1, `${col}00`);
  ctx.fillStyle = g;
  ctx.fillRect(x - ts * 0.5, y - ts * 0.3, ts * 2, ts * 1.4);
  ctx.globalCompositeOperation = 'source-over';
  if (down) return;
  ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(t * 4 + c)})`;
  ctx.fillRect(x + ts * 0.3, y + ts - ts * 0.1 - h, ts * 0.4, Math.max(1, ts * 0.04));
}

function door(ctx, lv, ch, c, r, ts, pressed, t) {
  const x = c * ts;
  const y = r * ts;
  const col = DOOR[ch];
  if (pressed.has(ch.toLowerCase())) { // đang mở: chỉ còn hai trụ mờ và vài hạt sáng
    ctx.fillStyle = `${col}40`;
    ctx.fillRect(x + ts * 0.18, y, ts * 0.08, ts);
    ctx.fillRect(x + ts * 0.74, y, ts * 0.08, ts);
    ctx.fillStyle = `${col}aa`;
    ctx.fillRect(x + ts * (0.2 + 0.55 * ((t * 0.7 + c * 0.31) % 1)), y + ts * ((t * 1.3 + r * 0.17) % 1), 2, 2);
    return;
  }
  const g = ctx.createLinearGradient(x, 0, x + ts, 0);
  g.addColorStop(0, col);
  g.addColorStop(0.5, '#fff6');
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x + ts * 0.2, y, ts * 0.6, ts + 0.5, ts * 0.1);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  for (let k = 1; k < 3; k++) ctx.fillRect(x + ts * 0.2, y + (ts * k) / 3, ts * 0.6, Math.max(1, ts * 0.05));
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(x + ts / 2, y + ts / 2, 0, x + ts / 2, y + ts / 2, ts * 0.9);
  halo.addColorStop(0, `${col}44`);
  halo.addColorStop(1, `${col}00`);
  ctx.fillStyle = halo;
  ctx.fillRect(x - ts * 0.5, y - ts * 0.5, ts * 2, ts * 2);
  ctx.globalCompositeOperation = 'source-over';
}

// Cổng thoát: hai vòng xoáy ngược chiều + hạt sáng quay quanh
function spring(ctx, c, r, ts, t) {
  const x = c * ts;
  const y = r * ts;
  const k = 0.5 + 0.5 * Math.sin(t * 5 + c); // đệm thở nhẹ cho dễ thấy
  const top = y + ts * (0.55 + 0.04 * k);
  ctx.strokeStyle = '#d6d3ee';
  ctx.lineWidth = Math.max(2, ts * 0.07);
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const yy = y + ts - ts * 0.08 - (i * (y + ts - ts * 0.08 - top)) / 4;
    ctx.lineTo(x + ts * (i % 2 ? 0.28 : 0.72), yy);
  }
  ctx.stroke();
  ctx.fillStyle = '#7ef0b0';
  ctx.beginPath();
  ctx.roundRect(x + ts * 0.1, top - ts * 0.12, ts * 0.8, ts * 0.14, ts * 0.06);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x + ts / 2, top, 0, x + ts / 2, top, ts * 0.9);
  g.addColorStop(0, '#7ef0b055');
  g.addColorStop(1, '#7ef0b000');
  ctx.fillStyle = g;
  ctx.fillRect(x - ts * 0.4, top - ts * 0.9, ts * 1.8, ts * 1.8);
  ctx.globalCompositeOperation = 'source-over';
}

// Băng chuyền: dải tối có mũi tên chạy theo chiều kéo
function belt(ctx, ch, c, r, ts, t) {
  const x = c * ts;
  const y = r * ts + ts * 0.78;
  const h = ts * 0.22;
  const dir = ch === '>' ? 1 : -1;
  ctx.fillStyle = '#2a2145';
  ctx.fillRect(x, y, ts, h);
  ctx.strokeStyle = '#ffd36e';
  ctx.lineWidth = Math.max(1.5, ts * 0.05);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, ts, h);
  ctx.clip();
  const off = ((t * 1.2) % 1) * ts * 0.5 * dir;
  for (let i = -1; i < 3; i++) {
    const cx = x + (i + 0.5) * ts * 0.5 + off;
    ctx.beginPath();
    ctx.moveTo(cx - dir * ts * 0.08, y + h * 0.2);
    ctx.lineTo(cx + dir * ts * 0.08, y + h * 0.5);
    ctx.lineTo(cx - dir * ts * 0.08, y + h * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

function portal(ctx, kind, c, r, ts, t) {
  const P = PAL[kind];
  const cx = c * ts + ts / 2;
  const cy = r * ts + ts * 0.5;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * 0.9);
  g.addColorStop(0, `rgba(${P.glow},.45)`);
  g.addColorStop(1, `rgba(${P.glow},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(cx - ts, cy - ts, ts * 2, ts * 2);
  ctx.strokeStyle = P.main;
  ctx.lineWidth = Math.max(2, ts * 0.1);
  for (let k = 0; k < 2; k++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((k ? -1 : 1) * t * 1.6);
    ctx.globalAlpha = k ? 0.6 : 0.95;
    ctx.beginPath();
    ctx.ellipse(0, 0, ts * (0.3 - k * 0.07), ts * (0.46 - k * 0.1), 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = P.light;
  for (let k = 0; k < 3; k++) {
    const a = t * 2.2 + (k * TAU) / 3;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * ts * 0.34, cy + Math.sin(a) * ts * 0.48, Math.max(1, ts * 0.04), 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function gem(ctx, kind, c, r, ts, t) {
  const P = PAL[kind];
  const cx = c * ts + ts / 2;
  const cy = r * ts + ts / 2 + Math.sin(t * 3 + c * 1.3) * ts * 0.06;
  const s = ts * 0.26;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * 0.7);
  g.addColorStop(0, `rgba(${P.glow},.5)`);
  g.addColorStop(1, `rgba(${P.glow},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(cx - ts, cy - ts, ts * 2, ts * 2);
  ctx.globalCompositeOperation = 'source-over';
  const fill = ctx.createLinearGradient(cx, cy - s, cx, cy + s);
  fill.addColorStop(0, P.light);
  fill.addColorStop(1, P.gem);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 1.15);
  ctx.lineTo(cx + s, cy - s * 0.2);
  ctx.lineTo(cx, cy + s * 1.15);
  ctx.lineTo(cx - s, cy - s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.lineWidth = Math.max(1, ts * 0.04);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(t * 5 + c)})`;
  ctx.beginPath();
  ctx.arc(cx - s * 0.3, cy - s * 0.45, Math.max(1, s * 0.16), 0, TAU);
  ctx.fill();
}

/* ---------------- nhân vật ---------------- */

function tongue(ctx, cx, base, tipX, tipY, half, color) {
  const mid = (base + tipY) / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - half, base);
  ctx.bezierCurveTo(cx - half * 1.1, mid, tipX - half * 0.25, mid, tipX, tipY);
  ctx.bezierCurveTo(tipX + half * 0.25, mid, cx + half * 1.1, mid, cx + half, base);
  ctx.closePath();
  ctx.fill();
}

// Vẽ nhân vật chibi: (x, y) là góc trên-trái của hộp BODY (w×h), chân ở đáy hộp.
// o: { face: ±1, sy: giãn dọc (1 = bình thường), ghost, seed, run (0..1 đang chạy), air (đang ở trên không), mood }
export function drawCharacter(ctx, kind, x, y, w, h, t, o = {}) {
  const { face = 1, sy = 1, ghost = false, seed = 0, run = 0, air = false, mood = 'happy' } = o;
  const P = PAL[kind];
  const bodyH = h * 0.78;
  const bot = -h * 0.07; // đáy thân
  const top = bot - bodyH;
  const ink = kind === 'fire' ? '#7a1d10' : '#143a73';
  const lw = Math.max(1.2, w * 0.055);
  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.scale(1 / sy, sy);
  ctx.globalAlpha = ghost ? 0.94 : 1;

  // bóng dưới chân
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.5, w * 0.1, 0, 0, TAU);
  ctx.fill();

  // quầng sáng
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, -h * 0.5, 0, 0, -h * 0.5, w * 1.4);
  halo.addColorStop(0, `rgba(${P.glow},.3)`);
  halo.addColorStop(1, `rgba(${P.glow},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(-w * 1.5, -h * 1.6, w * 3, h * 2.2);
  ctx.globalCompositeOperation = 'source-over';

  // chân: bước luân phiên khi chạy, co lại khi nhảy
  const stride = Math.sin(t * 16 + seed) * run;
  for (const s of [-1, 1]) {
    const lift = air ? w * 0.06 : Math.max(0, stride * s) * w * 0.1;
    ctx.fillStyle = P.dark;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.ellipse(s * w * 0.2 + stride * s * w * 0.04, -w * 0.07 - lift, w * 0.15, w * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // tay: đưa lên khi nhảy, vung khi chạy, vẫy nhẹ khi đứng yên
  for (const s of [-1, 1]) {
    const swing = air ? -0.9 : run ? Math.sin(t * 16 + seed + (s > 0 ? Math.PI : 0)) * 0.55 * run : Math.sin(t * 2.5 + seed + s) * 0.12;
    const ax = s * w * 0.5;
    const ay = top + bodyH * 0.6;
    const hx = ax + s * w * 0.1 + Math.sin(swing) * w * 0.05;
    const hy = ay + Math.cos(swing) * w * 0.12 + (air ? -w * 0.28 : 0);
    ctx.strokeStyle = P.main;
    ctx.lineWidth = w * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax - s * w * 0.04, ay);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = P.light;
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    ctx.arc(hx, hy, w * 0.1, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // đỉnh đầu (vẽ trước thân để thân đè lên chân lửa / tinh thể)
  const base = top + h * 0.06;
  if (kind === 'fire') {
    for (const [ox, hh, ph] of [[-0.28, 0.36, 0], [0, 0.56, 1.7], [0.28, 0.34, 3.1]]) {
      const tipX = ox * w + Math.sin(t * 9 + ph + seed) * w * 0.1 + face * w * 0.03;
      const tipY = base - h * hh * (0.92 + 0.14 * Math.sin(t * 11 + ph));
      tongue(ctx, ox * w, base, tipX, tipY, w * 0.22, '#e2380f');
      tongue(ctx, ox * w, base, tipX, tipY, w * 0.18, P.main);
      tongue(ctx, ox * w, base, tipX * 0.9, base + (tipY - base) * 0.55, w * 0.1, '#ffe27a');
    }
  } else {
    for (const [ox, hh, tilt] of [[-0.27, 0.34, -0.12], [0, 0.52, 0], [0.27, 0.34, 0.12]]) {
      const cx = ox * w;
      const tipY = base - h * hh;
      const g = ctx.createLinearGradient(0, tipY, 0, base);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#bfeaff');
      g.addColorStop(1, P.main);
      ctx.fillStyle = g;
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw * 0.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.15, base + h * 0.05);
      ctx.lineTo(cx + tilt * w, tipY);
      ctx.lineTo(cx + w * 0.15, base + h * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = lw * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.04, base - h * 0.02);
      ctx.lineTo(cx + tilt * w * 0.8 - w * 0.02, tipY + h * 0.08);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.45 * Math.sin(t * 4 + seed)})`;
    ctx.beginPath();
    ctx.arc(w * 0.36, base - h * 0.34, Math.max(1, w * 0.05), 0, TAU);
    ctx.fill();
  }

  // thân: một khối tròn mềm, viền đậm, bóng sáng
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, P.light);
  g.addColorStop(0.5, P.main);
  g.addColorStop(1, P.dark);
  ctx.fillStyle = g;
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(-w / 2, top, w, bodyH, [w * 0.52, w * 0.52, w * 0.36, w * 0.36]);
  ctx.fill();
  ctx.stroke();

  // bụng sáng + biểu tượng
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.beginPath();
  ctx.ellipse(0, bot - bodyH * 0.2, w * 0.28, bodyH * 0.14, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(0, bot - bodyH * 0.2);
  if (kind === 'fire') {
    ctx.fillStyle = 'rgba(255,240,170,.85)';
    ctx.beginPath();
    ctx.moveTo(0, -w * 0.09);
    ctx.bezierCurveTo(w * 0.1, -w * 0.02, w * 0.07, w * 0.08, 0, w * 0.08);
    ctx.bezierCurveTo(-w * 0.07, w * 0.08, -w * 0.1, -w * 0.02, 0, -w * 0.09);
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = Math.max(1, w * 0.03);
    for (let i = 0; i < 3; i++) {
      const an = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(an) * w * 0.09, Math.sin(an) * w * 0.09);
      ctx.lineTo(-Math.cos(an) * w * 0.09, -Math.sin(an) * w * 0.09);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ánh bóng trên đầu
  ctx.strokeStyle = 'rgba(255,255,255,.65)';
  ctx.lineWidth = w * 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-w * 0.02, top + bodyH * 0.34, w * 0.4, Math.PI * 1.08, Math.PI * 1.3);
  ctx.stroke();

  // mắt to bóng, chớp định kỳ, nhìn theo hướng đi
  const ey = top + bodyH * 0.44;
  const blink = (t * 0.9 + seed) % 4 < 0.1;
  const look = face * w * 0.05;
  const surprised = air || mood === 'scared';
  for (const s of [-1, 1]) {
    const ex = s * w * 0.21 + look * 0.5;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath();
    ctx.ellipse(ex, ey, w * 0.15, blink ? w * 0.02 : w * (surprised ? 0.2 : 0.18), 0, 0, TAU);
    ctx.fill();
    if (blink) { ctx.stroke(); continue; }
    ctx.fillStyle = '#2a1a3a';
    ctx.beginPath();
    ctx.ellipse(ex + look, ey + w * 0.02, w * 0.095, w * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = kind === 'fire' ? '#ff9a3c' : '#6fd0ff';
    ctx.beginPath();
    ctx.ellipse(ex + look, ey + w * 0.06, w * 0.06, w * 0.05, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex + look - w * 0.035, ey - w * 0.04, w * 0.04, 0, TAU);
    ctx.arc(ex + look + w * 0.03, ey + w * 0.05, w * 0.02, 0, TAU);
    ctx.fill();
    // lông mày: nhướng khi bay, hơi cau khi sợ
    ctx.strokeStyle = ink;
    ctx.lineWidth = w * 0.04;
    ctx.beginPath();
    const by = ey - w * (surprised ? 0.27 : 0.23);
    ctx.moveTo(ex - w * 0.09, by + (mood === 'scared' ? s * w * 0.03 : 0));
    ctx.lineTo(ex + w * 0.09, by - (mood === 'scared' ? s * w * 0.03 : w * 0.01));
    ctx.stroke();
  }

  // má hồng
  ctx.fillStyle = kind === 'fire' ? 'rgba(255,90,120,.45)' : 'rgba(255,130,190,.45)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * w * 0.34, ey + w * 0.17, w * 0.09, w * 0.055, 0, 0, TAU);
    ctx.fill();
  }

  // miệng: cười, hoặc tròn khi nhảy / sợ
  ctx.strokeStyle = '#2a1a3a';
  ctx.fillStyle = '#7a1d2a';
  ctx.lineWidth = Math.max(1, w * 0.045);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (surprised) {
    ctx.ellipse(look * 0.5, ey + w * 0.24, w * 0.05, w * 0.065, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.arc(look * 0.5, ey + w * 0.13, w * 0.1, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
  }
  ctx.restore();
}

// trạng thái chạy / bay của thân; người kia chỉ có vị trí nên suy từ độ dời giữa hai khung hình
const lastPos = new WeakMap();
function motion(b) {
  let vx = b.vx ?? 0;
  let air = b.vx !== undefined && b.onGround === false;
  if (b.vx === undefined) {
    const p = lastPos.get(b);
    vx = p ? (b.x - p.x) * 60 : 0;
    air = p ? Math.abs(b.y - p.y) > 0.02 : false;
    lastPos.set(b, { x: b.x, y: b.y });
  }
  return { run: air ? 0 : Math.min(1, Math.abs(vx) / 4), air };
}

function bodyScale(b) {
  const stretch = Math.min(0.2, Math.abs(b.vy || 0) * 0.011);
  return Math.max(0.7, 1 + stretch - (b.squash || 0));
}

/* ---------------- vẽ cả khung hình ---------------- */

export function draw(ctx, W, H, s) {
  const { lv, mine, theirs, me, other, pressed, t, gems, fx, shake, dpr } = s;
  const { ts, ox, oy } = layout(lv, W, H);
  drawBackground(ctx, W, H, t);

  ctx.save();
  const k = shake * ts * 0.3;
  ctx.translate(ox + (shake ? (Math.random() - 0.5) * k : 0), oy + (shake ? (Math.random() - 0.5) * k : 0));
  ctx.drawImage(wallLayer(lv, ts, dpr), 0, 0, lv.w * ts, lv.h * ts);

  for (let r = 0; r < lv.h; r++) {
    for (let c = 0; c < lv.w; c++) {
      const ch = lv.grid[r][c];
      if (ch === 'L' || ch === 'W' || ch === 'P') liquid(ctx, lv, ch, c, r, ts, t);
      else if (ch === 'a' || ch === 'b') plate(ctx, ch, c, r, ts, pressed, t);
      else if (ch === 'A' || ch === 'B') door(ctx, lv, ch, c, r, ts, pressed, t);
      else if (ch === 's') spring(ctx, c, r, ts, t);
      else if (ch === '>' || ch === '<') belt(ctx, ch, c, r, ts, t);
      else if (ch === 'f') portal(ctx, 'fire', c, r, ts, t);
      else if (ch === 'i') portal(ctx, 'ice', c, r, ts, t);
      else if ((ch === 'g' && me === 'fire') || (ch === 'h' && me === 'ice')) {
        if (!gems.has(`${c},${r}`)) gem(ctx, me, c, r, ts, t);
      }
    }
  }

  const bw = BODY.w * ts;
  const bh = BODY.h * ts;
  drawCharacter(ctx, other, theirs.x * ts, theirs.y * ts, bw, bh, t, { face: theirs.face, ghost: true, seed: 1.7, ...motion(theirs) });
  drawCharacter(ctx, me, mine.x * ts, mine.y * ts, bw, bh, t, { face: mine.face, sy: bodyScale(mine), seed: 0, ...motion(mine) });
  drawFx(ctx, ts, fx);
  ctx.restore();

  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}
