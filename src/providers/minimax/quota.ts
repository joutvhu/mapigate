import type { RawProviderQuotaResult, RawQuotaBucket } from "../../core/usage/types.js";
import { parseResetTime, toFiniteNumber } from "../../core/usage/utils.js";

export const MINIMAX_URLS = {
  minimax: [
    "https://www.minimax.io/v1/token_plan/remains",
    "https://api.minimax.io/v1/api/openplatform/coding_plan/remains",
  ],
  "minimax-cn": [
    "https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains",
    "https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains",
  ],
};

function getField(model: any, snakeKey: string, camelKey: string): any {
  if (!model || typeof model !== "object") return null;
  return model[snakeKey] ?? model[camelKey] ?? null;
}

export function formatMiniMaxQuotaName(model: any): string {
  const rawName = String(getField(model, "model_name", "modelName") || "").trim();
  if (!rawName) return "MiniMax";

  if (rawName === "MiniMax-M*" || rawName === "general") return "M-series";

  return rawName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .replace(/\bTo\b/g, "to")
    .replace(/\bTts\b/g, "TTS")
    .replace(/\bHd\b/g, "HD");
}

function getProvidedPercent(model: any, snakeKey: string, camelKey: string): number | null {
  const raw = getField(model, snakeKey, camelKey);
  if (raw === null || raw === undefined) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : null;
}

function getResetAt(
  model: any,
  capturedAtMs: number,
  remainsSnake: string,
  remainsCamel: string,
  endSnake: string,
  endCamel: string
): number | null {
  const remainsMs = Number(getField(model, remainsSnake, remainsCamel)) || 0;
  if (remainsMs > 0) return capturedAtMs + remainsMs;
  return parseResetTime(getField(model, endSnake, endCamel));
}

function buildQuotaBucket(
  total: number,
  count: number,
  resetAt: number | null,
  countMeansRemaining: boolean,
  providedPercent: number | null,
  label: string
): RawQuotaBucket {
  const safeTotal = Math.max(0, total);
  const used = countMeansRemaining
    ? Math.max(0, safeTotal - count)
    : Math.min(safeTotal, Math.max(0, count));
  const remaining = Math.max(0, safeTotal - used);

  let remainingPercentage = 0;
  if (providedPercent !== null) {
    remainingPercentage = Math.max(0, Math.min(100, Math.round(providedPercent)));
  } else if (safeTotal > 0) {
    remainingPercentage = Math.max(0, Math.min(100, Math.round((remaining / safeTotal) * 100)));
  }

  return {
    displayName: label,
    used,
    total: safeTotal,
    remaining,
    remainingPercentage,
    resetAt,
    unlimited: false,
    recurring: true,
  };
}

export async function getMiniMaxUsage(
  apiKey: string,
  providerId = "minimax",
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (apiKey || "").trim();

  if (!token) {
    return { plan: "MiniMax", message: "MiniMax API key not available." };
  }

  const isCn = providerId.toLowerCase().includes("cn");
  const urls = isCn ? MINIMAX_URLS["minimax-cn"] : MINIMAX_URLS["minimax"];
  let lastErrorMessage = "";

  for (let i = 0; i < urls.length; i++) {
    const usageUrl = urls[i];
    const countMeansRemaining = usageUrl.includes("/coding_plan/remains");

    try {
      const res = await fetchFn(usageUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });

      const rawText = await res.text();
      let payload: any = {};
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = {};
      }

      const baseResp = payload?.base_resp ?? payload?.baseResp ?? {};
      const statusCode = Number(baseResp.status_code ?? baseResp.statusCode) || 0;
      const statusMsg = String(baseResp.status_msg ?? baseResp.statusMsg ?? "").trim();
      const combined = `${statusMsg} ${rawText}`.toLowerCase();

      if (
        res.status === 401 ||
        res.status === 403 ||
        statusCode === 1004 ||
        /token plan|coding plan|invalid api key|invalid key|unauthorized/i.test(combined)
      ) {
        return {
          plan: "MiniMax",
          message: "MiniMax API key invalid or inactive. Use an active Token/Coding Plan key.",
        };
      }

      if (!res.ok) {
        lastErrorMessage = `MiniMax usage endpoint error (${res.status})`;
        if (i < urls.length - 1) continue;
        return { plan: "MiniMax", message: lastErrorMessage };
      }

      if (statusCode !== 0) {
        if (i < urls.length - 1) continue;
        return { plan: "MiniMax", message: statusMsg || "Upstream quota API error" };
      }

      const modelRemains = payload?.model_remains ?? payload?.modelRemains ?? payload?.data?.model_remains;
      const allModels = Array.isArray(modelRemains) ? modelRemains : [];

      if (allModels.length === 0) {
        if (i < urls.length - 1) continue;
        return { plan: "MiniMax Coding Plan", message: "MiniMax connected. No quota data returned." };
      }

      const capturedAtMs = Date.now();
      const quotas: Record<string, RawQuotaBucket> = {};

      for (const m of allModels) {
        const displayName = formatMiniMaxQuotaName(m);
        const modelKey = displayName.toLowerCase().replace(/[^a-z0-9]/g, "_");

        const sessionTotal = Math.max(
          0,
          Number(getField(m, "current_interval_total_count", "currentIntervalTotalCount")) || 0
        );
        const sessionPercent = getProvidedPercent(
          m,
          "current_interval_remaining_percent",
          "currentIntervalRemainingPercent"
        );

        if (sessionTotal > 0 || sessionPercent !== null) {
          let effTotal = sessionTotal;
          let effCount = Math.max(
            0,
            Number(getField(m, "current_interval_usage_count", "currentIntervalUsageCount")) || 0
          );

          if (sessionTotal <= 0 && sessionPercent !== null) {
            effTotal = 100;
            effCount = countMeansRemaining
              ? Math.round(100 * (sessionPercent / 100))
              : Math.round(100 * (1 - sessionPercent / 100));
          }

          const resetAt = getResetAt(
            m,
            capturedAtMs,
            "remains_time",
            "remainsTime",
            "end_time",
            "endTime"
          );

          quotas[`${modelKey}_5h`] = buildQuotaBucket(
            effTotal,
            effCount,
            resetAt,
            countMeansRemaining,
            sessionPercent,
            `${displayName} (5h)`
          );
        }

        const weeklyTotal = Math.max(
          0,
          Number(getField(m, "current_weekly_total_count", "currentWeeklyTotalCount")) || 0
        );
        const weeklyPercent = getProvidedPercent(
          m,
          "current_weekly_remaining_percent",
          "currentWeeklyRemainingPercent"
        );

        if (weeklyTotal > 0 || weeklyPercent !== null) {
          let effTotal = weeklyTotal;
          let effCount = Math.max(
            0,
            Number(getField(m, "current_weekly_usage_count", "currentWeeklyUsageCount")) || 0
          );

          if (weeklyTotal <= 0 && weeklyPercent !== null) {
            effTotal = 100;
            effCount = countMeansRemaining
              ? Math.round(100 * (weeklyPercent / 100))
              : Math.round(100 * (1 - weeklyPercent / 100));
          }

          const resetAt = getResetAt(
            m,
            capturedAtMs,
            "weekly_remains_time",
            "weeklyRemainsTime",
            "weekly_end_time",
            "weeklyEndTime"
          );

          quotas[`${modelKey}_7d`] = buildQuotaBucket(
            effTotal,
            effCount,
            resetAt,
            countMeansRemaining,
            weeklyPercent,
            `${displayName} (7d)`
          );
        }
      }

      if (Object.keys(quotas).length === 0) {
        if (i < urls.length - 1) continue;
        return { plan: "MiniMax Coding Plan", message: "MiniMax connected. Unable to extract quota usage." };
      }

      return {
        plan: "MiniMax Coding Plan",
        quotas,
      };
    } catch (err: any) {
      lastErrorMessage = err.message;
      if (i < urls.length - 1) continue;
    }
  }

  return {
    plan: "MiniMax",
    message: lastErrorMessage ? `MiniMax error: ${lastErrorMessage}` : "Failed to fetch MiniMax usage.",
  };
}
