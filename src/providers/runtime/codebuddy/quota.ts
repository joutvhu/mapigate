import type { RawProviderQuotaResult } from "../../../core/usage/types.js";
import { parseResetTime } from "../../../core/usage/utils.js";

function num(precise: any, plain: any): number {
  const n = Number(precise ?? plain);
  return Number.isFinite(n) ? n : 0;
}

function refillCadence(acc: any): string {
  const start = parseResetTime(acc.CycleStartTime);
  const end = parseResetTime(acc.CycleEndTime);
  if (start && end) {
    const days = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
    if (days <= 1.5) return "Daily";
    if (days <= 10) return "Weekly";
  }
  return "Monthly";
}

export async function getCodeBuddyUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  if (!accessToken) {
    return { plan: "CodeBuddy", message: "CodeBuddy credential not available." };
  }

  const isCn = providerSpecificData?.region === "cn";
  const usageUrl = isCn
    ? "https://copilot.tencent.com/v2/billing/meter/get-user-resource"
    : "https://www.codebuddy.ai/v2/billing/meter/get-user-resource";

  const res = await fetch(usageUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "CLI/2.108.1 CodeBuddy/2.108.1",
      "X-Product": "SaaS",
    },
    body: "{}",
  });

  if (!res.ok) {
    return { plan: "CodeBuddy", message: `CodeBuddy quota API error (${res.status})` };
  }

  const json: any = await res.json().catch(() => ({}));
  if (json?.code !== 0) {
    return { plan: "CodeBuddy", message: `CodeBuddy quota error: ${json?.msg || "unknown"}` };
  }

  const data = json.data || {};
  const accounts = Array.isArray(data.Accounts) ? data.Accounts : [];
  if (accounts.length === 0) {
    return { plan: "CodeBuddy", message: "Connected. No credit package found." };
  }

  const quotas: Record<string, any> = {};
  const refills = accounts.filter((a: any) => a.Type === "REFILL");
  const onetimes = accounts.filter((a: any) => a.Type === "ONE_TIME");

  for (const acc of refills) {
    const cadence = refillCadence(acc);
    const balance = num(acc.PreciseBalance, acc.Balance);
    const total = num(acc.PreciseTotal, acc.Total);
    const used = Math.max(0, total - balance);
    const label = `${cadence} Points (${acc.SubProductName || acc.PackageName || "Standard"})`;

    quotas[label] = {
      displayName: label,
      used,
      total,
      remaining: balance,
      remainingPercentage: total > 0 ? Math.round((balance / total) * 100) : 0,
      resetAt: parseResetTime(acc.CycleEndTime),
      unlimited: false,
      recurring: true,
    };
  }

  for (const acc of onetimes) {
    const balance = num(acc.PreciseBalance, acc.Balance);
    const total = num(acc.PreciseTotal, acc.Total);
    const used = Math.max(0, total - balance);
    const label = `Bonus Pack (${acc.PackageName || "One-time"})`;

    quotas[label] = {
      displayName: label,
      used,
      total,
      remaining: balance,
      remainingPercentage: total > 0 ? Math.round((balance / total) * 100) : 0,
      resetAt: parseResetTime(acc.ExpireTime),
      unlimited: false,
      recurring: false,
    };
  }

  const basePkg = refills[0] || accounts[0] || {};
  const plan = basePkg.PackageName || basePkg.SubProductName || "CodeBuddy";

  return { plan, quotas };
}
