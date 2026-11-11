import type { RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";
import { parseResetTime } from "../../../core/usage/utils.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";

export const OPENCODE_GO_USAGE_URL = "https://opencode.ai/inference/go/v1/usage";

const QUOTA_NAMES: Record<string, string> = {
  rolling: "Rolling",
  weekly: "Weekly",
  monthly: "Monthly",
};

function parsePercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function getOpenCodeGoUsage(
  apiKey?: string | null,
  options?: { proxyUrl?: string; fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return {
      plan: "OpenCode Go",
      message: "OpenCode Go API key not available. Add a key to view usage.",
    };
  }

  try {
    const headers = {
      Authorization: `Bearer ${apiKey.trim()}`,
      Accept: "application/json",
    };

    const response = options?.fetchFn
      ? await options.fetchFn(OPENCODE_GO_USAGE_URL, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(8000),
        })
      : await executeUpstreamFetch(
          OPENCODE_GO_USAGE_URL,
          {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(8000),
          },
          options?.proxyUrl
        );

    if (response.status === 401) {
      return {
        plan: "OpenCode Go",
        message: "OpenCode Go authentication failed. Check the API key.",
      };
    }

    if (response.status === 403) {
      const err: any = await response.json().catch(() => null);
      const subscriptionRequired = err?.error?.type === "EntitlementError";
      return {
        plan: "OpenCode Go",
        message: subscriptionRequired
          ? "OpenCode Go subscription required for this API key."
          : "OpenCode Go access forbidden for this API key.",
      };
    }

    if (!response.ok) {
      return {
        plan: "OpenCode Go",
        message: `OpenCode Go usage API error (${response.status}).`,
      };
    }

    const data: any = await response.json().catch(() => null);
    if (!data?.usage || typeof data.usage !== "object") {
      return {
        plan: "OpenCode Go",
        message: "OpenCode Go usage response did not contain quota data.",
      };
    }

    const quotas: Record<string, RawQuotaBucket> = {};
    for (const [period, name] of Object.entries(QUOTA_NAMES)) {
      const quota = data.usage[period];
      if (!quota || typeof quota !== "object") continue;
      const percent = parsePercent(quota.percent);
      if (percent === null) continue;
      const used = Math.max(0, Math.min(100, percent));
      const remaining = Math.max(0, 100 - used);
      quotas[name] = {
        displayName: name,
        used,
        total: 100,
        remaining,
        remainingPercentage: remaining,
        resetAt: parseResetTime(quota.resetsAt),
        unlimited: false,
        recurring: true,
      };
    }

    if (Object.keys(quotas).length === 0) {
      return {
        plan: "OpenCode Go",
        message: "OpenCode Go usage response did not contain valid quota data.",
      };
    }

    return { plan: "OpenCode Go", quotas };
  } catch (error: any) {
    return {
      plan: "OpenCode Go",
      message: `OpenCode Go error: ${error?.message || String(error)}`,
    };
  }
}
