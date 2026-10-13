import type { RawProviderQuotaResult } from "../../../core/usage/types.js";
import { parseResetTime } from "../../../core/usage/utils.js";

const USAGE_URL = "https://copilot.tencent.com/v2/billing/meter/get-user-resource";

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

export async function getCodeBuddyCnUsage(
  accessToken: string,
  _providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  if (!accessToken) {
    return { plan: "CodeBuddy CN", message: "CodeBuddy credential not available." };
  }

  const res = await fetch(USAGE_URL, {
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
    return { plan: "CodeBuddy CN", message: `CodeBuddy quota API error (${res.status})` };
  }

  const json: any = await res.json().catch(() => ({}));
  if (json?.code !== 0) {
    return { plan: "CodeBuddy CN", message: `CodeBuddy quota error: ${json?.msg || "unknown"}` };
  }

  const data = json?.data?.Response?.Data || {};
  const accounts = Array.isArray(data.Accounts) ? data.Accounts : [];
  if (accounts.length === 0) {
    return { plan: "CodeBuddy CN", message: "Connected. No credit package found." };
  }

  const cycleEndMs = (acc: any) => {
    const r = parseResetTime(acc.CycleEndTime);
    return r ? new Date(r).getTime() : Number.POSITIVE_INFINITY;
  };
  const REFILL_GAP_MS = 2 * 24 * 60 * 60 * 1000;
  const isRefill = (acc: any) => {
    const ce = cycleEndMs(acc);
    const de = Number(acc.DeductionEndTime);
    return Number.isFinite(ce) && Number.isFinite(de) && de - ce > REFILL_GAP_MS;
  };
  const byExpiry = (a: any, b: any) => cycleEndMs(a) - cycleEndMs(b);

  const refills = accounts.filter(isRefill).sort(byExpiry);
  const bonuses = accounts.filter((a: any) => !isRefill(a)).sort(byExpiry);

  const quotas: Record<string, any> = {};
  const seenRefill: Record<string, number> = {};

  refills.forEach((acc: any) => {
    const base = refillCadence(acc);
    seenRefill[base] = (seenRefill[base] || 0) + 1;
    const name = seenRefill[base] > 1 ? `${base} ${seenRefill[base]}` : base;
    const used = num(acc.CycleCapacityUsedPrecise, acc.CycleCapacityUsed);
    const total = num(acc.CycleCapacitySizePrecise, acc.CycleCapacitySize);
    quotas[name] = {
      used,
      total,
      remainingPercentage: total > 0 ? Math.max(0, ((total - used) / total) * 100) : 0,
      resetAt: parseResetTime(acc.CycleEndTime),
      unlimited: false,
      recurring: true,
    };
  });

  bonuses.forEach((acc: any, i: number) => {
    const used = num(acc.CapacityUsedPrecise, acc.CapacityUsed);
    const total = num(acc.CapacitySizePrecise, acc.CapacitySize);
    quotas[`Bonus Pack ${i + 1}`] = {
      used,
      total,
      remainingPercentage: total > 0 ? Math.max(0, ((total - used) / total) * 100) : 0,
      resetAt: parseResetTime(acc.CycleEndTime),
      unlimited: false,
      recurring: false,
    };
  });

  const basePkg = refills[0] || accounts[0] || {};
  const plan = basePkg.PackageName || basePkg.SubProductName || "CodeBuddy CN";

  return { plan, quotas };
}
