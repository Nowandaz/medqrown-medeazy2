import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import path from "path";

const SUPABASE_PROJECT_URL = "https://aavwvonsaphlqyylmjgt.supabase.co";
const BUCKET = "medqrown-images";

function getServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function isSupabaseStorageConfigured(): boolean {
  return !!getServiceRoleKey();
}

const ALLOWED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

function requireAdminSession(req: Request, res: Response): boolean {
  if (!(req.session as any)?.adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function registerObjectStorageRoutes(app: Express): void {

  app.post("/api/uploads/request-url", async (req: Request, res: Response) => {
    try {
      if (!requireAdminSession(req, res)) return;
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      if (typeof size === "number" && size > MAX_UPLOAD_BYTES) {
        return res.status(400).json({ error: "File too large (max 10 MB)" });
      }
      if (contentType && !String(contentType).startsWith("image/")) {
        return res.status(400).json({ error: "Only image uploads are allowed" });
      }
      const extCheck = path.extname(name).toLowerCase();
      if (!ALLOWED_IMAGE_EXTS.has(extCheck)) {
        return res.status(400).json({ error: "Only image files are allowed" });
      }

      const ext = path.extname(name) || "";
      const filename = `${randomUUID()}${ext}`;

      if (isSupabaseStorageConfigured()) {
        const objectPath = `questions/${filename}`;
        const publicUrl = `${SUPABASE_PROJECT_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
        const uploadURL = `/api/uploads/put/${encodeURIComponent(objectPath)}`;
        return res.json({ uploadURL, objectPath: publicUrl, metadata: { name, size, contentType } });
      }

      return res.status(500).json({ error: "Image storage not configured. Set SUPABASE_SERVICE_ROLE_KEY." });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      return res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.put("/api/uploads/put/*objectPath", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    const key = getServiceRoleKey();
    if (!key) {
      return res.status(500).json({ error: "Storage not configured" });
    }

    const objectPath = req.params.objectPath;
    // Constrain to the expected prefix + safe characters (no traversal, no arbitrary keys)
    const pathStr = Array.isArray(objectPath) ? objectPath.join("/") : String(objectPath);
    if (!/^questions\/[A-Za-z0-9-]+\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(pathStr)) {
      return res.status(400).json({ error: "Invalid object path" });
    }
    const contentType = req.headers["content-type"] || "application/octet-stream";
    if (!String(contentType).startsWith("image/")) {
      return res.status(400).json({ error: "Only image uploads are allowed" });
    }

    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_UPLOAD_BYTES) {
        req.destroy();
        if (!res.headersSent) res.status(413).json({ error: "File too large (max 10 MB)" });
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", async () => {
      try {
        const body = Buffer.concat(chunks);
        const uploadResp = await fetch(
          `${SUPABASE_PROJECT_URL}/storage/v1/object/${BUCKET}/${objectPath}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": contentType,
              "x-upsert": "true",
            },
            body,
          }
        );

        if (!uploadResp.ok) {
          const errText = await uploadResp.text();
          console.error("Supabase upload error:", errText);
          return res.status(500).json({ error: "Failed to upload to Supabase Storage" });
        }

        return res.json({ ok: true });
      } catch (err) {
        console.error("Upload error:", err);
        return res.status(500).json({ error: "Upload failed" });
      }
    });

    req.on("error", (err) => {
      console.error("Request stream error:", err);
      res.status(500).json({ error: "Upload stream failed" });
    });
  });
}
