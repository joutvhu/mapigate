import type { RawProviderQuotaResult } from "../../../core/usage/types.js";
import { parseResetTime } from "../../../core/usage/utils.js";
import { acquireMimoServiceToken, readDesktopPassToken } from "./auth.js";

export const XIAOMI_MIMO_MONTHLY_TOKEN_LIMIT = 4_100_000_000;
export const MIMO_ACCOUNT_USAGE_URL = "https://aistudio.xiaomimimo.com/open-apis/v1/user/usage";

const API_BASE_BY_REGION: Record<string, string> = {
  cn: "https://mimo-server-cn.xiaomimimo.com",
  sgp: "https://mimo-server-sgp.xiaomimimo.com",
  ams: "https://mimo-server-ams.xiaomimimo.com",
  ru: "https://mimo-server-ru.xiaomimimo.com",
  in: "https://mimo-server-in.xiaomimimo.com",
};

export async function getMimoUsage(
  _apiKey: string,
  providerId: string = "xiaomi-tokenplan",
  providerSpecificData?: Record<string, any>,
  _accountId?: string,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const pId = providerId.toLowerCase();
  const isTokenPlan = pId === "xiaomi-tokenplan" || pId === "xmtp";
  const planName = isTokenPlan ? "Xiaomi MiMo Token Plan" : "Xiaomi MiMo";
  const region = String(providerSpecificData?.region || "sgp").toLowerCase();

  let passToken = providerSpecificData?.mimoPassToken || providerSpecificData?.sessionToken;
  let userId = providerSpecificData?.userId;
  let cUserId = providerSpecificData?.cUserId;

  if (!passToken) {
    const desktop = await readDesktopPassToken();
    if (desktop) {
      passToken = desktop.passToken;
      userId = desktop.userId;
      cUserId = desktop.cUserId;
    }
  }

  if (passToken) {
    try {
      const serverBase = API_BASE_BY_REGION[region] || API_BASE_BY_REGION.sgp;
      const serviceToken = await acquireMimoServiceToken({ passToken, userId, cUserId }, region);
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "MiClaw/1.0",
      };

      if (serviceToken) {
        headers["Cookie"] = `serviceToken=${serviceToken}; userId=${userId || ""}`;
      } else {
        headers["Cookie"] = `passToken=${passToken}`;
      }

      const res = await fetchFn(`${serverBase}/api/user/usage`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(6000),
      }).catch(() => null);

      if (res && res.ok) {
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

      // Fallback: AIStudio endpoint
      const aistudioRes = await fetchFn(MIMO_ACCOUNT_USAGE_URL, {
        method: "GET",
        headers: {
          Cookie: `passToken=${passToken}`,
          "X-Mimo-Source": "mimocode-cli",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (aistudioRes.ok) {
        const json: any = await aistudioRes.json();
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
    } catch {}
  }

  return {
    plan: planName,
    message: "Xiaomi Token Plan does not provide an upstream quota API for standalone API keys.",
    quotas: {},
  };
}
