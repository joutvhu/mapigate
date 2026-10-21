import { getDatabase } from "../../../storage/database.js";

const MAX_SIGNATURES = 2000;
const MEMORY_TTL_MS = 1000 * 60 * 60; // 1 hour
const PERSISTED_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const SCOPE = "gemini_thought_signatures";

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

function isCompatible(entry: { family?: string | null }, family: string | null): boolean {
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
 * Stores a cryptographic thought signature for a tool_call_id with optional sessionId (RAM + SQLite).
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

    try {
      const db = getDatabase();
      const val = JSON.stringify({
        signature,
        family,
        createdAt: now,
        expiresAt: now + PERSISTED_TTL_MS,
      });
      db.run("INSERT OR REPLACE INTO kv_store (scope, key, value) VALUES (?, ?, ?)", SCOPE, k, val);
    } catch {
      // Fail-open
    }
  }
}

/**
 * Retrieves a stored thought signature by tool_call_id (RAM first, then SQLite fallback).
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

  try {
    const db = getDatabase();
    if (sidStr) {
      const sessionKey = `${sidStr}:${toolCallId}`;
      const sessionRow = db.get<{ value: string }>(
        "SELECT value FROM kv_store WHERE scope = ? AND key = ?",
        SCOPE,
        sessionKey
      );
      if (sessionRow?.value) {
        const parsed = JSON.parse(sessionRow.value);
        if (parsed && typeof parsed.signature === "string") {
          if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
            try { db.run("DELETE FROM kv_store WHERE scope = ? AND key = ?", SCOPE, sessionKey); } catch {}
          } else if (isCompatible(parsed, family)) {
            memorySignatures.set(sessionKey, {
              signature: parsed.signature,
              family: parsed.family || null,
              expiresAt: Date.now() + MEMORY_TTL_MS,
            });
            return parsed.signature;
          }
        }
      }
    }

    const row = db.get<{ value: string }>(
      "SELECT value FROM kv_store WHERE scope = ? AND key = ?",
      SCOPE,
      toolCallId
    );
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (parsed && typeof parsed.signature === "string") {
        if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
          try { db.run("DELETE FROM kv_store WHERE scope = ? AND key = ?", SCOPE, toolCallId); } catch {}
        } else if (isCompatible(parsed, family)) {
          memorySignatures.set(toolCallId, {
            signature: parsed.signature,
            family: parsed.family || null,
            expiresAt: Date.now() + MEMORY_TTL_MS,
          });
          return parsed.signature;
        }
      }
    }
  } catch {
    // Fail-open
  }

  return null;
}

/**
 * Async version of getGeminiThoughtSignatureSync for compatibility with 9router.
 */
export async function getGeminiThoughtSignature(
  toolCallId: string,
  sessionId: string | number | null = null,
  model: string | null = null
): Promise<string | null> {
  return getGeminiThoughtSignatureSync(toolCallId, sessionId, model);
}

/**
 * Clears signatures from RAM memory and SQLite persistence (useful for tests).
 */
export function clearThoughtSignatureStore(): void {
  memorySignatures.clear();
  try {
    const db = getDatabase();
    db.run("DELETE FROM kv_store WHERE scope = ?", SCOPE);
  } catch {
    // Fail-open
  }
}
