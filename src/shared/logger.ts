/**
 * High-performance, fail-open structured logger for Mapigate.
 * Correlates requests using colored-dot tags, formats timestamps,
 * redacts credentials/keys, and supports configurable log levels.
 */

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  OFF = 5,
}

export function parseLogLevel(lvl: string | number | undefined | null, fallback = LogLevel.INFO): LogLevel {
  if (typeof lvl === "number" && lvl in LogLevel) return lvl as LogLevel;
  if (typeof lvl === "string") {
    const upper = lvl.trim().toUpperCase();
    if (upper === "TRACE") return LogLevel.TRACE;
    if (upper === "DEBUG") return LogLevel.DEBUG;
    if (upper === "INFO") return LogLevel.INFO;
    if (upper === "WARN" || upper === "WARNING") return LogLevel.WARN;
    if (upper === "ERROR") return LogLevel.ERROR;
    if (upper === "OFF" || upper === "NONE" || upper === "SILENT") return LogLevel.OFF;
  }
  return fallback;
}

export function formatLogLevelName(level: LogLevel): "trace" | "debug" | "info" | "warn" | "error" | "off" {
  switch (level) {
    case LogLevel.TRACE:
      return "trace";
    case LogLevel.DEBUG:
      return "debug";
    case LogLevel.INFO:
      return "info";
    case LogLevel.WARN:
      return "warn";
    case LogLevel.ERROR:
      return "error";
    default:
      return "off";
  }
}

export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

export const LogSymbol = {
  INCOMING: "📥",
  DISPATCH: "▶",
  SAVER: "⚙",
  COMBO: "🔀",
  KEY: "🔑",
  FAILOVER: "🔄",
  STREAM: "🌊",
  USAGE: "📊",
  ERROR: "❌",
  SUCCESS: "✔",
  WARN: "⚠️",
  TRACE: "🔬",
  DEBUG: "🔍",
} as const;

/** Correlated colored dots to trace lines belonging to the same request */
export const REQ_TAGS = ["🟢", "🔵", "🟣", "🟡", "🟠", "🔴", "⚪", "🟤"] as const;
let tagCursor = 0;

/** Allocate next rotating tag when no request ID is available */
export function nextTag(): string {
  const tag = REQ_TAGS[tagCursor % REQ_TAGS.length];
  tagCursor = (tagCursor + 1) % REQ_TAGS.length;
  return tag;
}

/** Stable color tag derived from a request ID or session seed */
export function tagForSession(seed?: string | null): string {
  if (!seed || typeof seed !== "string") return nextTag();
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return REQ_TAGS[Math.abs(h) % REQ_TAGS.length];
}

/** Formats local time as 24-hour [HH:MM:SS] */
export function formatTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * Mask sensitive API key or token, showing only short prefix and suffix.
 * e.g., "sk-ant-api03-12345678" -> "sk-a...5678"
 */
export function maskKey(key?: string | null): string {
  if (!key || typeof key !== "string") return "***";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "***";
  if (trimmed.length <= 16) {
    return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`;
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

const SENSITIVE_KEYS = new Set([
  "authorization",
  "x-api-key",
  "api-key",
  "cookie",
  "set-cookie",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "password",
  "apikey",
  "rawapikey",
  "private_key",
  "client_secret",
]);

/**
 * Recursively redacts sensitive keys and bearer tokens from objects/arrays.
 */
export function sanitizeMetadata(data: any, depth = 0, seen = new WeakSet()): any {
  if (depth > 5) return "[Truncated: max depth]";
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    if (/^Bearer\s+[A-Za-z0-9_\-\.]{8,}$/i.test(data)) {
      return `Bearer ${maskKey(data.slice(7).trim())}`;
    }
    if (/^sk-[A-Za-z0-9_\-]{8,}$/i.test(data)) {
      return maskKey(data);
    }
    return data;
  }

  if (typeof data !== "object") return data;

  if (seen.has(data)) return "[Circular]";
  seen.add(data);

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeMetadata(item, depth + 1, seen));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (
      SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.includes("token") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("password") ||
      lowerKey.includes("apikey")
    ) {
      if (typeof val === "string") {
        if (/^Bearer\s+/i.test(val)) {
          sanitized[key] = `Bearer ${maskKey(val.replace(/^Bearer\s+/i, ""))}`;
        } else {
          sanitized[key] = maskKey(val);
        }
      } else {
        sanitized[key] = "[REDACTED]";
      }
    } else {
      sanitized[key] = sanitizeMetadata(val, depth + 1, seen);
    }
  }
  return sanitized;
}

export interface DoneLineParams {
  durationMs: number;
  ttftMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  tokensSaved?: number;
  cost?: number;
}

/** Formats the final request summary line matching 9router standard */
export function formatDoneLine(params: DoneLineParams): string {
  const {
    durationMs,
    ttftMs,
    promptTokens = 0,
    completionTokens = 0,
    cachedTokens = 0,
    cacheCreationTokens = 0,
    tokensSaved = 0,
    cost,
  } = params;

  let inStr = `IN ${promptTokens}`;
  if (cachedTokens || cacheCreationTokens) {
    const cacheParts = [];
    if (cachedTokens) cacheParts.push(`↻${cachedTokens}`);
    if (cacheCreationTokens) cacheParts.push(`+${cacheCreationTokens}`);
    inStr += ` (CACHE ${cacheParts.join(" ")})`;
  }

  const parts = [`DONE ${durationMs}ms`];
  if (ttftMs !== undefined && ttftMs > 0) {
    parts.push(`TTFT ${ttftMs}ms`);
  }
  parts.push(inStr);
  parts.push(`OUT ${completionTokens}`);
  if (tokensSaved > 0) {
    parts.push(`SAVED ${tokensSaved}`);
  }
  if (cost !== undefined && cost > 0) {
    parts.push(`$${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}`);
  }

  return parts.join(" · ");
}

function resolveInitialLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase() || process.env.MAPIGATE_LOG_LEVEL?.toUpperCase();
  if (envLevel) {
    return parseLogLevel(envLevel);
  }
  if (
    process.env.MAPIGATE_DEBUG === "1" ||
    process.env.MAPIGATE_DEBUG === "true" ||
    process.env.DEBUG === "1" ||
    process.env.DEBUG === "true" ||
    process.env.DEBUG?.includes("mapigate")
  ) {
    return LogLevel.DEBUG;
  }
  return LogLevel.INFO;
}

export class Logger {
  private level: LogLevel = resolveInitialLogLevel();

  public setLevel(level: LogLevel | string): void {
    if (typeof level === "string") {
      this.level = parseLogLevel(level);
    } else {
      this.level = level;
    }
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public getLevelName(): "trace" | "debug" | "info" | "warn" | "error" | "off" {
    return formatLogLevelName(this.level);
  }

  public isLevelEnabled(level: LogLevel): boolean {
    return this.level <= level;
  }

  public isTraceEnabled(): boolean {
    return this.level <= LogLevel.TRACE;
  }

  public isDebugEnabled(): boolean {
    return this.level <= LogLevel.DEBUG;
  }

  public isInfoEnabled(): boolean {
    return this.level <= LogLevel.INFO;
  }

  public isWarnEnabled(): boolean {
    return this.level <= LogLevel.WARN;
  }

  public isErrorEnabled(): boolean {
    return this.level <= LogLevel.ERROR;
  }

  public updateLevelFromEnv(): void {
    this.level = resolveInitialLogLevel();
  }

  private formatData(data: any): string {
    if (data === undefined) return "";
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(sanitizeMetadata(data));
    } catch {
      return String(data);
    }
  }

  /** Print one correlated session line: [HH:MM:SS] 🟢 ▶ message */
  public line(tag: string, symbol: string, message: string, minLevel: LogLevel = LogLevel.INFO): void {
    if (this.level > minLevel) return;
    try {
      console.log(`[${formatTime()}] ${tag} ${symbol} ${message}`);
    } catch {
      // Fail-open
    }
  }

  /** Print one error line with correlation tag (always printed, never suppressed) */
  public errorLine(tag: string, symbol: string, message: string): void {
    try {
      console.log(`[${formatTime()}] ${tag} ${symbol} ${message}`);
    } catch {
      // Fail-open
    }
  }

  /** Print one debug line with correlation tag */
  public debugLine(tag: string, symbol: string, message: string): void {
    if (this.level > LogLevel.DEBUG) return;
    try {
      console.log(`${ANSI.gray}[${formatTime()}] ${tag} ${symbol} ${message}${ANSI.reset}`);
    } catch {
      // Fail-open
    }
  }

  /** Print one trace line with correlation tag */
  public traceLine(tag: string, symbol: string, message: string): void {
    if (this.level > LogLevel.TRACE) return;
    try {
      console.log(`${ANSI.dim}${ANSI.gray}[${formatTime()}] ${tag} ${symbol} ${message}${ANSI.reset}`);
    } catch {
      // Fail-open
    }
  }

  public trace(subsystem: string, message: string, data?: any): void {
    if (this.level > LogLevel.TRACE) return;
    try {
      const dataStr = data !== undefined ? ` ${this.formatData(data)}` : "";
      console.log(`${ANSI.dim}${ANSI.gray}[${formatTime()}] 🔬 [${subsystem}] ${message}${dataStr}${ANSI.reset}`);
    } catch {
      // Fail-open
    }
  }

  public debug(subsystem: string, message: string, data?: any): void {
    if (this.level > LogLevel.DEBUG) return;
    try {
      const dataStr = data !== undefined ? ` ${this.formatData(data)}` : "";
      console.log(`${ANSI.gray}[${formatTime()}] 🔍 [${subsystem}] ${message}${dataStr}${ANSI.reset}`);
    } catch {
      // Fail-open
    }
  }

  public info(subsystem: string, message: string, data?: any): void {
    if (this.level > LogLevel.INFO) return;
    try {
      const dataStr = data !== undefined ? ` ${this.formatData(data)}` : "";
      console.log(`[${formatTime()}] ℹ️  [${subsystem}] ${message}${dataStr}`);
    } catch {
      // Fail-open
    }
  }

  public warn(subsystem: string, message: string, data?: any): void {
    if (this.level > LogLevel.WARN) return;
    try {
      const dataStr = data !== undefined ? ` ${this.formatData(data)}` : "";
      console.warn(`${ANSI.yellow}[${formatTime()}] ⚠️  [${subsystem}] ${message}${dataStr}${ANSI.reset}`);
    } catch {
      // Fail-open
    }
  }

  public error(subsystem: string, message: string, data?: any): void {
    if (this.level > LogLevel.ERROR) return;
    try {
      const dataStr = data !== undefined ? ` ${this.formatData(data)}` : "";
      console.error(`${ANSI.red}[${formatTime()}] ❌ [${subsystem}] ${message}${dataStr}${ANSI.reset}`);
    } catch {
      // Fail-open
    }
  }

  /** Log incoming HTTP request */
  public request(method: string, path: string, extra?: string | Record<string, any>): void {
    if (this.level > LogLevel.INFO) return;
    try {
      const dataStr = extra
        ? typeof extra === "string"
          ? ` ${extra}`
          : ` ${this.formatData(extra)}`
        : "";
      console.log(`${ANSI.cyan}[${formatTime()}] 📥 ${method} ${path}${dataStr}${ANSI.reset}`);
    } catch {
      // Fail-open
    }
  }

  /** Log completed HTTP response */
  public response(status: number, durationMs: number, extra?: string | Record<string, any>): void {
    if (this.level > LogLevel.INFO) return;
    try {
      const icon = status < 400 ? "📤" : "💥";
      const color = status < 400 ? ANSI.green : ANSI.red;
      const dataStr = extra
        ? typeof extra === "string"
          ? ` ${extra}`
          : ` ${this.formatData(extra)}`
        : "";
      console.log(`${color}[${formatTime()}] ${icon} ${status} (${durationMs}ms)${dataStr}${ANSI.reset}`);
    } catch {
      // Fail-open
    }
  }

  public maskKey(key?: string | null): string {
    return maskKey(key);
  }

  public sanitize(data: any): any {
    return sanitizeMetadata(data);
  }
}

export const logger = new Logger();
