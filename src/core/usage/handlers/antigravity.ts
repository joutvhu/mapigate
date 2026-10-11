import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime } from "../utils.js";

const ANTIGRAVITY_BASE_URL = "https://daily-cloudcode-pa.googleapis.com";
const USER_AGENT = "AntigravityIDE/0.1.0";

const GROUP_CONFIGS = [
  {
    pattern: /gemini/i,
    weekly: { key: "gemini_weekly", displayName: "Gemini (Weekly)" },
    session: { key: "gemini_session", displayName: "Gemini (5h)" },
  },
  {
    pattern: /claude|gpt/i,
    weekly: { key: "claude_gpt_weekly", displayName: "Claude & GPT (Weekly)" },
    session: { key: "claude_gpt_session", displayName: "Claude & GPT (5h)" },
  },
];

const IMPORTANT_MODELS = [
  "gemini-3.8-flash-high",
  "gemini-3.8-flash-medium",
  "gemini-3.7-flash-high",
  "gemini-3.1-pro-high",
  "claude-sonnet-5-5-high",
  "claude-sonnet-4-6",
  "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium",
];

export async function getAntigravityUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  if (!accessToken) {
    return { plan: "Free", message: "Antigravity access token not available." };
  }

  try {
    let projectId = providerSpecificData?.projectId || null;
    let plan = "Free";

    // 1. Fetch Subscription Info via loadCodeAssist
    try {
      const subRes = await fetch(`${ANTIGRAVITY_BASE_URL}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
          "X-Client-Name": "antigravity",
          "X-Client-Version": "0.1.0",
        },
        body: JSON.stringify({ metadata: { ide: "antigravity" } }),
        signal: AbortSignal.timeout(8000),
      });

      if (subRes.ok) {
        const subData: any = await subRes.json();
        if (subData?.cloudaicompanionProject) {
          projectId = subData.cloudaicompanionProject;
        }
        if (subData?.paidTier?.name || subData?.paidTier?.id) {
          plan = subData.paidTier.name || subData.paidTier.id;
        }
      }
    } catch {}

    const quotas: Record<string, RawQuotaBucket> = {};

    // 2. Fetch Weekly & Session Quota Summary
    try {
      const summaryRes = await fetch(`${ANTIGRAVITY_BASE_URL}/v1internal:retrieveUserQuotaSummary`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
          "X-Client-Name": "antigravity",
          "X-Client-Version": "0.1.0",
        },
        body: JSON.stringify({ ...(projectId ? { project: projectId } : {}) }),
        signal: AbortSignal.timeout(8000),
      });

      if (summaryRes.ok) {
        const summaryData: any = await summaryRes.json();
        const groups = Array.isArray(summaryData.groups)
          ? summaryData.groups
          : Array.isArray(summaryData.quotaSummary?.groups)
          ? summaryData.quotaSummary.groups
          : [];

        for (const group of groups) {
          if (!group || typeof group !== "object") continue;
          const displayName = group.displayName || "";
          const buckets = Array.isArray(group.buckets) ? group.buckets : [];

          for (const bucket of buckets) {
            if (!bucket || typeof bucket !== "object") continue;
            const windowType = String(bucket.window || "").toLowerCase();
            const bucketText = `${bucket.bucketId || ""} ${bucket.displayName || ""}`.toLowerCase();
            const isWeekly = windowType === "weekly" || bucketText.includes("weekly");
            const isSession =
              windowType === "5h" ||
              bucketText.includes("five hour") ||
              bucketText.includes("5h") ||
              bucketText.includes("daily") ||
              windowType === "daily";

            if (!isWeekly && !isSession) continue;
            if (bucket.disabled === true && isWeekly) continue;

            const remainingFraction = bucket.disabled === true ? 0 : Number(bucket.remainingFraction);
            if (!Number.isFinite(remainingFraction)) continue;

            for (const config of GROUP_CONFIGS) {
              if (config.pattern.test(displayName)) {
                const target = isWeekly ? config.weekly : config.session;
                if (quotas[target.key]) break;

                const total = 1000;
                const remaining = Math.round(total * remainingFraction);
                const used = Math.max(0, total - remaining);

                quotas[target.key] = {
                  displayName: target.displayName,
                  used,
                  total,
                  remainingPercentage: remainingFraction * 100,
                  resetAt: parseResetTime(bucket.resetTime),
                  unlimited: false,
                  recurring: true,
                };
                break;
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn("[Antigravity] Weekly summary fetch error:", err.message);
    }

    // 3. Fetch Available Models Quota (5h per-model windows)
    try {
      const modelsRes = await fetch(`${ANTIGRAVITY_BASE_URL}/v1internal:fetchAvailableModels`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
          "X-Client-Name": "antigravity",
          "X-Client-Version": "0.1.0",
        },
        body: JSON.stringify({ ...(projectId ? { project: projectId } : {}) }),
        signal: AbortSignal.timeout(8000),
      });

      if (modelsRes.ok) {
        const modelsData: any = await modelsRes.json();
        if (modelsData?.models && typeof modelsData.models === "object") {
          for (const [modelKey, info] of Object.entries<any>(modelsData.models)) {
            if (!info?.quotaInfo || info.isInternal || !IMPORTANT_MODELS.includes(modelKey)) {
              continue;
            }
            const remainingFraction = info.quotaInfo.remainingFraction || 0;
            const total = 1000;
            const remaining = Math.round(total * remainingFraction);
            const used = Math.max(0, total - remaining);

            quotas[modelKey] = {
              displayName: info.displayName || modelKey,
              used,
              total,
              remainingPercentage: remainingFraction * 100,
              resetAt: parseResetTime(info.quotaInfo.resetTime),
              unlimited: false,
              recurring: true,
            };
          }
        }
      }
    } catch {}

    // Fallback if no specific quotas were fetched
    if (Object.keys(quotas).length === 0) {
      quotas["gemini_session"] = {
        displayName: "Gemini (5h)",
        used: 0,
        total: 1000,
        remainingPercentage: 100,
        resetAt: null,
        unlimited: false,
      };
      quotas["claude_gpt_session"] = {
        displayName: "Claude & GPT (5h)",
        used: 0,
        total: 1000,
        remainingPercentage: 100,
        resetAt: null,
        unlimited: false,
      };
    }

    return {
      plan,
      quotas,
    };
  } catch (error: any) {
    return {
      plan: "Free",
      message: `Antigravity error: ${error.message}`,
    };
  }
}
