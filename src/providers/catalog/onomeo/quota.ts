import type { ProviderUsageContext, RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";

export const ONOMEO_ME_URL = "https://onomeo.com/api/me";

export async function getOnomeoUsage(
  context: ProviderUsageContext,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const apiKey = (context.account?.rawApiKey || "").trim();

  if (!apiKey) {
    return { plan: "Onomeo", message: "Onomeo API key is required." };
  }

  try {
    const res = await fetchFn(ONOMEO_ME_URL, {
      method: "GET",
      headers: {
        Authorization: apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        plan: "Onomeo",
        error: `Authentication failed (HTTP ${res.status}): Invalid Onomeo API key`,
      };
    }

    if (!res.ok) {
      return {
        plan: "Onomeo",
        error: `Failed to fetch Onomeo usage (HTTP ${res.status})`,
      };
    }

    const data: any = await res.json();
    const calls = data?.calls;
    const ownCalls = data?.ownCalls;
    const balance = typeof data?.balance === "number" ? data.balance : 0;

    const callsMax = Number(calls?.max) || 30;
    const callsLeft = typeof calls?.left === "number" ? calls.left : 30;
    const callsUsed = Math.max(0, callsMax - callsLeft);
    const callsPercent = Math.max(0, Math.min(100, Math.round((callsLeft / callsMax) * 100)));
    const callsNextIn = Number(calls?.nextIn) || 0;
    const callsResetAt = callsNextIn > 0 ? new Date(Date.now() + callsNextIn * 1000).toISOString() : null;

    const quotas: Record<string, RawQuotaBucket> = {
      free_calls: {
        displayName: "Free-model calls (5h window)",
        total: callsMax,
        used: callsUsed,
        remaining: callsLeft,
        remainingPercentage: callsPercent,
        resetAt: callsResetAt,
        recurring: true,
      },
      balance: {
        displayName: "Big-model balance",
        total: balance,
        used: 0,
        remaining: balance,
        remainingPercentage: 100,
        unlimited: true,
      },
    };

    if (ownCalls && typeof ownCalls === "object") {
      const ownMax = Number(ownCalls.max) || 300;
      const ownLeft = typeof ownCalls.left === "number" ? ownCalls.left : 300;
      const ownUsed = Math.max(0, ownMax - ownLeft);
      const ownPercent = Math.max(0, Math.min(100, Math.round((ownLeft / ownMax) * 100)));
      const ownNextIn = Number(ownCalls.nextIn) || 0;
      const ownResetAt = ownNextIn > 0 ? new Date(Date.now() + ownNextIn * 1000).toISOString() : null;

      quotas.own_calls = {
        displayName: "BYO-Key calls (5h window)",
        total: ownMax,
        used: ownUsed,
        remaining: ownLeft,
        remainingPercentage: ownPercent,
        resetAt: ownResetAt,
        recurring: true,
      };
    }

    const planName = balance > 0 ? "Onomeo (Paid / Big Models)" : "Onomeo (Free Tier)";

    return {
      plan: planName,
      quotas,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      plan: "Onomeo",
      error: `Failed to connect to Onomeo usage API: ${msg}`,
    };
  }
}
