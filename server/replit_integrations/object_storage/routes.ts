import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

// Images are stored in server/uploads/ on the local filesystem.
// Replit's filesystem is persistent across restarts, so images are never lost.
// No Supabase, no GCS, no external dependencies.

const UPLOADS_DIR = path.join(process.cwd(), "server", "uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function registerObjectStorageRoutes(app: Express): void {
  ensureUploadsDir();

  // Step 1: Client requests an upload slot — we return a PUT URL and the final public URL
  app.post("/api/uploads/request-url", (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "Missing required field: name" });

      const ext = path.extname(name) || "";
      const filename = `${randomUUID()}${ext}`;
      const uploadURL = `/api/uploads/put/${filename}`;
      const objectPath = `/api/uploads/image/${filename}`;

      return res.json({ uploadURL, objectPath, metadata: req.body });
    } catch (err) {
      console.error("request-url error:", err);
      return res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Step 2: Client PUTs the raw file bytes here — we save them to disk
  app.put("/api/uploads/put/:filename", (req: Request, res: Response) => {
    ensureUploadsDir();
    const filename = path.basename(req.params.filename);
    const dest = path.join(UPLOADS_DIR, filename);
    const out = fs.createWriteStream(dest);

    req.pipe(out);

    out.on("finish", () => res.json({ ok: true }));
    out.on("error", (err) => {
      console.error("Write error:", err);
      res.status(500).json({ error: "Failed to save file" });
    });
    req.on("error", (err) => {
      console.error("Request stream error:", err);
      out.destroy();
      res.status(500).json({ error: "Upload stream failed" });
    });
  });

  // Step 3: Serve uploaded images publicly
  app.get("/api/uploads/image/:filename", (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(UPLOADS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Image not found" });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".png": "image/png", ".gif": "image/gif",
      ".webp": "image/webp", ".svg": "image/svg+xml",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000");
    fs.createReadStream(filePath).pipe(res);
  });
}
