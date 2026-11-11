import type { RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";
import { parseResetTime } from "../../../core/usage/utils.js";
import {
  ANTIGRAVITY_IDE_VERSION,
  ANTIGRAVITY_USER_AGENT,
  ANTIGRAVITY_LOAD_PROJECT_URL,
  CLIENT_METADATA,
} from "../antigravity/types.js";
import { fetchAntigravityWeeklyQuota } from "../antigravity/weekly.js";
import { getAntigravityUsage } from "../antigravity/quota.js";

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
  const token = (accessToken || "").trim();


  if (!token) {
    return { plan: "Free", message: "Gemini CLI access token not available." };
  }

  if (token.startsWith("AIza")) {
    return {
      plan: "Gemini API",
      message: "Gemini API key connected. Quota tracking requires Google OAuth (Gemini CLI / Cloud Code).",
    };
  }

  // 1. First, attempt full Antigravity / Cloud Code quota resolution (weekly + session 5h + models)
  try {
    const agRes = await getAntigravityUsage(token, providerSpecificData, options);
    if (agRes && agRes.quotas && Object.keys(agRes.quotas).length > 0) {
      return agRes;
    }
  } catch {}

  // 2. Fallback to direct loadCodeAssist + retrieveUserQuota if needed
  const fetchFn = options?.fetchFn || globalThis.fetch;
  try {
    let projectId = normalizeCloudCodeProjectId(providerSpecificData?.projectId);
    let plan = "Free";

    if (!projectId) {
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
          projectId = normalizeCloudCodeProjectId(subData?.cloudaicompanionProject);
          plan = subData?.currentTier?.name || subData?.paidTier?.name || plan;
        }
      } catch {}
    }

    const quotas: Record<string, RawQuotaBucket> = {};

    try {
      const weekly = await fetchAntigravityWeeklyQuota(token, projectId, options);
      if (weekly && Object.keys(weekly).length > 0) {
        return { plan, quotas: weekly };
      }
    } catch {}

    if (projectId) {
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

export const getGeminiUsage = getGeminiCliUsage;
