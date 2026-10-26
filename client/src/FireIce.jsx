import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ArrowLeft, ArrowRight, ArrowUp, Diamond, DeviceRotate, PaperPlaneTilt, WifiSlash } from '@phosphor-icons/react';
import { Ic, MenuButton, Screen } from './ui.jsx';
import Mascot from './fireice/Mascot.jsx';
import { getPlayerId, read, write } from './storage.js';
import { BODY, DT, atExit, collectGems, countGems, isDead, newBody, parseLevel, pressedPlates, step } from './fireice/engine.js';
import { LEVELS } from './fireice/levels.js';
import { PAL, ambient, burst, confetti, draw, puff, updateFx } from './fireice/render.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const SEND_EVERY = 0.05; // gửi vị trí 20 lần/giây
const ROLE = {
  fire: { label: 'Lửa', tint: 'rgba(255,122,47,.28)', edge: 'rgba(255,170,90,.7)', text: '#ffb27a' },
  ice: { label: 'Băng', tint: 'rgba(111,211,255,.26)', edge: 'rgba(160,230,255,.7)', text: '#9fe3ff' },
};
const otherOf = (r) => (r === 'fire' ? 'ice' : 'fire');
const levelOf = (n) => parseLevel(LEVELS[n % LEVELS.length].rows);

export default function FireIce({ onExit }) {
  const playerId = useMemo(getPlayerId, []);
  const socketRef = useRef(null);
  const [pin, setPin] = useState(() => read('caro.pin'));
  const [error, setError] = useState('');
  const [me, setMe] = useState(null); // 'fire' | 'ice'
  const [game, setGame] = useState(null);
  const [kicked, setKicked] = useState(false);

  useEffect(() => {
    const socket = io(`${SERVER_URL}/fireice`);
    socketRef.current = socket;
    socket.on('joined', ({ seat }) => setMe(seat));
    socket.on('state', (g) => { setGame(g); setKicked(false); });
    socket.on('disconnect', (reason) => { if (reason === 'io server disconnect') setKicked(true); });
    // Đã lưu PIN (từ trò caro hoặc lần trước) thì tự vào phòng
    socket.on('connect', () => {
      const saved = read('caro.pin');
      if (!saved) return;
      socket.emit('join', { playerId, pin: saved }, (res) => {
        if (!res.ok) {
          setError(res.error);
          if (res.badPin) write('caro.pin', '');
        }
      });
    });
    return () => socket.disconnect();
  }, [playerId]);

  const emit = (event, payload, cb) => socketRef.current?.emit(event, payload, cb);
  const join = () => {
    setError('');
    emit('join', { playerId, pin }, (res) => {
      if (!res.ok) return setError(res.error);
      write('caro.pin', pin);
    });
  };
  const pick = (side) => {
    setError('');
    emit('pick', { side }, (res) => !res.ok && setError(res.error));
  };

  if (kicked) {
    return (
      <Screen className="fi-bg">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <Ic icon={WifiSlash} className="text-4xl text-white/70" />
          <p className="font-game font-semibold text-lg">Máy khác đã vào thay bạn</p>
          <button onClick={() => location.reload()} className="press rounded-2xl bg-orange-500 px-5 py-3 font-game font-semibold">Vào lại</button>
        </div>
      </Screen>
    );
  }

  /* ---------------- nhập PIN ---------------- */
  if (!game) {
    return (
      <Screen className="fi-bg">
        <MenuButton onClick={onExit} dark />
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
          <div className="flex items-end gap-1 -mb-2">
            <Mascot kind="fire" size={76} face={1} />
            <Mascot kind="ice" size={76} face={-1} />
          </div>
          <h1 className="fi-title text-5xl text-center leading-tight">Lửa &amp; Băng</h1>
          <p className="text-sm text-white/60 font-semibold mb-6 text-center">hai đứa cùng thoát ra nhé</p>
          <div className="fi-glass w-full max-w-xs rounded-3xl p-4 shadow-2xl sheet-up">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              className="w-full rounded-2xl border-2 border-white/15 focus:border-orange-400 outline-none px-4 py-3 mb-4 tracking-[0.5em] text-center font-bold bg-black/30 text-white placeholder:text-white/40"
              placeholder="Mã PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pin && join()}
            />
            <button
              onClick={join}
              disabled={!pin}
              className="press w-full rounded-2xl bg-gradient-to-r from-orange-500 to-sky-400 text-white py-3 font-game font-semibold text-lg shadow-lg shadow-orange-900/40 disabled:opacity-40"
            >
              Vào phòng <Ic icon={PaperPlaneTilt} weight="fill" />
            </button>
            {error && <p className="text-red-300 text-sm mt-3 text-center font-semibold">{error}</p>}
          </div>
        </div>
      </Screen>
    );
  }

  /* ---------------- sảnh chọn vai ---------------- */
  if (game.phase === 'lobby' || !me) {
    const other = me && otherOf(me);
    let hint;
    if (!me) hint = game.phase === 'playing' ? 'Đang chơi — chọn vai đang vắng để vào' : 'Chọn một vai nhé';
    else if (!game.players[other]) hint = 'Chờ người kia chọn vai…';
    else if (!game.players[other].online) hint = 'Người kia đang mất kết nối…';
    else if (!game.ready[me]) hint = 'Bấm "Sẵn sàng" khi bạn xong nhé';
    else if (!game.ready[other]) hint = 'Chờ người kia sẵn sàng…';
    else hint = 'Bắt đầu thôi!';

    return (
      <Screen className="fi-bg">
        <MenuButton onClick={onExit} dark />
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5">
          <h1 className="fi-title text-4xl text-center">Chọn vai</h1>
          <p className="text-sm text-white/65 font-semibold mb-5 text-center">{hint}</p>
          <div className="flex gap-3 w-full max-w-sm">
            {['fire', 'ice'].map((side) => {
              const R = ROLE[side];
              const holder = game.players[side];
              const mine = me === side;
              const taken = !!holder?.online && !mine;
              return (
                <button
                  key={side}
                  onClick={() => pick(side)}
                  disabled={taken}
                  className={`press fi-glass flex-1 rounded-3xl pt-3 pb-4 flex flex-col items-center shadow-xl transition ${taken ? 'opacity-45' : ''}`}
                  style={mine ? { background: R.tint, borderColor: R.edge, boxShadow: `0 0 28px ${R.tint}` } : undefined}
                >
                  <Mascot kind={side} size={84} bob={!taken} face={side === 'fire' ? 1 : -1} />
                  <span className="font-game font-bold text-xl -mt-2" style={{ color: R.text }}>{R.label}</span>
                  <span className="text-xs font-semibold text-white/55">
                    {mine ? 'Bạn' : holder ? (holder.online ? 'Có người' : 'Đang vắng') : 'Trống'}
                  </span>
                </button>
              );
            })}
          </div>
          {me && (
            <div className="flex gap-3 mt-5 w-full max-w-sm">
              <button onClick={() => emit('leave')} className="press fi-glass rounded-2xl px-5 py-3 font-game font-semibold text-white/85">
                Đổi
              </button>
              <button
                onClick={() => emit('ready', !game.ready[me])}
                disabled={!game.players[other]}
                className={`press flex-1 rounded-2xl py-3 font-game font-semibold text-lg text-white shadow-lg disabled:opacity-40 ${game.ready[me] ? 'bg-emerald-500 shadow-emerald-900/40' : 'bg-gradient-to-r from-orange-500 to-sky-400 shadow-orange-900/40'}`}
              >
                {game.ready[me] ? 'Đã sẵn sàng ✓' : 'Sẵn sàng'}
              </button>
            </div>
          )}
          {error && <p className="text-red-300 text-sm mt-3 text-center font-semibold">{error}</p>}
        </div>
      </Screen>
    );
  }

  return <Play socket={socketRef.current} me={me} game={game} onLobby={() => emit('backToLobby')} onExit={onExit} />;
}

/* ====================== màn chơi ====================== */

function Play({ socket, me, game, onLobby, onExit }) {
  const other = otherOf(me);
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const input = useRef({ left: false, right: false, jump: false });
  const gameRef = useRef(game);
  gameRef.current = game;
  const world = useRef(null);
  const [banner, setBanner] = useState('');
  const [portrait, setPortrait] = useState(false);
  const [gemCount, setGemCount] = useState(0);
  const gemTotal = useMemo(() => countGems(levelOf(game.level), me), [game.level, me]);

  // Mỗi lần server đổi nonce (bắt đầu / chết / qua màn): dựng lại màn, đưa hai người về chỗ xuất hiện
  useEffect(() => {
    const old = world.current;
    const lv = levelOf(game.level);
    const fx = old?.fx ?? [];
    const ev = game.event;
    let shake = 0;
    let text = '';
    if (ev?.type === 'died') {
      const victim = ev.by === me ? old?.mine : old?.theirs;
      if (victim) burst(fx, victim.x + BODY.w / 2, victim.y + BODY.h / 2, PAL[ev.by].glow, 40, 6, 0.9);
      shake = 1;
      text = `${ev.by === 'fire' ? 'Lửa' : 'Băng'} gục rồi, thử lại nào!`;
    } else if (ev?.type === 'win') {
      confetti(fx, lv.w);
      const got = old ? `  ◆ ${old.gems.size}/${countGems(old.lv, me)}` : '';
      text = game.level % LEVELS.length === 0 ? `Xong hết các màn! Chơi lại từ đầu nhé 🎉${got}` : `Qua màn ${game.level}! 🎉${got}`;
    }
    world.current = {
      lv,
      nonce: game.nonce,
      mine: newBody(lv.spawn[me]),
      theirs: { ...newBody(lv.spawn[other]), tx: lv.spawn[other].x, ty: lv.spawn[other].y },
      dead: false,
      sentExit: false,
      gems: new Set(),
      fx,
      shake,
    };
    setGemCount(0);
    setBanner(text);
    const t = setTimeout(() => setBanner(''), 2000);
    return () => clearTimeout(t);
  }, [game.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPos = ({ x, y, face }) => {
      const w = world.current;
      if (!w) return;
      w.theirs.tx = x;
      w.theirs.ty = y;
      w.theirs.face = face;
    };
    socket.on('pos', onPos);
    return () => socket.off('pos', onPos);
  }, [socket]);

  // Bàn phím cho lúc thử trên máy tính
  useEffect(() => {
    const map = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'jump', w: 'jump', ' ': 'jump' };
    const set = (v) => (e) => {
      const k = map[e.key];
      if (k) { input.current[k] = v; e.preventDefault(); }
    };
    const down = set(true);
    const up = set(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let last = performance.now();
    let acc = 0;
    let sendT = 0;

    const tick = (w) => {
      if (w.dead) return;
      const b = w.mine;
      const was = { ground: b.onGround, vy: b.vy };
      step(w.lv, b, input.current, pressedPlates(w.lv, [b, w.theirs]));
      const feetX = b.x + BODY.w / 2;
      if (was.ground && b.vy < -5) puff(w.fx, feetX, b.y + BODY.h, 5);
      if (!was.ground && b.onGround && was.vy > 5) {
        puff(w.fx, feetX, b.y + BODY.h, 7);
        b.squash = Math.min(0.35, was.vy * 0.025);
      }
      for (const [c, r] of collectGems(w.lv, b, me, w.gems)) {
        burst(w.fx, c + 0.5, r + 0.5, PAL[me].glow, 16, 3.5, 0.6);
        setGemCount(w.gems.size);
      }
      if (isDead(w.lv, b, me)) {
        w.dead = true;
        socket.emit('died', { nonce: w.nonce });
        return;
      }
      const at = atExit(w.lv, b, me);
      if (at !== w.sentExit) {
        w.sentExit = at;
        socket.emit('exit', { value: at, nonce: w.nonce });
      }
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const w = world.current;
      const box = boxRef.current;
      if (!w || !box) return;

      const W = box.clientWidth;
      const H = box.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setPortrait((p) => (p === H > W ? p : H > W));

      const g = gameRef.current;
      const live = !!g.players.fire?.online && !!g.players.ice?.online;
      if (live) {
        acc += dt;
        while (acc >= DT) { tick(w); acc -= DT; }
        sendT += dt;
        if (sendT >= SEND_EVERY) {
          sendT = 0;
          socket.volatile.emit('pos', { x: w.mine.x, y: w.mine.y, face: w.mine.face });
        }
      } else acc = 0;

      const k = Math.min(1, 14 * dt); // làm mượt vị trí người kia giữa các gói tin
      w.theirs.x += (w.theirs.tx - w.theirs.x) * k;
      w.theirs.y += (w.theirs.ty - w.theirs.y) * k;
      w.mine.squash = (w.mine.squash || 0) * Math.exp(-14 * dt);
      w.shake = Math.max(0, w.shake - dt * 2.5);
      if (!w.dead) ambient(w.fx, w.mine, me, dt);
      ambient(w.fx, w.theirs, other, dt);
      updateFx(w.fx, dt);

      const pressed = pressedPlates(w.lv, [w.mine, w.theirs]);
      draw(ctx, W, H, {
        lv: w.lv, mine: w.dead ? { ...w.mine, x: -9, y: -9 } : w.mine, theirs: w.theirs, me, other,
        pressed, t: now / 1000, gems: w.gems, fx: w.fx, shake: w.shake, dpr,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [socket, me, other]);

  const offline = !game.players[other]?.online;
  const R = ROLE[me];
  const lvName = LEVELS[game.level % LEVELS.length].name;

  return (
    <Screen className="fi-bg">
      <div className="relative flex-1 flex flex-col" style={{ touchAction: 'none' }}>
        <div className="flex items-center justify-between gap-2 px-3 py-2 z-10 text-sm font-game font-semibold">
          <button onClick={onExit} className="press fi-glass rounded-full px-3 py-1.5 text-white/85">Menu</button>
          <div className="fi-glass rounded-full px-3 py-1.5 flex items-center gap-2 min-w-0">
            <span className="shrink-0" style={{ color: R.text }}>{R.label}</span>
            <span className="text-white/90 truncate">Màn {(game.level % LEVELS.length) + 1}/{LEVELS.length}</span>
            <span className="hidden min-[420px]:inline text-white/50 truncate">· {lvName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="fi-glass rounded-full px-3 py-1.5 flex items-center gap-1" style={{ color: R.text }}>
              <Diamond weight="fill" /> {gemCount}/{gemTotal}
            </span>
            <button onClick={onLobby} className="press fi-glass rounded-full px-3 py-1.5 text-white/85">Sảnh</button>
          </div>
        </div>

        <div ref={boxRef} className="relative flex-1 min-h-0">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          {portrait && (
            <p className="absolute left-0 right-0 top-1 text-center text-xs text-white/55 font-semibold pointer-events-none">
              <Ic icon={DeviceRotate} /> Xoay ngang điện thoại sẽ dễ chơi hơn
            </p>
          )}
          {banner && (
            <div className="absolute inset-x-0 top-[28%] flex justify-center pointer-events-none px-4">
              <span className="fi-banner fi-glass rounded-2xl px-6 py-3 font-game text-2xl font-bold text-center shadow-2xl">{banner}</span>
            </div>
          )}
          {offline && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm font-game font-semibold text-lg text-center px-6">
              <span><Ic icon={WifiSlash} /> Người kia mất kết nối, đang chờ…</span>
            </div>
          )}
        </div>

        <Controls input={input} tint={R} />
      </div>
    </Screen>
  );
}

/* ====================== nút cảm ứng ====================== */

// Giữ để chạy, thả để dừng; trượt ngón sang nút bên cạnh vẫn tính (không bắt con trỏ cố định vào một nút)
function HoldButton({ input, name, className, style, children }) {
  const set = (v) => { input.current[name] = v; };
  return (
    <button
      className={`press select-none rounded-full text-white flex items-center justify-center backdrop-blur-md border active:brightness-150 ${className}`}
      style={{ touchAction: 'none', WebkitTouchCallout: 'none', ...style }}
      onPointerDown={(e) => { e.currentTarget.releasePointerCapture?.(e.pointerId); set(true); }}
      onPointerEnter={(e) => e.buttons && set(true)}
      onPointerUp={() => set(false)}
      onPointerLeave={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function Controls({ input, tint }) {
  // Thả hết nút khi rời màn / mất focus để nhân vật không chạy mãi
  useEffect(() => {
    const clear = () => { input.current.left = input.current.right = input.current.jump = false; };
    window.addEventListener('blur', clear);
    return () => { window.removeEventListener('blur', clear); clear(); };
  }, [input]);

  const dpad = { background: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.22)' };
  const jump = { background: tint.tint, borderColor: tint.edge, boxShadow: `0 0 24px ${tint.tint}` };
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between px-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex gap-3">
        <HoldButton input={input} name="left" className="h-20 w-20 text-4xl" style={dpad}><ArrowLeft weight="bold" /></HoldButton>
        <HoldButton input={input} name="right" className="h-20 w-20 text-4xl" style={dpad}><ArrowRight weight="bold" /></HoldButton>
      </div>
      <HoldButton input={input} name="jump" className="h-24 w-24 text-5xl" style={jump}><ArrowUp weight="bold" /></HoldButton>
    </div>
  );
}
