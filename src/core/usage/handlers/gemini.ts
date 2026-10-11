import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime } from "../utils.js";

const GEMINI_CLI_BASE_URL = "https://cloudcode-pa.googleapis.com";

export async function getGeminiUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  if (!accessToken) {
    return { plan: "Free", message: "Gemini access token not available." };
  }

  try {
    let projectId = providerSpecificData?.projectId || null;
    let plan = "Free";

    if (!projectId) {
      try {
        const subRes = await fetch(`${GEMINI_CLI_BASE_URL}/v1internal:loadCodeAssist`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ metadata: { ide: "gemini-cli" } }),
          signal: AbortSignal.timeout(8000),
        });
        if (subRes.ok) {
          const subData: any = await subRes.json();
          projectId = subData?.cloudaicompanionProject || null;
          plan = subData?.currentTier?.name || plan;
        }
      } catch {}
    }

    if (!projectId) {
      return {
        plan,
        message: "Gemini Cloud project ID not found. Configure a Google Cloud project.",
      };
    }

    const res = await fetch(`${GEMINI_CLI_BASE_URL}/v1internal:retrieveUserQuota`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ project: projectId }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { plan, message: `Gemini quota API error (${res.status}).` };
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
          remainingPercentage: remainingFraction * 100,
          resetAt: parseResetTime(bucket.resetTime),
          unlimited: false,
        };
      }
    }

    return { plan, quotas };
  } catch (error: any) {
    return { plan: "Free", message: `Gemini CLI error: ${error.message}` };
  }
}
