import type { ProviderUsageContext, RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";

export const COARENA_LIMITS_URL = "https://coarena.ai/api/v1/limits";

export async function getCoarenaUsage(
  context: ProviderUsageContext,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const apiKey = (context.account?.rawApiKey || "").trim();

  if (!apiKey) {
    return { plan: "Coarena", message: "Coarena API key is required." };
  }

  try {
    const res = await fetchFn(COARENA_LIMITS_URL, {
      method: "GET",
      headers: {
        Authorization: apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        plan: "Coarena",
        error: `Authentication failed (HTTP ${res.status}): Invalid Coarena API key`,
      };
    }

    if (!res.ok) {
      return {
        plan: "Coarena",
        error: `Failed to fetch Coarena limits (HTTP ${res.status})`,
      };
    }

    const json: any = await res.json();
    const data = json?.data || {};

    const usdPerDay = typeof data.usd_per_day === "number" ? data.usd_per_day : 5;
    const usedUsd = typeof data.today?.used_usd === "number" ? data.today.used_usd : 0;
    const leftUsd = typeof data.today?.left_usd === "number"
      ? data.today.left_usd
      : Math.max(0, usdPerDay - usedUsd);
    const remainingPercent = usdPerDay > 0
      ? Math.max(0, Math.min(100, Math.round((leftUsd / usdPerDay) * 100)))
      : 0;

    const rpm = Number(data.requests_per_minute_key) || Number(data.default_requests_per_minute) || 60;
    const resetsAt = data.today?.resets_at || null;

    const quotas: Record<string, RawQuotaBucket> = {
      daily_usd: {
        displayName: "Daily Allowance ($ USD)",
        total: usdPerDay,
        used: usedUsd,
        remaining: leftUsd,
        remainingPercentage: remainingPercent,
        resetAt: resetsAt,
        recurring: true,
      },
      rpm: {
        displayName: "Rate Limit (RPM)",
        total: rpm,
        used: 0,
        remaining: rpm,
        remainingPercentage: 100,
        unlimited: false,
      },
    };

    if (data.requests_per_day != null) {
      const rpd = Number(data.requests_per_day);
      const reqUsed = Number(data.today?.requests) || 0;
      const reqLeft = typeof data.today?.requests_left === "number"
        ? data.today.requests_left
        : Math.max(0, rpd - reqUsed);
      const reqPercent = rpd > 0 ? Math.max(0, Math.min(100, Math.round((reqLeft / rpd) * 100))) : 0;
      quotas.requests_today = {
        displayName: "Requests Today",
        total: rpd,
        used: reqUsed,
        remaining: reqLeft,
        remainingPercentage: reqPercent,
        resetAt: resetsAt,
        recurring: true,
      };
    } else if (data.today?.requests != null) {
      const reqUsed = Number(data.today.requests) || 0;
      quotas.requests_today = {
        displayName: "Requests Today",
        total: reqUsed,
        used: reqUsed,
        remaining: 0,
        remainingPercentage: 100,
        unlimited: true,
        resetAt: resetsAt,
        recurring: true,
      };
    }

    if (typeof data.concurrency === "number") {
      quotas.concurrency = {
        displayName: "Concurrency",
        total: data.concurrency,
        used: 0,
        remaining: data.concurrency,
        remainingPercentage: 100,
        unlimited: false,
      };
    }

    let planName = "Free Tier ($5/day)";
    if (data.source === "granted" || (data.usd_per_day && data.usd_per_day > 5)) {
      planName = `Granted ($${data.usd_per_day}/day)`;
    } else if (data.free === false) {
      planName = "Paid Tier";
    }

    return {
      plan: planName,
      quotas,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      plan: "Coarena",
      error: `Failed to connect to Coarena quota API: ${msg}`,
    };
  }
}
