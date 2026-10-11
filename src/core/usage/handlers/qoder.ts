import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime, toFiniteNumber } from "../utils.js";

const QODER_USAGE_URL = "https://openapi.qoder.sh/api/v2/quota/usage";
const QODER_CN_USAGE_URL = "https://openapi.qoder.com.cn/api/v2/quota/usage";

export async function getQoderUsage(
  accessToken: string,
  providerId = "qoder"
): Promise<RawProviderQuotaResult> {
  if (!accessToken?.trim()) {
    return { plan: "Qoder", message: "Qoder access token not available." };
  }

  const url = providerId === "qoder-cn" ? QODER_CN_USAGE_URL : QODER_USAGE_URL;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { plan: "Qoder", message: `Qoder quota API returned status ${res.status}.` };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};
    const quotaData = data?.data || data;

    const total = toFiniteNumber(quotaData?.total_quota ?? quotaData?.total, 100);
    const used = toFiniteNumber(quotaData?.used_quota ?? quotaData?.used, 0);
    const remaining = Math.max(0, total - used);
    const resetAt = parseResetTime(quotaData?.reset_time || quotaData?.expire_time);

    quotas["requests"] = {
      displayName: "Monthly Requests",
      used,
      total,
      remaining,
      remainingPercentage: total > 0 ? Math.round((remaining / total) * 100) : 0,
      resetAt,
      unlimited: false,
      recurring: true,
    };

    return {
      plan: quotaData?.plan_name || "Qoder",
      quotas,
    };
  } catch (err: any) {
    return { plan: "Qoder", message: `Qoder error: ${err.message}` };
  }
}
