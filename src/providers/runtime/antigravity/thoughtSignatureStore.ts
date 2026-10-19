import { getDefaultDataDir } from "../../../shared/constants/index.js";

const MAX_SIGNATURES = 2000;
const MEMORY_TTL_MS = 1000 * 60 * 60; // 1 hour

interface SignatureEntry {
  signature: string;
  family: string | null;
  expiresAt: number;
}

const memorySignatures = new Map<string, SignatureEntry>();

export function signatureFamily(model?: string): string | null {
  const m = typeof model === "string" ? model.toLowerCase() : "";
  if (!m) return null;
  if (m.includes("claude")) return "claude";
  if (m.includes("gemini")) return "gemini";
  return m;
}

function isCompatible(entry: SignatureEntry, family: string | null): boolean {
  return !entry.family || !family || entry.family === family;
}

function pruneMemoryExpired(): void {
  const now = Date.now();
  for (const [key, value] of memorySignatures.entries()) {
    if (value.expiresAt <= now) {
      memorySignatures.delete(key);
    }
  }

  while (memorySignatures.size > MAX_SIGNATURES) {
    const oldestKey = memorySignatures.keys().next().value;
    if (!oldestKey) break;
    memorySignatures.delete(oldestKey);
  }
}

/**
 * Stores a cryptographic thought signature for a tool_call_id with optional sessionId.
 */
export function storeGeminiThoughtSignature(
  toolCallId: string,
  signature: string,
  sessionId: string | number | null = null,
  model: string | null = null
): void {
  if (typeof toolCallId !== "string" || !toolCallId) return;
  if (typeof signature !== "string" || !signature) return;

  const now = Date.now();
  const family = signatureFamily(model || undefined);
  pruneMemoryExpired();

  const keys: string[] = [];
  const sidStr = sessionId != null ? String(sessionId).trim() : "";
  if (sidStr) {
    keys.push(`${sidStr}:${toolCallId}`);
  }
  keys.push(toolCallId);

  for (const k of keys) {
    memorySignatures.set(k, {
      signature,
      family,
      expiresAt: now + MEMORY_TTL_MS,
    });
  }
}

/**
 * Retrieves a stored thought signature by tool_call_id (sync, from RAM).
 */
export function getGeminiThoughtSignatureSync(
  toolCallId: string,
  sessionId: string | number | null = null,
  model: string | null = null
): string | null {
  if (typeof toolCallId !== "string" || !toolCallId) return null;
  const family = signatureFamily(model || undefined);
  pruneMemoryExpired();

  const sidStr = sessionId != null ? String(sessionId).trim() : "";
  if (sidStr) {
    const sessionKey = `${sidStr}:${toolCallId}`;
    const sessionEntry = memorySignatures.get(sessionKey);
    if (sessionEntry && sessionEntry.expiresAt > Date.now() && isCompatible(sessionEntry, family)) {
      return sessionEntry.signature;
    }
  }

  const entry = memorySignatures.get(toolCallId);
  if (entry && entry.expiresAt > Date.now() && isCompatible(entry, family)) {
    return entry.signature;
  }
  return null;
}

/**
 * Clears signatures from memory (useful for tests).
 */
export function clearThoughtSignatureStore(): void {
  memorySignatures.clear();
}
