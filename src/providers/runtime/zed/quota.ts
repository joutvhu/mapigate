import type { RawProviderQuotaResult } from "../../../core/usage/types.js";
import { parseResetTime, toFiniteNumber } from "../../../core/usage/utils.js";

export function formatZedPlanLabel(rawPlan?: string): string {
  const raw = String(rawPlan || "").trim();
  if (!raw) return "Zed";
  switch (raw.toLowerCase()) {
    case "zed_free":
      return "Zed Free";
    case "zed_pro":
      return "Zed Pro";
    case "zed_pro_trial":
      return "Zed Pro Trial";
    case "zed_student":
      return "Zed Student";
    case "zed_business":
      return "Zed Business";
    default:
      return raw
        .replace(/_/g, " ")
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
  }
}

export function parseZedUsageLimit(limit: any): { unlimited: boolean; total: number } {
  if (limit == null) return { unlimited: false, total: 0 };
  if (limit === "unlimited" || limit?.unlimited === true) {
    return { unlimited: true, total: 0 };
  }
  if (typeof limit === "number" && Number.isFinite(limit)) {
    return { unlimited: false, total: Math.max(0, limit) };
  }
  if (typeof limit === "string") {
    const trimmed = limit.trim();
    if (trimmed === "unlimited") return { unlimited: true, total: 0 };
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return { unlimited: false, total: Math.max(0, parsed) };
  }
  const limited = limit.limited ?? limit.Limited;
  if (typeof limited === "number" && Number.isFinite(limited)) {
    return { unlimited: false, total: Math.max(0, limited) };
  }
  return { unlimited: false, total: 0 };
}

function makeZedQuotaRow(usedRaw: any, limitRaw: any, resetAt: number | string | null = null) {
  const used = Math.max(0, toFiniteNumber(usedRaw, 0));
  const limitInfo = parseZedUsageLimit(limitRaw);

  if (limitInfo.unlimited) {
    return {
      used,
      total: 0,
      remainingPercentage: 100,
      resetAt: resetAt !== null ? resetAt : undefined,
      unlimited: true,
      recurring: true,
    };
  }

  const total = limitInfo.total;
  if (total <= 0) {
    return {
      used,
      total: 0,
      remainingPercentage: 0,
      resetAt: resetAt !== null ? resetAt : undefined,
      unlimited: false,
      recurring: true,
    };
  }

  const clampedUsed = Math.min(used, total);
  const remaining = Math.max(0, total - clampedUsed);
  return {
    used: clampedUsed,
    total,
    remainingPercentage: (remaining / total) * 100,
    resetAt: resetAt !== null ? resetAt : undefined,
    unlimited: false,
    recurring: true,
  };
}

export async function getZedUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>
): Promise<RawProviderQuotaResult> {
  const userId = providerSpecificData?.userId;
  if (!userId || !accessToken) {
    return { plan: "Zed", message: "Zed user ID or access token missing." };
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `${userId} ${accessToken}`,
  };
  const systemId = providerSpecificData?.systemId;
  if (systemId) headers["x-zed-system-id"] = systemId;

  const res = await fetch("https://cloud.zed.dev/client/users/me", {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    return { plan: "Zed", message: `Zed usage error (${res.status})` };
  }

  const data: any = await res.json().catch(() => ({}));
  const plan = data?.plan || {};
  const orgs: any[] = Array.isArray(data?.organizations) ? data.organizations : [];
  const targetOrgId = providerSpecificData?.organizationId || data?.default_organization_id;
  const currentOrg = orgs.find((o) => o?.id === targetOrgId) || orgs[0];
  const planId =
    (currentOrg?.id && data?.plans_by_organization?.[currentOrg.id]) ||
    plan.plan_v3 ||
    plan.plan_v2 ||
    plan.plan ||
    data?.plan_v3;

  const resetAt =
    parseResetTime(plan.subscription_period?.ended_at) ||
    parseResetTime(plan.subscriptionPeriod?.endedAt) ||
    null;

  const quotas: Record<string, any> = {};

  // Fetch Organization Billing Usage for Token Spend ($ used of $)
  if (currentOrg?.id) {
    try {
      const billingRes = await fetch(
        `https://cloud.zed.dev/client/organizations/${currentOrg.id}/billing/usage`,
        { headers }
      );
      if (billingRes.ok) {
        const billingData: any = await billingRes.json().catch(() => ({}));
        const tokenSpend = billingData?.token_spend || billingData?.tokenSpend;
        if (tokenSpend) {
          const usedCents = Math.max(0, toFiniteNumber(tokenSpend.spend_in_cents ?? tokenSpend.spendInCents, 0));
          const limitCentsRaw = tokenSpend.limit_in_cents ?? tokenSpend.limitInCents;
          const usedUsd = Math.round((usedCents / 100) * 100) / 100;

          if (limitCentsRaw != null) {
            const limitCents = Math.max(0, toFiniteNumber(limitCentsRaw, 0));
            const totalUsd = Math.round((limitCents / 100) * 100) / 100;
            if (totalUsd > 0) {
              const remaining = Math.max(0, totalUsd - usedUsd);
              quotas["Token Spend"] = {
                used: usedUsd,
                total: totalUsd,
                remainingPercentage: (remaining / totalUsd) * 100,
                resetAt: resetAt !== null ? resetAt : undefined,
                unlimited: false,
                recurring: true,
                unit: "USD",
              };
            } else {
              quotas["Token Spend"] = {
                used: usedUsd,
                total: 0,
                remainingPercentage: 100,
                resetAt: resetAt !== null ? resetAt : undefined,
                unlimited: true,
                recurring: true,
                unit: "USD",
              };
            }
          }
        }
      }
    } catch {}
  }

  // Fallback: If billing endpoint didn't provide token spend, check hosted model requests
  if (Object.keys(quotas).length === 0) {
    const usage = plan.usage || {};
    const modelRequests = usage.model_requests || usage.modelRequests;
    if (modelRequests) {
      const limitRaw = modelRequests.limit != null ? modelRequests.limit : modelRequests?.limit;
      const limitInfo = parseZedUsageLimit(limitRaw);
      if (limitInfo.unlimited || limitInfo.total > 0) {
        quotas["Hosted Model Requests"] = makeZedQuotaRow(modelRequests.used, limitRaw, resetAt);
      }
    }

    // Always include Edit Predictions as secondary quota so the card always has active progress
    const editPredictions = usage.edit_predictions || usage.editPredictions;
    if (editPredictions) {
      quotas["Edit Predictions"] = makeZedQuotaRow(editPredictions.used, editPredictions.limit, resetAt);
    }
  }

  const basePlanLabel = formatZedPlanLabel(planId);
  const orgSuffix = currentOrg?.name ? ` (${currentOrg.name})` : "";
  const displayPlan = `${basePlanLabel}${orgSuffix}`;

  return {
    plan: displayPlan,
    quotas,
  };
}
