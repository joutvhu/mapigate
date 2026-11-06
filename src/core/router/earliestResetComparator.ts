import type { ProviderAccount } from "../../shared/types/index.js";
import type { AccountQuotaResult, NormalizedQuotaItem } from "../usage/types.js";
import { QuotaService } from "../usage/quotaService.js";
import { cooldownManager } from "../resilience/index.js";

export interface AntigravityQuotaMetrics {
  hasQuotaData: boolean;
  isExhausted: boolean;
  weeklyResetRemainingMs: number;
  sessionResetRemainingMs: number;
  remainingPercentage: number;
}

export interface GenericQuotaMetrics {
  hasQuotaData: boolean;
  isExhausted: boolean;
  resetRemainingMs: number;
  remainingPercentage: number;
}

/**
 * Safely parse timestamp to numeric milliseconds.
 */
function toEpochMs(val: unknown): number | null {
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  if (typeof val === "string") {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Retrieve cached quota result for an account (memory cache first, then DB).
 */
export function getAccountCachedQuotaResult(account: ProviderAccount): AccountQuotaResult | null {
  try {
    const memory = QuotaService.getInstance().getCachedQuota(account.id);
    if (memory) return memory;
  } catch {}

  if (account.cachedQuotas) {
    try {
      const parsed = JSON.parse(account.cachedQuotas) as AccountQuotaResult;
      if (parsed && Array.isArray(parsed.quotas)) {
        return parsed;
      }
    } catch {}
  }

  return null;
}

/**
 * Extract Antigravity quota metrics prioritizing weekly quotas over 5h session quotas.
 */
export function getAntigravityMetrics(
  account: ProviderAccount,
  targetModel?: string,
  now: number = Date.now()
): AntigravityQuotaMetrics {
  const quotaResult = getAccountCachedQuotaResult(account);
  if (!quotaResult || !Array.isArray(quotaResult.quotas) || quotaResult.quotas.length === 0) {
    return {
      hasQuotaData: false,
      isExhausted: false,
      weeklyResetRemainingMs: Infinity,
      sessionResetRemainingMs: Infinity,
      remainingPercentage: 100,
    };
  }

  const quotas = quotaResult.quotas;
  const isClaudeGptModel = Boolean(targetModel && /claude|gpt/i.test(targetModel));
  const isArgonModel = Boolean(targetModel && /argon/i.test(targetModel));
  const isGeminiModel = Boolean(targetModel && /gemini/i.test(targetModel) && !isArgonModel);

  // Determine target buckets based on model family
  let weeklyBucket: NormalizedQuotaItem | undefined;
  let sessionBucket: NormalizedQuotaItem | undefined;

  if (isArgonModel) {
    weeklyBucket = quotas.find((q) => /argon/i.test(q.label) && /weekly/i.test(q.label));
    // Argon only has weekly limit upstream, so sessionBucket remains undefined.
    // Fallback to standard Gemini weekly/session if account has no dedicated Argon quota
    if (!weeklyBucket) {
      weeklyBucket = quotas.find((q) => /gemini/i.test(q.label) && !/argon/i.test(q.label) && /weekly/i.test(q.label));
      sessionBucket = quotas.find((q) => /gemini/i.test(q.label) && !/argon/i.test(q.label) && /5h|session|daily/i.test(q.label));
    }
  } else if (isClaudeGptModel) {
    weeklyBucket = quotas.find((q) => /claude|gpt/i.test(q.label) && /weekly/i.test(q.label));
    sessionBucket = quotas.find((q) => /claude|gpt/i.test(q.label) && /5h|session|daily/i.test(q.label));
  } else if (isGeminiModel) {
    weeklyBucket = quotas.find((q) => /gemini/i.test(q.label) && !/argon/i.test(q.label) && /weekly/i.test(q.label));
    sessionBucket = quotas.find((q) => /gemini/i.test(q.label) && !/argon/i.test(q.label) && /5h|session|daily/i.test(q.label));
  } else {
    // If model is unspecified or ambiguous: find earliest resetting weekly bucket with remaining > 0
    const weeklyBuckets = quotas.filter((q) => /weekly/i.test(q.label));
    const availableWeeklies = weeklyBuckets.filter((q) => (q.remainingPercentage ?? 0) > 0);
    const candidateWeeklies = availableWeeklies.length > 0 ? availableWeeklies : weeklyBuckets;

    weeklyBucket = candidateWeeklies.reduce<NormalizedQuotaItem | undefined>((earliest, cur) => {
      if (!earliest) return cur;
      const tCur = toEpochMs(cur.resetAt) ?? Infinity;
      const tEarliest = toEpochMs(earliest.resetAt) ?? Infinity;
      return tCur < tEarliest ? cur : earliest;
    }, undefined);

    sessionBucket = quotas.find((q) => /5h|session|daily/i.test(q.label));
  }

  const WEEKLY_CYCLE_MS = 7 * 86400 * 1000;
  const SESSION_CYCLE_MS = 5 * 3600 * 1000;

  // Calculate remaining ms until reset
  const weeklyTs = toEpochMs(weeklyBucket?.resetAt);
  let weeklyResetRemainingMs = Infinity;
  let weeklyHasReset = false;

  if (weeklyTs !== null) {
    if (weeklyTs > now) {
      weeklyResetRemainingMs = weeklyTs - now;
    } else {
      // Reset time has already elapsed! The account has rolled over into a new 7-day cycle.
      // Trigger background refresh so fresh numbers are retrieved from Google.
      weeklyHasReset = true;
      try {
        QuotaService.getInstance().fetchQuotaForAccount(account.id, true).catch(() => {});
      } catch {}
      const elapsed = now - weeklyTs;
      weeklyResetRemainingMs = WEEKLY_CYCLE_MS - (elapsed % WEEKLY_CYCLE_MS);
    }
  }

  const sessionTs = toEpochMs(sessionBucket?.resetAt);
  let sessionResetRemainingMs = Infinity;
  let sessionHasReset = false;

  if (sessionTs !== null) {
    if (sessionTs > now) {
      sessionResetRemainingMs = sessionTs - now;
    } else {
      // 5h session reset time has elapsed! Rolled over into a new 5h cycle.
      sessionHasReset = true;
      try {
        QuotaService.getInstance().fetchQuotaForAccount(account.id, true).catch(() => {});
      } catch {}
      const elapsed = now - sessionTs;
      sessionResetRemainingMs = SESSION_CYCLE_MS - (elapsed % SESSION_CYCLE_MS);
    }
  }

  // If the reset timestamp has passed, the account has reset and recovered its quota
  const weeklyRemainingPct = weeklyHasReset ? 100 : (weeklyBucket?.remainingPercentage ?? 100);
  const sessionRemainingPct = sessionHasReset ? 100 : (sessionBucket?.remainingPercentage ?? 100);

  // Account is exhausted if either bucket is at 0% and has NOT reset yet
  const isExhausted = weeklyRemainingPct === 0 || sessionRemainingPct === 0;

  return {
    hasQuotaData: true,
    isExhausted,
    weeklyResetRemainingMs,
    sessionResetRemainingMs,
    remainingPercentage: Math.min(weeklyRemainingPct, sessionRemainingPct),
  };
}

/**
 * Extract generic quota metrics for non-Antigravity providers that have cached quotas.
 */
export function getGenericQuotaMetrics(
  account: ProviderAccount,
  now: number = Date.now()
): GenericQuotaMetrics | null {
  const quotaResult = getAccountCachedQuotaResult(account);
  if (!quotaResult || !Array.isArray(quotaResult.quotas) || quotaResult.quotas.length === 0) {
    return null;
  }

  // Prioritize primary macro-period bucket (weekly / monthly) if available
  // e.g. Claude "Weekly (7d)", GitHub Copilot "monthly"
  const weeklyOrMonthly = quotaResult.quotas.find(
    (q) => /weekly|7d|7_day|month/i.test(q.label) && toEpochMs(q.resetAt) !== null
  );

  let targetBucket = weeklyOrMonthly;
  if (!targetBucket) {
    targetBucket = quotaResult.quotas.find((q) => toEpochMs(q.resetAt) !== null);
  }

  let minRemainingPct = 100;
  let anyExhausted = false;

  for (const bucket of quotaResult.quotas) {
    const remPct = bucket.remainingPercentage ?? 100;
    if (remPct === 0) anyExhausted = true;
    if (remPct < minRemainingPct) minRemainingPct = remPct;
  }

  const ts = toEpochMs(targetBucket?.resetAt);
  if (ts === null && minRemainingPct === 100) return null;

  let resetRemainingMs = Infinity;
  if (ts !== null) {
    if (ts > now) {
      resetRemainingMs = ts - now;
    } else {
      try {
        QuotaService.getInstance().fetchQuotaForAccount(account.id, true).catch(() => {});
      } catch {}
      const isMonthly = /month/i.test(targetBucket?.label || "");
      const isWeekly = /weekly|7d|7_day/i.test(targetBucket?.label || "");
      const isSession = /session|5h/i.test(targetBucket?.label || "");

      const cycleMs = isMonthly
        ? 30 * 86400 * 1000
        : isWeekly
        ? 7 * 86400 * 1000
        : isSession
        ? 5 * 3600 * 1000
        : 24 * 3600 * 1000;

      const elapsed = now - ts;
      resetRemainingMs = cycleMs - (elapsed % cycleMs);
    }
  }

  return {
    hasQuotaData: true,
    isExhausted: anyExhausted,
    resetRemainingMs,
    remainingPercentage: minRemainingPct,
  };
}

/**
 * Compare two accounts under the 'earliest-reset' strategy.
 * For Antigravity: prioritizes accounts whose Weekly quota resets sooner (rather than 5h session).
 */
export function compareAccountsEarliestReset(
  a: ProviderAccount,
  b: ProviderAccount,
  providerId: string,
  targetModel?: string,
  now: number = Date.now()
): number {
  // 1. Cooldown manager check (accounts recovering from 429 rate limit)
  const cdA = cooldownManager.getCooldownRemainingMs(a.id);
  const cdB = cooldownManager.getCooldownRemainingMs(b.id);
  if (cdA !== cdB) {
    return cdA - cdB;
  }

  const pId = providerId.toLowerCase();
  const isAntigravity = pId === "antigravity" || pId === "agy";

  if (isAntigravity) {
    const mA = getAntigravityMetrics(a, targetModel, now);
    const mB = getAntigravityMetrics(b, targetModel, now);

    if (mA.hasQuotaData && mB.hasQuotaData) {
      // 2a. Exhausted accounts (0% quota) are deprioritized behind active accounts
      if (!mA.isExhausted && mB.isExhausted) return -1;
      if (mA.isExhausted && !mB.isExhausted) return 1;

      // 2b. Both are NOT exhausted:
      // KEY PRINCIPLE: Prioritize the account whose Weekly quota resets sooner!
      // This maximizes "use-it-or-lose-it" weekly quota usage before the reset window closes,
      // and preserves weekly quota on accounts whose reset is several days away.
      if (!mA.isExhausted && !mB.isExhausted) {
        if (mA.weeklyResetRemainingMs !== mB.weeklyResetRemainingMs) {
          return mA.weeklyResetRemainingMs - mB.weeklyResetRemainingMs;
        }

        // Secondary tie-breaker: 5h session reset time
        if (mA.sessionResetRemainingMs !== mB.sessionResetRemainingMs) {
          return mA.sessionResetRemainingMs - mB.sessionResetRemainingMs;
        }

        // Tertiary tie-breaker: remaining quota percentage (higher percentage first)
        if (mA.remainingPercentage !== mB.remainingPercentage) {
          return mB.remainingPercentage - mA.remainingPercentage;
        }
      } else {
        // Both ARE exhausted: pick whichever will recover soonest
        const recoveryA = Math.min(mA.weeklyResetRemainingMs, mA.sessionResetRemainingMs);
        const recoveryB = Math.min(mB.weeklyResetRemainingMs, mB.sessionResetRemainingMs);
        if (recoveryA !== recoveryB) {
          return recoveryA - recoveryB;
        }
      }
    } else if (mA.hasQuotaData && !mB.hasQuotaData) {
      return mA.isExhausted ? 1 : -1;
    } else if (!mA.hasQuotaData && mB.hasQuotaData) {
      return mB.isExhausted ? -1 : 1;
    }
  } else {
    // Generic provider cached quota comparison
    const gA = getGenericQuotaMetrics(a, now);
    const gB = getGenericQuotaMetrics(b, now);

    if (gA && gB) {
      if (!gA.isExhausted && gB.isExhausted) return -1;
      if (gA.isExhausted && !gB.isExhausted) return 1;

      if (gA.resetRemainingMs !== gB.resetRemainingMs) {
        return gA.resetRemainingMs - gB.resetRemainingMs;
      }
    } else if (gA && !gB) {
      return gA.isExhausted ? 1 : -1;
    } else if (!gA && gB) {
      return gB.isExhausted ? -1 : 1;
    }
  }

  // 3. Fallback tie-breakers: least rateLimitHits, then least recently used
  if (a.rateLimitHits !== b.rateLimitHits) {
    return a.rateLimitHits - b.rateLimitHits;
  }
  return (a.lastUsedAt || 0) - (b.lastUsedAt || 0);
}
