import type { RawProviderQuotaResult, RawQuotaBucket } from "../../../core/usage/types.js";
import { parseResetTime, toFiniteNumber } from "../../../core/usage/utils.js";

export const GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
export const GROK_USER_URL = "https://cli-chat-proxy.grok.com/v1/user?include=subscription";
export const GRPC_CREDITS_URL = "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";
const GRPC_WEB_EMPTY_REQUEST_FRAME = Buffer.from([0, 0, 0, 0, 0]);

export function unwrapVal(value: any, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === "object" && !Array.isArray(value) && "val" in value) {
    return toFiniteNumber(value.val, fallback);
  }
  return toFiniteNumber(value, fallback);
}

export function detectGrokTier(user: any, config: any, token: string): string {
  const rawTier =
    user?.subscriptionTier ??
    user?.subscription_tier ??
    user?.subscription?.tier ??
    config?.subscriptionTier ??
    config?.subscription_tier;

  if (typeof rawTier === "string" && rawTier.trim()) {
    return rawTier
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      const tierMap: Record<number, string> = {
        0: "Free",
        1: "SuperGrok",
        2: "X Basic",
        3: "X Premium",
        4: "X Premium Plus",
        5: "SuperGrok Heavy",
        6: "SuperGrok Lite",
      };
      if (payload.tier !== undefined && tierMap[payload.tier]) {
        return tierMap[payload.tier];
      }
    }
  } catch {}

  if (user?.hasGrokCodeAccess === true) return "Grok Code";
  if (config?.isUnifiedBillingUser === true) return "Grok Build";
  return "Grok Build";
}

export function decodeGrokCreditsFrame(buffer: Buffer): { percentUsed: number; resetAt: string | null } | null {
  if (!buffer || buffer.length < 5) return null;
  try {
    const payloadLength = buffer.readUInt32BE(1);
    if (payloadLength > buffer.length - 5) return null;
    const payload = buffer.subarray(5, 5 + payloadLength);
    // Scan for subfield 1 float (usage ratio)
    let offset = 0;
    let ratio: number | null = null;
    let resetAtStr: string | null = null;

    while (offset < payload.length) {
      const tag = payload[offset++];
      const fieldNum = tag >>> 3;
      const wireType = tag & 0x7;
      if (fieldNum === 1 && wireType === 2) {
        // Nested credits info
        const len = payload[offset++];
        const sub = payload.subarray(offset, offset + len);
        offset += len;
        let subOff = 0;
        while (subOff < sub.length) {
          const subTag = sub[subOff++];
          const sField = subTag >>> 3;
          const sWire = subTag & 0x7;
          if (sField === 1 && sWire === 5) {
            ratio = sub.readFloatLE(subOff);
            subOff += 4;
          } else if (sField === 5 && sWire === 2) {
            const tLen = sub[subOff++];
            const tBuf = sub.subarray(subOff, subOff + tLen);
            subOff += tLen;
            if (tBuf.length >= 2 && (tBuf[0] >>> 3) === 1) {
              const sec = tBuf[1];
              resetAtStr = new Date(sec * 1000).toISOString();
            }
          } else if (sWire === 0) {
            while (subOff < sub.length && (sub[subOff++] & 0x80) !== 0) {}
          } else if (sWire === 2) {
            const skipLen = sub[subOff++];
            subOff += skipLen;
          } else if (sWire === 5) {
            subOff += 4;
          } else {
            break;
          }
        }
      } else if (wireType === 0) {
        while (offset < payload.length && (payload[offset++] & 0x80) !== 0) {}
      } else if (wireType === 2) {
        const l = payload[offset++];
        offset += l;
      } else {
        break;
      }
    }

    if (ratio !== null && Number.isFinite(ratio) && ratio >= 0) {
      return {
        percentUsed: Math.min(100, Math.round(ratio * 100)),
        resetAt: resetAtStr,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getGrokUsage(
  accessToken: string,
  providerSpecificData?: Record<string, any>,
  options?: { fetchFn?: typeof fetch }
): Promise<RawProviderQuotaResult> {
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const token = (accessToken || "").trim();

  if (!token) {
    return { plan: "Grok", message: "Grok access token not available." };
  }

  const email = providerSpecificData?.email;
  const userId = providerSpecificData?.userId || providerSpecificData?.principalId;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": "xai-grok-cli/0.1.0",
    "x-xai-token-auth": "xai-grok-cli",
    "x-grok-client-identifier": "grok-cli",
    "x-grok-client-version": "0.1.0",
    "x-grok-client-mode": "headless",
  };
  if (email) headers["x-email"] = email;
  if (userId) headers["x-userid"] = userId;

  try {
    let userData: any = null;
    try {
      const userRes = await fetchFn(GROK_USER_URL, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (userRes.ok) {
        userData = await userRes.json();
      }
    } catch {}

    const res = await fetchFn(GROK_BILLING_URL, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        plan: "Grok",
        message: "Grok token expired or unauthorized. Please re-authenticate.",
      };
    }

    if (!res.ok) {
      return { plan: "Grok", message: `Grok billing API error (${res.status}).` };
    }

    const data: any = await res.json();
    const config = data?.config && typeof data.config === "object" ? data.config : data;

    const periodEnd =
      parseResetTime(config?.billingPeriodEnd) ||
      parseResetTime(config?.billing_period_end) ||
      parseResetTime(config?.currentPeriod?.end) ||
      parseResetTime(config?.resetAt || config?.resetsAt);

    const quotas: Record<string, RawQuotaBucket> = {};
    const plan = detectGrokTier(userData, config, token);

    const monthlyLimit = unwrapVal(config?.monthlyLimit ?? config?.monthly_limit, NaN);
    const includedUsed = unwrapVal(config?.includedUsed ?? config?.included_used, NaN);
    const totalUsed = unwrapVal(config?.totalUsed ?? config?.total_used, 0);

    if (Number.isFinite(monthlyLimit) && monthlyLimit > 0) {
      const used = Number.isFinite(includedUsed) ? includedUsed : totalUsed;
      const remaining = Math.max(0, monthlyLimit - used);
      quotas["monthly_included"] = {
        displayName: "Monthly Included",
        used,
        total: monthlyLimit,
        remaining,
        remainingPercentage: Math.max(0, Math.min(100, Math.round((remaining / monthlyLimit) * 100))),
        resetAt: periodEnd,
        unlimited: false,
        recurring: true,
      };
    }

    const onDemandCap = unwrapVal(config?.onDemandCap, NaN);
    const onDemandUsed = unwrapVal(config?.onDemandUsed, NaN);

    if (Number.isFinite(onDemandCap) && onDemandCap > 0) {
      const used = Number.isFinite(onDemandUsed) ? Math.max(0, onDemandUsed) : 0;
      const remaining = Math.max(0, onDemandCap - used);
      quotas["on_demand"] = {
        displayName: "On-Demand Credits",
        used,
        total: onDemandCap,
        remaining,
        remainingPercentage: Math.max(0, Math.min(100, Math.round((remaining / onDemandCap) * 100))),
        resetAt: periodEnd,
        unlimited: false,
        recurring: true,
      };
    } else if (Number.isFinite(onDemandCap) && onDemandCap === 0 && Number.isFinite(onDemandUsed)) {
      quotas["on_demand"] = {
        displayName: "On-Demand Credits",
        used: 1,
        total: 1,
        remaining: 0,
        remainingPercentage: 0,
        resetAt: periodEnd,
        unlimited: false,
        recurring: true,
      };
    }

    const prepaid = unwrapVal(config?.prepaidBalance, NaN);
    if (Number.isFinite(prepaid) && prepaid > 0) {
      quotas["prepaid"] = {
        displayName: "Prepaid Balance",
        used: 0,
        total: prepaid,
        remaining: prepaid,
        remainingPercentage: 100,
        resetAt: null,
        unlimited: false,
        recurring: false,
      };
    }

    const usedPct = unwrapVal(config?.creditUsagePercent ?? config?.credit_usage_percent, NaN);
    if (Number.isFinite(usedPct) && usedPct >= 0) {
      const clampedUsed = Math.max(0, Math.min(100, Math.round(usedPct)));
      const remaining = Math.max(0, 100 - clampedUsed);
      quotas["weekly_supergrok"] = {
        displayName: "Weekly SuperGrok",
        used: clampedUsed,
        total: 100,
        remaining,
        remainingPercentage: remaining,
        resetAt: periodEnd,
        unlimited: false,
        recurring: true,
      };
    } else {
      // Best-effort SuperGrok gRPC-web check
      try {
        const grpcRes = await fetchFn(GRPC_CREDITS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/grpc-web+proto",
            "x-grpc-web": "1",
          },
          body: GRPC_WEB_EMPTY_REQUEST_FRAME,
          signal: AbortSignal.timeout(4000),
        });
        if (grpcRes.ok) {
          const buf = Buffer.from(await grpcRes.arrayBuffer());
          const decoded = decodeGrokCreditsFrame(buf);
          if (decoded) {
            quotas["weekly_supergrok"] = {
              displayName: "Weekly SuperGrok",
              used: decoded.percentUsed,
              total: 100,
              remaining: 100 - decoded.percentUsed,
              remainingPercentage: 100 - decoded.percentUsed,
              resetAt: parseResetTime(decoded.resetAt),
              unlimited: false,
              recurring: true,
            };
          }
        }
      } catch {}
    }

    if (Object.keys(quotas).length === 0) {
      return {
        plan,
        message: "Grok connected. No active quota metrics returned.",
      };
    }

    return {
      plan,
      quotas,
    };
  } catch (err: any) {
    return { plan: "Grok", message: `Failed to fetch Grok usage: ${err.message}` };
  }
}
