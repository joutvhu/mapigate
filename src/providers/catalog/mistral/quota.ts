import { getDatabase } from "../../../storage/database.js";
import type { ProviderUsageContext, RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";

export const MISTRAL_USER_ME_URL = "https://api.mistral.ai/v1/users/me";
export const DEFAULT_MISTRAL_MONTHLY_ALLOWANCE_USD = 10; // $10/month included allowance on Free Tier

export async function getMistralUsage(
  context: ProviderUsageContext,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const apiKey = (context.account?.rawApiKey || "").trim();

  if (!apiKey) {
    return { plan: "Mistral", message: "Mistral API key is required." };
  }

  let userInfo: any = null;
  try {
    const res = await fetchFn(MISTRAL_USER_ME_URL, {
      method: "GET",
      headers: {
        Authorization: apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        plan: "Mistral",
        error: `Authentication failed (HTTP ${res.status}): Invalid Mistral API key`,
      };
    }

    if (res.ok) {
      userInfo = await res.json();
    }
  } catch {
    // If user info fails, proceed with local tracking
  }

  // Calculate calendar month window (Mistral resets on the 1st of each calendar month at 00:00 UTC)
  const now = new Date();
  const startOfMonthUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
  const nextMonthUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

  let usedCost = 0;
  let usedTokens = 0;
  try {
    const db = getDatabase();
    const row = db.get<{ used_cost: number; used_tokens: number }>(
      `SELECT 
         COALESCE(SUM(cost), 0) as used_cost,
         COALESCE(SUM(prompt_tokens + completion_tokens), 0) as used_tokens
       FROM request_logs
       WHERE provider_id = 'mistral'
         AND timestamp >= ?
         AND (? IS NULL OR account_id = ?)`,
      startOfMonthUtc,
      context.account?.id || null,
      context.account?.id || null
    );
    usedCost = Number(row?.used_cost) || 0;
    usedTokens = Number(row?.used_tokens) || 0;
  } catch {
    usedCost = 0;
    usedTokens = 0;
  }

  const allowanceUsd = DEFAULT_MISTRAL_MONTHLY_ALLOWANCE_USD;
  const remainingUsd = Math.max(0, Math.round((allowanceUsd - usedCost) * 100) / 100);
  const remainingPercent = Math.max(0, Math.min(100, Math.round((remainingUsd / allowanceUsd) * 100)));

  const quotas: Record<string, RawQuotaBucket> = {
    included_api: {
      displayName: "Included API Allowance ($10/mo)",
      total: allowanceUsd,
      used: Math.round(usedCost * 100) / 100,
      remaining: remainingUsd,
      remainingPercentage: remainingPercent,
      resetAt: nextMonthUtc.toISOString(),
      recurring: true,
    },
    included_vibe: {
      displayName: "Included Vibe Code Allowance ($10/mo)",
      total: 10,
      used: 0,
      remaining: 10,
      remainingPercentage: 100,
      resetAt: nextMonthUtc.toISOString(),
      recurring: true,
    },
    monthly_tokens: {
      displayName: "Monthly Tokens (Through Mapigate)",
      total: 1_000_000_000,
      used: usedTokens,
      remaining: Math.max(0, 1_000_000_000 - usedTokens),
      remainingPercentage: Math.max(0, Math.min(100, Math.round(((1_000_000_000 - usedTokens) / 1_000_000_000) * 100))),
      resetAt: nextMonthUtc.toISOString(),
      recurring: true,
    },
  };

  const orgName = userInfo?.organization?.name || "Personal";
  const planName = `Mistral Free (${orgName} - $10 Included Allowance)`;

  return {
    plan: planName,
    quotas,
  };
}
