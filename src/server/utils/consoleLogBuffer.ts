import { EventEmitter } from "node:events";
import { CONSOLE_LOG_CONFIG } from "../../shared/constants/index.js";

const consoleLevels = ["log", "info", "warn", "error", "debug"] as const;
type ConsoleLevel = (typeof consoleLevels)[number];

interface ConsoleLogBufferState {
  logs: string[];
  pendingLines: string[];
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
    pendingLines: [],
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
if (!state.pendingLines) state.pendingLines = [];
if (!state.flushTimer) state.flushTimer = null;

const FLUSH_INTERVAL_MS = CONSOLE_LOG_CONFIG.flushIntervalMs || 100;
const MAX_BATCH_LINES = CONSOLE_LOG_CONFIG.maxBatchLines || 50;
const MAX_LINES = CONSOLE_LOG_CONFIG.maxLines || 300;

// Strip ANSI escape codes so terminal color codes don't bleed into UI
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

function formatArg(arg: any): string {
  if (typeof arg === "string") return stripAnsi(arg);
  if (arg instanceof Error) return stripAnsi(arg.stack || arg.message || String(arg));
  try {
    return stripAnsi(typeof arg === "object" ? JSON.stringify(arg) : String(arg));
  } catch {
    return stripAnsi(String(arg));
  }
}

function toLogLine(_level: ConsoleLevel, args: any[]): string {
  return args.map(formatArg).join(" ");
}

function flushPendingLines(): void {
  state.flushTimer = null;
  if (!state.pendingLines.length) return;

  const lines = state.pendingLines.splice(0, state.pendingLines.length);
  state.emitter.emit("lines", lines);
}

function scheduleFlush(): void {
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(flushPendingLines, FLUSH_INTERVAL_MS);
  state.flushTimer?.unref?.();
}

function appendLine(line: string): void {
  state.logs.push(line);
  if (state.logs.length > MAX_LINES) {
    state.logs = state.logs.slice(-MAX_LINES);
  }
  state.pendingLines.push(line);
  if (state.pendingLines.length >= MAX_BATCH_LINES) {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    flushPendingLines();
  } else {
    scheduleFlush();
  }
}

export function initConsoleLogCapture(): void {
  if (state.patched) return;

  for (const level of consoleLevels) {
    state.originals[level] = console[level];
    console[level] = (...args: any[]) => {
      appendLine(toLogLine(level, args));
      state.originals[level]?.(...args);
    };
  }

  state.patched = true;
}

export function getConsoleLogs(): string[] {
  return state.logs;
}

export function clearConsoleLogs(): void {
  state.logs = [];
  state.pendingLines = [];
  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
  state.emitter.emit("clear");
}

export function getConsoleEmitter(): EventEmitter {
  return state.emitter;
}

export const consoleLogEmitter = state.emitter;
