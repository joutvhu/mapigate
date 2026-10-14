import { createHash } from "node:crypto";

/**
 * Normalizes message or block content (string, array of content blocks, or object)
 * into a single deterministic string for prefix hashing.
 */
function normalizeContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
      } else if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        if (typeof record.text === "string") {
          parts.push(record.text);
        } else if (record.type === "text" && typeof record.content === "string") {
          parts.push(record.content);
        } else if (typeof record.content === "string") {
          parts.push(record.content);
        }
      }
    }
    return parts.join("\n");
  }
  if (content && typeof content === "object") {
    const record = content as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
  }
  return "";
}

/**
 * Extracts conversation prefix hash anchored to the invariant root:
 * system prompt (string or array) plus the first user message.
 *
 * Guarantees identical hashes across Turn 1 through Turn N in both
 * Anthropic and OpenAI formats.
 */
export function extractConversationPrefixHash(body: any): string | null {
  if (!body || typeof body !== "object") return null;

  try {
    let systemText = "";

    // 1. Anthropic-style system prompt (string or array of blocks)
    if (body.system) {
      systemText = normalizeContent(body.system);
    }

    // 2. Scan body.messages for system prompt (if not already found) and first user message
    const systemParts: string[] = [];
    let firstUserText = "";

    if (Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        if (!msg || typeof msg !== "object") continue;
        const role = msg.role;
        if (!body.system && (role === "system" || role === "developer")) {
          const text = normalizeContent(msg.content);
          if (text) systemParts.push(text);
        } else if (!firstUserText && role === "user") {
          firstUserText = normalizeContent(msg.content);
        }
      }
    }

    if (!systemText && systemParts.length > 0) {
      systemText = systemParts.join("\n");
    }

    // Responses API fallback: body.input
    if (!firstUserText && typeof body.input === "string") {
      firstUserText = body.input;
    }

    // If neither system prompt nor first user message exists, return null
    if (!systemText && !firstUserText) {
      return null;
    }

    // Anchored hash of system prompt and first user message
    return createHash("sha256")
      .update("sys:")
      .update(systemText)
      .update("\0user:")
      .update(firstUserText)
      .digest("hex");
  } catch {
    // Fail-open
    return null;
  }
}

/**
 * Deterministic Rendezvous Hashing (Highest Random Weight - HRW) for account affinity.
 * Routes requests with the same prefixHash to the same account across runs,
 * and gracefully fails over to the next highest-scoring account if an account is removed/in cooldown.
 */
export function pickAffinityAccount<T extends { id: string }>(
  accounts: T[],
  prefixHash: string
): T | undefined {
  if (!accounts || accounts.length === 0) return undefined;
  if (!prefixHash || accounts.length === 1) return accounts[0];

  try {
    let highestWeight = -1n;
    let selected: T = accounts[0];

    for (const account of accounts) {
      // Deterministic sha256 scoring: H(prefixHash + "\0" + account.id)
      const digest = createHash("sha256")
        .update(prefixHash)
        .update("\0")
        .update(account.id)
        .digest("hex");

      // Take first 16 bytes (128 bits) as BigInt score for speed and precision
      const weight = BigInt(`0x${digest.slice(0, 32)}`);
      if (weight > highestWeight) {
        highestWeight = weight;
        selected = account;
      }
    }

    return selected;
  } catch {
    // Fail-open fallback to first account
    return accounts[0];
  }
}
