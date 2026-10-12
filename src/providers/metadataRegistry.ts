import type { ProviderRegistryItem } from "./types.js";
import {
  PROVIDER_REGISTRY as SHARED_PROVIDER_REGISTRY,
  getRegistryProvider as sharedGetRegistryProvider,
  getAllRegistryProviders as sharedGetAllRegistryProviders,
} from "../shared/constants/providerRegistry/index.js";

export const PROVIDER_REGISTRY: Record<string, ProviderRegistryItem> = {
  ...SHARED_PROVIDER_REGISTRY,
};

export function getRegistryProvider(id: string): ProviderRegistryItem | undefined {
  if (PROVIDER_REGISTRY[id]) return PROVIDER_REGISTRY[id];
  const lower = id.toLowerCase();
  for (const item of Object.values(PROVIDER_REGISTRY)) {
    if (item.id.toLowerCase() === lower) return item;
    if (item.alias?.toLowerCase() === lower) return item;
    if (item.uiAlias?.toLowerCase() === lower) return item;
    if (item.aliases?.some((a) => a.toLowerCase() === lower)) return item;
  }
  return sharedGetRegistryProvider(id);
}

export function getAllRegistryProviders(): ProviderRegistryItem[] {
  return Object.values(PROVIDER_REGISTRY);
}
