import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Cat, Confetti as ConfettiIcon, EnvelopeSimple, Flag, Handshake, Heart, PaperPlaneTilt, Rabbit, SmileySad, WifiSlash,
} from '@phosphor-icons/react';
import { Ic, MenuButton, Screen } from './ui.jsx';
import { getPlayerId, read, write } from './storage.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const EMOJIS = ['❤️', '😘', '🥰', '😂', '😭', '😡', '👏'];
const SIDE = {
  X: { label: 'Thỏ Tim', Icon: Rabbit, color: '#ff5c8a', bg: 'bg-pink-200/70', card: 'bg-pink-100 border-heart shadow-pink-200', glyph: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' },
  O: { label: 'Mèo Sao', Icon: Cat, color: '#4fb0ff', bg: 'bg-sky-200/70', card: 'bg-sky-100 border-star shadow-sky-200', glyph: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z' },
};

const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const STAR = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

function Piece({ symbol, ghost, jump, delay }) {
  const isX = symbol === 'X';
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-[78%] h-[78%] ${ghost ? 'ghost' : jump ? 'win-jump' : 'piece-pop'}`}
      style={{ '--d': delay, filter: `drop-shadow(0 1px 1px ${isX ? '#ff5c8a66' : '#4fb0ff66'})` }}
    >
      <path d={isX ? HEART : STAR} fill={isX ? '#ff5c8a' : '#4fb0ff'} />
    </svg>
  );
}

const rand = (a, b) => a + Math.random() * (b - a);

function Shape({ kind, color, size, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...rest}>
      <path d={kind === 'star' ? STAR : HEART} fill={color} />
    </svg>
  );
}

const BG_SHAPES = [['heart', '#ff8fb1'], ['star', '#8fcdff'], ['heart', '#ffc2d6'], ['star', '#ffe08a'], ['heart', '#ff5c8a']];
const CONFETTI_SHAPES = [['heart', '#ff5c8a'], ['star', '#ffd23f'], ['heart', '#ff8fb1'], ['star', '#4fb0ff'], ['heart', '#ffb3c7']];

function BackgroundHearts() {
  const items = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({
      i, left: rand(2, 96), size: rand(14, 28), dur: rand(16, 28), del: -rand(0, 24), shape: BG_SHAPES[i % 5],
    })),
    [],
  );
  return items.map((h) => (
    <span key={h.i} className="float-bg" style={{ left: `${h.left}%`, '--dur': `${h.dur}s`, '--del': `${h.del}s` }}>
      <Shape kind={h.shape[0]} color={h.shape[1]} size={h.size} />
    </span>
  ));
}

function Confetti() {
  const items = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({
      i, left: rand(0, 100), size: rand(14, 26), dur: rand(2.8, 5), del: -rand(0, 4), shape: CONFETTI_SHAPES[i % 5],
    })),
    [],
  );
  return items.map((c) => (
    <span key={c.i} className="confetti" style={{ left: `${c.left}%`, '--dur': `${c.dur}s`, '--del': `${c.del}s` }}>
      <Shape kind={c.shape[0]} color={c.shape[1]} size={c.size} />
    </span>
  ));
}

function Dots() {
  return (
    <span className="inline-flex gap-1 ml-1 align-middle">
      {[0, 0.2, 0.4].map((d) => (
        <span key={d} className="dot w-1.5 h-1.5 rounded-full bg-current" style={{ animationDelay: `${d}s` }} />
      ))}
    </span>
  );
}

export default function App({ onExit }) {
  const playerId = useMemo(getPlayerId, []);
  const socketRef = useRef(null);
  const [pin, setPin] = useState(() => read('caro.pin'));
  const [error, setError] = useState('');
  const [me, setMe] = useState(null); // 'X' | 'O'
  const [game, setGame] = useState(null);
  const [floats, setFloats] = useState([]);
  const [confirmResign, setConfirmResign] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState(false); // thu gọn khay emoji/hành động
  const drag = useRef(null);
  const swiped = useRef(false); // vừa vuốt xong thì bỏ qua cú click sinh ra sau đó
  const [kicked, setKicked] = useState(false); // bị tab/máy khác của cùng người chơi giành chỗ
  const scrollRef = useRef(null);
  const pinch = useRef(null);

  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('joined', ({ symbol }) => setMe(symbol));
    socket.on('state', (g) => { setGame(g); setKicked(false); });
    socket.on('disconnect', (reason) => { if (reason === 'io server disconnect') setKicked(true); });
    socket.on('emoji', ({ emoji }) => {
      const id = Math.random();
      setFloats((f) => [...f, { id, emoji, left: rand(8, 82) }]);
      setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 2300);
    });
    // Đã lưu PIN thì tự vào phòng (mở lại trang / mạng chập chờn)
    socket.on('connect', () => {
      const saved = read('caro.pin');
      if (saved) {
        socket.emit('join', { playerId, pin: saved }, (res) => {
          if (!res.ok) {
            setError(res.error);
            if (res.badPin) write('caro.pin', '');
          }
        });
      }
    });
    return () => socket.disconnect();
  }, [playerId]);

  const gameOver = !!game && (!!game.winner || game.draw);
  useEffect(() => { if (gameOver) setConfirmResign(false); }, [gameOver]);

  // Safari iOS: chặn zoom cả trang khi chụm, để chỉ bàn cờ zoom
  useEffect(() => {
    const stop = (e) => e.preventDefault();
    document.addEventListener('gesturestart', stop);
    return () => document.removeEventListener('gesturestart', stop);
  }, []);

  const clampZoom = (z) => Math.min(3, Math.max(1, z));
  // giữ nguyên tâm nhìn khi đổi mức zoom
  const applyZoom = (next) => {
    const el = scrollRef.current;
    const z = clampZoom(next);
    if (el) {
      const cx = (el.scrollLeft + el.clientWidth / 2) / zoom;
      const cy = (el.scrollTop + el.clientHeight / 2) / zoom;
      requestAnimationFrame(() => {
        el.scrollLeft = cx * z - el.clientWidth / 2;
        el.scrollTop = cy * z - el.clientHeight / 2;
      });
    }
    setZoom(z);
  };
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e) => { if (e.touches.length === 2) pinch.current = { d: dist(e.touches), z: zoom }; };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinch.current) applyZoom(pinch.current.z * (dist(e.touches) / pinch.current.d));
  };
  const onTouchEnd = (e) => { if (e.touches.length < 2) pinch.current = null; };

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

  /* ---------------- màn hình nhập PIN ---------------- */
  if (!game) {
    const can = !!pin;
    return (
      <Screen>
        <BackgroundHearts />
        {onExit && <MenuButton onClick={onExit} />}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
          <div className="mascot flex items-center gap-1 mb-3 drop-shadow">
            <Rabbit size={64} weight="duotone" color="#ff5c8a" />
            <Heart size={30} weight="fill" color="#ff8fb1" />
            <Cat size={64} weight="duotone" color="#4fb0ff" />
          </div>
          <h1 className="font-display font-extrabold text-4xl text-heart text-center leading-tight">Cờ Caro</h1>
          <p className="text-sm text-heart/70 font-semibold mb-6 text-center">của hai đứa mình <Ic icon={Heart} weight="fill" /></p>
          <div className="w-full max-w-xs bg-white/80 backdrop-blur rounded-3xl p-4 shadow-lg shadow-pink-200/60 sheet-up">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              className="w-full rounded-2xl border-2 border-pink-100 focus:border-heart outline-none px-4 py-3 mb-4 tracking-[0.5em] text-center font-bold bg-white"
              placeholder="Mã PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && can && join()}
            />
            <button
              onClick={join}
              disabled={!can}
              className="press w-full rounded-2xl bg-heart text-white py-3 font-display font-bold text-lg shadow-md shadow-pink-300 disabled:opacity-40 disabled:shadow-none"
            >
              Vào phòng <Ic icon={PaperPlaneTilt} weight="fill" />
            </button>
            {error && <p className="text-red-500 text-sm mt-3 text-center font-semibold">{error}</p>}
          </div>
          <p className="text-[11px] text-heart/60 mt-4 text-center">5 quân liên tiếp, không bị chặn 2 đầu là thắng</p>
        </div>
      </Screen>
    );
  }

  /* ---------------- sảnh chọn phe ---------------- */
  if (game.phase === 'lobby' || !me) {
    const { players: lp, ready, phase } = game;
    const other = me === 'X' ? 'O' : 'X';
    const bothSeated = !!lp.X && !!lp.O;
    let hint;
    if (!me) hint = phase === 'playing' ? 'Ván đang diễn ra — chọn phe đang vắng để vào' : 'Chọn một phe nhé';
    else if (!lp[other]) hint = <>Chờ người kia chọn phe<Dots /></>;
    else if (!lp[other].online) hint = <>Người kia đang mất kết nối<Dots /></>;
    else if (!ready[me]) hint = 'Bấm "Sẵn sàng" khi bạn xong nhé';
    else if (!ready[other]) hint = <>Chờ người kia sẵn sàng<Dots /></>;
    else hint = 'Bắt đầu thôi!';

    return (
      <Screen>
        <BackgroundHearts />
        {onExit && <MenuButton onClick={onExit} />}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5">
          <h1 className="font-display font-extrabold text-3xl text-heart text-center leading-tight">Chọn phe</h1>
          <p className="text-sm text-heart/70 font-semibold mb-4 text-center">Cả hai sẵn sàng là bắt đầu <Ic icon={Heart} weight="fill" /></p>
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            {['X', 'O'].map((s) => {
              const cfg = SIDE[s];
              const holder = lp[s];
              const mine = me === s;
              const away = holder && !holder.online && !mine;
              const taken = holder && holder.online && !mine;
              const canPick = !mine && !taken && !(me && holder);
              return (
                <div
                  key={s}
                  className={`sheet-up rounded-3xl border-2 p-3 flex flex-col items-center text-center shadow-lg ${mine || taken || away ? cfg.card : 'bg-white/80 border-transparent shadow-pink-100'}`}
                >
                  <span className={`w-20 h-20 rounded-full flex items-center justify-center ${cfg.bg} ${mine ? 'mascot' : ''}`}>
                    <cfg.Icon size={52} weight="duotone" color={cfg.color} />
                  </span>
                  <div className="font-display font-extrabold text-lg mt-2 flex items-center gap-1">
                    <svg viewBox="0 0 24 24" className="w-4 h-4"><path d={cfg.glyph} fill={cfg.color} /></svg>
                    {cfg.label}
                  </div>
                  <div className="text-xs font-semibold h-5 mt-0.5 text-[#6b2d45]/80">
                    {mine ? (ready[s] ? 'Bạn · sẵn sàng' : 'Bạn') : taken ? (ready[s] ? 'Người ấy · sẵn sàng' : 'Người ấy') : away ? 'Đang vắng' : 'Còn trống'}
                  </div>
                  {canPick && (
                    <button
                      onClick={() => pick(s)}
                      className="press mt-2 w-full rounded-2xl py-2 font-bold text-sm text-white"
                      style={{ background: cfg.color }}
                    >
                      {away ? 'Ngồi thay' : me ? 'Đổi sang phe này' : 'Chọn phe này'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {me && (
            <div className="w-full max-w-sm mt-4 flex gap-2">
              <button
                onClick={() => emit('ready', !ready[me])}
                disabled={!bothSeated}
                className={`press flex-1 rounded-2xl py-3 font-display font-bold text-lg shadow-md disabled:opacity-40 ${ready[me] ? 'bg-white text-heart border-2 border-pink-200' : 'bg-heart text-white shadow-pink-300'}`}
              >
                {ready[me] ? 'Huỷ sẵn sàng' : 'Sẵn sàng'}
              </button>
              <button
                onClick={() => emit('leave')}
                className="press rounded-2xl bg-white/90 border-2 border-pink-200 text-heart px-4 font-bold text-sm"
              >
                Rời phe
              </button>
            </div>
          )}
          <p className="mt-4 text-sm font-bold text-heart text-center min-h-5">{hint}</p>
          {error && <p className="text-red-500 text-sm mt-1 text-center font-semibold">{error}</p>}
        </div>
      </Screen>
    );
  }

  /* ---------------- màn hình chơi ---------------- */
  const { players, board, turn, winner, draw, winLine, lastMove, score, drawOffer, resigned } = game;
  const waiting = !players.X || !players.O || !players.X.online || !players.O.online;
  const winSet = new Map((winLine || []).map(([r, c], i) => [`${r},${c}`, i]));
  const over = !!winner || draw;
  const myTurn = !over && !waiting && turn === me;
  const iWon = winner === me;
  const partner = players[me === 'X' ? 'O' : 'X'];

  // kết quả ván / lời xin hoà luôn bật khay lên để không bỏ sót
  const sheetOpen = !collapsed || over || (!waiting && !!drawOffer && drawOffer !== me);

  const tap = (r, c) => {
    if (!myTurn || board[r][c]) return;
    emit('move', { row: r, col: c });
  };

  return (
    <Screen>
      <BackgroundHearts />
      {iWon && <Confetti />}

      <div className="relative z-10 flex flex-col h-full max-w-xl mx-auto w-full px-2.5 pt-2 pb-2">
        {/* tiêu đề */}
        <div className="flex items-center justify-between px-1 h-8">
          <span className="font-display font-extrabold text-heart text-lg"><Ic icon={Heart} weight="fill" /> Cờ Caro</span>
        </div>

        {/* người chơi */}
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          {['X', 'O'].map((s) => {
            const active = turn === s && !over && !waiting;
            const isMe = me === s;
            return (
              <div
                key={s}
                className={`relative rounded-2xl px-3 py-1.5 flex items-center gap-2 transition-all duration-300 border-2
                  ${active ? (s === 'X' ? 'bg-pink-100 border-heart scale-[1.03] shadow-md shadow-pink-200' : 'bg-sky-100 border-star scale-[1.03] shadow-md shadow-sky-200') : 'bg-white/70 border-transparent'}`}
              >
                <span
                  className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${s === 'X' ? 'bg-pink-200/70' : 'bg-sky-200/70'} ${active ? 'turn-hop' : ''}`}
                >
                  <Ic icon={SIDE[s].Icon} size={28} color={SIDE[s].color} className="!align-baseline" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[13px] font-bold">
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0"><path d={s === 'X' ? HEART : STAR} fill={s === 'X' ? '#ff5c8a' : '#4fb0ff'} /></svg>
                    <span className="truncate">{SIDE[s].label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-display font-extrabold text-xl leading-none">{score[s]}</span>
                    {active ? (
                      <span className="rounded-full px-1.5 text-[10px] font-bold leading-4 text-white whitespace-nowrap" style={{ background: SIDE[s].color }}>
                        {isMe ? <>Lượt bạn <Ic icon={Heart} weight="fill" /></> : <>Đang nghĩ<Dots /></>}
                      </span>
                    ) : isMe && (
                      <span className="rounded-full bg-white/90 px-1.5 text-[10px] font-bold leading-4" style={{ color: SIDE[s].color }}>bạn</span>
                    )}
                  </div>
                </div>
                {players[s] && (
                  <span className={`absolute top-1.5 right-2 w-2 h-2 rounded-full ${players[s].online ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* bàn cờ */}
        <div className="flex-1 min-h-0 mt-3 flex justify-center relative" style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
          <div
            ref={scrollRef}
            className="w-full h-full overflow-auto rounded-2xl shadow-xl shadow-pink-200/70"
            style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'contain' }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
          <div
            className="relative bg-white/85 p-1"
            style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, minHeight: 0 }}
          >
            <div className="grid w-full h-full" style={{ gridTemplateColumns: `repeat(${board[0].length}, 1fr)`, gridTemplateRows: `repeat(${board.length}, 1fr)` }}>
              {board.map((row, r) =>
                row.map((cell, c) => {
                  const isLast = lastMove && lastMove[0] === r && lastMove[1] === c;
                  const winIdx = winSet.get(`${r},${c}`);
                  return (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => tap(r, c)}
                      aria-label={`Hàng ${r + 1} cột ${c + 1}`}
                      className={`relative flex items-center justify-center border-[0.5px] border-pink-200/80 p-0
                        ${winIdx !== undefined ? 'bg-yellow-100' : isLast ? 'bg-pink-50' : 'bg-transparent'}`}
                    >
                      {cell ? (
                        <>
                          <Piece symbol={cell} jump={winIdx !== undefined} delay={`${(winIdx || 0) * 0.12}s`} />
                          {isLast && !over && <span className="last-ripple absolute inset-0" style={{ '--ripple': cell === 'X' ? '#ff5c8a' : '#4fb0ff' }} />}
                        </>
                      ) : null}
                    </button>
                  );
                }),
              )}
            </div>

            {waiting && (
              <div className="absolute inset-0 rounded-2xl bg-white/70 backdrop-blur-[2px] flex flex-col items-center justify-center text-center px-6">
                <div className="mascot mb-2">
                  {partner
                    ? <WifiSlash size={64} weight="duotone" color="#ff5c8a" />
                    : <EnvelopeSimple size={64} weight="duotone" color="#ff5c8a" />}
                </div>
                <div className="font-display font-bold text-heart text-lg">
                  {partner ? 'Người ấy đang mất kết nối' : 'Chờ người yêu vào phòng'}
                  <Dots />
                </div>
                <div className="text-xs text-heart/70 mt-1 font-semibold">Ván cờ sẽ tiếp tục ngay khi có đủ 2 người</div>
              </div>
            )}
          </div>
          </div>
          <div className="absolute right-1.5 bottom-1.5 flex flex-col gap-1.5">
            {[['+', 0.5, 'Phóng to'], ['−', -0.5, 'Thu nhỏ']].map(([t, d, label]) => (
              <button
                key={t}
                onClick={() => applyZoom(zoom + d)}
                aria-label={label}
                className="press w-9 h-9 rounded-full bg-white/90 shadow-md text-heart text-xl font-bold leading-none"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* khu vực dưới: emoji + hành động */}
        <div
          className="mt-1"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)', touchAction: 'none' }}
          onPointerDown={(e) => { drag.current = { y: e.clientY }; }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dy = e.clientY - d.y;
            if (Math.abs(dy) > 20) { setCollapsed(dy > 0); drag.current = null; swiped.current = true; setTimeout(() => { swiped.current = false; }, 350); }
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          {/* tay nắm: vuốt xuống để thu gọn, vuốt lên (hoặc chạm) để mở */}
          <div
            role="button"
            aria-label={sheetOpen ? 'Thu gọn' : 'Mở rộng'}
            className="flex justify-center pt-3 pb-2 -mt-2"
            onClick={() => { if (!swiped.current) setCollapsed((c) => !c); }}
          >
            <span className="h-1.5 w-12 rounded-full bg-heart/40" />
          </div>
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: sheetOpen ? '1fr' : '0fr' }}
          >
          <div className="overflow-hidden min-h-0">
          <div className="space-y-2">
          <div className="flex justify-between bg-white/70 rounded-full px-3 py-1">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => emit('emoji', e)} className="press text-2xl w-9 h-9 flex items-center justify-center" aria-label={`Gửi ${e}`}>
                {e}
              </button>
            ))}
          </div>

          {over ? (
            <div className="sheet-up rounded-3xl bg-white/90 shadow-lg shadow-pink-200 p-3 text-center">
              <div className="font-display font-extrabold text-xl text-heart">
                {draw ? <>Hai đứa hoà nhau <Ic icon={Handshake} /></> : resigned
                  ? (resigned === me
                    ? <><Ic icon={Flag} /> Bạn đã đầu hàng</>
                    : <><Ic icon={ConfettiIcon} /> {SIDE[resigned].label} đầu hàng</>)
                  : iWon ? <><Ic icon={ConfettiIcon} /> Giỏi quá đi!</> : <>Thua nhưng vẫn yêu <Ic icon={Heart} weight="fill" /></>}
              </div>
              <button
                onClick={() => emit('rematch')}
                className="press mt-2 w-full rounded-2xl bg-heart text-white py-3 font-display font-bold text-lg shadow-md shadow-pink-300"
              >
                Chơi ván nữa <Ic icon={Heart} weight="fill" />
              </button>
              <button
                onClick={() => emit('backToLobby')}
                className="press mt-2 w-full rounded-2xl bg-white border-2 border-pink-200 text-heart py-2.5 font-bold text-sm"
              >
                Về sảnh chọn phe
              </button>
            </div>
          ) : !waiting && drawOffer && drawOffer !== me ? (
            <div className="sheet-up rounded-3xl bg-yellow-100 border-2 border-yellow-300 p-3 text-center">
              <div className="font-bold text-yellow-800 mb-2">{SIDE[drawOffer].label} xin hoà <Ic icon={Handshake} /></div>
              <div className="flex gap-2">
                <button onClick={() => emit('acceptDraw')} className="press flex-1 rounded-2xl bg-emerald-400 text-white py-2.5 font-bold">Đồng ý hoà</button>
                <button onClick={() => emit('declineDraw')} className="press flex-1 rounded-2xl bg-white text-heart border-2 border-pink-200 py-2.5 font-bold">Đánh tiếp</button>
              </div>
            </div>
          ) : confirmResign ? (
            <div className="sheet-up flex items-center gap-2">
              <span className="flex-1 text-center text-sm font-bold text-heart">Đầu hàng thật hả? <Ic icon={SmileySad} /></span>
              <button onClick={() => { emit('resign'); setConfirmResign(false); }} className="press rounded-2xl bg-heart text-white px-5 py-2.5 font-bold">Đầu hàng</button>
              <button onClick={() => setConfirmResign(false)} className="press rounded-2xl bg-white border-2 border-pink-200 text-heart px-4 py-2.5 font-bold">Huỷ</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => emit('offerDraw')}
                disabled={waiting || drawOffer === me}
                className="press flex-1 rounded-2xl bg-white/90 border-2 border-pink-200 text-heart py-2.5 font-bold text-sm disabled:opacity-50"
              >
                {drawOffer === me ? 'Đã xin hoà, chờ nhé…' : <><Ic icon={Handshake} /> Xin hoà</>}
              </button>
              <button
                onClick={() => setConfirmResign(true)}
                disabled={waiting}
                className="press flex-1 rounded-2xl bg-white/90 border-2 border-pink-200 text-heart py-2.5 font-bold text-sm disabled:opacity-50"
              >
                <Ic icon={Flag} /> Đầu hàng
              </button>
              {waiting && (
                <button
                  onClick={() => emit('backToLobby')}
                  className="press flex-1 rounded-2xl bg-white/90 border-2 border-pink-200 text-heart py-2.5 font-bold text-sm"
                >
                  Về sảnh
                </button>
              )}
            </div>
          )}
          </div>
          </div>
          </div>
        </div>
      </div>

      {kicked && (
        <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-2 bg-heart px-3 py-2 text-white text-sm font-bold" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
          <span className="flex-1">Phòng đang mở ở tab/máy khác</span>
          <button onClick={() => socketRef.current?.connect()} className="press rounded-xl bg-white px-3 py-1 text-heart">Vào lại</button>
        </div>
      )}

      {/* emoji bay lên */}
      {floats.map((f) => (
        <span key={f.id} className="float-emoji fixed text-5xl pointer-events-none z-20" style={{ left: `${f.left}%`, bottom: '14%' }}>
          {f.emoji}
        </span>
      ))}
    </Screen>
  );
}
