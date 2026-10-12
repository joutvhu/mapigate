import type { RawProviderQuotaResult, RawQuotaBucket } from "../../core/usage/types.js";
import { parseResetTime } from "../../core/usage/utils.js";

export const XIAOMI_MIMO_MONTHLY_TOKEN_LIMIT = 4_100_000_000;
export const MIMO_ACCOUNT_USAGE_URL = "https://aistudio.xiaomimimo.com/open-apis/v1/user/usage";

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

  return {
    plan: planName,
    message: "Xiaomi Token Plan does not provide an upstream quota API for API keys.",
    quotas: {},
  };
}
