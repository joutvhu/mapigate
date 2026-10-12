import type { RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";
import { parseResetTime } from "../../../core/usage/utils.js";

export const GITHUB_COPILOT_USER_URL = "https://api.github.com/copilot_internal/user";

export function formatGitHubQuotaSnapshot(
  quota: any,
  label: string,
  resetAt: number | null
): RawQuotaBucket {
  if (!quota) {
    return {
      displayName: label,
      used: 0,
      total: 0,
      remaining: 0,
      remainingPercentage: 100,
      resetAt,
      unlimited: true,
      recurring: true,
    };
  }

  const total = Number(quota.entitlement) || 0;
  const remaining = Number(quota.remaining) || 0;
  const used = Math.max(0, total - remaining);
  const remainingPercentage =
    total > 0 ? Math.max(0, Math.min(100, Math.round((remaining / total) * 100))) : quota.unlimited ? 100 : 0;

  return {
    displayName: label,
    used,
    total,
    remaining,
    remainingPercentage,
    resetAt,
    unlimited: Boolean(quota.unlimited),
    recurring: true,
  };
}

export async function getGitHubUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (providerSpecificData?.githubAccessToken || accessToken || "").trim();

  if (!token) {
    return { plan: "Copilot", message: "GitHub access token not available." };
  }

  if (token.startsWith("tid=") && !providerSpecificData?.githubAccessToken) {
    return {
      plan: "Copilot",
      message: "GitHub OAuth token required for quota tracking. Please re-authenticate GitHub Copilot.",
    };
  }

  try {
    const res = await fetchFn(GITHUB_COPILOT_USER_URL, {
      method: "GET",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
        "X-GitHub-Api-Version": "2025-04-01",
        "User-Agent": "GitHubCopilot/1.0.0",
        "Editor-Version": "vscode/1.100.0",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        plan: "Copilot",
        message: "GitHub authentication expired or unauthorized for Copilot quota.",
      };
    }

    if (!res.ok) {
      return {
        plan: "Copilot",
        message: `GitHub Copilot API error (${res.status}).`,
      };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};

    if (data.quota_snapshots) {
      const snapshots = data.quota_snapshots;
      const resetAt = parseResetTime(data.quota_reset_date);

      if (snapshots.chat) {
        quotas["chat"] = formatGitHubQuotaSnapshot(snapshots.chat, "Chat Messages", resetAt);
      }
      if (snapshots.completions) {
        quotas["completions"] = formatGitHubQuotaSnapshot(
          snapshots.completions,
          "Code Completions",
          resetAt
        );
      }
      if (snapshots.premium_interactions) {
        quotas["premium_interactions"] = formatGitHubQuotaSnapshot(
          snapshots.premium_interactions,
          "Premium Interactions",
          resetAt
        );
      }

      return {
        plan: data.copilot_plan || "Copilot Individual",
        quotas,
      };
    }

    if (data.monthly_quotas || data.limited_user_quotas) {
      const monthly = data.monthly_quotas || {};
      const usedMap = data.limited_user_quotas || {};
      const resetAt = parseResetTime(data.limited_user_reset_date);

      const chatTotal = Number(monthly.chat) || 0;
      const chatUsed = Number(usedMap.chat) || 0;
      const chatRemaining = Math.max(0, chatTotal - chatUsed);

      const compTotal = Number(monthly.completions) || 0;
      const compUsed = Number(usedMap.completions) || 0;
      const compRemaining = Math.max(0, compTotal - compUsed);

      quotas["chat"] = {
        displayName: "Chat Messages",
        used: chatUsed,
        total: chatTotal,
        remaining: chatRemaining,
        remainingPercentage: chatTotal > 0 ? Math.round((chatRemaining / chatTotal) * 100) : 0,
        resetAt,
        unlimited: false,
        recurring: true,
      };

      quotas["completions"] = {
        displayName: "Code Completions",
        used: compUsed,
        total: compTotal,
        remaining: compRemaining,
        remainingPercentage: compTotal > 0 ? Math.round((compRemaining / compTotal) * 100) : 0,
        resetAt,
        unlimited: false,
        recurring: true,
      };

      return {
        plan: data.copilot_plan || data.access_type_sku || "Copilot Free",
        quotas,
      };
    }

    return {
      plan: data.copilot_plan || "Copilot",
      message: "GitHub Copilot connected. Unable to parse quota data.",
    };
  } catch (err: any) {
    return {
      plan: "Copilot",
      message: `Failed to fetch GitHub Copilot usage: ${err.message}`,
    };
  }
}
