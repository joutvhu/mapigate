import type { RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";
import { parseResetTime } from "../../../core/usage/utils.js";
import { CLIENT_METADATA } from "../antigravity/types.js";

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
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (accessToken || "").trim();

  if (!token) {
    return { plan: "Free", message: "Gemini CLI access token not available." };
  }

  try {
    let projectId = normalizeCloudCodeProjectId(providerSpecificData?.projectId);
    let plan = "Free";

    if (!projectId) {
      try {
        const subRes = await fetchFn(`${GEMINI_CLI_BASE_URL}/v1internal:loadCodeAssist`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ metadata: CLIENT_METADATA }),
          signal: AbortSignal.timeout(8000),
        });

        if (subRes.ok) {
          const subData: any = await subRes.json();
          projectId = normalizeCloudCodeProjectId(subData?.cloudaicompanionProject);
          plan = subData?.currentTier?.name || plan;
        }
      } catch {}
    }

    if (!projectId) {
      return {
        plan,
        message:
          "Gemini CLI project ID not available. Reconnect Gemini CLI, or configure a Google Cloud project with Gemini Code Assist access before checking quota.",
      };
    }

    const res = await fetchFn(`${GEMINI_CLI_BASE_URL}/v1internal:retrieveUserQuota`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ project: projectId }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { plan, message: `Gemini CLI quota error (${res.status}).` };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};

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

    return { plan, quotas };
  } catch (error: any) {
    return { plan: "Free", message: `Gemini CLI error: ${error.message}` };
  }
}
