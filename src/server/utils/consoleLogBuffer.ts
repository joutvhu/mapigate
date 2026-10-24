import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { CONSOLE_LOG_CONFIG } from "../../shared/constants/index.js";
import { maskKey } from "../../shared/logger.js";
import type {
  StructuredLogEntry,
  LogLevel,
  LogCategory,
} from "../../shared/types/logging.js";

const consoleLevels = ["log", "info", "warn", "error", "debug"] as const;
type ConsoleLevel = (typeof consoleLevels)[number];

interface ConsoleLogBufferState {
  logs: string[];
  structuredLogs: StructuredLogEntry[];
  pendingLines: string[];
  pendingStructured: StructuredLogEntry[];
  flushTimer: NodeJS.Timeout | null;
  patched: boolean;
  originals: Partial<Record<ConsoleLevel, (...args: any[]) => void>>;
  emitter: EventEmitter;
}

declare global {
  // eslint-disable-next-line no-var
  var _consoleLogBufferState: ConsoleLogBufferState | undefined;
}

if (!globalThis._consoleLogBufferState) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);
  globalThis._consoleLogBufferState = {
    logs: [],
    structuredLogs: [],
    pendingLines: [],
    pendingStructured: [],
    flushTimer: null,
    patched: false,
    originals: {},
    emitter,
  };
}

const state = globalThis._consoleLogBufferState;
if (!state.emitter) {
  state.emitter = new EventEmitter();
  state.emitter.setMaxListeners(100);
}
if (!state.logs) state.logs = [];
if (!state.structuredLogs) state.structuredLogs = [];
if (!state.pendingLines) state.pendingLines = [];
if (!state.pendingStructured) state.pendingStructured = [];
if (!state.flushTimer) state.flushTimer = null;

const FLUSH_INTERVAL_MS = CONSOLE_LOG_CONFIG.flushIntervalMs || 100;
const MAX_BATCH_LINES = CONSOLE_LOG_CONFIG.maxBatchLines || 50;
const MAX_LINES = CONSOLE_LOG_CONFIG.maxLines || 500;
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

/** Mask sensitive credentials, tokens, and keys in log text */
export function maskSecretsInText(text: string): string {
  if (!text || typeof text !== "string") return text;
  let result = text.replace(/Bearer\s+([A-Za-z0-9_\-\.]{8,})/gi, (_m, t) => `Bearer ${maskKey(t)}`);
  result = result.replace(/sk-[A-Za-z0-9_\-]{8,}/g, (m) => maskKey(m));
  return result.replace(
    /"(password|secret|rawApiKey|client_secret|apiKey)"\s*:\s*"([^"]+)"/gi,
    (_m, f, val) => `"${f}":"${maskKey(val)}"`
  );
}

function formatArg(arg: any): string {
  if (typeof arg === "string") return maskSecretsInText(stripAnsi(arg));
  if (arg instanceof Error) return maskSecretsInText(stripAnsi(arg.stack || arg.message || String(arg)));
  try {
    const json = typeof arg === "object" ? JSON.stringify(arg) : String(arg);
    return maskSecretsInText(stripAnsi(json));
  } catch {
    return maskSecretsInText(stripAnsi(String(arg)));
  }
}

/** Heuristically parses a raw string line into a StructuredLogEntry */
export function parseRawLineToStructured(line: string, fallbackLevel: LogLevel = "info"): StructuredLogEntry {
  const cleanLine = maskSecretsInText(stripAnsi(line));
  const timeMatch = cleanLine.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*/);
  let rest = timeMatch ? cleanLine.slice(timeMatch[0].length) : cleanLine;

  const tagMatch = rest.match(/^([🟢🔵🟣🟡🟠🔴⚪🟤📥▶⚙🔀🔑🔄🌊📊❌✔⚠️💥📤🛠️])\s*/u);
  const reqTag = tagMatch ? tagMatch[1] : undefined;
  if (tagMatch) rest = rest.slice(tagMatch[0].length);

  let level: LogLevel = fallbackLevel;
  const upper = cleanLine.toUpperCase();
  if (upper.includes("[ERROR]") || upper.includes("ERROR:") || cleanLine.includes("💥") || cleanLine.includes("❌")) {
    level = "error";
  } else if (upper.includes("[WARN]") || upper.includes("WARN:") || upper.includes("WARNING:") || cleanLine.includes("⚠️")) {
    level = "warn";
  } else if (cleanLine.includes("🔬") || upper.includes("[TRACE]") || fallbackLevel === "trace") {
    level = "trace";
  } else if (upper.includes("[DEBUG]") || cleanLine.includes("🔍") || fallbackLevel === "debug") {
    level = "debug";
  }

  let category: LogCategory = "system";
  if (cleanLine.includes("[SCHEDULER]") || cleanLine.includes("tokenScheduler")) {
    category = "scheduler";
  } else if (cleanLine.includes("[MITM]") || cleanLine.toLowerCase().includes("mitm") || cleanLine.includes("Root CA")) {
    category = "mitm";
  } else if (cleanLine.includes("[ROUTER]") || cleanLine.includes("LoadBalancer") || cleanLine.includes("failing over") || cleanLine.includes("🔄")) {
    category = "router";
  } else if (cleanLine.includes("[RTK]") || cleanLine.includes("RTK:")) {
    category = "rtk";
  } else if (cleanLine.includes("[AUTH]") || cleanLine.includes("OAuth")) {
    category = "auth";
  } else if (
    cleanLine.includes("/v1/") || cleanLine.includes("TTFT") || cleanLine.includes("streaming chunks") ||
    cleanLine.includes("DONE ") || cleanLine.includes("Tool invoked:") || cleanLine.includes("Upstream") ||
    cleanLine.includes("upstream") || cleanLine.includes("📥") || cleanLine.includes("🌊") || cleanLine.includes("📊")
  ) {
    category = "proxy";
  }

  return { id: crypto.randomUUID(), timestamp: Date.now(), level, category, message: rest || cleanLine, reqTag, rawText: cleanLine };
}

function flushPendingLines(): void {
  state.flushTimer = null;
  if (!state.pendingLines.length && !state.pendingStructured.length) return;
  const lines = state.pendingLines.splice(0, state.pendingLines.length);
  const structured = state.pendingStructured.splice(0, state.pendingStructured.length);
  state.emitter.emit("lines", lines, structured);
  state.emitter.emit("structured", structured);
}

function queueAndSchedule(line: string, entry: StructuredLogEntry): void {
  state.logs.push(line);
  if (state.logs.length > MAX_LINES) state.logs = state.logs.slice(-MAX_LINES);
  state.structuredLogs.push(entry);
  if (state.structuredLogs.length > MAX_LINES) state.structuredLogs = state.structuredLogs.slice(-MAX_LINES);

  state.pendingLines.push(line);
  state.pendingStructured.push(entry);

  if (state.pendingLines.length >= MAX_BATCH_LINES) {
    if (state.flushTimer) { clearTimeout(state.flushTimer); state.flushTimer = null; }
    flushPendingLines();
  } else if (!state.flushTimer) {
    state.flushTimer = setTimeout(flushPendingLines, FLUSH_INTERVAL_MS);
    state.flushTimer?.unref?.();
  }
}

function appendLine(line: string, fallbackLevel: ConsoleLevel = "log"): void {
  const sanitized = maskSecretsInText(line);
  const lvlMap: Record<ConsoleLevel, LogLevel> = { log: "info", info: "info", warn: "warn", error: "error", debug: "debug" };
  const structured = parseRawLineToStructured(sanitized, lvlMap[fallbackLevel]);
  queueAndSchedule(sanitized, structured);
}

/** Appends or enriches a StructuredLogEntry into the buffer */
export function appendStructuredLog(entry: StructuredLogEntry): void {
  try {
    const raw = maskSecretsInText(entry.rawText || entry.message);
    const enriched: StructuredLogEntry = {
      ...entry,
      id: entry.id || crypto.randomUUID(),
      timestamp: entry.timestamp || Date.now(),
      rawText: raw,
    };

    // Find any existing structured log entry with the same requestId (searching newest to oldest)
    let existing: StructuredLogEntry | undefined;
    if (enriched.requestId) {
      for (let i = state.structuredLogs.length - 1; i >= 0; i--) {
        if (state.structuredLogs[i].requestId === enriched.requestId) {
          existing = state.structuredLogs[i];
          break;
        }
      }
    }

    if (!existing && enriched.reqTag) {
      for (let i = state.structuredLogs.length - 1; i >= 0; i--) {
        const item = state.structuredLogs[i];
        if (
          item.reqTag === enriched.reqTag &&
          item.category === enriched.category &&
          (item.rawText.includes(enriched.message) || enriched.rawText.includes(item.message))
        ) {
          existing = item;
          break;
        }
      }
    }

    if (existing) {
      Object.assign(existing, enriched, {
        gateway: { ...existing.gateway, ...enriched.gateway },
        error: enriched.error || existing.error,
      });
      if (!state.pendingStructured.includes(existing)) {
        state.pendingStructured.push(existing);
      }
      if (!state.flushTimer) {
        state.flushTimer = setTimeout(flushPendingLines, FLUSH_INTERVAL_MS);
        state.flushTimer?.unref?.();
      }
      return;
    }

    queueAndSchedule(raw, enriched);
  } catch {
    // Fail-open
  }
}

export function initConsoleLogCapture(): void {
  if (state.patched) return;
  for (const level of consoleLevels) {
    state.originals[level] = console[level];
    console[level] = (...args: any[]) => {
      appendLine(args.map(formatArg).join(" "), level);
      state.originals[level]?.(...args);
    };
  }
  state.patched = true;
}

export function getConsoleLogs(): string[] { return state.logs; }
export function getStructuredLogs(): StructuredLogEntry[] { return state.structuredLogs; }

export function clearConsoleLogs(): void {
  state.logs = [];
  state.structuredLogs = [];
  state.pendingLines = [];
  state.pendingStructured = [];
  if (state.flushTimer) { clearTimeout(state.flushTimer); state.flushTimer = null; }
  state.emitter.emit("clear");
}

export function getConsoleEmitter(): EventEmitter { return state.emitter; }
export const consoleLogEmitter = state.emitter;
