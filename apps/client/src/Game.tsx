import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Piece,
  Player,
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
const maskCache = new Map<string, string>();
const jigsawMask = (p: Piece, rows: number, cols: number) => {
  const cacheKey = `${p.row}:${p.col}:${rows}:${cols}`;
  const cached = maskCache.get(cacheKey);
  if (cached) return cached;
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
  const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  maskCache.set(cacheKey, mask);
  return mask;
};

type PieceNodeProps = {
  piece: Piece;
  rows: number;
  cols: number;
  imageUrl: string;
  groupSize: number;
  owner?: Player;
  isTop: boolean;
  isSnapped: boolean;
  register: (id: string, node: HTMLDivElement | null) => void;
  onBegin: (event: React.PointerEvent, piece: Piece, groupSize: number) => void;
};

const PieceNode = memo(function PieceNode({
  piece,
  rows,
  cols,
  imageUrl,
  groupSize,
  owner,
  isTop,
  isSnapped,
  register,
  onBegin,
}: PieceNodeProps) {
  const setNode = useCallback(
    (node: HTMLDivElement | null) => register(piece.id, node),
    [piece.id, register],
  );
  const mask = jigsawMask(piece, rows, cols);
  // La máscara reserva 15/100 por lado. Agrandamos la pieza para que
  // el cuerpo central (70/100) siga ocupando exactamente su celda.
  const padX = (piece.width * 15) / 70;
  const padY = (piece.height * 15) / 70;
  const visualWidth = piece.width + padX * 2;
  const visualHeight = piece.height + padY * 2;
  const imageWidth = piece.width * cols;
  const imageHeight = piece.height * rows;
  const backgroundX =
    ((-piece.col * piece.width + padX) / (visualWidth - imageWidth)) * 100;
  const backgroundY =
    ((-piece.row * piece.height + padY) / (visualHeight - imageHeight)) * 100;

  return (
    <div
      ref={setNode}
      data-piece={piece.id}
      className={`piece ${piece.status} ${isSnapped ? "snap" : ""}`}
      onPointerDown={(event) => onBegin(event, piece, groupSize)}
      style={{
        left: `${(piece.x - padX) / 10}%`,
        top: `${(piece.y - padY) / 7}%`,
        width: `${visualWidth / 10}%`,
        height: `${visualHeight / 7}%`,
        backgroundImage: `url(${serverUrl(imageUrl)})`,
        backgroundSize: `${(imageWidth / visualWidth) * 100}% ${(imageHeight / visualHeight) * 100}%`,
        backgroundPosition: `${backgroundX}% ${backgroundY}%`,
        maskImage: mask,
        WebkitMaskImage: mask,
        zIndex:
          groupSize === 1
            ? piece.status === "moving"
              ? 20
              : isTop
                ? 15
                : 10
            : piece.status === "moving"
              ? 5
              : 4,
        outlineColor: owner?.color,
      }}
    >
      {owner && (
        <span style={{ background: owner.color }}>{owner.name}</span>
      )}
    </div>
  );
});

type DragMember = Pick<Piece, "id" | "x" | "y" | "width" | "height">;
type DragSession = {
  id: string;
  groupId: string;
  dx: number;
  dy: number;
  locked: boolean;
  released: boolean;
  seq: number;
  anchorX: number;
  anchorY: number;
  currentX: number;
  currentY: number;
  visualDx: number;
  visualDy: number;
  members: DragMember[];
  lastSentAt: number;
  frame?: number;
};

const MOVE_SEND_INTERVAL = 50;
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
    [topPiece, setTopPiece] = useState<string>(),
    [snappedPiece, setSnappedPiece] = useState<string>(),
    [complete, setComplete] = useState(summary.completed);
  const socket = useRef<TypedSocket | null>(null),
    meRef = useRef("");
  const board = useRef<HTMLDivElement>(null),
    drag = useRef<DragSession | undefined>(undefined),
    piecesRef = useRef<Piece[]>([]),
    pieceElements = useRef(new Map<string, HTMLDivElement>());

  piecesRef.current = state?.pieces || [];

  const registerPiece = useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) pieceElements.current.set(id, node);
      else pieceElements.current.delete(id);
    },
    [],
  );

  const point = useCallback((event: React.PointerEvent) => {
    const bounds = board.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 1000,
      y: ((event.clientY - bounds.top) / bounds.height) * 700,
    };
  }, []);

  const paintDrag = useCallback((session: DragSession) => {
    if (session.frame !== undefined) return;
    session.frame = window.requestAnimationFrame(() => {
      session.frame = undefined;
      const bounds = board.current?.getBoundingClientRect();
      if (!bounds) return;
      const translateX = (session.visualDx / 1000) * bounds.width;
      const translateY = (session.visualDy / 700) * bounds.height;
      board.current?.classList.add("drag-active");
      for (const member of session.members) {
        const node = pieceElements.current.get(member.id);
        if (!node) continue;
        node.classList.add("drag-local");
        node.style.transform = `translate3d(${translateX}px, ${translateY}px, 0)`;
      }
    });
  }, []);

  const clearDragPaint = useCallback((session: DragSession) => {
    if (session.frame !== undefined) {
      window.cancelAnimationFrame(session.frame);
      session.frame = undefined;
    }
    board.current?.classList.remove("drag-active");
    for (const member of session.members) {
      const node = pieceElements.current.get(member.id);
      if (!node) continue;
      node.classList.remove("drag-local");
      node.style.removeProperty("transform");
    }
  }, []);

  const commitDrag = useCallback(
    (session: DragSession) => {
      if (drag.current !== session) return;
      const positions = new Map(
        session.members.map((member) => [
          member.id,
          { x: member.x + session.visualDx, y: member.y + session.visualDy },
        ]),
      );
      setState((old) =>
        old
          ? {
              ...old,
              pieces: old.pieces.map((piece) => {
                const position = positions.get(piece.id);
                return position ? { ...piece, ...position } : piece;
              }),
            }
          : old,
      );
      socket.current?.emit("piece:release", {
        roomId,
        pieceId: session.id,
        x: session.currentX,
        y: session.currentY,
        clientSeq: ++session.seq,
      });
      drag.current = undefined;
      window.requestAnimationFrame(() => clearDragPaint(session));
    },
    [clearDragPaint, roomId],
  );
  useEffect(() => {
    const s = io(SERVER_URL || undefined, {
      transports: ["websocket", "polling"],
      tryAllTransports: true,
    }) as TypedSocket;
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
    const patchMany = (pieces: Piece[]) => {
      const incoming = new Map(pieces.map((piece) => [piece.id, piece]));
      setState((old) =>
        old
          ? {
              ...old,
              pieces: old.pieces.map((piece) => {
                const next = incoming.get(piece.id);
                return next && next.version >= piece.version ? next : piece;
              }),
            }
          : old,
      );
    };
    const confirmPendingLock = (piece: Piece) => {
      const pending = drag.current;
      if (
        pending?.id !== piece.id ||
        piece.status !== "moving" ||
        piece.movedBy !== meRef.current
      )
        return;
      pending.locked = true;
      if (pending.released) {
        commitDrag(pending);
      } else paintDrag(pending);
    };
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
      confirmPendingLock(p);
    });
    s.on("piece:lock-denied", (id) => {
      if (drag.current?.id === id) {
        clearDragPaint(drag.current);
        drag.current = undefined;
      }
      setMessage("Esa pieza ya está en movimiento.");
    });
    s.on("piece:moved", patch);
    s.on("pieces:updated", (pieces) => {
      patchMany(pieces);
      const pendingId = drag.current?.id;
      if (!pendingId) return;
      const pendingPiece = pieces.find((piece) => piece.id === pendingId);
      if (pendingPiece) confirmPendingLock(pendingPiece);
    });
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
    const joinRoom = () => {
      if (drag.current) clearDragPaint(drag.current);
      drag.current = undefined;
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
    };
    s.on("connect", joinRoom);
    return () => {
      if (drag.current) clearDragPaint(drag.current);
      s.emit("room:leave");
      s.disconnect();
    };
  }, [roomId, initialName, clearDragPaint, commitDrag, paintDrag]);
  const groupSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const piece of state?.pieces || []) {
      const id = piece.groupId || piece.id;
      sizes.set(id, (sizes.get(id) || 0) + 1);
    }
    return sizes;
  }, [state?.pieces]);
  const placed = Math.max(0, ...groupSizes.values()),
    progress = state && placed > 1 ? Math.round((placed / state.pieces.length) * 100) : 0;
  const players = useMemo(
    () => new Map(state?.players.map((p) => [p.id, p]) || []),
    [state?.players],
  );
  const down = useCallback((e: React.PointerEvent, p: Piece, groupSize: number) => {
    if (p.status === "moving" || !socket.current || drag.current) return;
    if (groupSize === 1) setTopPiece(p.id);
    const q = point(e);
    const groupId = p.groupId || p.id;
    drag.current = {
      id: p.id,
      groupId,
      dx: q.x - p.x,
      dy: q.y - p.y,
      locked: false,
      released: false,
      seq: 0,
      anchorX: p.x,
      anchorY: p.y,
      currentX: p.x,
      currentY: p.y,
      visualDx: 0,
      visualDy: 0,
      members: piecesRef.current
        .filter((piece) => (piece.groupId || piece.id) === groupId)
        .map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
      lastSentAt: 0,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    socket.current.emit("piece:lock", { roomId, pieceId: p.id });
  }, [point, roomId]);
  const move = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const q = point(e);
    const desiredDx = q.x - d.dx - d.anchorX;
    const desiredDy = q.y - d.dy - d.anchorY;
    const minDx = Math.max(
      ...d.members.map((member) => (member.width * 15) / 70 - member.x),
    );
    const maxDx = Math.min(
      ...d.members.map(
        (member) =>
          1000 - member.width - (member.width * 15) / 70 - member.x,
      ),
    );
    const minDy = Math.max(
      ...d.members.map((member) => (member.height * 15) / 70 - member.y),
    );
    const maxDy = Math.min(
      ...d.members.map(
        (member) =>
          700 - member.height - (member.height * 15) / 70 - member.y,
      ),
    );
    d.visualDx = Math.max(minDx, Math.min(maxDx, desiredDx));
    d.visualDy = Math.max(minDy, Math.min(maxDy, desiredDy));
    d.currentX = d.anchorX + d.visualDx;
    d.currentY = d.anchorY + d.visualDy;
    if (!d.locked) return;
    paintDrag(d);
    const now = performance.now();
    if (now - d.lastSentAt < MOVE_SEND_INTERVAL) return;
    d.lastSentAt = now;
    socket.current?.emit("piece:move", {
      roomId,
      pieceId: d.id,
      x: d.currentX,
      y: d.currentY,
      clientSeq: ++d.seq,
    });
  }, [paintDrag, point, roomId]);
  const up = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    if (!d.locked) {
      d.released = true;
      return;
    }
    commitDrag(d);
  }, [commitDrag]);
  if (!state)
    return (
      <main className="center-state">
        <div className="spinner" />
        <p>Preparando las piezas…</p>
      </main>
    );
  return (
    <main className="game">
      <div className="rotate-device" role="status">
        <div className="phone-icon"><i /></div>
        <h2>Gir&aacute el teléfono</h2>
        <p>Usá la pantalla en horizontal para ver el tablero más grande.</p>
      </div>
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
        <div className="sidebar-tools">
          <button
            className="ghost"
            onClick={() => socket.current?.emit("pieces:reorder", { roomId })}
          >
            Ordenar fichas
          </button>
          <button className="ghost" onClick={() => setShowRef(true)}>
            Ver imagen de referencia
          </button>
        </div>
      </aside>
      <section className="play-area">
        <div className="mobile-progress">
          <div className="mobile-status">
            <b>{progress}% completado</b>
            <span>{state.players.length} jugando</span>
          </div>
          <div className="mobile-actions">
            <button onClick={() => setShowRef(true)}>
              Ver guía
            </button>
            <button
              onClick={() => socket.current?.emit("pieces:reorder", { roomId })}
            >
              Ordenar
            </button>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(location.href);
                setCopied(true);
              }}
            >
              {copied ? "¡Copiado!" : "Compartir"}
            </button>
          </div>
        </div>
        <div className="board-viewport">
          <div className="board-shell">
            <div
            ref={board}
            className={`board ${state.pieces.length >= 100 ? "dense" : ""}`}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            {state.pieces.map((p) => {
              const pieceGroupSize = groupSizes.get(p.groupId || p.id) || 1;
              const owner =
                p.movedBy && pieceGroupSize === 1
                  ? players.get(p.movedBy)
                  : undefined;
              return (
                <PieceNode
                  key={p.id}
                  piece={p}
                  rows={state.rows}
                  cols={state.cols}
                  imageUrl={state.imageUrl}
                  groupSize={pieceGroupSize}
                  owner={owner}
                  isTop={p.id === topPiece}
                  isSnapped={p.id === snappedPiece}
                  register={registerPiece}
                  onBegin={down}
                />
              );
            })}
            </div>
          </div>
        </div>
        {message && <div className="toast">{message}</div>}
      </section>
      {showRef && (
        <div
          className="reference-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Imagen de referencia"
          onClick={() => setShowRef(false)}
        >
          <div className="reference-dialog" onClick={(event) => event.stopPropagation()}>
            <button
              className="reference-close"
              onClick={() => setShowRef(false)}
              aria-label="Cerrar imagen de referencia"
            >
              ×
            </button>
            <img src={serverUrl(state.imageUrl)} alt="Referencia del puzzle" />
          </div>
        </div>
      )}
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
