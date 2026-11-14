import type { RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";
import { parseResetTime, toFiniteNumber } from "../../../core/usage/utils.js";

export const TRAE_ENTITLEMENT_URL =
  "https://ug-normal.trae.ai/trae/api/v1/pay/user_current_entitlement_list";

export async function getTraeUsage(
  accessToken: string,
  _providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  const token = (accessToken || "").trim();
  if (!token) {
    return { plan: "Trae", message: "Trae access token not available." };
  }

  const authHeader = token.startsWith("Cloud-IDE-JWT ") ? token : `Cloud-IDE-JWT ${token}`;

  try {
    const res = await fetch(TRAE_ENTITLEMENT_URL, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Authorization: authHeader,
        "x-cloudide-token": token,
        Origin: "https://www.trae.ai",
        Referer: "https://www.trae.ai/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ require_usage: true }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { plan: "Trae", message: `Trae quota API error (HTTP ${res.status})` };
    }

    const data: any = await res.json().catch(() => ({}));
    return parseTraeEntitlementResponse(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { plan: "Trae", message: `Failed to fetch Trae quota: ${message}` };
  }
}

export function parseTraeEntitlementResponse(data: any): RawProviderQuotaResult {
  const packList = Array.isArray(data?.user_entitlement_pack_list)
    ? data.user_entitlement_pack_list
    : [];

  if (packList.length === 0) {
    return { plan: "Trae", message: "Connected. No entitlement package found." };
  }

  const primaryPack = packList.find((p: any) => !p.is_hide) || packList[0];
  const plan = primaryPack.display_desc || "Free plan";
  const baseInfo = primaryPack.entitlement_base_info || {};
  const quota =
    baseInfo.quota ||
    baseInfo.product_extra?.subscription_extra?.quota ||
    {};
  const usage = primaryPack.usage || {};
  const endTime = baseInfo.end_time;
  const resetAt = parseResetTime(endTime);

  const quotas: Record<string, RawQuotaBucket> = {};

  // 1. Dollar Usage
  const basicLimit = toFiniteNumber(quota.basic_usage_limit, 0);
  const bonusLimit = toFiniteNumber(quota.bonus_usage_limit, 0);
  const totalDollarLimit = basicLimit + bonusLimit;
  const basicUsage = toFiniteNumber(usage.basic_usage_amount, 0);
  const bonusUsage = toFiniteNumber(usage.bonus_usage_amount, 0);
  const totalDollarUsage = basicUsage + bonusUsage;

  if (totalDollarLimit > 0) {
    quotas["Dollar Usage"] = {
      used: totalDollarUsage,
      total: totalDollarLimit,
      remaining: Math.max(0, totalDollarLimit - totalDollarUsage),
      resetAt,
      displayName: "Dollar Usage ($)",
      recurring: true,
    };
  }

  // 2. Autocomplete
  const autoLimit = toFiniteNumber(quota.auto_completion_limit, 0);
  if (autoLimit > 0) {
    const autoUsed = toFiniteNumber(
      usage.auto_completion_amount ?? usage.autocomplete_amount ?? 0
    );
    quotas["Autocomplete"] = {
      used: autoUsed,
      total: autoLimit,
      remaining: Math.max(0, autoLimit - autoUsed),
      resetAt,
      displayName: "Autocomplete",
      recurring: true,
    };
  }

  // 3. Fast Requests (Premium Model Fast Requests if configured)
  const fastLimit = toFiniteNumber(quota.premium_model_fast_request_limit, 0);
  if (fastLimit > 0) {
    const fastUsed = toFiniteNumber(
      usage.premium_model_fast_request_amount ?? usage.fast_request_amount ?? 0
    );
    quotas["Fast Requests"] = {
      used: fastUsed,
      total: fastLimit,
      remaining: Math.max(0, fastLimit - fastUsed),
      resetAt,
      displayName: "Fast Requests",
      recurring: true,
    };
  }

  return {
    plan,
    quotas,
  };
}
