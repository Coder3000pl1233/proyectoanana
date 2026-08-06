export type Difficulty = "facil" | "media" | "dificil" | "experto";
export type PieceStatus = "free" | "moving" | "placed";
export interface Player {
  id: string;
  name: string;
  color: string;
  connected: boolean;
}
export interface Piece {
  id: string;
  groupId?: string;
  row: number;
  col: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  width: number;
  height: number;
  status: PieceStatus;
  movedBy: string | null;
  version: number;
}
export interface RoomSummary {
  id: string;
  difficulty: Difficulty;
  pieceCount: number;
  width: number;
  height: number;
  completed: boolean;
  progress: number;
  createdAt: string;
}
export interface RoomState extends RoomSummary {
  imageUrl: string;
  rows: number;
  cols: number;
  pieces: Piece[];
  players: Player[];
}
export interface JoinPayload {
  roomId: string;
  name: string;
  playerToken?: string;
}
export interface LockPayload {
  roomId: string;
  pieceId: string;
}
export interface MovePayload extends LockPayload {
  x: number;
  y: number;
  clientSeq: number;
}
export type ReleasePayload = MovePayload;
export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "room:error": (message: string) => void;
  "player:joined": (player: Player) => void;
  "player:left": (playerId: string) => void;
  "piece:locked": (piece: Piece) => void;
  "piece:lock-denied": (pieceId: string) => void;
  "piece:moved": (piece: Piece) => void;
  "piece:released": (piece: Piece) => void;
  "piece:placed": (piece: Piece) => void;
  "puzzle:completed": () => void;
}
export interface ClientToServerEvents {
  "room:join": (
    payload: JoinPayload,
    ack: (r: {
      ok: boolean;
      token?: string;
      playerId?: string;
      error?: string;
    }) => void,
  ) => void;
  "room:leave": () => void;
  "piece:lock": (payload: LockPayload) => void;
  "piece:move": (payload: MovePayload) => void;
  "piece:release": (payload: ReleasePayload) => void;
}
export const DIFFICULTIES: Record<
  Difficulty,
  { rows: number; cols: number; count: number }
> = {
  facil: { rows: 3, cols: 4, count: 12 },
  media: { rows: 4, cols: 6, count: 24 },
  dificil: { rows: 6, cols: 8, count: 48 },
  experto: { rows: 10, cols: 10, count: 100 },
};
