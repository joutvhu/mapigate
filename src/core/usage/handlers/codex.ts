import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime, toFiniteNumber } from "../utils.js";

export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const CODEX_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

export function getCodexAccountId(providerSpecificData?: Record<string, any>): string | null {
  return (
    providerSpecificData?.chatgptAccountId ||
    providerSpecificData?.accountId ||
    providerSpecificData?.workspaceId ||
    null
  );
}

export function getCodexReviewRateLimit(data: any): any {
  if (data?.code_review_rate_limit || data?.review_rate_limit) {
    return data.code_review_rate_limit || data.review_rate_limit;
  }

  const byLimitId = data?.rate_limits_by_limit_id;
  if (byLimitId && typeof byLimitId === "object" && !Array.isArray(byLimitId)) {
    return byLimitId.code_review || byLimitId.codex_review || byLimitId.review || null;
  }

  const additional = Array.isArray(data?.additional_rate_limits) ? data.additional_rate_limits : [];
  return (
    additional.find((entry: any) => {
      const id = String(entry?.limit_name || entry?.metered_feature || entry?.id || "").toLowerCase();
      return id === "code_review" || id === "codex_review" || id === "review" || id.includes("review");
    }) || null
  );
}

export function getCodexSparkRateLimit(data: any): any {
  if (data?.spark_rate_limit || data?.gpt_5_3_codex_spark_rate_limit) {
    return data.spark_rate_limit || data.gpt_5_3_codex_spark_rate_limit;
  }

  const byLimitId = data?.rate_limits_by_limit_id;
  if (byLimitId && typeof byLimitId === "object" && !Array.isArray(byLimitId)) {
    return byLimitId["gpt-5.3-codex-spark"] || byLimitId.gpt_5_3_codex_spark || byLimitId.spark || null;
  }

  const additional = Array.isArray(data?.additional_rate_limits) ? data.additional_rate_limits : [];
  return (
    additional.find((entry: any) => {
      const id = String(entry?.limit_name || entry?.metered_feature || entry?.id || "").toLowerCase();
      return id.includes("spark") || id.includes("5.3-codex-spark");
    }) || null
  );
}

export function formatCodexWindow(win: any, label: string): RawQuotaBucket | null {
  if (!win || typeof win !== "object") return null;
  const usedPercent = Math.max(
    0,
    Math.min(100, toFiniteNumber(win?.used_percent ?? win?.percent_used, 0))
  );
  const remaining = Math.max(0, 100 - usedPercent);
  return {
    displayName: label,
    used: usedPercent,
    total: 100,
    remaining,
    remainingPercentage: remaining,
    resetAt: parseResetTime(win?.reset_at ?? win?.resets_at ?? win?.resetAt),
    unlimited: false,
    recurring: true,
  };
}

export async function getCodexUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (accessToken || "").trim();

  if (!token) {
    return { plan: "Codex", message: "Codex access token not available." };
  }

  const accountId = getCodexAccountId(providerSpecificData);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (accountId) {
    headers["ChatGPT-Account-Id"] = accountId;
    headers["chatgpt-account-id"] = accountId;
  }

  try {
    const res = await fetchFn(CODEX_USAGE_URL, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        plan: "Codex",
        message: "Codex authentication failed. Token may be expired.",
      };
    }

    if (!res.ok) {
      return {
        plan: "Codex",
        message: `Codex usage API returned status ${res.status}.`,
      };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};

    // 1. Primary & Secondary normal rate limit windows
    const rateLimit = data?.rate_limit || data?.rate_limits || data?.rate_limits_by_limit_id?.codex || data;
    const normalPrimary = rateLimit?.primary_window || rateLimit?.primary;
    const normalSecondary = rateLimit?.secondary_window || rateLimit?.secondary;

    const sessionBucket = formatCodexWindow(normalPrimary, "Session (5h)");
    if (sessionBucket) quotas["session"] = sessionBucket;

    const weeklyBucket = formatCodexWindow(normalSecondary, "Weekly (7d)");
    if (weeklyBucket) quotas["weekly"] = weeklyBucket;

    // 2. Code Review rate limit windows
    const reviewLimit = getCodexReviewRateLimit(data);
    if (reviewLimit) {
      const reviewPrimary = reviewLimit?.primary_window || reviewLimit?.primary;
      const reviewSecondary = reviewLimit?.secondary_window || reviewLimit?.secondary;
      const rSession = formatCodexWindow(reviewPrimary, "Code Review (Session)");
      if (rSession) quotas["review_session"] = rSession;
      const rWeekly = formatCodexWindow(reviewSecondary, "Code Review (Weekly)");
      if (rWeekly) quotas["review_weekly"] = rWeekly;
    }

    // 3. Spark rate limit windows
    const sparkLimit = getCodexSparkRateLimit(data);
    if (sparkLimit) {
      const sparkPrimary = sparkLimit?.primary_window || sparkLimit?.primary;
      const sparkSecondary = sparkLimit?.secondary_window || sparkLimit?.secondary;
      const sSession = formatCodexWindow(sparkPrimary, "Spark (Session)");
      if (sSession) quotas["spark_session"] = sSession;
      const sWeekly = formatCodexWindow(sparkSecondary, "Spark (Weekly)");
      if (sWeekly) quotas["spark_weekly"] = sWeekly;
    }

    // 4. Rate limit reset credits
    const directCredits = toFiniteNumber(data?.rate_limit_reset_credits?.available_count, 0);
    if (directCredits > 0) {
      quotas["reset_credits"] = {
        displayName: "Instant Reset Credits",
        used: 0,
        total: directCredits,
        remaining: directCredits,
        remainingPercentage: 100,
        resetAt: null,
        unlimited: false,
        recurring: false,
      };
    } else {
      try {
        const credRes = await fetchFn(CODEX_CREDITS_URL, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(4000),
        });
        if (credRes.ok) {
          const credData: any = await credRes.json();
          const availableCredits = toFiniteNumber(
            credData?.available_count ?? credData?.credits ?? credData?.available,
            0
          );
          if (availableCredits > 0) {
            quotas["reset_credits"] = {
              displayName: "Instant Reset Credits",
              used: 0,
              total: availableCredits,
              remaining: availableCredits,
              remainingPercentage: 100,
              resetAt: null,
              unlimited: false,
              recurring: false,
            };
          }
        }
      } catch {}
    }

    const plan = data?.plan_type || data?.summary?.plan || data?.plan || "Codex Pro";

    return {
      plan,
      quotas,
    };
  } catch (err: any) {
    return {
      plan: "Codex",
      message: `Failed to fetch Codex usage: ${err.message}`,
    };
  }
}
