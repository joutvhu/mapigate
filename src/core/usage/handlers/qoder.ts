import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime, toFiniteNumber } from "../utils.js";

export const QODER_USAGE_URL = "https://openapi.qoder.sh/api/v2/quota/usage";
export const QODER_CN_USAGE_URL = "https://openapi.qoder.com.cn/api/v2/quota/usage";

export async function getQoderUsage(
  accessToken: string,
  providerId = "qoder",
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (accessToken || "").trim();

  if (!token) {
    return { plan: "Qoder", message: "Qoder access token not available." };
  }

  const isCn = providerId.toLowerCase().includes("cn");
  const url = isCn ? QODER_CN_USAGE_URL : QODER_USAGE_URL;
  const defaultPlan = isCn ? "Qoder CN" : "Qoder";

  try {
    const res = await fetchFn(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        plan: defaultPlan,
        message: "Qoder token invalid or expired. Re-authenticate connection.",
      };
    }

    if (!res.ok) {
      return {
        plan: defaultPlan,
        message: `Qoder usage API returned status ${res.status}.`,
      };
    }

    const body: any = await res.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return { plan: defaultPlan, message: "Qoder usage response was not JSON." };
    }

    const userQuota = body.userQuota || body.data?.userQuota || {};
    const orgQuota = body.orgResourcePackage || body.data?.orgResourcePackage || {};

    const expiresAtRaw = body.expiresAt ?? body.data?.expiresAt;
    const expiresAt = parseResetTime(expiresAtRaw);

    const quotas: Record<string, RawQuotaBucket> = {};

    const parsePackageBucket = (pkg: any, displayName: string): RawQuotaBucket => {
      const total = toFiniteNumber(pkg?.total, 0);
      const used = toFiniteNumber(pkg?.used, 0);
      const remaining = toFiniteNumber(pkg?.remaining, Math.max(0, total - used));
      const remainingPercentage =
        total > 0 ? Math.max(0, Math.min(100, Math.round((remaining / total) * 100))) : 100;

      return {
        displayName,
        used,
        total,
        remaining,
        remainingPercentage,
        resetAt: expiresAt,
        unlimited: false,
        recurring: true,
      };
    };

    if (userQuota && (userQuota.total !== undefined || userQuota.remaining !== undefined)) {
      quotas["user"] = parsePackageBucket(userQuota, "User Quota");
    }

    if (orgQuota && (orgQuota.total !== undefined || orgQuota.remaining !== undefined)) {
      quotas["organization"] = parsePackageBucket(orgQuota, "Org Resource Package");
    }

    if (Object.keys(quotas).length === 0) {
      return {
        plan: body.plan || defaultPlan,
        message: "Qoder connected. No quota data returned.",
      };
    }

    return {
      plan: body.plan || body.plan_name || defaultPlan,
      quotas,
    };
  } catch (err: any) {
    return {
      plan: defaultPlan,
      message: `Failed to fetch Qoder usage: ${err.message}`,
    };
  }
}
