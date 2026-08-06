import { randomInt } from "node:crypto";
import { DIFFICULTIES, type Difficulty, type Piece } from "@puzzle/shared";
export const BOARD = { width: 1000, height: 700 };
// El puzzle ocupa una zona central y deja espacio alrededor para las piezas sueltas.
export const PUZZLE = { width: 700, height: 490, x: 150, y: 105 };
export function generatePieces(difficulty: Difficulty): Piece[] {
  const { rows, cols } = DIFFICULTIES[difficulty],
    w = PUZZLE.width / cols,
    h = PUZZLE.height / rows,
    padX = (w * 15) / 70,
    padY = (h * 15) / 70;
  const cells = Array.from({ length: rows * cols }, (_, i) => ({
    x:
      cols === 1
        ? padX
        : padX + ((i % cols) * (BOARD.width - w - padX * 2)) / (cols - 1),
    y:
      rows === 1
        ? padY
        : padY +
          (Math.floor(i / cols) * (BOARD.height - h - padY * 2)) / (rows - 1),
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
  x: Math.max(
    (piece.width * 15) / 70,
    Math.min(BOARD.width - piece.width - (piece.width * 15) / 70, x),
  ),
  y: Math.max(
    (piece.height * 15) / 70,
    Math.min(BOARD.height - piece.height - (piece.height * 15) / 70, y),
  ),
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
  constructor(public pieces: Piece[]) {
    for (const piece of pieces) {
      if (piece.status === "moving") {
        piece.status = "free";
        piece.movedBy = null;
        piece.version++;
      }
    }
    const groups = new Map<string, Piece[]>();
    for (const piece of pieces) {
      const id = piece.groupId || piece.id;
      groups.set(id, [...(groups.get(id) || []), piece]);
    }
    for (const members of groups.values()) {
      const leftShift = Math.max(
          0,
          ...members.map((piece) => (piece.width * 15) / 70 - piece.x),
        ),
        rightShift = Math.min(
          0,
          ...members.map(
            (piece) =>
              BOARD.width -
              piece.width -
              (piece.width * 15) / 70 -
              piece.x,
          ),
        ),
        topShift = Math.max(
          0,
          ...members.map((piece) => (piece.height * 15) / 70 - piece.y),
        ),
        bottomShift = Math.min(
          0,
          ...members.map(
            (piece) =>
              BOARD.height -
              piece.height -
              (piece.height * 15) / 70 -
              piece.y,
          ),
        ),
        dx = leftShift || rightShift,
        dy = topShift || bottomShift;
      for (const piece of members) {
        piece.x += dx;
        piece.y += dy;
      }
    }
  }
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
    const members = this.group(p),
      desiredDx = x - p.x,
      desiredDy = y - p.y,
      minDx = Math.max(
        ...members.map((member) => (member.width * 15) / 70 - member.x),
      ),
      maxDx = Math.min(
        ...members.map(
          (member) =>
            BOARD.width - member.width - (member.width * 15) / 70 - member.x,
        ),
      ),
      minDy = Math.max(
        ...members.map((member) => (member.height * 15) / 70 - member.y),
      ),
      maxDy = Math.min(
        ...members.map(
          (member) =>
            BOARD.height - member.height - (member.height * 15) / 70 - member.y,
        ),
      ),
      dx = Math.max(minDx, Math.min(maxDx, desiredDx)),
      dy = Math.max(minDy, Math.min(maxDy, desiredDy));
    for (const member of members) {
      member.x += dx;
      member.y += dy;
      member.version++;
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
  reorder() {
    if (this.pieces.some((piece) => piece.status === "moving")) return [];
    const groups = new Map<string, Piece[]>();
    for (const piece of this.pieces) {
      const id = piece.groupId || piece.id;
      groups.set(id, [...(groups.get(id) || []), piece]);
    }
    const layouts = [...groups.values()]
      .map((members) => {
        const minX = Math.min(...members.map((piece) => piece.x));
        const minY = Math.min(...members.map((piece) => piece.y));
        const maxX = Math.max(...members.map((piece) => piece.x + piece.width));
        const maxY = Math.max(...members.map((piece) => piece.y + piece.height));
        return { members, minX, minY, width: maxX - minX, height: maxY - minY };
      })
      .sort((a, b) => b.height * b.width - a.height * a.width);
    const maxWidth = Math.max(...this.pieces.map((piece) => piece.width));
    const maxHeight = Math.max(...this.pieces.map((piece) => piece.height));
    const gapX = (maxWidth * 24) / 70;
    const gapY = (maxHeight * 24) / 70;
    let cursorX = gapX / 2,
      cursorY = gapY / 2,
      rowHeight = 0;
    for (const layout of layouts) {
      if (cursorX + layout.width + gapX / 2 > BOARD.width) {
        cursorX = gapX / 2;
        cursorY += rowHeight + gapY;
        rowHeight = 0;
      }
      const dx = cursorX - layout.minX;
      const dy = cursorY - layout.minY;
      for (const piece of layout.members) {
        piece.x += dx;
        piece.y += dy;
        piece.version++;
      }
      cursorX += layout.width + gapX;
      rowHeight = Math.max(rowHeight, layout.height);
    }
    return this.pieces;
  }
  get complete() {
    return (
      this.pieces.length > 0 &&
      this.group(this.pieces[0]).length === this.pieces.length
    );
  }
}
