import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { LogRepository } from "../../../storage/repositories/logRepo.js";
import { parseResetTime } from "../utils.js";

/**
 * Xiaomi MiMo Token Plan monthly limit (4.1 Billion tokens).
 * Follows OmniRoute's reference implementation in open-sse/services/usage/xiaomi-mimo.ts.
 */
export const XIAOMI_MIMO_MONTHLY_TOKEN_LIMIT = 4_100_000_000;

export const MIMO_ACCOUNT_USAGE_URL = "https://aistudio.xiaomimimo.com/open-apis/v1/user/usage";

/**
 * Xiaomi MiMo / Xiaomi Token Plan Usage Handler.
 *
 * Implements the OmniRoute reference pattern:
 * Xiaomi exposes token plan usage only behind the web console session cookie
 * (the `tp-...` / `sk-...` API key cannot access the internal quota endpoint).
 *
 * Therefore, Mapigate:
 * 1. If an account session / cookie is provided in providerSpecificData (e.g. mimoPassToken),
 *    calls the upstream session API.
 * 2. Otherwise (standard Token Plan API key), self-tracks all tokens routed to this
 *    connection in the current UTC month from `request_logs` and compares them against
 *    the known Token Plan monthly limit (4.1B tokens).
 */
export async function getMimoUsage(
  apiKey: string,
  providerId: string = "xiaomi-tokenplan",
  providerSpecificData?: Record<string, any>,
  accountId?: string,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const pId = providerId.toLowerCase();
  const isTokenPlan = pId === "xiaomi-tokenplan" || pId === "xmtp";
  const planName = isTokenPlan ? "Xiaomi MiMo Token Plan" : "Xiaomi MiMo";

  // 1. Try upstream session API if a web session / mimoPassToken is present
  const sessionToken = providerSpecificData?.mimoPassToken || providerSpecificData?.sessionToken;
  if (sessionToken) {
    try {
      const res = await fetchFn(MIMO_ACCOUNT_USAGE_URL, {
        method: "GET",
        headers: {
          Cookie: `passToken=${sessionToken}`,
          "X-Mimo-Source": "mimocode-cli",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const json: any = await res.json();
        if (json?.code === 0 && json?.data) {
          const percent = typeof json.data.percent === "number" ? json.data.percent : null;
          if (percent !== null && Number.isFinite(percent)) {
            const remaining = Math.max(0, Math.min(100, Math.round(percent)));
            const used = 100 - remaining;
            const resetAt = parseResetTime(json.data.resetAt || json.data.resetDate);

            return {
              plan: planName,
              quotas: {
                weekly: {
                  displayName: "Weekly Quota",
                  used,
                  total: 100,
                  remaining,
                  remainingPercentage: remaining,
                  resetAt,
                  unlimited: false,
                  recurring: true,
                },
              },
            };
          }
        }
      }
    } catch {
      // Fall through to self-tracked Token Plan usage
    }
  }

  // 2. Self-tracked Monthly Quota (OmniRoute pattern)
  // Sum routed tokens in current UTC month from local request_logs
  const usedTokens = LogRepository.getMonthlyTokensForAccount(accountId || "", pId);
  const totalTokens = XIAOMI_MIMO_MONTHLY_TOKEN_LIMIT;
  const remainingTokens = Math.max(0, totalTokens - usedTokens);
  const remainingPercentage =
    totalTokens > 0
      ? Math.max(0, Math.min(100, Math.round(((totalTokens - usedTokens) / totalTokens) * 100)))
      : 100;

  // Reset timestamp: 00:00:00 UTC on the 1st day of next month
  const now = new Date();
  const nextMonthUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)
  );

  const quotas: Record<string, RawQuotaBucket> = {
    monthly: {
      displayName: "Monthly Tokens",
      used: usedTokens,
      total: totalTokens,
      remaining: remainingTokens,
      remainingPercentage,
      resetAt: nextMonthUtc.getTime(),
      unlimited: false,
      recurring: true,
    },
  };

  return {
    plan: planName,
    quotas,
  };
}
