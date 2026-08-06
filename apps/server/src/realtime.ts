import type { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Player,
} from "@puzzle/shared";
import { PuzzleEngine } from "./domain.js";
import type { Store } from "./store.js";
const COLORS = [
  "#6c5ce7",
  "#00a8a8",
  "#f97316",
  "#db2777",
  "#2563eb",
  "#65a30d",
  "#9333ea",
  "#dc2626",
];
const clean = (s: string) =>
  [...s]
    .filter((c) => c >= " " && c !== "<" && c !== ">")
    .join("")
    .trim()
    .slice(0, 24);
export function setupRealtime(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  store: Store,
) {
  const engines = new Map<string, PuzzleEngine>(),
    players = new Map<string, Map<string, Player>>(),
    tokens = new Map<
      string,
      { roomId: string; playerId: string; name: string }
    >();
  const engine = (id: string) => {
    let e = engines.get(id);
    if (!e) {
      const s = store.state(id);
      if (!s) return;
      e = new PuzzleEngine(s.pieces);
      engines.set(id, e);
    }
    return e;
  };
  io.on("connection", (socket) => {
    let roomId = "",
      playerId = "",
      lastMove = 0,
      lockTimer: ReturnType<typeof setTimeout> | undefined;
    const clearLockTimer = () => {
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = undefined;
    };
    const releaseStaleLock = () => {
      clearLockTimer();
      const e = engine(roomId);
      if (!e || !playerId) return;
      const released = e.releasePlayer(playerId);
      if (released.length)
        io.to(roomId).emit(
          "pieces:updated",
          released.map((piece) => ({ ...piece })),
        );
      store.save(roomId, e.pieces, e.complete);
    };
    const renewLockTimer = () => {
      clearLockTimer();
      lockTimer = setTimeout(releaseStaleLock, 12000);
    };
    socket.on("room:join", (payload, ack) => {
      const name = clean(payload?.name || "");
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(payload?.roomId || "") || !name)
        return ack({ ok: false, error: "Datos de acceso inválidos." });
      const state = store.state(payload.roomId),
        e = engine(payload.roomId);
      if (!state || !e) return ack({ ok: false, error: "La sala no existe." });
      roomId = payload.roomId;
      const saved = payload.playerToken
        ? tokens.get(payload.playerToken)
        : undefined;
      playerId = saved?.roomId === roomId ? saved.playerId : randomUUID();
      const staleLocks = e.releasePlayer(playerId);
      if (staleLocks.length) {
        io.to(roomId).emit(
          "pieces:updated",
          staleLocks.map((piece) => ({ ...piece })),
        );
        store.save(roomId, e.pieces, e.complete);
      }
      const token =
        saved?.roomId === roomId ? payload.playerToken! : randomUUID();
      tokens.set(token, { roomId, playerId, name });
      let roomPlayers = players.get(roomId);
      if (!roomPlayers) {
        roomPlayers = new Map();
        players.set(roomId, roomPlayers);
      }
      const old = roomPlayers.get(playerId);
      const player: Player = {
        id: playerId,
        name,
        color: old?.color || COLORS[roomPlayers.size % COLORS.length],
        connected: true,
      };
      roomPlayers.set(playerId, player);
      socket.join(roomId);
      socket.emit("room:state", {
        ...state,
        pieces: e.pieces,
        players: [...roomPlayers.values()].filter((p) => p.connected),
      });
      socket.to(roomId).emit("player:joined", player);
      ack({ ok: true, token, playerId });
    });
    socket.on("piece:lock", (p) => {
      if (p.roomId !== roomId) return;
      const e = engine(roomId);
      if (!e) return;
      if (e.lock(p.pieceId, playerId)) {
        renewLockTimer();
        const piece = e.pieces.find((x) => x.id === p.pieceId)!;
        io.to(roomId).emit(
          "pieces:updated",
          e.group(piece).map((member) => ({ ...member })),
        );
      } else socket.emit("piece:lock-denied", p.pieceId);
    });
    socket.on("piece:move", (p) => {
      const now = Date.now();
      if (
        p.roomId !== roomId ||
        now - lastMove < 35 ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y)
      )
        return;
      lastMove = now;
      renewLockTimer();
      const e = engine(roomId),
        piece = e?.move(p.pieceId, playerId, p.x, p.y);
      if (e && piece)
        socket
          .to(roomId)
          .emit(
            "pieces:updated",
            e.group(piece).map((member) => ({ ...member })),
          );
    });
    socket.on("piece:release", (p) => {
      if (p.roomId !== roomId || !Number.isFinite(p.x) || !Number.isFinite(p.y))
        return;
      clearLockTimer();
      const e = engine(roomId);
      const piece = e?.release(p.pieceId, playerId, p.x, p.y);
      if (!e || !piece) return;
      store.save(roomId, e.pieces, e.complete);
      io.to(roomId).emit(
        "pieces:updated",
        e.group(piece).map((member) => ({ ...member })),
      );
      if (e.lastReleaseMerged)
        io.to(roomId).emit("piece:placed", { ...piece });
      if (e.complete) io.to(roomId).emit("puzzle:completed");
    });
    socket.on("pieces:reorder", (payload) => {
      if (payload.roomId !== roomId) return;
      const e = engine(roomId);
      if (!e) return;
      const reordered = e.reorder();
      if (!reordered.length) return;
      store.save(roomId, e.pieces, e.complete);
      io.to(roomId).emit(
        "pieces:updated",
        reordered.map((piece) => ({ ...piece })),
      );
    });
    const leave = () => {
      clearLockTimer();
      if (!roomId || !playerId) return;
      const e = engine(roomId);
      setTimeout(() => {
        const p = players.get(roomId)?.get(playerId);
        if (p?.connected) return;
        const released = e?.releasePlayer(playerId) || [];
        if (released.length)
          io.to(roomId).emit(
            "pieces:updated",
            released.map((piece) => ({ ...piece })),
          );
        if (e) store.save(roomId, e.pieces, e.complete);
      }, 2200);
      const p = players.get(roomId)?.get(playerId);
      if (p) p.connected = false;
      socket.to(roomId).emit("player:left", playerId);
    };
    socket.on("room:leave", leave);
    socket.on("disconnect", leave);
  });
  return { engines, players };
}
