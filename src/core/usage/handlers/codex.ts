import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime, toFiniteNumber } from "../utils.js";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

export async function getCodexUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  if (!accessToken) {
    return { plan: "Codex", message: "Codex access token not available." };
  }

  const accountId =
    providerSpecificData?.chatgptAccountId ||
    providerSpecificData?.accountId ||
    providerSpecificData?.workspaceId;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  if (accountId) {
    headers["ChatGPT-Account-Id"] = accountId;
  }

  try {
    const res = await fetch(CODEX_USAGE_URL, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        plan: "Codex",
        message: `Codex usage API returned status ${res.status}.`,
      };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};

    const rateLimit = data?.rate_limit || data;
    const primary = rateLimit?.primary_window || rateLimit?.primary;
    const secondary = rateLimit?.secondary_window || rateLimit?.secondary;

    const formatWindow = (win: any, label: string): RawQuotaBucket => {
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
    };

    if (primary) {
      quotas["session"] = formatWindow(primary, "Session (5h)");
    }
    if (secondary) {
      quotas["weekly"] = formatWindow(secondary, "Weekly (7d)");
    }

    // Try fetching reset credits count
    try {
      const credRes = await fetch(CODEX_CREDITS_URL, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (credRes.ok) {
        const credData: any = await credRes.json();
        const availableCredits = toFiniteNumber(
          credData?.credits ?? credData?.remaining_credits ?? credData?.available,
          0
        );
        quotas["reset_credits"] = {
          displayName: "Instant Reset Credits",
          used: 0,
          total: availableCredits,
          remaining: availableCredits,
          remainingPercentage: availableCredits > 0 ? 100 : 0,
          resetAt: null,
          unlimited: false,
          recurring: false,
        };
      }
    } catch {}

    const plan = data?.plan_type || data?.plan || "Codex Pro";

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
