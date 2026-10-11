import type { RawProviderQuotaResult, RawQuotaBucket } from "../../usage/types.js";
import { parseResetTime } from "../../usage/utils.js";

export const CLAUDE_OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage?cedar_ember=1";
export const CLAUDE_API_VERSION = "2023-06-01";
export const CLAUDE_USER_AGENT = "claude-cli/1.0.0 (external, cli)";

export const CLAUDE_REFRESH_INTERVAL_MS = 600_000;
export const OAUTH_429_COOLDOWN_MS = 180_000;
const USAGE_CACHE_TTL_MS = 300_000;

interface CacheEntry {
  result: RawProviderQuotaResult;
  expiresAt: number;
}

const claudeUsageCache = new Map<string, CacheEntry>();
const claudeCooldown = new Map<string, number>();

export function _clearClaudeCache(): void {
  claudeUsageCache.clear();
  claudeCooldown.clear();
}

export function parseClaudeResetGrants(block: any): {
  availableCount: number;
  nextGrantId: string | null;
  expiresAt: string | null;
  clears: string[];
} | null {
  if (!block?.eligible || !Array.isArray(block.grants)) return null;
  const grants = block.grants.filter((g: any) => g?.id && !g.paused && Number(g.resets_left) > 0);
  const next = grants.find((g: any) => g.id === block.next_grant_id) || grants[0] || null;
  return {
    availableCount: grants.reduce((sum: number, g: any) => sum + Number(g.resets_left), 0),
    nextGrantId: next?.id || null,
    expiresAt: next?.ends_at || null,
    clears: Array.isArray(next?.clears) ? next.clears : [],
  };
}

export async function getClaudeUsage(
  accessToken: string,
  options?: { force?: boolean; fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (accessToken || "").trim();

  if (!token) {
    return { plan: "Claude Code", message: "Claude access token not available." };
  }

  if (token.startsWith("sk-ant-api")) {
    return {
      plan: "Claude API",
      message: "Claude API key connected. Quota tracking is available for Claude Code OAuth connections.",
    };
  }

  const force = options?.force === true;

  if (!force) {
    const cached = claudeUsageCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  const cooldownUntil = claudeCooldown.get(token);
  if (cooldownUntil && Date.now() < cooldownUntil) {
    const cached = claudeUsageCache.get(token);
    if (cached) return cached.result;
    return {
      plan: "Claude Code",
      message: "Claude quota API is currently rate-limited (cooling down). Try again later.",
    };
  }

  try {
    const res = await fetchFn(CLAUDE_OAUTH_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "anthropic-version": CLAUDE_API_VERSION,
        "User-Agent": CLAUDE_USER_AGENT,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        plan: "Claude API",
        message: "Claude token is not authorized for OAuth usage tracking. Reconnect Claude Code.",
      };
    }

    if (res.status === 429) {
      claudeCooldown.set(token, Date.now() + OAUTH_429_COOLDOWN_MS);
      const cached = claudeUsageCache.get(token);
      if (cached) return cached.result;
      return {
        plan: "Claude Code",
        message: "Claude API returned 429 rate limit. Polling paused for 3 minutes.",
      };
    }

    if (!res.ok) {
      return {
        plan: "Claude Code",
        message: `Claude usage endpoint returned status ${res.status}.`,
      };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};

    const hasUtilization = (w: any) => w && typeof w === "object" && typeof w.utilization === "number";

    const createQuotaBucket = (window: any, displayName: string): RawQuotaBucket => {
      const used = Math.min(100, Math.max(0, window.utilization));
      const remaining = Math.max(0, 100 - used);
      return {
        displayName,
        used,
        total: 100,
        remaining,
        remainingPercentage: remaining,
        resetAt: parseResetTime(window.resets_at),
        unlimited: false,
        recurring: true,
      };
    };

    if (hasUtilization(data.five_hour)) {
      quotas["session"] = createQuotaBucket(data.five_hour, "Session (5h)");
    }

    if (hasUtilization(data.seven_day)) {
      quotas["weekly"] = createQuotaBucket(data.seven_day, "Weekly (7d)");
    }

    for (const [key, value] of Object.entries<any>(data)) {
      if (key.startsWith("seven_day_") && key !== "seven_day" && hasUtilization(value)) {
        const modelName = key.replace("seven_day_", "");
        const label = `Weekly ${modelName.toUpperCase()} (7d)`;
        quotas[key] = createQuotaBucket(value, label);
      }
    }

    if (Array.isArray(data.limits)) {
      for (const limit of data.limits) {
        if (limit?.kind !== "weekly_scoped") continue;
        const modelName = String(limit?.scope?.model?.display_name || "").trim();
        if (!modelName || typeof limit.percent !== "number") continue;
        const used = Math.min(100, Math.max(0, limit.percent));
        const remaining = Math.max(0, 100 - used);
        const key = `weekly_${modelName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
        quotas[key] = {
          displayName: `Weekly ${modelName} (7d)`,
          used,
          total: 100,
          remaining,
          remainingPercentage: remaining,
          resetAt: parseResetTime(limit.resets_at),
          unlimited: false,
          recurring: true,
        };
      }
    }

    const resetCredits = parseClaudeResetGrants(data.cedar_ember);
    if (resetCredits && resetCredits.availableCount > 0) {
      quotas["reset_credits"] = {
        displayName: "Instant Reset Credits",
        used: 0,
        total: resetCredits.availableCount,
        remaining: resetCredits.availableCount,
        remainingPercentage: 100,
        resetAt: parseResetTime(resetCredits.expiresAt),
        unlimited: false,
        recurring: false,
      };
    }

    const result: RawProviderQuotaResult = {
      plan: "Claude Code",
      quotas,
    };

    claudeUsageCache.set(token, {
      result,
      expiresAt: Date.now() + USAGE_CACHE_TTL_MS,
    });

    return result;
  } catch (err: any) {
    const cached = claudeUsageCache.get(token);
    if (cached) return cached.result;
    return {
      plan: "Claude Code",
      message: `Failed to fetch Claude usage: ${err.message}`,
    };
  }
}
