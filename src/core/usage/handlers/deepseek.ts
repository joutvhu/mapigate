import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { toFiniteNumber } from "../utils.js";

const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";

export async function getDeepseekUsage(apiKey: string): Promise<RawProviderQuotaResult> {
  if (!apiKey?.trim()) {
    return { plan: "DeepSeek", message: "DeepSeek API key not available." };
  }

  try {
    const res = await fetch(DEEPSEEK_BALANCE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        plan: "DeepSeek",
        message: "DeepSeek authentication failed. Please verify API key.",
      };
    }

    if (!res.ok) {
      return {
        plan: "DeepSeek",
        message: `DeepSeek balance API error (${res.status}).`,
      };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};
    const list = Array.isArray(data?.balance_infos) ? data.balance_infos : [];

    for (const item of list) {
      const currency = typeof item.currency === "string" ? item.currency.toUpperCase() : "USD";
      const totalBalance = toFiniteNumber(item.total_balance ?? item.totalBalance, 0);

      quotas[`balance_${currency.toLowerCase()}`] = {
        displayName: `Balance (${currency})`,
        used: 0,
        total: totalBalance,
        remaining: totalBalance,
        remainingPercentage: totalBalance > 0 ? 100 : 0,
        resetAt: null,
        unlimited: false,
        recurring: false,
      };
    }

    return {
      plan: "DeepSeek API",
      quotas,
    };
  } catch (err: any) {
    return {
      plan: "DeepSeek",
      message: `DeepSeek balance check failed: ${err.message}`,
    };
  }
}
