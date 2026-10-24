import { getRegistryProvider, PROVIDER_REGISTRY } from "../../providers/metadataRegistry.js";

/**
 * Fallback static map for common providers if accessed outside registered providers context.
 */
const FALLBACK_QUOTA_ORDER_MAP: Record<string, string[]> = {
  antigravity: [
    "Gemini (5h)",
    "Gemini (Weekly)",
    "Claude & GPT (5h)",
    "Claude & GPT (Weekly)",
  ],
  github: [
    "Chat",
    "Completions",
    "Premium Interactions",
  ],
  copilot: [
    "Chat",
    "Completions",
    "Premium Interactions",
  ],
  claude: [
    "5-Hour Window",
    "5h Session",
    "Session",
    "7-Day Window",
    "Weekly",
  ],
  codex: [
    "Session",
    "Weekly",
    "Credits",
    "Balance",
  ],
  openai: [
    "Session",
    "Weekly",
    "Credits",
    "Balance",
  ],
  gemini: [
    "Requests (RPM)",
    "Requests (Daily)",
    "Tokens (TPM)",
    "Tokens (Daily)",
  ],
  "gemini-cli": [
    "Gemini (5h)",
    "Gemini (Weekly)",
    "Requests (RPM)",
    "Requests (Daily)",
    "Tokens (TPM)",
    "Tokens (Daily)",
  ],
  grok: [
    "Session",
    "Weekly",
    "Requests",
    "Tokens",
    "Balance",
  ],
  "grok-cli": [
    "Session",
    "Weekly",
    "Requests",
    "Tokens",
    "Balance",
  ],
  kiro: [
    "Session",
    "Weekly",
    "Monthly",
    "Credits",
  ],
  deepseek: [
    "Balance",
    "Total Grants",
    "Topped-up Balance",
  ],
  minimax: [
    "Coding Tokens",
    "Standard Tokens",
    "Balance",
  ],
  "minimax-cn": [
    "Coding Tokens",
    "Standard Tokens",
    "Balance",
  ],
  glm: [
    "Session",
    "Weekly",
    "Balance",
  ],
  "glm-cn": [
    "Session",
    "Weekly",
    "Balance",
  ],
  qoder: [
    "Daily",
    "Weekly",
    "Monthly",
    "Balance",
  ],
  "qoder-cn": [
    "Daily",
    "Weekly",
    "Monthly",
    "Balance",
  ],
  xkiro: [
    "Session (5h)",
    "Weekly (7d)",
    "Free Tokens (Daily)",
    "Wallet Balance",
  ],
  "xiaomi-tokenplan": [
    "Monthly Tokens",
    "Weekly Quota",
  ],
  xmtp: [
    "Monthly Tokens",
    "Weekly Quota",
  ],
  "xiaomi-mimo": [
    "Monthly Tokens",
    "Weekly Quota",
  ],
  mimo: [
    "Monthly Tokens",
    "Weekly Quota",
  ],
};

/**
 * Proxy that pulls quotaOrder dynamically from provider metadata in metadataRegistry,
 * falling back to static constants if not yet found.
 */
export const PROVIDER_QUOTA_ORDER_MAP: Record<string, string[]> = new Proxy(
  FALLBACK_QUOTA_ORDER_MAP,
  {
    get(target, prop: string) {
      if (typeof prop !== "string") return undefined;
      const lower = prop.toLowerCase();
      const item = getRegistryProvider(lower);
      if (item?.quotaOrder) return item.quotaOrder;
      return target[lower];
    },
    has(target, prop: string) {
      if (typeof prop !== "string") return false;
      const lower = prop.toLowerCase();
      const item = getRegistryProvider(lower);
      return Boolean(item?.quotaOrder) || lower in target;
    },
  }
);

/**
 * Sorts normalized quota items into a fixed, deterministic order per provider.
 * Reads preferred order directly from provider metadata if available.
 */
export function sortNormalizedQuotas<T extends { label: string }>(
  providerId: string,
  items: T[]
): T[] {
  if (!items || items.length <= 1) return items ? [...items] : [];

  const normProvider = (providerId || "").toLowerCase();
  const providerItem = getRegistryProvider(normProvider);
  const preferredOrder = providerItem?.quotaOrder || PROVIDER_QUOTA_ORDER_MAP[normProvider] || [];

  return [...items].sort((a, b) => {
    const getPriority = (label: string): number => {
      const l = (label || "").trim().toLowerCase();
      const idx = preferredOrder.findIndex((pref) => {
        const p = pref.toLowerCase();
        return l === p || l.startsWith(p) || p.startsWith(l) || l.includes(p);
      });
      return idx === -1 ? 9999 : idx;
    };

    const prioA = getPriority(a.label);
    const prioB = getPriority(b.label);

    if (prioA !== prioB) {
      return prioA - prioB;
    }

    // Tie-breaker: alphabetical order by label to ensure deterministic stability
    return (a.label || "").localeCompare(b.label || "");
  });
}
