import type { RawProviderQuotaResult, RawQuotaBucket } from "../types.js";
import { parseResetTime, toFiniteNumber } from "../utils.js";

const MINIMAX_REMAINS_URL = "https://api.minimax.io/v1/token_plan/remains";
const MINIMAX_CN_REMAINS_URL = "https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains";

export async function getMiniMaxUsage(
  apiKey: string,
  providerId = "minimax"
): Promise<RawProviderQuotaResult> {
  if (!apiKey?.trim()) {
    return { plan: "MiniMax", message: "MiniMax API key not available." };
  }

  const url = providerId === "minimax-cn" ? MINIMAX_CN_REMAINS_URL : MINIMAX_REMAINS_URL;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { plan: "MiniMax", message: `MiniMax usage API error (${res.status}).` };
    }

    const data: any = await res.json();
    const quotas: Record<string, RawQuotaBucket> = {};

    const modelList = Array.isArray(data?.model_remains)
      ? data.model_remains
      : Array.isArray(data?.data?.model_remains)
      ? data.data.model_remains
      : [];

    for (const m of modelList) {
      const name = m.model_name || m.modelName || "MiniMax";
      const total = toFiniteNumber(m.current_interval_total_count, 100);
      const remaining = toFiniteNumber(m.current_interval_remaining_count, total);
      const used = Math.max(0, total - remaining);
      const resetAt = parseResetTime(m.current_interval_end_time || m.end_time);

      quotas[name.toLowerCase().replace(/[^a-z0-9]/g, "_")] = {
        displayName: name,
        used,
        total,
        remaining,
        remainingPercentage: total > 0 ? Math.round((remaining / total) * 100) : 0,
        resetAt,
        unlimited: false,
        recurring: true,
      };
    }

    return {
      plan: "MiniMax Coding Plan",
      quotas,
    };
  } catch (err: any) {
    return { plan: "MiniMax", message: `MiniMax error: ${err.message}` };
  }
}
