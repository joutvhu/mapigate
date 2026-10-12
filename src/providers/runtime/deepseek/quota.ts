import type { RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";
import { toFiniteNumber } from "../../../core/usage/utils.js";

export const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";

export function sanitizeApiKey(apiKey: string | null | undefined): string {
  if (!apiKey || typeof apiKey !== "string") return "";
  let clean = apiKey.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  return clean;
}

export function parseBalanceInfos(data: any): Array<{
  currency: string;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
}> {
  const list = Array.isArray(data?.balance_infos) ? data.balance_infos : [];
  const results: Array<{
    currency: string;
    totalBalance: number;
    grantedBalance: number;
    toppedUpBalance: number;
  }> = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const currency = typeof item.currency === "string" ? item.currency.toUpperCase() : "";
    if (!currency) continue;

    results.push({
      currency,
      totalBalance: toFiniteNumber(item.total_balance ?? item.totalBalance, 0),
      grantedBalance: toFiniteNumber(item.granted_balance ?? item.grantedBalance, 0),
      toppedUpBalance: toFiniteNumber(item.topped_up_balance ?? item.toppedUpBalance, 0),
    });
  }

  return results;
}

export async function getDeepseekUsage(
  apiKey: string,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const cleanKey = sanitizeApiKey(apiKey);

  if (!cleanKey) {
    return { plan: "DeepSeek", message: "DeepSeek API key not available." };
  }

  try {
    const res = await fetchFn(DEEPSEEK_BALANCE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cleanKey}`,
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
      const errText = await res.text().catch(() => "");
      return {
        plan: "DeepSeek",
        message: `DeepSeek balance API error (${res.status})${errText ? `: ${errText.slice(0, 100)}` : ""}`,
      };
    }

    const data: any = await res.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return { plan: "DeepSeek", message: "DeepSeek balance response was not JSON." };
    }

    const balances = parseBalanceInfos(data);
    if (balances.length === 0) {
      return {
        plan: "DeepSeek",
        message: "DeepSeek connected. No balance data returned.",
      };
    }

    const isAvailable = data.is_available === true || data.isAvailable === true;
    const quotas: Record<string, RawQuotaBucket> = {};

    for (const b of balances) {
      const total = Math.max(0, b.totalBalance);
      const remaining = total;
      quotas[`balance_${b.currency.toLowerCase()}`] = {
        displayName: `Balance (${b.currency})`,
        used: 0,
        total,
        remaining,
        remainingPercentage: total > 0 ? 100 : 0,
        resetAt: null,
        unlimited: false,
        recurring: false,
      };
    }

    return {
      plan: isAvailable ? "DeepSeek" : "DeepSeek (Insufficient Balance)",
      quotas,
    };
  } catch (err: any) {
    return {
      plan: "DeepSeek",
      message: `DeepSeek balance check failed: ${err.message}`,
    };
  }
}
