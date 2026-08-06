import express from "express";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { mkdirSync, unlinkSync } from "node:fs";
import { resolve, basename } from "node:path";
import { DIFFICULTIES, type Difficulty } from "@puzzle/shared";
import { generatePieces } from "./domain.js";
import type { Store } from "./store.js";
export function makeApp(store: Store, uploadDir: string, origin: string) {
  mkdirSync(uploadDir, { recursive: true });
  const app = express();
  app.use(cors({ origin }));
  app.use(express.json({ limit: "32kb" }));
  app.use(
    "/uploads",
    express.static(uploadDir, { immutable: true, maxAge: "7d" }),
  );
  const upload = multer({
    dest: uploadDir,
    limits: {
      fileSize: Number(process.env.MAX_IMAGE_MB || 8) * 1024 * 1024,
      files: 1,
    },
    fileFilter: (_r, f, cb) =>
      cb(null, ["image/jpeg", "image/png", "image/webp"].includes(f.mimetype)),
  });
  app.get("/api/health", (_q, r) => r.json({ ok: true }));
  app.get("/api/rooms/:id", (req, res) => {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(req.params.id))
      return res.status(400).json({ error: "Enlace inválido." });
    const s = store.summary(req.params.id);
    return s
      ? res.json(s)
      : res.status(404).json({ error: "La sala no existe." });
  });
  app.post("/api/rooms", upload.single("image"), async (req, res) => {
    let file = req.file;
    try {
      const difficulty = req.body.difficulty as Difficulty;
      if (!file || !DIFFICULTIES[difficulty]) throw new Error("INVALID");
      const meta = await sharp(file.path).metadata();
      if (
        !meta.width ||
        !meta.height ||
        meta.width < 320 ||
        meta.height < 240 ||
        meta.width > 12000 ||
        meta.height > 12000 ||
        !["jpeg", "png", "webp"].includes(meta.format || "")
      )
        throw new Error("INVALID");
      const id = randomBytes(18).toString("base64url"),
        filename = `${id}.webp`;
      await sharp(file.path)
        .rotate()
        .resize(1000, 700, { fit: "cover", position: "centre" })
        .webp({ quality: 88 })
        .toFile(resolve(uploadDir, filename));
      unlinkSync(file.path);
      file = undefined;
      const cfg = DIFFICULTIES[difficulty];
      store.create({
        id,
        difficulty,
        imagePath: basename(filename),
        width: meta.width,
        height: meta.height,
        rows: cfg.rows,
        cols: cfg.cols,
        pieces: generatePieces(difficulty),
      });
      res.status(201).json({ id, url: `/room/${id}` });
    } catch {
      if (file)
        try {
          unlinkSync(file.path);
        } catch {
          console.warn("No se pudo quitar un archivo temporal");
        }
      res
        .status(400)
        .json({
          error:
            "Usá una imagen JPG, PNG o WebP de 320×240 px como mínimo y hasta 8 MB.",
        });
    }
  });
  return app;
}
