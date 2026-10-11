import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime, toFiniteNumber } from "../utils.js";

const GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";

export async function getGrokUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  if (!accessToken?.trim()) {
    return { plan: "Grok", message: "Grok access token not available." };
  }

  const email = providerSpecificData?.email;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken.trim()}`,
    Accept: "application/json",
    "User-Agent": "xai-grok-cli/0.1.0",
    "x-xai-token-auth": "xai-grok-cli",
    "x-grok-client-mode": "headless",
  };
  if (email) headers["x-email"] = email;

  try {
    const res = await fetch(GROK_BILLING_URL, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { plan: "Grok", message: `Grok billing API error (${res.status}).` };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};
    const config = data?.config || {};

    const prepaid = toFiniteNumber(config?.prepaidBalance?.val ?? config?.prepaidBalance, 0);
    const cap = toFiniteNumber(config?.onDemandCap?.val ?? config?.onDemandCap, 0);
    const used = toFiniteNumber(config?.onDemandUsed?.val ?? config?.onDemandUsed, 0);
    const resetAt = parseResetTime(config?.currentPeriod?.end || config?.billingPeriodEnd);

    if (cap > 0) {
      const remaining = Math.max(0, cap - used);
      quotas["on_demand"] = {
        displayName: "On-Demand Credits",
        used,
        total: cap,
        remaining,
        remainingPercentage: Math.round((remaining / cap) * 100),
        resetAt,
        unlimited: false,
        recurring: true,
      };
    }

    if (prepaid > 0 || cap === 0) {
      quotas["prepaid"] = {
        displayName: "Prepaid Balance",
        used: 0,
        total: prepaid,
        remaining: prepaid,
        remainingPercentage: prepaid > 0 ? 100 : 0,
        resetAt: null,
        unlimited: false,
        recurring: false,
      };
    }

    return {
      plan: "Grok Pro",
      quotas,
    };
  } catch (err: any) {
    return { plan: "Grok", message: `Failed to fetch Grok usage: ${err.message}` };
  }
}
