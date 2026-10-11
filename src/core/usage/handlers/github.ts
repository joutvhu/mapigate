import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime } from "../utils.js";

const GITHUB_COPILOT_USER_URL = "https://api.github.com/copilot_internal/user";

export async function getGitHubUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  const token = providerSpecificData?.githubAccessToken || accessToken;
  if (!token) {
    return { plan: "Copilot", message: "GitHub access token not available." };
  }

  try {
    const res = await fetch(GITHUB_COPILOT_USER_URL, {
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

    if (!res.ok) {
      return {
        plan: "Copilot",
        message: `GitHub Copilot API error (${res.status}).`,
      };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};

    // 1. Paid Plan format with quota_snapshots
    if (data.quota_snapshots) {
      const snapshots = data.quota_snapshots;
      const resetAt = parseResetTime(data.quota_reset_date);

      const formatSnapshot = (s: any, label: string): RawQuotaBucket => {
        if (!s) {
          return {
            displayName: label,
            used: 0,
            total: 0,
            remainingPercentage: 100,
            resetAt,
            unlimited: true,
          };
        }
        const total = s.entitlement || 0;
        const remaining = s.remaining || 0;
        const used = Math.max(0, total - remaining);
        const fraction = total > 0 ? (remaining / total) * 100 : 100;

        return {
          displayName: label,
          used,
          total,
          remaining,
          remainingPercentage: Math.round(fraction),
          resetAt,
          unlimited: Boolean(s.unlimited),
          recurring: true,
        };
      };

      if (snapshots.chat) {
        quotas["chat"] = formatSnapshot(snapshots.chat, "Chat Messages");
      }
      if (snapshots.completions) {
        quotas["completions"] = formatSnapshot(snapshots.completions, "Code Completions");
      }
      if (snapshots.premium_interactions) {
        quotas["premium_interactions"] = formatSnapshot(
          snapshots.premium_interactions,
          "Premium Interactions"
        );
      }

      return {
        plan: data.copilot_plan || "Copilot Individual",
        quotas,
      };
    }

    // 2. Free / Limited format
    if (data.monthly_quotas || data.limited_user_quotas) {
      const monthly = data.monthly_quotas || {};
      const usedMap = data.limited_user_quotas || {};
      const resetAt = parseResetTime(data.limited_user_reset_date);

      const chatTotal = monthly.chat || 0;
      const chatUsed = usedMap.chat || 0;
      const chatRemaining = Math.max(0, chatTotal - chatUsed);

      const compTotal = monthly.completions || 0;
      const compUsed = usedMap.completions || 0;
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
      message: "GitHub Copilot connected, but no quota snapshot format recognized.",
    };
  } catch (err: any) {
    return {
      plan: "Copilot",
      message: `Failed to fetch GitHub Copilot usage: ${err.message}`,
    };
  }
}
