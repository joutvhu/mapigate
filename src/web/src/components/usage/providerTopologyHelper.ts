import { getRegistryProvider } from "../../../../shared/constants/providerRegistry.js";

export interface ProviderTopologyMeta {
  id: string;
  name: string;
  color: string;
  image?: string;
  iconBg?: string;
}

const TOPOLOGY_PROVIDER_ALIASES: Record<string, string> = {
  "github-copilot": "github",
  copilot: "github",
  "devin-cli": "devin",
  "devin-desktop": "devin",
  "devin-cli-agentic": "devin",
  dvd: "devin",
};

/**
 * Resolves topology metadata (name, color, image, iconBg) for a given provider ID
 * using canonical metadata from the provider registry, with graceful fallbacks.
 */
export function getProviderMeta(providerId: string): ProviderTopologyMeta {
  if (!providerId) {
    return {
      id: "unknown",
      name: "Unknown",
      color: "#64748B",
    };
  }

  const rawLower = providerId.toLowerCase().trim();
  const canonicalId = TOPOLOGY_PROVIDER_ALIASES[rawLower] || rawLower;
  const reg = getRegistryProvider(canonicalId) || getRegistryProvider(rawLower);

  if (reg) {
    return {
      id: reg.id,
      name: reg.name,
      color: reg.color || "#64748B",
      image: reg.image,
      iconBg: reg.iconBg,
    };
  }

  return {
    id: providerId,
    name: providerId.charAt(0).toUpperCase() + providerId.slice(1),
    color: "#64748B",
  };
}
