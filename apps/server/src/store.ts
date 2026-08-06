import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Difficulty, Piece, RoomState, RoomSummary } from "@puzzle/shared";
import { progress } from "./domain.js";
type RoomRow = {
  id: string;
  difficulty: Difficulty;
  image_path: string;
  width: number;
  height: number;
  rows: number;
  cols: number;
  pieces_json: string;
  completed: number;
  created_at: string;
  updated_at: string;
};
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,difficulty TEXT NOT NULL,image_path TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,rows INTEGER NOT NULL,cols INTEGER NOT NULL,pieces_json TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
    );
  }
  create(r: {
    id: string;
    difficulty: Difficulty;
    imagePath: string;
    width: number;
    height: number;
    rows: number;
    cols: number;
    pieces: Piece[];
  }) {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO rooms VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        r.id,
        r.difficulty,
        r.imagePath,
        r.width,
        r.height,
        r.rows,
        r.cols,
        JSON.stringify(r.pieces),
        0,
        now,
        now,
      );
  }
  row(id: string) {
    return this.db.prepare("SELECT * FROM rooms WHERE id=?").get(id) as
      RoomRow | undefined;
  }
  summary(id: string): RoomSummary | undefined {
    const r = this.row(id);
    if (!r) return;
    const pieces = JSON.parse(r.pieces_json) as Piece[];
    return {
      id: r.id,
      difficulty: r.difficulty,
      pieceCount: pieces.length,
      width: r.width,
      height: r.height,
      completed: !!r.completed,
      progress: progress(pieces),
      createdAt: r.created_at,
    };
  }
  state(id: string): Omit<RoomState, "players"> | undefined {
    const r = this.row(id);
    if (!r) return;
    const s = this.summary(id)!;
    return {
      ...s,
      imageUrl: `/uploads/${r.image_path}`,
      rows: r.rows,
      cols: r.cols,
      pieces: JSON.parse(r.pieces_json),
    };
  }
  save(id: string, pieces: Piece[], completed: boolean) {
    this.db
      .prepare(
        "UPDATE rooms SET pieces_json=?,completed=?,updated_at=? WHERE id=?",
      )
      .run(
        JSON.stringify(pieces),
        completed ? 1 : 0,
        new Date().toISOString(),
        id,
      );
  }
}
