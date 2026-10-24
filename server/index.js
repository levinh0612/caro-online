import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Server } from 'socket.io';
import { ROWS, COLS, emptyBoard, checkWin } from './rules.js';

const PORT = process.env.PORT || 3001;
const ORIGIN = process.env.CLIENT_ORIGIN || '*';
const ROOM_PIN = process.env.ROOM_PIN;
if (!ROOM_PIN) {
  console.error('Thiếu ROOM_PIN (đặt trong server/.env hoặc biến môi trường)');
  process.exit(1);
}

const pinOk = (input) => {
  const a = Buffer.from(String(input ?? ''));
  const b = Buffer.from(ROOM_PIN);
  return a.length === b.length && timingSafeEqual(a, b);
};
const MAX_PIN_FAILS = 5; // sai quá số lần này trên 1 kết nối thì bị ngắt

// Chặn dò PIN theo IP: quá 10 lần sai trong 10 phút thì khoá IP đó 10 phút
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const MAX_IP_FAILS = 10;
const ipFails = new Map(); // ip -> { n, since }
const clientIp = (socket) =>
  String(socket.handshake.headers['x-forwarded-for'] || socket.handshake.address).split(',').pop().trim();
const ipLocked = (ip) => {
  const f = ipFails.get(ip);
  if (!f) return false;
  if (Date.now() - f.since > FAIL_WINDOW_MS) { ipFails.delete(ip); return false; }
  return f.n >= MAX_IP_FAILS;
};
const noteFail = (ip) => {
  const f = ipFails.get(ip);
  if (!f || Date.now() - f.since > FAIL_WINDOW_MS) ipFails.set(ip, { n: 1, since: Date.now() });
  else f.n += 1;
};

const httpServer = createServer((req, res) => {
  res.writeHead(200).end('caro server ok');
});
const io = new Server(httpServer, { cors: { origin: ORIGIN } });

const ROOM = 'LOVE';
const SEATS = ['X', 'O'];

// Một phòng duy nhất, 2 phe. players[s] = { id, sid|null }  (id là token client tự giữ)
// phase: 'lobby' (chọn phe + sẵn sàng) -> 'playing'
const room = {
  phase: 'lobby',
  players: { X: null, O: null },
  ready: { X: false, O: false },
  score: { X: 0, O: 0 },
  firstTurn: 'X',
};
resetBoard(room);

function resetBoard(r) {
  r.board = emptyBoard();
  r.turn = r.firstTurn;
  r.winner = null;
  r.winLine = null;
  r.draw = false;
  r.drawOffer = null; // ký hiệu người đang xin hoà
  r.resigned = null; // ký hiệu người đã đầu hàng
  r.lastMove = null;
}

function publicState() {
  const p = (s) => room.players[s] && { online: !!room.players[s].sid };
  return {
    phase: room.phase,
    ready: room.ready,
    board: room.board,
    turn: room.turn,
    winner: room.winner,
    winLine: room.winLine,
    draw: room.draw,
    drawOffer: room.drawOffer,
    resigned: room.resigned,
    lastMove: room.lastMove,
    score: room.score,
    players: { X: p('X'), O: p('O') },
  };
}

const emit = () => io.to(ROOM).emit('state', publicState());
const seatOf = (playerId) => SEATS.find((s) => room.players[s]?.id === playerId) || null;
const bothOnline = () => SEATS.every((s) => room.players[s]?.sid);

io.on('connection', (socket) => {
  let current = null; // { symbol } khi đã có phe
  let playerId = null; // có giá trị sau khi join đúng PIN
  let pinFails = 0;

  // Gán kết nối này vào phe `symbol`; đá kết nối cũ của cùng phe (nếu còn) sau khi đã gán xong
  const sit = (symbol) => {
    const prevSid = room.players[symbol]?.sid;
    room.players[symbol] = { id: playerId, sid: socket.id };
    current = { symbol };
    socket.emit('joined', { symbol });
    if (prevSid && prevSid !== socket.id) io.sockets.sockets.get(prevSid)?.disconnect(true);
  };

  socket.on('join', ({ playerId: id, pin } = {}, ack) => {
    const ip = clientIp(socket);
    if (ipLocked(ip)) return ack?.({ ok: false, error: 'Thử sai nhiều quá, đợi một lát nhé' });
    if (!pinOk(pin)) {
      noteFail(ip);
      if (++pinFails >= MAX_PIN_FAILS) socket.disconnect(true);
      return ack?.({ ok: false, error: 'Sai mã PIN', badPin: true });
    }
    if (typeof id !== 'string' || !id) return ack?.({ ok: false, error: 'Thiếu mã thiết bị' });
    playerId = id;
    socket.join(ROOM);
    const seat = seatOf(playerId);
    if (seat) {
      sit(seat); // vào lại phe cũ (tải lại trang / mạng chập chờn)
    } else {
      current = null;
      socket.emit('joined', { symbol: null });
    }
    emit();
    ack?.({ ok: true });
  });

  // Chọn / đổi phe. Phe trống: ngồi vào. Phe có người đang vắng mặt: ngồi thay (đổi máy).
  socket.on('pick', ({ side } = {}, ack) => {
    if (!playerId) return ack?.({ ok: false, error: 'Chưa vào phòng' });
    if (!SEATS.includes(side)) return ack?.({ ok: false, error: 'Phe không hợp lệ' });
    const mine = current?.symbol ?? null;
    if (mine === side) return ack?.({ ok: true });

    const holder = room.players[side];
    if (holder?.sid) return ack?.({ ok: false, error: 'Phe này có người chọn rồi' });
    if (mine && holder) return ack?.({ ok: false, error: 'Bạn đang giữ phe khác' });
    if (mine && room.phase !== 'lobby') return ack?.({ ok: false, error: 'Đang chơi, không đổi phe được' });

    if (mine) {
      room.players[mine] = null; // rời phe cũ, sang phe trống
      room.ready[mine] = false;
    }
    sit(side);
    room.ready[side] = false;
    emit();
    ack?.({ ok: true });
  });

  socket.on('leave', () => {
    if (!current || room.phase !== 'lobby') return;
    room.players[current.symbol] = null;
    room.ready[current.symbol] = false;
    current = null;
    socket.emit('joined', { symbol: null });
    emit();
  });

  socket.on('ready', (value) => {
    if (!current || room.phase !== 'lobby') return;
    if (!SEATS.every((s) => room.players[s])) return; // cần đủ 2 phe mới sẵn sàng được
    room.ready[current.symbol] = !!value;
    if (SEATS.every((s) => room.ready[s]) && bothOnline()) {
      room.phase = 'playing';
      room.ready = { X: false, O: false };
      resetBoard(room);
    }
    emit();
  });

  socket.on('move', ({ row, col } = {}) => {
    if (!current || room.phase !== 'playing' || room.winner || room.draw) return;
    if (!bothOnline()) return;
    if (room.turn !== current.symbol) return;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS || room.board[row][col]) return;

    room.drawOffer = null;
    room.board[row][col] = current.symbol;
    room.lastMove = [row, col];
    const line = checkWin(room.board, row, col);
    if (line) {
      room.winner = current.symbol;
      room.winLine = line;
      room.score[current.symbol] += 1;
    } else if (room.board.every((r) => r.every(Boolean))) {
      room.draw = true;
    } else {
      room.turn = current.symbol === 'X' ? 'O' : 'X';
    }
    emit();
  });

  const playing = () =>
    current && room.phase === 'playing' && bothOnline() && !room.winner && !room.draw;
  const other = () => (current.symbol === 'X' ? 'O' : 'X');

  socket.on('offerDraw', () => {
    if (!playing() || room.drawOffer) return;
    room.drawOffer = current.symbol;
    emit();
  });

  socket.on('acceptDraw', () => {
    if (!playing() || room.drawOffer !== other()) return;
    room.draw = true;
    room.drawOffer = null;
    emit();
  });

  socket.on('declineDraw', () => {
    if (!playing() || room.drawOffer !== other()) return;
    room.drawOffer = null;
    emit();
  });

  socket.on('resign', () => {
    if (!playing()) return;
    room.winner = other();
    room.resigned = current.symbol;
    room.drawOffer = null;
    room.score[room.winner] += 1;
    emit();
  });

  // Chơi lại: đổi bên đi trước mỗi ván
  socket.on('rematch', () => {
    if (!current || room.phase !== 'playing' || !(room.winner || room.draw)) return;
    room.firstTurn = room.firstTurn === 'X' ? 'O' : 'X';
    resetBoard(room);
    emit();
  });

  // Về sảnh: chỉ khi ván đã kết thúc hoặc đối phương mất kết nối; cả hai cùng về, giữ nguyên chỗ ngồi
  socket.on('backToLobby', () => {
    if (!current || room.phase !== 'playing') return;
    if (!(room.winner || room.draw) && bothOnline()) return;
    room.phase = 'lobby';
    room.ready = { X: false, O: false };
    room.score = { X: 0, O: 0 };
    room.firstTurn = 'X';
    resetBoard(room);
    emit();
  });

  socket.on('emoji', (emoji) => {
    if (current && typeof emoji === 'string' && emoji.length <= 8) {
      io.to(ROOM).emit('emoji', { from: current.symbol, emoji });
    }
  });

  socket.on('disconnect', () => {
    if (!current) return;
    const p = room.players[current.symbol];
    if (p?.sid === socket.id) {
      p.sid = null;
      room.ready[current.symbol] = false;
    }
    emit();
  });
});

httpServer.listen(PORT, () => console.log(`caro server listening on :${PORT}`));
