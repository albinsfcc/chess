/** Detect promotion/reversal without generating legal moves on the UI thread. */
export function promotionTransition(before: string, after: string): boolean {
  const a = before.split(" ")[0], b = after.split(" ")[0];
  for (const pieces of ["PNBRQ", "pnbrq"]) {
    const count = (board: string, piece: string) => board.split(piece).length - 1;
    const pawnChange = count(b, pieces[0]) - count(a, pieces[0]);
    if (Math.abs(pawnChange) !== 1) continue;
    if ([...pieces.slice(1)].some(piece => count(b, piece) - count(a, piece) === -pawnChange)) return true;
  }
  return false;
}
