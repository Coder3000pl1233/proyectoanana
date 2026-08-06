import { useEffect, useState } from "react";
import type { Difficulty, RoomSummary } from "@puzzle/shared";
import { Game } from "./Game";
import { serverUrl } from "./config";

const jsonResponse = async (response: Response) => {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json"))
    throw new Error("El servidor del puzzle no está disponible. Intentá nuevamente en un momento.");
  return response.json();
};
const fetchServer = async (path: string, options?: RequestInit) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(serverUrl(path), { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error("El servidor está tardando demasiado en responder. Esperá un minuto e intentá otra vez.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};
const roomId = location.pathname.match(/^\/room\/([A-Za-z0-9_-]+)$/)?.[1];
export function App() {
  useEffect(() => {
    // Despierta el servicio gratuito de Render mientras la persona prepara
    // la sala, para que crear o abrir el tablero no pague toda la espera.
    const controller = new AbortController();
    fetch(serverUrl("/api/health"), {
      signal: controller.signal,
      cache: "no-store",
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return (
    <>
      <header className="top">
        <a href="/" className="brand">
          <span>◩</span> Proyecto Anana
        </a>
        <span className="tagline">Cada pieza, entre todos.</span>
      </header>
      {roomId ? <RoomGate id={roomId} /> : <Home />}
    </>
  );
}
function Home() {
  const [name, setName] = useState(localStorage.getItem("puzzle-name") || ""),
    [difficulty, setDifficulty] = useState<Difficulty>("facil"),
    [file, setFile] = useState<File>(),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const choose = (f?: File) => {
    setError("");
    if (!f) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
      f.size > 8 * 1024 * 1024
    ) {
      setError("Elegí una imagen JPG, PNG o WebP de hasta 8 MB.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || !file) {
      setError("Escribí tu nombre y elegí una imagen.");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set("image", file);
    fd.set("difficulty", difficulty);
    try {
      const r = await fetchServer("/api/rooms", { method: "POST", body: fd }),
        data = await jsonResponse(r);
      if (!r.ok) throw new Error(data.error);
      localStorage.setItem("puzzle-name", name.trim());
      localStorage.setItem(`host-${data.id}`, name.trim());
      location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos crear la sala.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="landing">
      <section className="hero">
        <div className="eyebrow">PUZZLES COLABORATIVOS EN TIEMPO REAL</div>
        <h1>
          Una imagen.
          <br />
          <em>Muchas manos.</em>
        </h1>
        <p>
          Subí una foto, compartí el enlace y armen el puzzle juntos desde
          cualquier lugar.
        </p>
        <div className="how">
          <span>
            <b>01</b> Creá
          </span>
          <i>→</i>
          <span>
            <b>02</b> Invitá
          </span>
          <i>→</i>
          <span>
            <b>03</b> Armen
          </span>
        </div>
      </section>
      <form className="create-card" onSubmit={submit}>
        <div className="card-title">
          <span>✦</span>
          <div>
            <h2>Crear una sala</h2>
            <p>Prepará el tablero en menos de un minuto.</p>
          </div>
        </div>
        <label>
          Tu nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="¿Cómo te llamás?"
            autoComplete="name"
          />
        </label>
        <label>
          Imagen del puzzle
          <div className={"drop " + (preview ? "has-image" : "")}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => choose(e.target.files?.[0])}
            />
            {preview ? (
              <img src={preview} alt="Vista previa" />
            ) : (
              <>
                <strong>Subí una imagen</strong>
                <small>JPG, PNG o WebP · máximo 8 MB</small>
              </>
            )}
          </div>
        </label>
        <fieldset>
          <legend>Dificultad</legend>
          <div className="levels">
            {(
              [
                ["facil", "Fácil", "12 piezas"],
                ["media", "Media", "24 piezas"],
                ["dificil", "Difícil", "48 piezas"],
                ["experto", "Experto", "100 piezas"],
              ] as const
            ).map((x) => (
              <button
                type="button"
                className={difficulty === x[0] ? "selected" : ""}
                onClick={() => setDifficulty(x[0])}
                key={x[0]}
              >
                <b>{x[1]}</b>
                <small>{x[2]}</small>
              </button>
            ))}
          </div>
        </fieldset>
        {difficulty === "experto" && (
          <p className="expert-note">
            Desafío grande: recomendado para pantallas amplias y equipos.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Creando tablero…" : "Crear sala →"}
        </button>
        <p className="privacy">Sin cuentas · Sala privada por enlace</p>
      </form>
    </main>
  );
}
function RoomGate({ id }: { id: string }) {
  const [summary, setSummary] = useState<RoomSummary | null>(),
    [error, setError] = useState(""),
    [name, setName] = useState(
      localStorage.getItem(`host-${id}`) ||
        localStorage.getItem("puzzle-name") ||
        "",
    ),
    [joined, setJoined] = useState(!!localStorage.getItem(`host-${id}`));
  useEffect(() => {
    fetchServer(`/api/rooms/${id}`)
      .then(async (r) => {
        const d = await jsonResponse(r);
        if (!r.ok) throw new Error(d.error);
        setSummary(d);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  if (error)
    return (
      <main className="center-state">
        <div className="state-icon">?</div>
        <h1>Esta sala no está disponible</h1>
        <p>{error}</p>
        <a href="/" className="primary link">
          Crear un puzzle nuevo
        </a>
      </main>
    );
  if (!summary)
    return (
      <main className="center-state">
        <div className="spinner" />
        <p>Buscando la sala…</p>
      </main>
    );
  if (joined) return <Game roomId={id} initialName={name} summary={summary} />;
  return (
    <main className="join-wrap">
      <section className="join-card">
        <div className="state-icon">✦</div>
        <div className="eyebrow">TE INVITARON A UN PUZZLE</div>
        <h1>
          {summary.completed ? "Puzzle completado" : "Hay un lugar para vos"}
        </h1>
        <p>
          {summary.pieceCount} piezas · dificultad {summary.difficulty}
        </p>
        <label>
          Tu nombre
          <input
            autoFocus
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="¿Cómo te llamás?"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim().length > 1) setJoined(true);
            }}
          />
        </label>
        <button
          className="primary"
          onClick={() => {
            if (name.trim().length > 1) {
              localStorage.setItem("puzzle-name", name.trim());
              setJoined(true);
            }
          }}
        >
          Entrar al tablero →
        </button>
      </section>
    </main>
  );
}
