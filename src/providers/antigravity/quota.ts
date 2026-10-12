import type { RawProviderQuotaResult, RawQuotaBucket } from "../../core/usage/types.js";
import { parseResetTime } from "../../core/usage/utils.js";
import {
  ANTIGRAVITY_IDE_VERSION,
  ANTIGRAVITY_USER_AGENT,
  ANTIGRAVITY_LOAD_PROJECT_URL,
  ANTIGRAVITY_QUOTA_MODELS_URL,
  CLIENT_METADATA,
  IMPORTANT_MODELS,
} from "./types.js";
import { fetchAntigravityWeeklyQuota } from "./weekly.js";

export * from "./types.js";
export * from "./weekly.js";

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

    if (response.status === 401) return { _errorStatus: 401 };
    if (response.status === 403) return { _errorStatus: 403 };
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

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

    const projectId = subscriptionInfo?.cloudaicompanionProject || providerSpecificData?.projectId || null;
    const paidTierId = subscriptionInfo?.paidTier?.id;
    const isFreeTier = !paidTierId || paidTierId === "free-tier";
    const plan = subscriptionInfo?.currentTier?.name || subscriptionInfo?.paidTier?.name || (isFreeTier ? "Free" : "Standard");

    const quotas: Record<string, RawQuotaBucket> = {};
    const modelQuotas: Record<string, RawQuotaBucket> = {};

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
          body: JSON.stringify({ ...(projectId ? { project: projectId } : {}) }),
          signal: AbortSignal.timeout(8000),
        });

        if (response.status === 401) {
          return { plan, message: "Antigravity quota API authentication expired. Chat may still work.", error: "Authentication expired (401)", quotas: {} };
        }
        if (response.status === 403) {
          return { plan, message: "Antigravity quota API access forbidden. Chat may still work.", error: "Access forbidden (403)", quotas: {} };
        }

        if (response.ok) {
          const data: any = await response.json();
          if (data?.models && typeof data.models === "object") {
            for (const [modelKey, info] of Object.entries<any>(data.models)) {
              if (!info?.quotaInfo || info.isInternal || !IMPORTANT_MODELS.includes(modelKey)) continue;
              const remainingFraction = info.quotaInfo.remainingFraction ?? 0;
              const total = 1000;
              const remaining = Math.round(total * remainingFraction);
              modelQuotas[modelKey] = {
                displayName: info.displayName || modelKey,
                used: Math.max(0, total - remaining),
                total,
                remaining,
                remainingPercentage: remainingFraction * 100,
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

    try {
      const weeklyQuotas = await fetchAntigravityWeeklyQuota(accessToken, projectId, options);
      if (isFreeTier) {
        for (const k of ["gemini_weekly", "claude_gpt_weekly"]) {
          if (weeklyQuotas[k]) quotas[k] = weeklyQuotas[k];
        }
      } else {
        reconcileModelQuotasIntoWeekly(modelQuotas, weeklyQuotas);
        for (const key of ["gemini_session", "gemini_weekly", "claude_gpt_session", "claude_gpt_weekly"]) {
          if (weeklyQuotas[key]) quotas[key] = weeklyQuotas[key];
        }
      }
    } catch {
      // Best-effort overlay
    }

    if (Object.keys(quotas).length === 0) {
      return { plan, message: "No quota information available for Antigravity account.", quotas: {} };
    }
    return { plan, quotas };
  } catch (error: any) {
    return { plan: "Free", error: error.message || "Failed to fetch Antigravity quota", message: `Antigravity error: ${error.message}`, quotas: {} };
  }
}

function reconcileModelQuotasIntoWeekly(
  modelQuotas: Record<string, RawQuotaBucket>,
  weeklyQuotas: Record<string, RawQuotaBucket>
): void {
  const entries = Object.entries(modelQuotas);
  const geminiModels = entries.filter(([k]) => k.startsWith("gemini-") && !k.includes("image"));
  const claudeModels = entries.filter(([k]) => k.startsWith("claude-"));

  if (!weeklyQuotas.gemini_session && geminiModels.length > 0) {
    const rep = geminiModels.reduce((min, cur) =>
      (cur[1].remainingPercentage ?? 100) < (min[1].remainingPercentage ?? 100) ? cur : min
    )[1];
    weeklyQuotas.gemini_session = {
      displayName: "Gemini (5h)",
      used: rep.used,
      total: rep.total,
      remaining: rep.remaining,
      remainingPercentage: rep.remainingPercentage,
      resetAt: rep.resetAt,
      unlimited: false,
      recurring: true,
    };
  }

  if (!weeklyQuotas.claude_gpt_session && claudeModels.length > 0) {
    const rep = claudeModels.reduce((min, cur) =>
      (cur[1].remainingPercentage ?? 100) < (min[1].remainingPercentage ?? 100) ? cur : min
    )[1];
    weeklyQuotas.claude_gpt_session = {
      displayName: "Claude & GPT (5h)",
      used: rep.used,
      total: rep.total,
      remaining: rep.remaining,
      remainingPercentage: rep.remainingPercentage,
      resetAt: rep.resetAt,
      unlimited: false,
      recurring: true,
    };
  }

  applyExhaustionReconciliation(geminiModels, weeklyQuotas, "gemini_session");
  applyExhaustionReconciliation(claudeModels, weeklyQuotas, "claude_gpt_session");
}

function applyExhaustionReconciliation(
  models: [string, RawQuotaBucket][],
  weeklyQuotas: Record<string, RawQuotaBucket>,
  sessionKey: string
): void {
  if (!weeklyQuotas[sessionKey] || models.length === 0) return;
  const allExhausted = models.every(([, q]) => (q.remainingPercentage ?? 0) === 0);
  if (allExhausted && (weeklyQuotas[sessionKey].remainingPercentage ?? 0) > 0) {
    const maxResetAt = models.reduce<string | number | Date | null | undefined>((max, [, q]) => {
      if (!max) return q.resetAt;
      if (q.resetAt && new Date(q.resetAt).getTime() > new Date(max).getTime()) return q.resetAt;
      return max;
    }, null);
    weeklyQuotas[sessionKey].used = weeklyQuotas[sessionKey].total ?? 1000;
    weeklyQuotas[sessionKey].remaining = 0;
    weeklyQuotas[sessionKey].remainingPercentage = 0;
    if (maxResetAt) weeklyQuotas[sessionKey].resetAt = maxResetAt;
  }
}
