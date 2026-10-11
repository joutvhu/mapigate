import crypto from "node:crypto";
import {
  BASE62_CHARS,
  OPENCODE_SESSION_RE,
  OPENCODE_REQUEST_RE,
} from "./types.js";

let lastTimestamp = 0;
let counter = 0;

function unstableRandom(): string {
  const bytes = crypto.randomBytes(14);
  let randomPart = "";
  for (let i = 0; i < 14; i++) {
    randomPart += BASE62_CHARS[bytes[i] % 62];
  }
  return randomPart;
}

export function generateSessionId(timestamp = Date.now()): string {
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp;
    counter = 0;
  }
  counter++;

  const current = BigInt(timestamp) * 0x1000n + BigInt(counter);
  const value = ~current;
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0")
  ).join("");
  return `ses_${time}${unstableRandom()}`;
}

export function generateRequestId(timestamp = Date.now()): string {
  const current = BigInt(timestamp) * 0x1000n + 1n;
  const value = current;
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0")
  ).join("");
  return `msg_${time}${unstableRandom()}`;
}

export function translateSessionId(sessionId: string, clientTool = ""): string {
  if (typeof sessionId === "string" && OPENCODE_SESSION_RE.test(sessionId.trim())) {
    return sessionId.trim();
  }
  const digest = crypto
    .createHash("sha256")
    .update(`opencode\0${clientTool || "generic"}\0${sessionId || ""}`)
    .digest();
  const timeHex = digest.subarray(0, 6).toString("hex");
  let randomPart = "";
  for (let i = 6; i < 20; i++) {
    randomPart += BASE62_CHARS[digest[i] % 62];
  }
  return `ses_${timeHex}${randomPart}`;
}

const stableOpencodeSessions = new Map<string, { sessionId: string; lastUsed: number }>();
const MAX_STABLE_SESSIONS = 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;

export function getStableSessionId(identityKey = "default"): string {
  const existing = stableOpencodeSessions.get(identityKey);
  const now = Date.now();
  if (existing && now - existing.lastUsed < SESSION_TTL_MS) {
    existing.lastUsed = now;
    return existing.sessionId;
  }
  const sessionId = generateSessionId(now);
  if (stableOpencodeSessions.size >= MAX_STABLE_SESSIONS) {
    const oldestKey = stableOpencodeSessions.keys().next().value;
    if (oldestKey) stableOpencodeSessions.delete(oldestKey);
  }
  stableOpencodeSessions.set(identityKey, { sessionId, lastUsed: now });
  return sessionId;
}

export function clearStableSessions(): void {
  stableOpencodeSessions.clear();
}

function lastUserText(body: any): string {
  try {
    if (!body || typeof body !== "object") return "";
    const arr = Array.isArray(body.messages)
      ? body.messages
      : Array.isArray(body.contents)
      ? body.contents
      : Array.isArray(body.input)
      ? body.input
      : null;
    if (!arr) return typeof body.input === "string" ? body.input.slice(-600) : "";
    for (let i = arr.length - 1; i >= 0; i--) {
      const msg = arr[i];
      if (!msg) continue;
      if (msg.role && msg.role !== "user") continue;
      const content = msg.content;
      if (typeof content === "string" && content.trim()) return content.trim().slice(-600);
      if (Array.isArray(content)) {
        const text = content
          .map((part: any) => (typeof part === "string" ? part : part?.text || part?.input_text || ""))
          .join(" ")
          .trim();
        if (text) return text.slice(-600);
      }
    }
  } catch {
    return "";
  }
  return "";
}

export function deriveRequestId(sessionId: string, body?: any): string {
  const text = lastUserText(body);
  if (!text) return generateRequestId();
  const digest = crypto
    .createHash("sha256")
    .update(`opencode-req\0${sessionId || ""}\0${text}`)
    .digest();
  const timeHex = digest.subarray(0, 6).toString("hex");
  let randomPart = "";
  for (let i = 6; i < 20; i++) {
    randomPart += BASE62_CHARS[digest[i] % 62];
  }
  const id = `msg_${timeHex}${randomPart}`;
  return OPENCODE_REQUEST_RE.test(id) ? id : generateRequestId();
}
