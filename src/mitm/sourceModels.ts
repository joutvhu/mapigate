import { MITM_TOOLS } from "./handlers/generated/toolsConfig.js";
import { getDefaultMappings } from "./toolsHelper.js";
import { getCanonicalModelList, resolveModelDisplayName } from "../core/capabilities/modelDictionary.js";

export interface SuggestedSourceModel {
  id: string;
  name: string;
  category: "native" | "standard";
  toolId?: string;
}

/**
 * Returns a list of suggested source model IDs for a given MITM intercepted tool.
 * Native tool models are listed first, followed by canonical standard models.
 */
export function getSuggestedSourceModels(toolId?: string | null): SuggestedSourceModel[] {
  const tool = (toolId || "").toLowerCase();
  const seenIds = new Set<string>();
  const nativeModels: SuggestedSourceModel[] = [];

  // 1. Tool-specific native models from default mappings
  if (tool) {
    const defaults = getDefaultMappings(tool);
    for (const m of defaults) {
      const id = m.sourceModel;
      const lower = id.toLowerCase();
      if (!seenIds.has(lower)) {
        seenIds.add(lower);
        nativeModels.push({
          id,
          name: resolveModelDisplayName(id) || id,
          category: "native",
          toolId: tool,
        });
      }
    }

    // Also include any explicit keys from modelSynonyms for this tool
    const targetTool = MITM_TOOLS.find((t) => t.id === tool);
    if (targetTool?.modelSynonyms) {
      for (const key of Object.keys(targetTool.modelSynonyms)) {
        const lower = key.toLowerCase();
        if (!seenIds.has(lower)) {
          seenIds.add(lower);
          nativeModels.push({
            id: key,
            name: resolveModelDisplayName(key) || key,
            category: "native",
            toolId: tool,
          });
        }
      }
    }
  }

  // 2. Canonical standard models
  const canonicalList = getCanonicalModelList();
  const standardModels: SuggestedSourceModel[] = [];

  for (const item of canonicalList) {
    const lower = item.id.toLowerCase();
    if (!seenIds.has(lower)) {
      seenIds.add(lower);
      standardModels.push({
        id: item.id,
        name: item.name,
        category: "standard",
      });
    }
  }

  return [...nativeModels, ...standardModels];
}
