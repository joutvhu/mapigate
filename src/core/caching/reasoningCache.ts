import { getDatabase } from "../../storage/database.js";

export interface IReasoningCache {
  get(toolCallId: string): string | null;
  save(toolCallId: string, provider: string, model: string, reasoning: string, ttlMs?: number): void;
  saveMultiple(toolCallIds: string[], provider: string, model: string, reasoning: string, ttlMs?: number): void;
  clear(): void;
}

export interface CachedReasoningEntry {
  reasoning: string;
  provider: string;
  model: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export class ReasoningCache implements IReasoningCache {
  private readonly memoryCache = new Map<string, CachedReasoningEntry>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(maxEntries = 300, defaultTtlMs = DEFAULT_TTL_MS) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  public get(toolCallId: string): string | null {
    if (!toolCallId) return null;

    const now = Date.now();
    const memEntry = this.memoryCache.get(toolCallId);
    if (memEntry) {
      if (now > memEntry.expiresAt) {
        this.memoryCache.delete(toolCallId);
      } else {
        // Refresh LRU position
        this.memoryCache.delete(toolCallId);
        this.memoryCache.set(toolCallId, memEntry);
        return memEntry.reasoning;
      }
    }

    try {
      const db = getDatabase();
      const row = db.get<{
        reasoning: string;
        provider: string;
        model: string;
        expires_at: number;
      }>(
        "SELECT reasoning, provider, model, expires_at FROM reasoning_cache WHERE tool_call_id = ? AND expires_at > ?",
        toolCallId,
        now
      );

      if (row) {
        this.setMemory(toolCallId, {
          reasoning: row.reasoning,
          provider: row.provider,
          model: row.model,
          expiresAt: row.expires_at,
        });
        return row.reasoning;
      }
    } catch {
      // Fail-open on database errors
    }

    return null;
  }

  public save(
    toolCallId: string,
    provider: string,
    model: string,
    reasoning: string,
    ttlMs = this.defaultTtlMs
  ): void {
    if (!toolCallId || typeof reasoning !== "string" || !reasoning.trim()) return;

    const now = Date.now();
    const expiresAt = now + ttlMs;

    this.setMemory(toolCallId, { reasoning, provider, model, expiresAt });

    try {
      const db = getDatabase();
      db.run(
        `INSERT OR REPLACE INTO reasoning_cache (tool_call_id, provider, model, reasoning, char_count, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        toolCallId,
        provider,
        model,
        reasoning,
        reasoning.length,
        now,
        expiresAt
      );
    } catch {
      // Fail-open on database errors
    }
  }

  public saveMultiple(
    toolCallIds: string[],
    provider: string,
    model: string,
    reasoning: string,
    ttlMs = this.defaultTtlMs
  ): void {
    if (!Array.isArray(toolCallIds) || toolCallIds.length === 0 || !reasoning) return;
    for (const id of toolCallIds) {
      if (id) {
        this.save(id, provider, model, reasoning, ttlMs);
      }
    }
  }

  public clear(): void {
    this.memoryCache.clear();
    try {
      const db = getDatabase();
      db.run("DELETE FROM reasoning_cache");
    } catch {
      // Fail-open
    }
  }

  public hasInMemory(toolCallId: string): boolean {
    return this.memoryCache.has(toolCallId);
  }

  public getMemorySize(): number {
    return this.memoryCache.size;
  }

  private setMemory(toolCallId: string, entry: CachedReasoningEntry): void {
    if (this.memoryCache.has(toolCallId)) {
      this.memoryCache.delete(toolCallId);
    } else if (this.memoryCache.size >= this.maxEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.memoryCache.delete(oldestKey);
      }
    }
    this.memoryCache.set(toolCallId, entry);
  }
}

export const reasoningCache = new ReasoningCache();

const REASONING_REPLAY_PROVIDERS = new Set([
  "deepseek",
  "opencode-go",
  "siliconflow",
  "nebius",
  "deepinfra",
  "sambanova",
  "fireworks",
  "together",
  "kimi-coding",
  "kimi-coding-apikey",
  "xiaomi-mimo",
  "command-code",
  "moonshot",
  "kimi",
]);

const REASONING_REPLAY_MODEL_PATTERNS = [
  /deepseek[-/]r1/i,
  /deepseek[-/]reasoner/i,
  /deepseek[-/]chat/i,
  /deepseek[-/]v4/i,
  /zen\/deepseek-v4/i,
  /kimi[-/]k\d/i,
  /(?:^|\/)(?:kimi-)?k3(?:$|-)/i,
  /(?:^|\/)kimi-k2\.7/i,
  /qwq/i,
  /qwen.*think/i,
  /glm.*think/i,
  /^mimo[-.]?v\d/i,
  /thinking/i,
  /reasoner/i,
  /r1\b/i,
];

export function requiresReasoningReplay(
  providerOrParams: string | { provider: string; model: string },
  modelStr?: string
): boolean {
  let provider = "";
  let model = "";

  if (typeof providerOrParams === "object" && providerOrParams !== null) {
    provider = providerOrParams.provider || "";
    model = providerOrParams.model || "";
  } else if (typeof providerOrParams === "string") {
    provider = providerOrParams;
    model = modelStr || "";
  }

  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedModel = model.trim().toLowerCase();

  if (REASONING_REPLAY_PROVIDERS.has(normalizedProvider)) {
    return true;
  }

  return REASONING_REPLAY_MODEL_PATTERNS.some((pattern) => pattern.test(normalizedModel));
}

export function applyReasoningReplayPolicy(
  messages: any[],
  providerId: string,
  model: string,
  cache: IReasoningCache = reasoningCache
): void {
  if (!Array.isArray(messages) || messages.length === 0) return;

  const needsReplay = requiresReasoningReplay(providerId, model);

  if (!needsReplay) {
    // Strip reasoning from assistant messages sent to non-thinking models
    for (const msg of messages) {
      if (msg && msg.role === "assistant") {
        if ("reasoning_content" in msg) delete msg.reasoning_content;
        if ("reasoning" in msg) delete msg.reasoning;
        if (Array.isArray(msg.content)) {
          msg.content = msg.content.filter((b: any) => b?.type !== "thinking");
        }
      }
    }
    return;
  }

  // Thinking model: replay reasoning for assistant messages with tool calls
  for (const msg of messages) {
    if (!msg || msg.role !== "assistant") continue;

    // OpenAI format: tool_calls
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const existing = typeof msg.reasoning_content === "string" ? msg.reasoning_content : "";
      if (!existing) {
        let cached: string | null = null;
        for (const tc of msg.tool_calls) {
          if (tc?.id) {
            cached = cache.get(tc.id);
            if (cached) break;
          }
        }
        msg.reasoning_content = cached || "";
      }
    }

    // Anthropic format: content array with tool_use blocks
    if (Array.isArray(msg.content)) {
      const hasToolUse = msg.content.some((b: any) => b?.type === "tool_use");
      if (hasToolUse) {
        const thinkingBlock = msg.content.find((b: any) => b?.type === "thinking");
        if (!thinkingBlock) {
          let cached: string | null = null;
          for (const block of msg.content) {
            if (block?.type === "tool_use" && block.id) {
              cached = cache.get(block.id);
              if (cached) break;
            }
          }
          msg.content.unshift({
            type: "thinking",
            thinking: cached || "",
          });
        } else if (!thinkingBlock.thinking) {
          let cached: string | null = null;
          for (const block of msg.content) {
            if (block?.type === "tool_use" && block.id) {
              cached = cache.get(block.id);
              if (cached) break;
            }
          }
          if (cached) {
            thinkingBlock.thinking = cached;
          }
        }
      }
    }
  }
}

/**
 * Prunes expired entries from SQLite reasoning_cache table.
 * Returns the number of pruned rows.
 */
export function pruneExpiredReasoningCache(): number {
  try {
    const db = getDatabase();
    const result = db.run("DELETE FROM reasoning_cache WHERE expires_at <= ?", Date.now());
    return result?.changes || 0;
  } catch {
    return 0;
  }
}

export const REASONING_CACHE_PRUNE_INTERVAL_MS = 15 * 60 * 1000; // 900_000ms (15 minutes)
let reasoningCachePruneTimer: NodeJS.Timeout | null = null;

export function startReasoningCachePruneJob(
  intervalMs = REASONING_CACHE_PRUNE_INTERVAL_MS
): NodeJS.Timeout {
  if (reasoningCachePruneTimer) return reasoningCachePruneTimer;

  reasoningCachePruneTimer = setInterval(() => {
    pruneExpiredReasoningCache();
  }, intervalMs);

  if (typeof reasoningCachePruneTimer.unref === "function") {
    reasoningCachePruneTimer.unref();
  }

  return reasoningCachePruneTimer;
}

export function stopReasoningCachePruneJob(): void {
  if (reasoningCachePruneTimer) {
    clearInterval(reasoningCachePruneTimer);
    reasoningCachePruneTimer = null;
  }
}

// Start periodic cleanup interval (15 mins) with unref()
startReasoningCachePruneJob();

