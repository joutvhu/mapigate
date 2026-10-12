import type { ProviderRegistryItem } from "./types.js";
import { PROVIDER_REGISTRY as GENERATED_REGISTRY } from "./generated/metadataRegistry.generated.js";

export const PROVIDER_REGISTRY: Record<string, ProviderRegistryItem> = GENERATED_REGISTRY;

export function getRegistryProvider(id: string): ProviderRegistryItem | undefined {
  if (!id) return undefined;
  if (PROVIDER_REGISTRY[id]) return PROVIDER_REGISTRY[id];
  const lower = id.toLowerCase();
  if (PROVIDER_REGISTRY[lower]) return PROVIDER_REGISTRY[lower];
  for (const item of Object.values(PROVIDER_REGISTRY)) {
    if (item.id.toLowerCase() === lower) return item;
    if (item.alias?.toLowerCase() === lower) return item;
    if (item.uiAlias?.toLowerCase() === lower) return item;
    if (item.aliases?.some((a) => a.toLowerCase() === lower)) return item;
  }
  return undefined;
}

export function getAllRegistryProviders(): ProviderRegistryItem[] {
  return Object.values(PROVIDER_REGISTRY);
}
