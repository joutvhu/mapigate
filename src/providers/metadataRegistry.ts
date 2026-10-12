import type { ProviderRegistryItem } from "./types.js";
import { metadataChunk1 } from "./metadata/chunk1.js";
import { metadataChunk2 } from "./metadata/chunk2.js";
import { metadataChunk3 } from "./metadata/chunk3.js";
import { metadataChunk4 } from "./metadata/chunk4.js";
import { metadataChunk5 } from "./metadata/chunk5.js";

export const PROVIDER_REGISTRY: Record<string, ProviderRegistryItem> = {
  ...metadataChunk1,
  ...metadataChunk2,
  ...metadataChunk3,
  ...metadataChunk4,
  ...metadataChunk5,
};

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
