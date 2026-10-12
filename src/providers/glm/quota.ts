import type { RawProviderQuotaResult, RawQuotaBucket } from "../../core/usage/types.js";
import { parseResetTime } from "../../core/usage/utils.js";

export const GLM_QUOTA_URLS = {
  international: "https://api.z.ai/api/monitor/usage/quota/limit",
  china: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
};

export function parseGlmQuotaResponse(json: any): {
  plan: string;
  quotas: Record<string, RawQuotaBucket>;
} {
  const data = json?.data && typeof json.data === "object" ? json.data : {};
  const limits = Array.isArray(data.limits) ? data.limits : [];
  const quotas: Record<string, RawQuotaBucket> = {};

  for (const limit of limits) {
    if (!limit || (limit.type !== "TOKENS_LIMIT" && limit.type !== "CREDIT_LIMIT")) continue;
    const usedPercent = Math.max(0, Math.min(100, Number(limit.percentage) || 0));
    const resetMs = Number(limit.nextResetTime) || 0;
    const remaining = Math.max(0, 100 - usedPercent);
    const resetAt = resetMs > 0 ? parseResetTime(resetMs) : null;

    let key = "session";
    let displayName = "Session";

    if (limit.unit === 3) {
      key = `session_${limit.number}h`;
      displayName = `Session (${limit.number}h)`;
    } else if (limit.unit === 6) {
      key = "weekly";
      displayName = "Weekly (7d)";
    } else if (limit.type === "TOKENS_LIMIT") {
      key = "tokens";
      displayName = "Tokens";
    } else {
      key = `limit_${limit.number || "quota"}`;
      displayName = `Limit (${limit.number || "Quota"})`;
    }

    quotas[key] = {
      displayName,
      used: usedPercent,
      total: 100,
      remaining,
      remainingPercentage: remaining,
      resetAt,
      unlimited: false,
      recurring: true,
    };
  }

  const levelRaw = typeof data.level === "string" ? data.level : "";
  const plan = levelRaw
    ? levelRaw.charAt(0).toUpperCase() + levelRaw.slice(1).toLowerCase()
    : "GLM Coding Plan";

  return { plan, quotas };
}

export async function getGlmUsage(
  apiKey: string,
  providerId = "glm",
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (apiKey || "").trim();

  if (!token) {
    return { plan: "GLM", message: "GLM API key not available." };
  }

  const isCn = providerId.toLowerCase().includes("cn");
  const quotaUrl = isCn ? GLM_QUOTA_URLS.china : GLM_QUOTA_URLS.international;
  const defaultPlan = isCn ? "GLM CN" : "GLM";

  try {
    const res = await fetchFn(quotaUrl, {
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
        message: "GLM API key invalid or expired.",
      };
    }

    if (!res.ok) {
      return {
        plan: defaultPlan,
        message: `GLM quota API error (${res.status}).`,
      };
    }

    const json = await res.json().catch(() => null);
    if (!json || typeof json !== "object") {
      return { plan: defaultPlan, message: "GLM quota response was not JSON." };
    }

    const { plan, quotas } = parseGlmQuotaResponse(json);

    if (Object.keys(quotas).length === 0) {
      return {
        plan: plan || defaultPlan,
        message: "GLM connected. No quota limits data returned.",
      };
    }

    return {
      plan: plan || defaultPlan,
      quotas,
    };
  } catch (err: any) {
    return {
      plan: defaultPlan,
      message: `GLM quota check failed: ${err.message}`,
    };
  }
}
