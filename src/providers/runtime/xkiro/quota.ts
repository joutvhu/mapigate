import type { RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";

export const XKIRO_USAGE_URL = "https://api.xkiro.com/v1/usage";

export function parseXKiroUsageData(data: any): RawProviderQuotaResult {
  const quotas: Record<string, RawQuotaBucket> = {};

  if (!data || typeof data !== "object") {
    return { plan: "Pay-as-you-go", quotas };
  }

  const rawPlan = typeof data.plan === "string" ? data.plan.trim() : "";
  const plan = rawPlan
    ? rawPlan.charAt(0).toUpperCase() + rawPlan.slice(1)
    : "Pay-as-you-go";

  if (Array.isArray(data.windows)) {
    for (const win of data.windows) {
      if (!win || typeof win !== "object") continue;

      const windowSec = Number(win.window_sec) || 0;
      const spentUsd = parseFloat(win.spent_usd || "0") || 0;
      const capUsd = parseFloat(win.cap_usd || "0") || 0;
      const remainingUsd = parseFloat(win.remaining_usd || "0") || Math.max(0, capUsd - spentUsd);

      let label = "Spend Window";
      let key = `window_${windowSec}`;
      if (windowSec === 18000) {
        label = "Session (5h)";
        key = "session_5h";
      } else if (windowSec === 604800) {
        label = "Weekly (7d)";
        key = "weekly_7d";
      } else if (windowSec > 0) {
        const hours = Math.round(windowSec / 3600);
        label = `${hours}h Window`;
      }

      const resetsInSec = Number(win.resets_in_sec) || 0;
      const resetAt = resetsInSec > 0 ? Date.now() + resetsInSec * 1000 : null;
      const remainingPercentage =
        capUsd > 0 ? Math.max(0, Math.min(100, Math.round((remainingUsd / capUsd) * 100))) : 100;

      quotas[key] = {
        displayName: label,
        used: spentUsd,
        total: capUsd,
        remaining: remainingUsd,
        remainingPercentage,
        resetAt,
        unlimited: capUsd <= 0,
        recurring: true,
      };
    }
  }

  if (data.free_tokens && typeof data.free_tokens === "object") {
    const ft = data.free_tokens;
    const limit = Number(ft.limit_per_day);
    if (Number.isFinite(limit) && limit > 0) {
      const used = Number(ft.used_today) || 0;
      const parsedRemaining = Number(ft.remaining);
      const remaining =
        ft.remaining !== undefined && ft.remaining !== null && Number.isFinite(parsedRemaining)
          ? parsedRemaining
          : Math.max(0, limit - used);
      const remainingPercentage = Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));

      const now = new Date();
      const nextUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));

      quotas["free_tokens"] = {
        displayName: "Free Tokens (Daily)",
        used,
        total: limit,
        remaining,
        remainingPercentage,
        resetAt: nextUtcMidnight.getTime(),
        unlimited: false,
        recurring: true,
      };
    }
  }

  if (data.wallet && typeof data.wallet === "object") {
    const balanceUsd = parseFloat(data.wallet.balance_usd ?? data.wallet.balance);
    if (Number.isFinite(balanceUsd)) {
      const heldUsd = parseFloat(data.wallet.held_usd || "0") || 0;
      quotas["wallet"] = {
        displayName: "Wallet Balance",
        used: heldUsd,
        total: balanceUsd,
        remaining: balanceUsd,
        remainingPercentage: 100,
        resetAt: null,
        unlimited: true,
        recurring: false,
      };
    }
  }

  return {
    plan,
    quotas,
  };
}

export async function getXKiroUsage(
  apiKey: string,
  providerSpecificData?: Record<string, any>,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (apiKey || "").trim();

  if (!token) {
    return { plan: "Pay-as-you-go", message: "xKiro API key not available." };
  }

  const endpoint = providerSpecificData?.usageUrl || XKIRO_USAGE_URL;

  try {
    const res = await fetchFn(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": token,
        Accept: "application/json",
        "User-Agent": "mapigate/0.1.0",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401) {
      return {
        plan: "xKiro",
        message: "xKiro API key invalid or unauthorized (401).",
        error: "Unauthorized (401)",
        quotas: {},
      };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        plan: "xKiro",
        message: `xKiro usage endpoint error (${res.status}): ${errText}`,
        error: `HTTP ${res.status}`,
        quotas: {},
      };
    }

    const data: any = await res.json();
    return parseXKiroUsageData(data);
  } catch (error: any) {
    return {
      plan: "xKiro",
      message: `Failed to fetch xKiro quota: ${error.message}`,
      error: error.message,
      quotas: {},
    };
  }
}
