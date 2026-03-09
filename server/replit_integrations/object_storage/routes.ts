import type { Express, Request, Response } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), "server", "uploads");

function isObjectStorageConfigured(): boolean {
  return !!(process.env.PRIVATE_OBJECT_DIR);
}

function ensureUploadsDir() {
  if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
    fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
  }
}

export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  app.post("/api/uploads/request-url", async (req: Request, res: Response) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }

      if (isObjectStorageConfigured()) {
        const uploadURL = await objectStorageService.getObjectEntityUploadURL();
        const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
        return res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
      }

      // Local file upload fallback
      ensureUploadsDir();
      const ext = path.extname(name) || "";
      const filename = `${randomUUID()}${ext}`;
      const uploadURL = `/api/uploads/put/${filename}`;
      const objectPath = `/objects/local/${filename}`;

      return res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      return res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Local upload PUT handler — receives raw file body from Uppy
  app.put("/api/uploads/put/:filename", (req: Request, res: Response) => {
    ensureUploadsDir();
    const filename = req.params.filename;
    // Sanitize: only allow safe filenames
    if (!/^[\w\-]+\.\w+$/.test(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
    const writeStream = fs.createWriteStream(filePath);

    req.pipe(writeStream);

    writeStream.on("finish", () => {
      res.status(200).json({ ok: true });
    });

    writeStream.on("error", (err) => {
      console.error("File write error:", err);
      res.status(500).json({ error: "Failed to save file" });
    });

    req.on("error", (err) => {
      console.error("Request stream error:", err);
      writeStream.destroy();
      res.status(500).json({ error: "Upload stream failed" });
    });
  });

  // Serve locally uploaded files
  app.get("/objects/local/:filename", (req: Request, res: Response) => {
    const filename = req.params.filename;
    if (!/^[\w\-]+\.\w+$/.test(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    res.sendFile(filePath);
  });

  // Remote object storage serving (when configured)
  app.get("/objects/*objectPath", async (req: Request, res: Response) => {
    try {
      const rawParam = req.params.objectPath;
      const pathStr = Array.isArray(rawParam) ? rawParam.join("/") : rawParam;
      const objectPath = `/objects/${pathStr}`;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
