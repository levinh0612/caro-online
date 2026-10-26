// Lửa & Băng: namespace /fireice, một phòng duy nhất, 2 vai 'fire' | 'ice' (co-op).
// Mỗi client tự mô phỏng nhân vật của mình; server chỉ giữ sảnh, màn hiện tại, và chuyển tiếp vị trí.
const SEATS = ['fire', 'ice'];
const ROOM = 'FI';
const MAX_COORD = 200; // toạ độ (đơn vị ô) vượt quá thì bỏ

export function attachFireIce(io, { pinOk, ipLocked, noteFail, clientIp, maxPinFails }) {
  const nsp = io.of('/fireice');

  // players[s] = { id, sid|null }. nonce tăng mỗi lần bắt đầu / chết / qua màn để hai máy cùng reset.
  const room = {
    phase: 'lobby',
    players: { fire: null, ice: null },
    ready: { fire: false, ice: false },
    exits: { fire: false, ice: false },
    level: 0,
    nonce: 0,
    event: null, // { type: 'died' | 'win', by? }
  };

  const publicState = () => {
    const p = (s) => room.players[s] && { online: !!room.players[s].sid };
    return {
      phase: room.phase,
      players: { fire: p('fire'), ice: p('ice') },
      ready: room.ready,
      level: room.level,
      nonce: room.nonce,
      event: room.event,
    };
  };
  const emit = () => nsp.to(ROOM).emit('state', publicState());
  const seatOf = (playerId) => SEATS.find((s) => room.players[s]?.id === playerId) || null;
  const bothOnline = () => SEATS.every((s) => room.players[s]?.sid);
  const newRound = () => {
    room.exits = { fire: false, ice: false };
    room.nonce += 1;
  };

  nsp.on('connection', (socket) => {
    let seat = null;
    let playerId = null;
    let pinFails = 0;

    const sit = (side) => {
      const prevSid = room.players[side]?.sid;
      room.players[side] = { id: playerId, sid: socket.id };
      seat = side;
      socket.emit('joined', { seat });
      if (prevSid && prevSid !== socket.id) nsp.sockets.get(prevSid)?.disconnect(true);
    };

    socket.on('join', ({ playerId: id, pin } = {}, ack) => {
      const ip = clientIp(socket);
      if (ipLocked(ip)) return ack?.({ ok: false, error: 'Thử sai nhiều quá, đợi một lát nhé' });
      if (!pinOk(pin)) {
        noteFail(ip);
        if (++pinFails >= maxPinFails) socket.disconnect(true);
        return ack?.({ ok: false, error: 'Sai mã PIN', badPin: true });
      }
      if (typeof id !== 'string' || !id) return ack?.({ ok: false, error: 'Thiếu mã thiết bị' });
      playerId = id;
      socket.join(ROOM);
      const mine = seatOf(playerId);
      if (mine) sit(mine);
      else socket.emit('joined', { seat: null });
      emit();
      ack?.({ ok: true });
    });

    socket.on('pick', ({ side } = {}, ack) => {
      if (!playerId) return ack?.({ ok: false, error: 'Chưa vào phòng' });
      if (!SEATS.includes(side)) return ack?.({ ok: false, error: 'Vai không hợp lệ' });
      if (seat === side) return ack?.({ ok: true });
      const holder = room.players[side];
      if (holder?.sid) return ack?.({ ok: false, error: 'Vai này có người chọn rồi' });
      if (seat && holder) return ack?.({ ok: false, error: 'Bạn đang giữ vai khác' });
      if (seat && room.phase !== 'lobby') return ack?.({ ok: false, error: 'Đang chơi, không đổi vai được' });
      if (seat) {
        room.players[seat] = null;
        room.ready[seat] = false;
      }
      sit(side);
      room.ready[side] = false;
      emit();
      ack?.({ ok: true });
    });

    socket.on('leave', () => {
      if (!seat || room.phase !== 'lobby') return;
      room.players[seat] = null;
      room.ready[seat] = false;
      seat = null;
      socket.emit('joined', { seat: null });
      emit();
    });

    socket.on('ready', (value) => {
      if (!seat || room.phase !== 'lobby') return;
      if (!SEATS.every((s) => room.players[s])) return;
      room.ready[seat] = !!value;
      if (SEATS.every((s) => room.ready[s]) && bothOnline()) {
        room.phase = 'playing';
        room.ready = { fire: false, ice: false };
        room.level = 0;
        room.event = null;
        newRound();
      }
      emit();
    });

    // Vị trí của mình, chuyển cho người kia (volatile: trễ thì bỏ, không dồn hàng đợi)
    socket.on('pos', ({ x, y, face } = {}) => {
      if (!seat || room.phase !== 'playing') return;
      if (![x, y].every((n) => Number.isFinite(n) && Math.abs(n) <= MAX_COORD)) return;
      socket.to(ROOM).volatile.emit('pos', { x, y, face: face === -1 ? -1 : 1 });
    });

    // Chạm hố sai loại: reset cả hai. Kiểm tra nonce để hai tin "chết" gần nhau chỉ tính một lần.
    socket.on('died', ({ nonce } = {}) => {
      if (!seat || room.phase !== 'playing' || nonce !== room.nonce) return;
      room.event = { type: 'died', by: seat };
      newRound();
      emit();
    });

    // Đứng ở cửa thoát của mình hay không; cả hai cùng đứng thì qua màn
    socket.on('exit', ({ value, nonce } = {}) => {
      if (!seat || room.phase !== 'playing' || nonce !== room.nonce) return;
      room.exits[seat] = !!value;
      if (SEATS.every((s) => room.exits[s]) && bothOnline()) {
        room.level += 1;
        room.event = { type: 'win' };
        newRound();
        emit();
      }
    });

    socket.on('backToLobby', () => {
      if (!seat || room.phase !== 'playing') return;
      room.phase = 'lobby';
      room.ready = { fire: false, ice: false };
      room.level = 0;
      room.event = null;
      newRound();
      emit();
    });

    socket.on('disconnect', () => {
      if (!seat) return;
      const p = room.players[seat];
      if (p?.sid === socket.id) {
        p.sid = null;
        room.ready[seat] = false;
        room.exits[seat] = false;
      }
      emit();
    });
  });
}
