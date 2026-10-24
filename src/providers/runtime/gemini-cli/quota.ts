import type { RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";
import { parseResetTime } from "../../../core/usage/utils.js";
import {
  ANTIGRAVITY_IDE_VERSION,
  ANTIGRAVITY_USER_AGENT,
  ANTIGRAVITY_LOAD_PROJECT_URL,
  ANTIGRAVITY_QUOTA_MODELS_URL,
  CLIENT_METADATA,
  IMPORTANT_MODELS,
} from "../antigravity/types.js";
import { fetchAntigravityWeeklyQuota } from "../antigravity/weekly.js";

export const GEMINI_CLI_BASE_URL = "https://cloudcode-pa.googleapis.com";

export function normalizeCloudCodeProjectId(project: any): string | null {
  if (typeof project === "string") return project.trim() || null;
  if (project && typeof project === "object" && typeof project.id === "string") {
    return project.id.trim() || null;
  }
  return null;
}

export async function getGeminiCliUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>,
  options?: { fetchFn?: typeof fetch; force?: boolean }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (accessToken || "").trim();

  if (!token) {
    return { plan: "Free", message: "Gemini CLI access token not available." };
  }

  try {
    let projectId = normalizeCloudCodeProjectId(providerSpecificData?.projectId);
    let plan = "Free";
    let isFreeTier = true;

    // 1. Load Code Assist metadata to get real project ID & tier
    try {
      const subRes = await fetchFn(ANTIGRAVITY_LOAD_PROJECT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": ANTIGRAVITY_USER_AGENT,
          "Content-Type": "application/json",
          "X-Client-Name": "antigravity",
          "X-Client-Version": ANTIGRAVITY_IDE_VERSION,
        },
        body: JSON.stringify({ metadata: CLIENT_METADATA, mode: 1 }),
        signal: AbortSignal.timeout(8000),
      });

      if (subRes.ok) {
        const subData: any = await subRes.json();
        const detectedProject = normalizeCloudCodeProjectId(subData?.cloudaicompanionProject);
        if (detectedProject) projectId = detectedProject;

        const paidTierId = subData?.paidTier?.id;
        isFreeTier = !paidTierId || paidTierId === "free-tier";
        plan = subData?.currentTier?.name || subData?.paidTier?.name || (isFreeTier ? "Free" : "Standard");
      }
    } catch {}

    const quotas: Record<string, RawQuotaBucket> = {};

    // 2. Fetch retrieveUserQuotaSummary (Gemini Weekly & Session)
    try {
      const weeklyQuotas = await fetchAntigravityWeeklyQuota(token, projectId, options);
      if (weeklyQuotas.gemini_weekly) {
        quotas["gemini_weekly"] = weeklyQuotas.gemini_weekly;
      }
      if (weeklyQuotas.gemini_session) {
        quotas["gemini_session"] = weeklyQuotas.gemini_session;
      }
    } catch {}

    // 3. If Paid/Pro Tier, also try fetchAvailableModels for per-model breakdown
    if (!isFreeTier && projectId) {
      try {
        const modelsRes = await fetchFn(ANTIGRAVITY_QUOTA_MODELS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": ANTIGRAVITY_USER_AGENT,
            "Content-Type": "application/json",
            "X-Client-Name": "antigravity",
            "X-Client-Version": ANTIGRAVITY_IDE_VERSION,
          },
          body: JSON.stringify({ project: projectId }),
          signal: AbortSignal.timeout(8000),
        });

        if (modelsRes.ok) {
          const data: any = await modelsRes.json();
          if (data?.models && typeof data.models === "object") {
            for (const [modelKey, info] of Object.entries<any>(data.models)) {
              if (!info?.quotaInfo || info.isInternal || !IMPORTANT_MODELS.includes(modelKey)) continue;
              const remainingFraction = info.quotaInfo.remainingFraction ?? 0;
              const total = 1000;
              const remaining = Math.round(total * remainingFraction);
              quotas[modelKey] = {
                displayName: info.displayName || modelKey,
                used: Math.max(0, total - remaining),
                total,
                remaining,
                remainingPercentage: remainingFraction * 100,
                resetAt: parseResetTime(info.quotaInfo.resetTime),
                unlimited: false,
                recurring: true,
              };
            }
          }
        }
      } catch {}
    }

    // 4. Fallback to legacy retrieveUserQuota if no summary buckets were found
    if (Object.keys(quotas).length === 0 && projectId) {
      try {
        const res = await fetchFn(`${GEMINI_CLI_BASE_URL}/v1internal:retrieveUserQuota`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": ANTIGRAVITY_USER_AGENT,
            "Content-Type": "application/json",
            "X-Client-Name": "antigravity",
            "X-Client-Version": ANTIGRAVITY_IDE_VERSION,
          },
          body: JSON.stringify({ project: projectId }),
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data: any = await res.json();
          if (Array.isArray(data.buckets)) {
            for (const bucket of data.buckets) {
              if (!bucket.modelId || bucket.remainingFraction == null) continue;
              const remainingFraction = Number(bucket.remainingFraction) || 0;
              const total = 1000;
              const remaining = Math.round(total * remainingFraction);
              const used = Math.max(0, total - remaining);

              quotas[bucket.modelId] = {
                displayName: bucket.displayName || bucket.modelId,
                used,
                total,
                remaining,
                remainingPercentage: Math.max(0, Math.min(100, Math.round(remainingFraction * 100))),
                resetAt: parseResetTime(bucket.resetTime),
                unlimited: false,
                recurring: true,
              };
            }
          }
        }
      } catch {}
    }

    if (Object.keys(quotas).length > 0) {
      return { plan, quotas };
    }

    return {
      plan,
      message: "No quota limits reported for this Google account.",
      quotas: {},
    };
  } catch (error: any) {
    return { plan: "Free", message: `Gemini CLI error: ${error.message}` };
  }
}
