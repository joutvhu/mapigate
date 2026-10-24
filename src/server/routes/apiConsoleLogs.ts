import { Router, type Request, type Response } from "express";
import {
  getConsoleLogs,
  getStructuredLogs,
  clearConsoleLogs,
  getConsoleEmitter,
} from "../utils/consoleLogBuffer.js";
import { CONSOLE_LOG_CONFIG } from "../../shared/constants/index.js";
import type { StructuredLogEntry } from "../../shared/types/logging.js";
import { logger, parseLogLevel } from "../../shared/logger.js";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";

export const consoleLogsRouter = Router();

// GET /api/console-logs/level - Get current gateway log level
consoleLogsRouter.get("/level", (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      level: logger.getLevelName(),
      availableLevels: ["trace", "debug", "info", "warn", "error"],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to get log level" });
  }
});

// PUT /api/console-logs/level - Dynamically update gateway log level
consoleLogsRouter.put("/level", (req: Request, res: Response) => {
  try {
    const { level } = req.body || {};
    if (!level || typeof level !== "string") {
      return res.status(400).json({ success: false, error: "Missing or invalid 'level' parameter" });
    }
    const parsed = parseLogLevel(level);
    logger.setLevel(parsed);
    const updatedName = logger.getLevelName();
    SettingsRepository.setLogLevel(updatedName);
    logger.info("SYSTEM", `Gateway log level dynamically changed to [${updatedName.toUpperCase()}]`);
    res.json({ success: true, level: updatedName });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to update log level" });
  }
});

// PATCH /api/console-logs/level - Dynamically update gateway log level
consoleLogsRouter.patch("/level", (req: Request, res: Response) => {
  try {
    const { level } = req.body || {};
    if (!level || typeof level !== "string") {
      return res.status(400).json({ success: false, error: "Missing or invalid 'level' parameter" });
    }
    const parsed = parseLogLevel(level);
    logger.setLevel(parsed);
    const updatedName = logger.getLevelName();
    SettingsRepository.setLogLevel(updatedName);
    logger.info("SYSTEM", `Gateway log level dynamically changed to [${updatedName.toUpperCase()}]`);
    res.json({ success: true, level: updatedName });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to update log level" });
  }
});

// GET /api/console-logs/observability - Get current observability capture mode
consoleLogsRouter.get("/observability", (_req: Request, res: Response) => {
  try {
    const mode = SettingsRepository.getObservabilityMode();
    res.json({
      success: true,
      mode,
      availableModes: [
        { value: "errors_only", label: "Errors Only (Recommended)" },
        { value: "all", label: "All Requests (Full Capture)" },
        { value: "off", label: "Off (Zero Disk IO)" },
      ],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to get observability mode" });
  }
});

// PUT /api/console-logs/observability - Dynamically update observability capture mode
consoleLogsRouter.put("/observability", (req: Request, res: Response) => {
  try {
    const { mode } = req.body || {};
    if (mode !== "off" && mode !== "errors_only" && mode !== "all") {
      return res.status(400).json({ success: false, error: "Invalid mode. Must be 'off', 'errors_only', or 'all'." });
    }
    const updated = SettingsRepository.setObservabilityMode(mode);
    logger.info("SYSTEM", `Observability capture mode updated to [${updated.toUpperCase()}]`);
    res.json({ success: true, mode: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || "Failed to update observability mode" });
  }
});

// GET snapshot of current console logs
consoleLogsRouter.get("/", (_req: Request, res: Response) => {
  try {
    const logs = getConsoleLogs();
    const structuredLogs = getStructuredLogs();
    res.json({ success: true, logs, structuredLogs, level: logger.getLevelName() });
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
  const initialStructured = getStructuredLogs();
  try {
    res.write(
      `data: ${JSON.stringify({
        type: "init",
        logs: initialLogs,
        lines: initialLogs,
        structured: initialStructured,
      })}\n\n`
    );
  } catch {
    return;
  }

  const onLines = (lines: string[], structured?: StructuredLogEntry[]) => {
    if (closed || !Array.isArray(lines) || lines.length === 0) return;
    try {
      res.write(
        `data: ${JSON.stringify({
          type: "lines",
          lines,
          logs: lines,
          structured: structured || [],
        })}\n\n`
      );
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
