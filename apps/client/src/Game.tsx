import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Piece,
  RoomState,
  RoomSummary,
} from "@puzzle/shared";
import { SERVER_URL, serverUrl } from "./config";
type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
let audioContext: AudioContext | undefined;
const playSnapSound = () => {
  try {
    audioContext ??= new AudioContext();
    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(820, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
  } catch {
    // Algunos navegadores bloquean audio hasta la primera interacción.
  }
};
const edgeKind = (
  row: number,
  col: number,
  edge: "top" | "right" | "bottom" | "left",
) => {
  const sign = (axis: "horizontal" | "vertical", r: number, c: number) =>
    ((r * 73856093) ^ (c * 19349663) ^ (axis === "horizontal" ? 1 : 0)) & 1
      ? 1
      : -1;
  if (edge === "top") return -sign("horizontal", row - 1, col);
  if (edge === "right") return sign("vertical", row, col);
  if (edge === "bottom") return sign("horizontal", row, col);
  return -sign("vertical", row, col - 1);
};
const jigsawMask = (p: Piece, rows: number, cols: number) => {
  const top = p.row === 0 ? 0 : edgeKind(p.row, p.col, "top"),
    right = p.col === cols - 1 ? 0 : edgeKind(p.row, p.col, "right"),
    bottom = p.row === rows - 1 ? 0 : edgeKind(p.row, p.col, "bottom"),
    left = p.col === 0 ? 0 : edgeKind(p.row, p.col, "left");
  const t =
    top === 0
      ? "L85 15"
      : top > 0
        ? "L40 15 C44 15 44 12 42 9 C37 2 42 0 50 0 C58 0 63 2 58 9 C56 12 56 15 60 15 L85 15"
        : "L40 15 C44 15 44 18 42 21 C37 28 42 30 50 30 C58 30 63 28 58 21 C56 18 56 15 60 15 L85 15";
  const r =
    right === 0
      ? "L85 85"
      : right > 0
        ? "L85 40 C85 44 88 44 91 42 C98 37 100 42 100 50 C100 58 98 63 91 58 C88 56 85 56 85 60 L85 85"
        : "L85 40 C85 44 82 44 79 42 C72 37 70 42 70 50 C70 58 72 63 79 58 C82 56 85 56 85 60 L85 85";
  const b =
    bottom === 0
      ? "L15 85"
      : bottom > 0
        ? "L60 85 C56 85 56 88 58 91 C63 98 58 100 50 100 C42 100 37 98 42 91 C44 88 44 85 40 85 L15 85"
        : "L60 85 C56 85 56 82 58 79 C63 72 58 70 50 70 C42 70 37 72 42 79 C44 82 44 85 40 85 L15 85";
  const l =
    left === 0
      ? "L15 15"
      : left > 0
        ? "L15 60 C15 56 12 56 9 58 C2 63 0 58 0 50 C0 42 2 37 9 42 C12 44 15 44 15 40 L15 15"
        : "L15 60 C15 56 18 56 21 58 C28 63 30 58 30 50 C30 42 28 37 21 42 C18 44 15 44 15 40 L15 15";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path fill="white" d="M15 15 ${t} L85 15 ${r} L85 85 ${b} L15 85 ${l} Z"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};
export function Game({
  roomId,
  initialName,
  summary,
}: {
  roomId: string;
  initialName: string;
  summary: RoomSummary;
}) {
  const [state, setState] = useState<RoomState>(),
    [me, setMe] = useState(""),
    [message, setMessage] = useState(""),
    [showRef, setShowRef] = useState(false),
    [copied, setCopied] = useState(false),
    [snappedPiece, setSnappedPiece] = useState<string>(),
    [complete, setComplete] = useState(summary.completed);
  const socket = useRef<TypedSocket | null>(null),
    meRef = useRef("");
  const board = useRef<HTMLDivElement>(null),
    drag = useRef<
      | { id: string; dx: number; dy: number; locked: boolean; seq: number }
      | undefined
    >(undefined);
  useEffect(() => {
    const s = io(SERVER_URL || undefined) as TypedSocket;
    socket.current = s;
    const patch = (piece: Piece) =>
      setState((old) =>
        old
          ? {
              ...old,
              pieces: old.pieces.map((p) =>
                p.id === piece.id && piece.version >= p.version ? piece : p,
              ),
            }
          : old,
      );
    s.on("room:state", setState);
    s.on("player:joined", (p) =>
      setState((old) =>
        old
          ? {
              ...old,
              players: [...old.players.filter((x) => x.id !== p.id), p],
            }
          : old,
      ),
    );
    s.on("player:left", (id) =>
      setState((old) =>
        old ? { ...old, players: old.players.filter((x) => x.id !== id) } : old,
      ),
    );
    s.on("piece:locked", (p) => {
      patch(p);
      if (drag.current?.id === p.id)
        drag.current.locked = p.movedBy === meRef.current;
    });
    s.on("piece:lock-denied", (id) => {
      if (drag.current?.id === id) drag.current = undefined;
      setMessage("Esa pieza ya está en movimiento.");
    });
    s.on("piece:moved", patch);
    s.on("piece:released", patch);
    s.on("piece:placed", (p) => {
      patch(p);
      setSnappedPiece(p.id);
      playSnapSound();
      window.setTimeout(
        () =>
          setSnappedPiece((current) =>
            current === p.id ? undefined : current,
          ),
        520,
      );
      setMessage("¡Pieza encajada!");
    });
    s.on("puzzle:completed", () => setComplete(true));
    const token = localStorage.getItem(`token-${roomId}`) || undefined;
    s.emit(
      "room:join",
      { roomId, name: initialName, playerToken: token },
      (r) => {
        if (r.ok) {
          localStorage.setItem(`token-${roomId}`, r.token!);
          meRef.current = r.playerId!;
          setMe(r.playerId!);
        } else setMessage(r.error || "No pudimos entrar.");
      },
    );
    return () => {
      s.emit("room:leave");
      s.disconnect();
    };
  }, [roomId, initialName]);
  const groupSizes = new Map<string, number>();
  for (const piece of state?.pieces || []) {
    const id = piece.groupId || piece.id;
    groupSizes.set(id, (groupSizes.get(id) || 0) + 1);
  }
  const placed = Math.max(0, ...groupSizes.values()),
    progress = state && placed > 1 ? Math.round((placed / state.pieces.length) * 100) : 0;
  const players = useMemo(
    () => new Map(state?.players.map((p) => [p.id, p]) || []),
    [state],
  );
  const point = (e: React.PointerEvent) => {
    const r = board.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 1000,
      y: ((e.clientY - r.top) / r.height) * 700,
    };
  };
  const down = (e: React.PointerEvent, p: Piece) => {
    if (p.status === "moving" || !socket.current) return;
    const q = point(e);
    drag.current = {
      id: p.id,
      dx: q.x - p.x,
      dy: q.y - p.y,
      locked: false,
      seq: 0,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    socket.current.emit("piece:lock", { roomId, pieceId: p.id });
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d?.locked || !state) return;
    const p = state.pieces.find((x) => x.id === d.id)!;
    const q = point(e),
      x = q.x - d.dx,
      y = q.y - d.dy,
      dx = x - p.x,
      dy = y - p.y,
      groupId = p.groupId || p.id;
    setState((old) =>
      old
        ? {
            ...old,
            pieces: old.pieces.map((v) =>
              (v.groupId || v.id) === groupId
                ? { ...v, x: v.x + dx, y: v.y + dy }
                : v,
            ),
          }
        : old,
    );
    socket.current?.emit("piece:move", {
      roomId,
      pieceId: p.id,
      x,
      y,
      clientSeq: ++d.seq,
    });
  };
  const up = () => {
    const d = drag.current;
    if (!d?.locked || !state) {
      drag.current = undefined;
      return;
    }
    const p = state.pieces.find((x) => x.id === d.id)!;
    socket.current?.emit("piece:release", {
      roomId,
      pieceId: p.id,
      x: p.x,
      y: p.y,
      clientSeq: ++d.seq,
    });
    drag.current = undefined;
  };
  if (!state)
    return (
      <main className="center-state">
        <div className="spinner" />
        <p>Preparando las piezas…</p>
      </main>
    );
  return (
    <main className="game">
      <aside className="sidebar">
        <div>
          <div className="eyebrow">SALA EN VIVO</div>
          <h1>El puzzle del equipo</h1>
        </div>
        <div className="share">
          <input readOnly value={location.href} />
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(location.href);
              setCopied(true);
            }}
          >
            {copied ? "¡Copiado!" : "Copiar enlace"}
          </button>
        </div>
        <section>
          <div className="section-title">
            <b>Progreso</b>
            <strong>{progress}%</strong>
          </div>
          <div className="bar">
            <i style={{ width: `${progress}%` }} />
          </div>
          <small>
            {placed} colocadas · {state.pieces.length - placed} por ubicar
          </small>
        </section>
        <section>
          <div className="section-title">
            <b>Jugadores</b>
            <span className="live">● {state.players.length} en línea</span>
          </div>
          <div className="players">
            {state.players.map((p) => (
              <div key={p.id}>
                <i style={{ background: p.color }}>{p.name[0].toUpperCase()}</i>
                <span>
                  {p.name}
                  {p.id === me && <small> vos</small>}
                </span>
              </div>
            ))}
          </div>
        </section>
        <button className="ghost" onClick={() => setShowRef((x) => !x)}>
          {showRef ? "Ocultar" : "Mostrar"} imagen de referencia
        </button>
      </aside>
      <section className="play-area">
        <div className="mobile-progress">
          <b>{progress}% completado</b>
          <span>{state.players.length} jugando</span>
        </div>
        <div className="board-shell">
          <div
            ref={board}
            className="board"
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            {showRef && (
              <img
                className="reference"
                src={serverUrl(state.imageUrl)}
                alt="Referencia del puzzle"
              />
            )}
            {state.pieces.map((p) => {
              const owner = p.movedBy ? players.get(p.movedBy) : undefined;
              const mask = jigsawMask(p, state.rows, state.cols);
              // La máscara reserva 15/100 por lado. Agrandamos la pieza para que
              // el cuerpo central (70/100) siga ocupando exactamente su celda.
              const padX = (p.width * 15) / 70;
              const padY = (p.height * 15) / 70;
              const visualWidth = p.width + padX * 2;
              const visualHeight = p.height + padY * 2;
              const imageWidth = p.width * state.cols;
              const imageHeight = p.height * state.rows;
              const backgroundX =
                ((-p.col * p.width + padX) / (visualWidth - imageWidth)) * 100;
              const backgroundY =
                ((-p.row * p.height + padY) / (visualHeight - imageHeight)) *
                100;
              return (
                <div
                  key={p.id}
                  data-piece={p.id}
                  className={`piece ${p.status} ${snappedPiece === p.id ? "snap" : ""}`}
                  onPointerDown={(e) => down(e, p)}
                  style={{
                    left: `${(p.x - padX) / 10}%`,
                    top: `${(p.y - padY) / 7}%`,
                    width: `${visualWidth / 10}%`,
                    height: `${visualHeight / 7}%`,
                    backgroundImage: `url(${serverUrl(state.imageUrl)})`,
                    backgroundSize: `${(imageWidth / visualWidth) * 100}% ${(imageHeight / visualHeight) * 100}%`,
                    backgroundPosition: `${backgroundX}% ${backgroundY}%`,
                    maskImage: mask,
                    WebkitMaskImage: mask,
                    zIndex:
                      p.status === "moving"
                        ? 20
                        : p.status === "placed"
                          ? 1
                          : 5,
                    outlineColor: owner?.color,
                  }}
                >
                  {owner && (
                    <span style={{ background: owner.color }}>
                      {owner.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {message && <div className="toast">{message}</div>}
      </section>
      {complete && (
        <div className="celebration">
          <div className="confetti-rain" aria-hidden="true">
            {Array.from({ length: 70 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    left: `${(i * 37) % 100}%`,
                    animationDelay: `${-((i * 0.13) % 3.2)}s`,
                    animationDuration: `${2.4 + (i % 7) * 0.18}s`,
                    "--drift": `${(i % 2 ? 1 : -1) * (25 + (i % 5) * 12)}px`,
                    background: ["#ff7557", "#ffd166", "#6c5ce7", "#55efc4", "#74b9ff"][i % 5],
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <div className="glitter" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => <i key={i}>✦</i>)}
          </div>
          <div className="confetti">✦ ◆ ● ✦</div>
          <h2>¡Puzzle completado!</h2>
          <p>Entre todos hicieron encajar cada pieza.</p>
          <div className="final-image">
            <img src={serverUrl(state.imageUrl)} alt="Puzzle terminado" />
          </div>
          <a className="primary link" href="/">
            Crear otro puzzle
          </a>
        </div>
      )}
    </main>
  );
}
