export const read = (k, d = '') => {
  try { return localStorage.getItem(k) ?? d; } catch { return d; }
};
export const write = (k, v) => {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
};

// Mã thiết bị dùng chung cho mọi trò, để vào lại đúng chỗ ngồi sau khi tải lại trang
export function getPlayerId() {
  let id = read('caro.playerId');
  if (!id) {
    // randomUUID chỉ có ở https/localhost; mở bằng IP mạng LAN (http) thì phải tự sinh
    id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    write('caro.playerId', id);
  }
  return id;
}
