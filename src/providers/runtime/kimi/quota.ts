import type { RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";
import { parseResetTime, toFiniteNumber } from "../../../core/usage/utils.js";

const USAGE_URL = "https://api.kimi.com/coding/v1/usages";

export async function getKimiUsage(
  accessToken?: string | null,
  apiKey?: string | null,
  providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  const useApiKey = typeof apiKey === "string" && apiKey.length > 0;
  const useOAuth = !useApiKey && typeof accessToken === "string" && accessToken.length > 0;

  if (!useApiKey && !useOAuth) {
    return { plan: "Kimi Coding", message: "Kimi access token or API key not available." };
  }

  const authHeaders: Record<string, string> = useApiKey
    ? { "x-api-key": apiKey! }
    : {
        Authorization: `Bearer ${accessToken}`,
        ...(providerSpecificData?.deviceId ? { "X-Msh-Device-Id": providerSpecificData.deviceId } : {}),
      };

  try {
    const res = await fetch(USAGE_URL, {
      method: "GET",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) {
        return { plan: "Kimi Coding", message: "Kimi authentication expired. Please re-authorize." };
      }
      return { plan: "Kimi Coding", message: `Kimi Coding error (${res.status}): ${text.slice(0, 100)}` };
    }

    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      return { plan: "Kimi Coding", message: "Invalid JSON response from Kimi usage API." };
    }

    const quotas: Record<string, RawQuotaBucket> = {};
    const usageObj = data?.usage || {};
    const usageLimit = toFiniteNumber(usageObj.limit ?? usageObj.Limit, 0);
    const usageUsed = toFiniteNumber(usageObj.used ?? usageObj.Used, 0);
    const usageRemaining = toFiniteNumber(usageObj.remaining ?? usageObj.Remaining, NaN);
    const usageResetTime = usageObj.resetTime || usageObj.ResetTime || usageObj.reset_at || usageObj.resetAt;

    if (usageLimit > 0) {
      const rem = Number.isFinite(usageRemaining) ? usageRemaining : Math.max(0, usageLimit - usageUsed);
      quotas["Weekly"] = {
        displayName: "Weekly Limit",
        used: usageUsed,
        total: usageLimit,
        remaining: rem,
        remainingPercentage: Math.max(0, Math.min(100, Math.round((rem / usageLimit) * 100))),
        resetAt: parseResetTime(usageResetTime),
        unlimited: false,
        recurring: true,
      };
    }

    const limitsArray = Array.isArray(data?.limits) ? data.limits : [];
    for (const item of limitsArray) {
      const detail = item?.detail || {};
      const limit = toFiniteNumber(detail.limit ?? detail.Limit, 0);
      const remaining = toFiniteNumber(detail.remaining ?? detail.Remaining, NaN);
      const resetTime = detail.resetTime || detail.reset_at || detail.resetAt;
      if (limit > 0) {
        const rem = Number.isFinite(remaining) ? remaining : Math.max(0, limit);
        quotas["Ratelimit"] = {
          displayName: "Rate Limit",
          used: Math.max(0, limit - rem),
          total: limit,
          remaining: rem,
          remainingPercentage: Math.max(0, Math.min(100, Math.round((rem / limit) * 100))),
          resetAt: parseResetTime(resetTime),
          unlimited: false,
          recurring: true,
        };
      }
    }

    return {
      plan: "Kimi Coding",
      quotas,
    };
  } catch (err: any) {
    return { plan: "Kimi Coding", message: `Failed to fetch Kimi usage: ${err.message}` };
  }
}
