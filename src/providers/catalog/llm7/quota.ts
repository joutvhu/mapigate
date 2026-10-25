import { getDatabase } from "../../../storage/database.js";
import type { ProviderUsageContext, RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";

export const LLM7_BALANCE_URL = "https://api.llm7.io/v1/balance";
export const DEFAULT_LLM7_DAILY_TOKEN_ALLOWANCE = 100_000; // 100k tokens per 24 hours (Free Tier)

export async function getLlm7Usage(
  context: ProviderUsageContext,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const apiKey = (context.account?.rawApiKey || "").trim();

  if (!apiKey) {
    return { plan: "LLM7", message: "LLM7 API key is required." };
  }

  let balanceData: any = null;
  try {
    const res = await fetchFn(LLM7_BALANCE_URL, {
      method: "GET",
      headers: {
        Authorization: apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        plan: "LLM7",
        error: `Authentication failed (HTTP ${res.status}): Invalid LLM7 API key`,
      };
    }

    if (res.ok) {
      balanceData = await res.json();
    }
  } catch {
    // Proceed with local tracking
  }

  // Calculate 24-hour rolling window usage from Mapigate request_logs
  const rollingWindow24h = Date.now() - 24 * 60 * 60 * 1000;
  let usedTokens = 0;
  try {
    const db = getDatabase();
    const row = db.get<{ used_tokens: number }>(
      `SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) as used_tokens
       FROM request_logs
       WHERE provider_id = 'llm7'
         AND timestamp >= ?
         AND (? IS NULL OR account_id = ?)`,
      rollingWindow24h,
      context.account?.id || null,
      context.account?.id || null
    );
    usedTokens = Number(row?.used_tokens) || 0;
  } catch {
    usedTokens = 0;
  }

  const totalDaily = DEFAULT_LLM7_DAILY_TOKEN_ALLOWANCE;
  const remainingTokens = Math.max(0, totalDaily - usedTokens);
  const remainingPercent = Math.max(0, Math.min(100, Math.round((remainingTokens / totalDaily) * 100)));
  const balanceUsd = Number(balanceData?.balance_usd) || 0;

  const quotas: Record<string, RawQuotaBucket> = {
    daily_tokens: {
      displayName: "Daily Token Allowance (24h)",
      total: totalDaily,
      used: usedTokens,
      remaining: remainingTokens,
      remainingPercentage: remainingPercent,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      recurring: true,
    },
    balance: {
      displayName: "Account Balance (USD)",
      total: balanceUsd,
      used: 0,
      remaining: balanceUsd,
      remainingPercentage: 100,
      unlimited: true,
    },
    rate_limits: {
      displayName: "Rate Limits (250 r/h, 60 r/m, 1 r/s)",
      total: 250,
      used: 0,
      remaining: 250,
      remainingPercentage: 100,
      unlimited: false,
    },
  };

  const planName = balanceUsd > 0 ? "Pay-As-You-Go" : "Free Tier";

  return {
    plan: planName,
    quotas,
  };
}
