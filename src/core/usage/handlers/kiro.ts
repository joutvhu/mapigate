import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime } from "../utils.js";

export const CW_HOST = "https://codewhisperer.us-east-1.amazonaws.com";
export const Q_HOST = "https://q.us-east-1.amazonaws.com";
export const LIMITS_PATH = "/getUsageLimits";

export function parseKiroQuotaData(data: any): RawProviderQuotaResult {
  const quotas: Record<string, RawQuotaBucket> = {};
  const usageList = Array.isArray(data?.usageBreakdownList) ? data.usageBreakdownList : [];
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
}

export async function getKiroUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (accessToken || "").trim();

  if (!token) {
    return { plan: "Kiro", message: "Kiro access token not available." };
  }

  const authMethod = providerSpecificData?.authMethod || "builder-id";
  const isApiKey = authMethod === "api_key";
  const isExternalIdp = authMethod === "external_idp";

  const apiKeyHeaders: Record<string, string> = isApiKey ? { tokentype: "API_KEY" } : {};
  const externalIdpHeaders: Record<string, string> = isExternalIdp ? { TokenType: "EXTERNAL_IDP" } : {};
  const profileArn = providerSpecificData?.profileArn || "";

  const attempts = [
    {
      name: "codewhisperer-get",
      run: async () =>
        fetchFn(
          `${CW_HOST}${LIMITS_PATH}?isEmailRequired=true&origin=AI_EDITOR&resourceType=AGENTIC_REQUEST`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
              "x-amz-user-agent": "aws-sdk-js/1.0.0 KiroIDE",
              "user-agent": "aws-sdk-js/1.0.0 KiroIDE",
              ...apiKeyHeaders,
              ...externalIdpHeaders,
            },
            signal: AbortSignal.timeout(6000),
          }
        ),
    },
    {
      name: "codewhisperer-post",
      run: async () =>
        fetchFn(CW_HOST, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-amz-json-1.0",
            "x-amz-target": "AmazonCodeWhispererService.GetUsageLimits",
            Accept: "application/json",
            ...apiKeyHeaders,
            ...externalIdpHeaders,
          },
          body: JSON.stringify({
            origin: "AI_EDITOR",
            ...(profileArn ? { profileArn } : {}),
            resourceType: "AGENTIC_REQUEST",
          }),
          signal: AbortSignal.timeout(6000),
        }),
    },
    {
      name: "q-get",
      run: async () => {
        const params = new URLSearchParams({
          origin: "AI_EDITOR",
          ...(profileArn ? { profileArn } : {}),
          resourceType: "AGENTIC_REQUEST",
        });
        return fetchFn(`${Q_HOST}${LIMITS_PATH}?${params.toString()}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "x-amz-user-agent": "aws-sdk-js/1.0.0 KiroIDE",
            "user-agent": "aws-sdk-js/1.0.0 KiroIDE",
            ...apiKeyHeaders,
            ...externalIdpHeaders,
          },
          signal: AbortSignal.timeout(6000),
        });
      },
    },
    {
      name: "q-post",
      run: async () =>
        fetchFn(Q_HOST, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-amz-json-1.0",
            "x-amz-target": "AmazonCodeWhispererService.GetUsageLimits",
            Accept: "application/json",
            ...apiKeyHeaders,
            ...externalIdpHeaders,
          },
          body: JSON.stringify({
            origin: "AI_EDITOR",
            ...(profileArn ? { profileArn } : {}),
            resourceType: "AGENTIC_REQUEST",
          }),
          signal: AbortSignal.timeout(6000),
        }),
    },
  ];

  let sawAuthError = false;
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const response = await attempt.run();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          sawAuthError = true;
        }
        errors.push(`${attempt.name}:${response.status}`);
        continue;
      }

      const data = await response.json();
      return parseKiroQuotaData(data);
    } catch (err: any) {
      errors.push(`${attempt.name}:${err.message}`);
    }
  }

  if (sawAuthError && authMethod === "idc") {
    return {
      plan: "Kiro",
      message:
        "Kiro quota API is unavailable for the current AWS IAM Identity Center session. Chat may still work.",
    };
  }

  if (sawAuthError && (authMethod === "google" || authMethod === "github")) {
    return {
      plan: "Kiro",
      message: "Kiro quota API authentication expired. Chat may still work.",
    };
  }

  if (sawAuthError) {
    return {
      plan: "Kiro",
      message: "Kiro quota API rejected the current token. Chat may still work.",
    };
  }

  const fallbackMessage =
    errors.length > 0
      ? `Unable to fetch Kiro usage right now (${errors[errors.length - 1]}).`
      : "Unable to fetch Kiro usage right now.";

  return {
    plan: "Kiro",
    message: fallbackMessage,
  };
}
