import { randomInt } from "node:crypto";
import { DIFFICULTIES, type Difficulty, type Piece } from "@puzzle/shared";
export const BOARD = { width: 1000, height: 700 };
// El puzzle ocupa una zona central y deja espacio alrededor para las piezas sueltas.
export const PUZZLE = { width: 700, height: 490, x: 150, y: 105 };
export function generatePieces(difficulty: Difficulty): Piece[] {
  const { rows, cols } = DIFFICULTIES[difficulty],
    w = PUZZLE.width / cols,
    h = PUZZLE.height / rows;
  const cells = Array.from({ length: rows * cols }, (_, i) => ({
    x: cols === 1 ? 0 : ((i % cols) * (BOARD.width - w)) / (cols - 1),
    y:
      rows === 1 ? 0 : (Math.floor(i / cols) * (BOARD.height - h)) / (rows - 1),
  }));
  for (let i = cells.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.map((p, i) => ({
    id: `p${i}`,
    groupId: `p${i}`,
    row: Math.floor(i / cols),
    col: i % cols,
    x: p.x,
    y: p.y,
    targetX: PUZZLE.x + (i % cols) * w,
    targetY: PUZZLE.y + Math.floor(i / cols) * h,
    width: w,
    height: h,
    status: "free",
    movedBy: null,
    version: 0,
  }));
}
export const clampPosition = (piece: Piece, x: number, y: number) => ({
  x: Math.max(0, Math.min(BOARD.width - piece.width, x)),
  y: Math.max(0, Math.min(BOARD.height - piece.height, y)),
});
export const shouldSnap = (p: Piece, x: number, y: number) =>
  Math.hypot(x - p.targetX, y - p.targetY) <=
  Math.min(p.width, p.height) * 0.28;
export const progress = (pieces: Piece[]) => {
  const sizes = new Map<string, number>();
  for (const p of pieces) {
    const id = p.groupId || p.id;
    sizes.set(id, (sizes.get(id) || 0) + 1);
  }
  const largest = Math.max(0, ...sizes.values());
  return largest < 2 ? 0 : Math.round((largest / pieces.length) * 100);
};
export class PuzzleEngine {
  lastReleaseMerged = false;
  constructor(public pieces: Piece[]) {}
  group(p: Piece) {
    const id = p.groupId || p.id;
    return this.pieces.filter((x) => (x.groupId || x.id) === id);
  }
  lock(id: string, player: string) {
    const p = this.pieces.find((x) => x.id === id);
    if (!p || p.status === "moving") return false;
    for (const x of this.group(p)) {
      x.status = "moving";
      x.movedBy = player;
      x.version++;
    }
    return true;
  }
  move(id: string, player: string, x: number, y: number) {
    const p = this.pieces.find((x) => x.id === id);
    if (!p || p.status !== "moving" || p.movedBy !== player) return null;
    const pos = clampPosition(p, x, y),
      dx = pos.x - p.x,
      dy = pos.y - p.y;
    for (const x of this.group(p)) {
      x.x += dx;
      x.y += dy;
      x.version++;
    }
    return p;
  }
  release(id: string, player: string, x: number, y: number) {
    this.lastReleaseMerged = false;
    const p = this.move(id, player, x, y);
    if (!p) return null;
    let members = this.group(p);
    let best: { a: Piece; b: Piece; distance: number } | undefined;
    for (const a of members)
      for (const b of this.pieces) {
        if (members.includes(b) || b.status === "moving") continue;
        const rowDistance = Math.abs(a.row - b.row);
        const colDistance = Math.abs(a.col - b.col);
        // Solo pueden unirse vecinos que comparten un lado, nunca diagonales.
        if (rowDistance + colDistance !== 1) continue;
        const ex = b.x + (a.targetX - b.targetX),
          ey = b.y + (a.targetY - b.targetY),
          distance = Math.hypot(a.x - ex, a.y - ey);
        if (
          distance <= Math.min(a.width, a.height) * 0.32 &&
          (!best || distance < best.distance)
        )
          best = { a, b, distance };
      }
    if (best) {
      this.lastReleaseMerged = true;
      const dx = best.b.x + (best.a.targetX - best.b.targetX) - best.a.x,
        dy = best.b.y + (best.a.targetY - best.b.targetY) - best.a.y,
        groupId = best.b.groupId || best.b.id;
      for (const member of members) {
        member.x += dx;
        member.y += dy;
        member.groupId = groupId;
      }
      members = this.group(best.b);
    }
    for (const member of members) {
      member.status = "free";
      member.movedBy = null;
      member.version++;
    }
    return p;
  }
  releasePlayer(player: string) {
    const released: Piece[] = [];
    for (const p of this.pieces)
      if (p.movedBy === player) {
        p.status = "free";
        p.movedBy = null;
        p.version++;
        released.push(p);
      }
    return released;
  }
  get complete() {
    return (
      this.pieces.length > 0 &&
      this.group(this.pieces[0]).length === this.pieces.length
    );
  }
}
