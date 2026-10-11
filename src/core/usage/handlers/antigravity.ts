import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime } from "../utils.js";

export const ANTIGRAVITY_IDE_VERSION = "2.11.0";
export const ANTIGRAVITY_USER_AGENT = "antigravity/ide/2.11.0";
export const ANTIGRAVITY_LOAD_PROJECT_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
export const ANTIGRAVITY_QUOTA_MODELS_URL = "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";
export const ANTIGRAVITY_QUOTA_SUMMARY_URL = "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary";

export const IDE_TYPE = {
  UNSPECIFIED: 0,
  JETSKI: 10,
  ANTIGRAVITY: 9,
  PLUGINS: 7,
} as const;

export const PLATFORM = {
  UNSPECIFIED: 0,
  DARWIN_AMD64: 1,
  DARWIN_ARM64: 2,
  LINUX_AMD64: 3,
  LINUX_ARM64: 4,
  WINDOWS_AMD64: 5,
} as const;

export const PLUGIN_TYPE = {
  UNSPECIFIED: 0,
  CLOUD_CODE: 1,
  GEMINI: 2,
} as const;

export function getPlatformEnum(): number {
  const os = process.platform;
  const architecture = process.arch;
  if (os === "darwin") return architecture === "arm64" ? PLATFORM.DARWIN_ARM64 : PLATFORM.DARWIN_AMD64;
  if (os === "linux") return architecture === "arm64" ? PLATFORM.LINUX_ARM64 : PLATFORM.LINUX_AMD64;
  if (os === "win32") return PLATFORM.WINDOWS_AMD64;
  return PLATFORM.UNSPECIFIED;
}

export const CLIENT_METADATA = {
  ideType: IDE_TYPE.ANTIGRAVITY,
  platform: getPlatformEnum(),
  pluginType: PLUGIN_TYPE.GEMINI,
};

const GROUP_CONFIGS = [
  {
    pattern: /gemini/i,
    weekly: { key: "gemini_weekly", displayName: "Gemini (Weekly)" },
    session: { key: "gemini_session", displayName: "Gemini (5h)" },
  },
  {
    pattern: /claude|gpt/i,
    weekly: { key: "claude_gpt_weekly", displayName: "Claude & GPT (Weekly)" },
    session: { key: "claude_gpt_session", displayName: "Claude & GPT (5h)" },
  },
];

const IMPORTANT_MODELS = [
  "gemini-3.8-flash-high",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-low",
  "gemini-3.7-flash-high",
  "gemini-3.7-flash-medium",
  "gemini-3.7-flash-low",
  "gemini-3.6-flash-high",
  "gemini-3.6-flash-medium",
  "gemini-3.6-flash-low",
  "gemini-3.1-pro-high",
  "gemini-pro-agent",
  "gemini-3.1-pro-low",
  "claude-sonnet-5-5-high",
  "claude-sonnet-5-5-medium",
  "claude-sonnet-5-5-low",
  "claude-sonnet-5-5",
  "claude-opus-5-5-high",
  "claude-opus-5-5-medium",
  "claude-opus-5-5-low",
  "claude-opus-5-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium",
  "gemini-3.1-flash-image",
];

// In-flight dedup cache: 3 minutes TTL
const WEEKLY_CACHE_TTL_MS = 180_000;
interface WeeklyCacheEntry {
  result?: Record<string, RawQuotaBucket>;
  expiresAt?: number;
  promise?: Promise<Record<string, RawQuotaBucket>>;
}

const weeklyCache = new Map<string, WeeklyCacheEntry>();

function cacheKey(accessToken: string, projectId?: string | null): string {
  return `${accessToken}::${projectId || ""}`;
}

export function _clearWeeklyCache(): void {
  weeklyCache.clear();
}

/**
 * Parse a retrieveUserQuotaSummary response into normalized weekly and session quotas.
 * Pure function — safe to unit-test without network.
 */
export function parseWeeklyQuotaSummary(data: any): Record<string, RawQuotaBucket> {
  if (!data || typeof data !== "object") return {};

  const groups = Array.isArray(data.groups)
    ? data.groups
    : Array.isArray(data.quotaSummary?.groups)
    ? data.quotaSummary.groups
    : null;

  if (!groups) return {};

  const result: Record<string, RawQuotaBucket> = {};

  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const displayName = group.displayName || "";
    const buckets = Array.isArray(group.buckets) ? group.buckets : [];

    for (const bucket of buckets) {
      if (!bucket || typeof bucket !== "object") continue;

      const windowType = String(bucket.window || "").toLowerCase();
      const bucketText = `${bucket.bucketId || ""} ${bucket.displayName || ""}`.toLowerCase();
      const isWeekly = windowType === "weekly" || bucketText.includes("weekly");
      const isSession =
        windowType === "5h" ||
        bucketText.includes("five hour") ||
        bucketText.includes("5h") ||
        bucketText.includes("daily") ||
        windowType === "daily";

      if (!isWeekly && !isSession) continue;

      // If a session (5h) bucket is marked disabled by upstream (because weekly was hit),
      // keep it so the UI shows the 5h row, but with remainingFraction: 0.
      // Disabled weekly buckets are truly disabled and skipped.
      if (bucket.disabled === true && isWeekly) continue;

      const remainingFraction = bucket.disabled === true ? 0 : Number(bucket.remainingFraction);
      if (!Number.isFinite(remainingFraction)) continue;

      for (const config of GROUP_CONFIGS) {
        if (config.pattern.test(displayName)) {
          const target = isWeekly ? config.weekly : config.session;
          if (result[target.key]) break;

          const total = 1000;
          const remaining = Math.round(total * remainingFraction);
          const used = Math.max(0, total - remaining);

          result[target.key] = {
            displayName: target.displayName,
            used,
            total,
            remaining,
            remainingPercentage: remainingFraction * 100,
            resetAt: parseResetTime(bucket.resetTime),
            unlimited: false,
            recurring: true,
          };
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Fetch weekly quota summary with 3-minute in-flight dedup cache.
 */
export async function fetchAntigravityWeeklyQuota(
  accessToken: string,
  projectId?: string | null,
  options?: { fetchFn?: typeof fetch; force?: boolean }
): Promise<Record<string, RawQuotaBucket>> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const key = cacheKey(accessToken, projectId);

  if (!options?.force) {
    const hit = weeklyCache.get(key);
    if (hit?.promise) return hit.promise;
    if (hit && hit.expiresAt && hit.expiresAt > Date.now() && hit.result) {
      return hit.result;
    }
  }

  const promise = (async () => {
    try {
      const response = await fetchFn(ANTIGRAVITY_QUOTA_SUMMARY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": ANTIGRAVITY_USER_AGENT,
          "Content-Type": "application/json",
          "X-Client-Name": "antigravity",
          "X-Client-Version": ANTIGRAVITY_IDE_VERSION,
        },
        body: JSON.stringify({
          ...(projectId ? { project: projectId } : {}),
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return {};

      const data: any = await response.json();
      return parseWeeklyQuotaSummary(data);
    } catch {
      return {};
    }
  })();

  weeklyCache.set(key, { promise });

  try {
    const result = await promise;
    if (result && Object.keys(result).length > 0) {
      weeklyCache.set(key, { result, expiresAt: Date.now() + WEEKLY_CACHE_TTL_MS });
    } else {
      weeklyCache.delete(key);
    }
    return result;
  } catch {
    weeklyCache.delete(key);
    return {};
  }
}

/**
 * Get Antigravity subscription info via production loadCodeAssist
 */
export async function getAntigravitySubscriptionInfo(
  accessToken: string,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<any> {
  try {
    const response = await fetchFn(ANTIGRAVITY_LOAD_PROJECT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": ANTIGRAVITY_USER_AGENT,
        "Content-Type": "application/json",
        "X-Client-Name": "antigravity",
        "X-Client-Version": ANTIGRAVITY_IDE_VERSION,
      },
      body: JSON.stringify({ metadata: CLIENT_METADATA, mode: 1 }),
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 401) {
      return { _errorStatus: 401 };
    }
    if (response.status === 403) {
      return { _errorStatus: 403 };
    }
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Antigravity Usage handler following 9router patterns
 */
export async function getAntigravityUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>,
  options?: { fetchFn?: typeof fetch; force?: boolean }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;

  if (!accessToken) {
    return { plan: "Free", message: "Antigravity access token not available." };
  }

  try {
    // 1. Fetch Subscription Info via production loadCodeAssist
    const subscriptionInfo = await getAntigravitySubscriptionInfo(accessToken, fetchFn);
    if (subscriptionInfo?._errorStatus === 401) {
      return {
        plan: "Free",
        message: "Antigravity quota API authentication expired. Chat may still work.",
        error: "Authentication expired (401)",
        quotas: {},
      };
    }
    if (subscriptionInfo?._errorStatus === 403) {
      return {
        plan: "Free",
        message: "Antigravity quota API access forbidden. Chat may still work.",
        error: "Access forbidden (403)",
        quotas: {},
      };
    }
    const projectId =
      subscriptionInfo?.cloudaicompanionProject ||
      providerSpecificData?.projectId ||
      null;

    const paidTierId = subscriptionInfo?.paidTier?.id;
    const isFreeTier = !paidTierId || paidTierId === "free-tier";
    const plan =
      subscriptionInfo?.currentTier?.name ||
      subscriptionInfo?.paidTier?.name ||
      (isFreeTier ? "Free" : "Standard");

    const quotas: Record<string, RawQuotaBucket> = {};

    // 2. Paid-tier: Fetch Available Models (5h per-model windows)
    if (!isFreeTier) {
      try {
        const response = await fetchFn(ANTIGRAVITY_QUOTA_MODELS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": ANTIGRAVITY_USER_AGENT,
            "Content-Type": "application/json",
            "X-Client-Name": "antigravity",
            "X-Client-Version": ANTIGRAVITY_IDE_VERSION,
          },
          body: JSON.stringify({
            ...(projectId ? { project: projectId } : {}),
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (response.status === 401) {
          return {
            plan,
            message: "Antigravity quota API authentication expired. Chat may still work.",
            error: "Authentication expired (401)",
            quotas: {},
          };
        }

        if (response.status === 403) {
          return {
            plan,
            message: "Antigravity quota API access forbidden. Chat may still work.",
            error: "Access forbidden (403)",
            quotas: {},
          };
        }

        if (response.ok) {
          const data: any = await response.json();
          if (data?.models && typeof data.models === "object") {
            for (const [modelKey, info] of Object.entries<any>(data.models)) {
              if (!info?.quotaInfo || info.isInternal || !IMPORTANT_MODELS.includes(modelKey)) {
                continue;
              }

              const remainingFraction = info.quotaInfo.remainingFraction ?? 0;
              const remainingPercentage = remainingFraction * 100;
              const total = 1000;
              const remaining = Math.round(total * remainingFraction);
              const used = Math.max(0, total - remaining);

              quotas[modelKey] = {
                displayName: info.displayName || modelKey,
                used,
                total,
                remaining,
                remainingPercentage,
                resetAt: parseResetTime(info.quotaInfo.resetTime),
                unlimited: false,
                recurring: true,
              };
            }
          }
        }
      } catch (err: any) {
        console.warn("[Antigravity] Models fetch error:", err.message);
      }
    }

    // 3. Best-effort weekly quota overlay
    try {
      const weeklyQuotas = await fetchAntigravityWeeklyQuota(accessToken, projectId, options);

      if (isFreeTier) {
        // Free-tier accounts only have weekly quotas (no separate 5h window).
        // Only keep weekly buckets to avoid misleading 0% session windows.
        for (const [k, v] of Object.entries(weeklyQuotas)) {
          if (k.endsWith("_weekly")) {
            quotas[k] = v;
          }
        }
      } else {
        // Reconcile short-window session quota if models are exhausted:
        // If every model in a family is locked/exhausted (remainingPercentage === 0)
        // until a future reset time, update the 5h session row (not the weekly row).
        const entries = Object.entries(quotas);
        const geminiModels = entries.filter(([k]) => k.startsWith("gemini-") && !k.includes("image"));
        const claudeModels = entries.filter(([k]) => k.startsWith("claude-"));

        if (weeklyQuotas.gemini_session && geminiModels.length > 0) {
          const allGeminiExhausted = geminiModels.every(([, q]) => (q.remainingPercentage ?? 0) === 0);
          if (allGeminiExhausted && (weeklyQuotas.gemini_session.remainingPercentage ?? 0) > 0) {
            const maxResetAt = geminiModels.reduce<string | number | Date | null | undefined>(
              (max, [, q]) => {
                if (!max) return q.resetAt;
                if (q.resetAt && new Date(q.resetAt).getTime() > new Date(max).getTime()) {
                  return q.resetAt;
                }
                return max;
              },
              null
            );
            weeklyQuotas.gemini_session.used = weeklyQuotas.gemini_session.total ?? 1000;
            weeklyQuotas.gemini_session.remaining = 0;
            weeklyQuotas.gemini_session.remainingPercentage = 0;
            if (maxResetAt) {
              weeklyQuotas.gemini_session.resetAt = maxResetAt;
            }
          }
        }

        if (weeklyQuotas.claude_gpt_session && claudeModels.length > 0) {
          const allClaudeExhausted = claudeModels.every(([, q]) => (q.remainingPercentage ?? 0) === 0);
          if (allClaudeExhausted && (weeklyQuotas.claude_gpt_session.remainingPercentage ?? 0) > 0) {
            const maxResetAt = claudeModels.reduce<string | number | Date | null | undefined>(
              (max, [, q]) => {
                if (!max) return q.resetAt;
                if (q.resetAt && new Date(q.resetAt).getTime() > new Date(max).getTime()) {
                  return q.resetAt;
                }
                return max;
              },
              null
            );
            weeklyQuotas.claude_gpt_session.used = weeklyQuotas.claude_gpt_session.total ?? 1000;
            weeklyQuotas.claude_gpt_session.remaining = 0;
            weeklyQuotas.claude_gpt_session.remainingPercentage = 0;
            if (maxResetAt) {
              weeklyQuotas.claude_gpt_session.resetAt = maxResetAt;
            }
          }
        }

        Object.assign(quotas, weeklyQuotas);
      }
    } catch {
      // Best-effort overlay
    }

    // Fail cleanly with descriptive message if no quotas were fetched
    if (Object.keys(quotas).length === 0) {
      return {
        plan,
        message: "No quota information available for Antigravity account.",
        quotas: {},
      };
    }

    return {
      plan,
      quotas,
    };
  } catch (error: any) {
    return {
      plan: "Free",
      error: error.message || "Failed to fetch Antigravity quota",
      message: `Antigravity error: ${error.message}`,
      quotas: {},
    };
  }
}
