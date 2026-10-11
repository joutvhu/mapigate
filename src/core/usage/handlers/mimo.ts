import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
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
 * Xiaomi exposes token plan usage only behind the web console session cookie
 * (the `tp-...` / `sk-...` API key cannot access the internal quota endpoint).
 *
 * Therefore, Mapigate:
 * 1. If an account session / cookie is provided in providerSpecificData (e.g. mimoPassToken),
 *    calls the upstream session API for real quota percentage.
 * 2. If only an API key is present without an upstream quota endpoint, no inaccurate
 *    local estimation is performed. Mapigate gracefully returns an informational message
 *    without displaying fabricated quota progress bars.
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
      // Ignored
    }
  }

  // 2. For API key without upstream quota endpoint:
  // Do NOT display inaccurate local estimation. Return informative message with empty quotas.
  return {
    plan: planName,
    message: "Xiaomi Token Plan does not provide an upstream quota API for API keys.",
    quotas: {},
  };
}
