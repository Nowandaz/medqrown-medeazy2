import "./tz";
import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { attachLiveQuizWebSocket } from "./live-quiz";
import { migrateStage3 } from "./stage3-migration";
import { migrateStage4 } from "./stage4-migration";
import { migrateStage5 } from "./stage5-migration";
import { migrateStage6 } from "./stage6-migration";
import { migrateStage7 } from "./stage7-migration";
import { migrateStage9 } from "./stage9-migration";
import { migrateStage10 } from "./stage10-migration";
import { migrateStage11 } from "./stage11-migration";
import { migrateTimetable } from "./timetable";
import { submitDueStage6Attempts } from "./stage6";
import { sendDueRenewalReminders } from "./stage5";
import { applyRegistrationSchedule } from "./stage9";
import { ensureCurrentAndNextCohorts } from "./stage3-storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const keepRawBody = (req: any, _res: any, buf: Buffer) => {
  req.rawBody = buf;
};
const jsonParser = express.json({ verify: keepRawBody });
// Bulk question imports can carry hundreds of long questions, so they get a
// larger body limit than the 100kb default used everywhere else.
const bulkImportJsonParser = express.json({ limit: "10mb", verify: keepRawBody });
const BULK_IMPORT_PATH = /^\/api\/exams\/[^/]+\/questions\/bulk$/;

app.use((req, res, next) =>
  req.method === "POST" && BULK_IMPORT_PATH.test(req.path)
    ? bulkImportJsonParser(req, res, next)
    : jsonParser(req, res, next),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await migrateStage3();
  await migrateStage4();
  await migrateStage5();
  await migrateStage6();
  await migrateStage7();
  await migrateStage9();
  await migrateStage10();
  await migrateStage11();
  await migrateTimetable();
  await ensureCurrentAndNextCohorts();
  const { seed } = await import("./seed");
  await seed().catch(console.error);
  await registerRoutes(httpServer, app);
  void submitDueStage6Attempts().catch((error) => console.error("Stage 6 deadline sweep failed", error));
  setInterval(() => {
    void sendDueRenewalReminders().catch((error) => console.error("Stage 5 reminder job failed", error));
  }, 15 * 60 * 1000).unref();
  setInterval(() => {
    void applyRegistrationSchedule().catch((error) => console.error("Registration schedule failed", error));
  }, 60 * 1000).unref();
  setInterval(() => {
    void submitDueStage6Attempts().catch((error) => console.error("Stage 6 deadline sweep failed", error));
  }, 15 * 1000).unref();
  attachLiveQuizWebSocket(httpServer);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      // Not supported on Windows (local development); Render runs Linux.
      reusePort: process.platform === "linux",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
