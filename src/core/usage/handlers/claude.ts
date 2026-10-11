import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime } from "../utils.js";

const CLAUDE_OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage?cedar_ember=1";
const CLAUDE_API_VERSION = "2023-06-01";
const CLAUDE_USER_AGENT = "claude-cli/1.0.0 (external, cli)";

export const CLAUDE_REFRESH_INTERVAL_MS = 600_000; // 10 minutes refresh guard
export const OAUTH_429_COOLDOWN_MS = 180_000; // 3 minutes cooldown on 429
const USAGE_CACHE_TTL_MS = 300_000; // 5 minutes cache TTL

interface CacheEntry {
  result: RawProviderQuotaResult;
  expiresAt: number;
}

const claudeUsageCache = new Map<string, CacheEntry>();
const claudeCooldown = new Map<string, number>();

export async function getClaudeUsage(
  accessToken: string,
  options?: { force?: boolean }
): Promise<RawProviderQuotaResult> {
  if (!accessToken) {
    return { plan: "Claude Code", message: "Claude access token not available." };
  }

  const force = options?.force === true;

  // 1. Check in-memory cache
  if (!force) {
    const cached = claudeUsageCache.get(accessToken);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  // 2. Check 429 cooldown
  const cooldownUntil = claudeCooldown.get(accessToken);
  if (cooldownUntil && Date.now() < cooldownUntil) {
    const cached = claudeUsageCache.get(accessToken);
    if (cached) return cached.result;
    return {
      plan: "Claude Code",
      message: "Claude quota API is currently rate-limited (cooling down). Try again later.",
    };
  }

  try {
    const res = await fetch(CLAUDE_OAUTH_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "anthropic-version": CLAUDE_API_VERSION,
        "User-Agent": CLAUDE_USER_AGENT,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 429) {
      claudeCooldown.set(accessToken, Date.now() + OAUTH_429_COOLDOWN_MS);
      const cached = claudeUsageCache.get(accessToken);
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

    const result: RawProviderQuotaResult = {
      plan: "Claude Code",
      quotas,
    };

    // Cache successful read
    claudeUsageCache.set(accessToken, {
      result,
      expiresAt: Date.now() + USAGE_CACHE_TTL_MS,
    });

    return result;
  } catch (err: any) {
    const cached = claudeUsageCache.get(accessToken);
    if (cached) return cached.result;
    return {
      plan: "Claude Code",
      message: `Failed to fetch Claude usage: ${err.message}`,
    };
  }
}
