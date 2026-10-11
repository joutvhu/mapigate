import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime } from "../utils.js";

const CW_LIMITS_URL =
  "https://codewhisperer.us-east-1.amazonaws.com/getUsageLimits?isEmailRequired=true&origin=AI_EDITOR&resourceType=AGENTIC_REQUEST";

export async function getKiroUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  if (!accessToken) {
    return { plan: "Kiro", message: "Kiro access token not available." };
  }

  const authMethod = providerSpecificData?.authMethod || "builder-id";
  const isApiKey = authMethod === "api_key";
  const isExternalIdp = authMethod === "external_idp";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "x-amz-user-agent": "aws-sdk-js/1.0.0 KiroIDE",
    "user-agent": "aws-sdk-js/1.0.0 KiroIDE",
  };
  if (isApiKey) {
    headers["tokentype"] = "API_KEY";
  }
  if (isExternalIdp) {
    headers["TokenType"] = "EXTERNAL_IDP";
  }

  try {
    const res = await fetch(CW_LIMITS_URL, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        plan: "Kiro",
        message: `Kiro API returned status ${res.status}.`,
      };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};
    const usageList = data?.usageBreakdownList || [];
    const resetAt = parseResetTime(data?.nextDateReset || data?.resetDate);

    for (const breakdown of usageList) {
      const resourceType = String(breakdown?.resourceType || "agentic_request").toLowerCase();
      const used = Number(breakdown?.currentUsageWithPrecision) || 0;
      const total = Number(breakdown?.usageLimitWithPrecision) || 0;
      const remaining = Math.max(0, total - used);
      const remainingPercentage = total > 0 ? Math.round((remaining / total) * 100) : 0;

      const label =
        resourceType === "agentic_request"
          ? "Agentic Requests"
          : resourceType
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());

      quotas[resourceType] = {
        displayName: label,
        used,
        total,
        remaining,
        remainingPercentage,
        resetAt,
        unlimited: false,
        recurring: true,
      };

      if (breakdown.freeTrialInfo) {
        const ftUsed = Number(breakdown.freeTrialInfo.currentUsageWithPrecision) || 0;
        const ftTotal = Number(breakdown.freeTrialInfo.usageLimitWithPrecision) || 0;
        const ftRemaining = Math.max(0, ftTotal - ftUsed);
        const ftExpiry = parseResetTime(breakdown.freeTrialInfo.freeTrialExpiry || resetAt);

        quotas[`${resourceType}_freetrial`] = {
          displayName: `${label} (Free Trial)`,
          used: ftUsed,
          total: ftTotal,
          remaining: ftRemaining,
          remainingPercentage: ftTotal > 0 ? Math.round((ftRemaining / ftTotal) * 100) : 0,
          resetAt: ftExpiry,
          unlimited: false,
          recurring: false,
        };
      }
    }

    if (Object.keys(quotas).length === 0) {
      quotas["agentic_request"] = {
        displayName: "Agentic Requests",
        used: 0,
        total: 500,
        remaining: 500,
        remainingPercentage: 100,
        resetAt,
        unlimited: false,
        recurring: true,
      };
    }

    return {
      plan: data?.subscriptionInfo?.subscriptionTitle || "Kiro Pro",
      quotas,
    };
  } catch (err: any) {
    return {
      plan: "Kiro",
      message: `Failed to fetch Kiro usage: ${err.message}`,
    };
  }
}
