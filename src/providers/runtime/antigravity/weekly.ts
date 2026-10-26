import type { RawQuotaBucket } from "../../../core/usage/types.js";
import { parseResetTime } from "../../../core/usage/utils.js";
import { fetchWithDnsBypass } from "../../../shared/utils/dnsResolver.js";
import {
  ANTIGRAVITY_IDE_VERSION,
  ANTIGRAVITY_USER_AGENT,
  ANTIGRAVITY_QUOTA_SUMMARY_URL,
  GROUP_CONFIGS,
  type WeeklyCacheEntry,
} from "./types.js";

const WEEKLY_CACHE_TTL_MS = 180_000;
const weeklyCache = new Map<string, WeeklyCacheEntry>();

function cacheKey(accessToken: string, projectId?: string | null): string {
  return `${accessToken}::${projectId || ""}`;
}

export function _clearWeeklyCache(): void {
  weeklyCache.clear();
}

/**
 * Parse a retrieveUserQuotaSummary response into normalized weekly and session quotas.
 * Pure function — safe to unit-test without network.
 */
export function parseWeeklyQuotaSummary(data: any): Record<string, RawQuotaBucket> {
  if (!data || typeof data !== "object") return {};

  const groups = Array.isArray(data.groups)
    ? data.groups
    : Array.isArray(data.quotaSummary?.groups)
    ? data.quotaSummary.groups
    : null;

  if (!groups) return {};

  const result: Record<string, RawQuotaBucket> = {};

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
          if (result[target.key]) break;

          const total = isWeekly ? 3000 : 1000;
          const remaining = Math.round(total * remainingFraction);
          const used = Math.max(0, total - remaining);

          result[target.key] = {
            displayName: target.displayName,
            used,
            total,
            remaining,
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

  return result;
}

/**
 * Fetch weekly quota summary with 3-minute in-flight dedup cache.
 */
export async function fetchAntigravityWeeklyQuota(
  accessToken: string,
  projectId?: string | null,
  options?: { fetchFn?: typeof fetch; force?: boolean }
): Promise<Record<string, RawQuotaBucket>> {
  const fetchFn = (options?.fetchFn as any) || fetchWithDnsBypass;
  const key = cacheKey(accessToken, projectId);

  if (!options?.force) {
    const hit = weeklyCache.get(key);
    if (hit?.promise) return hit.promise;
    if (hit && hit.expiresAt && hit.expiresAt > Date.now() && hit.result) {
      return hit.result;
    }
  }

  const promise = (async () => {
    try {
      const response = await fetchFn(ANTIGRAVITY_QUOTA_SUMMARY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": ANTIGRAVITY_USER_AGENT,
          "Content-Type": "application/json",
          "X-Client-Name": "antigravity",
          "X-Client-Version": ANTIGRAVITY_IDE_VERSION,
        },
        body: JSON.stringify({
          ...(projectId ? { project: projectId } : {}),
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return {};

      const data: any = await response.json();
      return parseWeeklyQuotaSummary(data);
    } catch {
      return {};
    }
  })();

  weeklyCache.set(key, { promise });

  try {
    const result = await promise;
    if (result && Object.keys(result).length > 0) {
      weeklyCache.set(key, { result, expiresAt: Date.now() + WEEKLY_CACHE_TTL_MS });
    } else {
      weeklyCache.delete(key);
    }
    return result;
  } catch {
    weeklyCache.delete(key);
    return {};
  }
}
