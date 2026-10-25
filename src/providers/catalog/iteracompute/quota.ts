import { getDatabase } from "../../../storage/database.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";

const DEFAULT_MONTHLY_ALLOWANCE = 30_000_000; // 30M tokens/month (Free Tier)

export async function getIteracomputeUsage(
  context: ProviderUsageContext
): Promise<RawProviderQuotaResult> {
  const account = context.account;
  const psd = (account.providerSpecificData || {}) as Record<string, any>;

  // Tier-based allowances from IteraCompute:
  // Free: 30M tokens, 160k TPM
  // Starter ($10+ recharge): 100M tokens, 300k TPM
  // Pro ($50+ recharge): 300M tokens, 600k TPM
  let totalAllowance = DEFAULT_MONTHLY_ALLOWANCE;
  let tpm = 160_000;
  let tierName = "Free";

  if (psd.tier === "pro") {
    totalAllowance = 300_000_000;
    tpm = 600_000;
    tierName = "Pro";
  } else if (psd.tier === "starter") {
    totalAllowance = 100_000_000;
    tpm = 300_000;
    tierName = "Starter";
  } else if (typeof psd.monthlyAllowance === "number" && psd.monthlyAllowance > 0) {
    totalAllowance = psd.monthlyAllowance;
  }

  // Calculate UTC calendar month window (IteraCompute resets at 00:00 UTC on the 1st of each month)
  const now = new Date();
  const startOfMonthUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
  const nextMonthUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

  let usedTokens = 0;
  try {
    const db = getDatabase();
    const row = db.get<{ used_tokens: number }>(
      `SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) as used_tokens
       FROM request_logs
       WHERE (provider_id = 'iteracompute' OR provider_id = 'itera')
         AND timestamp >= ?
         AND (? IS NULL OR account_id = ?)`,
      startOfMonthUtc,
      account.id || null,
      account.id || null
    );
    usedTokens = Number(row?.used_tokens) || 0;
  } catch {
    usedTokens = 0;
  }

  const remaining = Math.max(0, totalAllowance - usedTokens);
  const remainingPercentage = Math.max(0, Math.min(100, Math.round((remaining / totalAllowance) * 100)));

  return {
    plan: tierName,
    quotas: {
      monthly_tokens: {
        displayName: "Monthly Token Allowance",
        total: totalAllowance,
        used: usedTokens,
        remaining,
        remainingPercentage,
        resetAt: nextMonthUtc.toISOString(),
        recurring: true,
      },
      tpm: {
        displayName: "Rate Limit (TPM)",
        total: tpm,
        used: 0,
        remaining: tpm,
        remainingPercentage: 100,
        unlimited: false,
      },
    },
  };
}
