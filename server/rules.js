export const COLS = 15;
export const ROWS = 19; // cao hơn rộng để lấp đầy màn hình điện thoại dọc
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

export const emptyBoard = () =>
  Array.from({ length: ROWS }, () => Array(COLS).fill(null));

const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

// Luật VN: >= 5 quân liên tiếp và KHÔNG bị chặn cả 2 đầu.
// Đầu bị chặn = có quân đối thủ (mép bàn cờ không tính là chặn).
export function checkWin(board, r, c) {
  const me = board[r][c];
  if (!me) return null;
  for (const [dr, dc] of DIRS) {
    const cells = [[r, c]];
    let [a, b] = [r + dr, c + dc];
    while (inside(a, b) && board[a][b] === me) { cells.push([a, b]); a += dr; b += dc; }
    const end1 = inside(a, b) ? board[a][b] : null;
    [a, b] = [r - dr, c - dc];
    while (inside(a, b) && board[a][b] === me) { cells.unshift([a, b]); a -= dr; b -= dc; }
    const end2 = inside(a, b) ? board[a][b] : null;
    const blocked = (e) => e !== null && e !== me;
    if (cells.length >= 5 && !(blocked(end1) && blocked(end2))) return cells;
  }
  return null;
}
