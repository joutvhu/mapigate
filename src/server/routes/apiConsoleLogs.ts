import { Router, type Request, type Response } from "express";
import {
  getConsoleLogs,
  clearConsoleLogs,
  getConsoleEmitter,
} from "../utils/consoleLogBuffer.js";
import { CONSOLE_LOG_CONFIG } from "../../shared/constants/index.js";

export const consoleLogsRouter = Router();

// GET snapshot of current console logs
consoleLogsRouter.get("/", (_req: Request, res: Response) => {
  try {
    const logs = getConsoleLogs();
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to get console logs" });
  }
});

// DELETE clear console log buffer
consoleLogsRouter.delete("/", (_req: Request, res: Response) => {
  try {
    clearConsoleLogs();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to clear console logs" });
  }
});

// GET /stream - Server-Sent Events (SSE) live streaming
consoleLogsRouter.get("/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const emitter = getConsoleEmitter();
  let closed = false;

  // Send initial history snapshot
  const initialLogs = getConsoleLogs();
  try {
    res.write(`data: ${JSON.stringify({ type: "init", logs: initialLogs })}\n\n`);
  } catch {
    return;
  }

  const onLines = (lines: string[]) => {
    if (closed || !Array.isArray(lines) || lines.length === 0) return;
    try {
      res.write(`data: ${JSON.stringify({ type: "lines", lines })}\n\n`);
    } catch {
      cleanup();
    }
  };

  const onClear = () => {
    if (closed) return;
    try {
      res.write(`data: ${JSON.stringify({ type: "clear" })}\n\n`);
    } catch {
      cleanup();
    }
  };

  const keepaliveInterval = CONSOLE_LOG_CONFIG.keepaliveIntervalMs || 25000;
  const keepaliveTimer = setInterval(() => {
    if (closed) {
      clearInterval(keepaliveTimer);
      return;
    }
    try {
      res.write(": keepalive\n\n");
    } catch {
      cleanup();
    }
  }, keepaliveInterval);

  keepaliveTimer.unref?.();

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepaliveTimer);
    emitter.off("lines", onLines);
    emitter.off("clear", onClear);
    try {
      if (!res.writableEnded) {
        res.end();
      }
    } catch {}
  };

  emitter.on("lines", onLines);
  emitter.on("clear", onClear);

  req.on("close", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
});
