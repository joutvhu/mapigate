import type { ProviderRegistryItem } from "../../../providers/core/types.js";
import type { FreeTierProviderData, ResolvedFreeModel } from "./freeTierHelper.js";

export type FreeTierGroupMode = "provider" | "model" | "family" | "role";

export interface FreeTierModelCandidate {
  model: ResolvedFreeModel;
  provider: ProviderRegistryItem;
  connectionStatus: "connected" | "not_connected" | "error" | "exhausted";
  statusLabel: string;
  statusDetail?: string;
  latencyMs?: number;
}

export interface FreeTierGroup {
  id: string;
  name: string;
  description?: string;
  badge?: string;
  defaultComboName: string;
  candidates: FreeTierModelCandidate[];
}

/**
 * Normalizes a model identifier into a canonical key to align identical/equivalent models
 * across providers (e.g. "groq/llama-3.3-70b-versatile" and "cerebras/llama-3.3-70b").
 */
export function extractCanonicalModelKey(rawId: string): string {
  if (!rawId) return "";
  let id = rawId.trim().toLowerCase();

  // Strip vendor prefixes if present (e.g. "meta-llama/", "openai/", "google/")
  if (id.includes("/")) {
    id = id.split("/").pop()!;
  }

  // Strip distribution tags & qualifiers
  id = id
    .replace(/:free$/, "")
    .replace(/-free$/, "")
    .replace(/\/free$/, "")
    .replace(/-contributor-free(-exp)?$/, "")
    .replace(/-vision-exp$/, "")
    .replace(/-(versatile|instant|instruct|preview|latest|it)$/, "")
    .replace(/-(2501|2507|1017)$/, "");

  // Normalize dots & spaces to dashes
  id = id.replace(/\./g, "-").replace(/[\s_]+/g, "-").replace(/-+/g, "-");

  // Normalize common variations
  id = id
    .replace(/^meta-llama-/, "llama-")
    .replace(/^qwen3/, "qwen-3")
    .replace(/^qwen2-5/, "qwen-2-5")
    .replace(/^llama3-3/, "llama-3-3")
    .replace(/^llama4/, "llama-4")
    .replace(/^zai-glm-/, "glm-");

  return id.replace(/^-+|-+$/g, "");
}

/**
 * Formats a canonical key into a readable human title.
 */
export function formatModelGroupTitle(key: string): string {
  if (!key) return "Unknown Model";

  // Friendly title overrides for prominent models
  const MAP: Record<string, string> = {
    "llama-3-3-70b": "Llama 3.3 70B",
    "llama-3-1-8b": "Llama 3.1 8B",
    "llama-4-maverick-17b-128e": "Llama 4 Maverick",
    "llama-4-scout-17b-16e": "Llama 4 Scout",
    "qwen-3-32b": "Qwen 3 32B",
    "qwen-2-5-coder-32b": "Qwen 2.5 Coder 32B",
    "gpt-oss-120b": "GPT OSS 120B",
    "gemini-3-8-flash": "Gemini 3.8 Flash",
    "gemini-2-5-flash": "Gemini 2.5 Flash",
    "gemini-2-5-pro": "Gemini 2.5 Pro",
    "deepseek-r1-distill-llama-70b": "DeepSeek R1 (Llama 70B)",
    "deepseek-r1": "DeepSeek R1",
    "deepseek-v4-flash": "DeepSeek V4 Flash",
    "deepseek-v4-1-flash": "DeepSeek V4.1 Flash",
    "minimax-m2-7": "MiniMax M2.7",
    "minimax-m3": "MiniMax M3",
    "codestral": "Codestral",
    "mistral-small": "Mistral Small",
  };

  if (MAP[key]) return MAP[key];

  return key
    .split("-")
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Categorizes a model into a family ecosystem.
 */
export function getModelFamily(key: string): { id: string; name: string } {
  const k = key.toLowerCase();
  if (k.includes("llama")) return { id: "llama", name: "Meta Llama" };
  if (k.includes("qwen") || k.includes("qwq")) return { id: "qwen", name: "Qwen" };
  if (k.includes("deepseek")) return { id: "deepseek", name: "DeepSeek" };
  if (k.includes("gemini") || k.includes("gemma")) return { id: "gemini", name: "Google Gemini" };
  if (k.includes("mistral") || k.includes("codestral") || k.includes("ministral")) {
    return { id: "mistral", name: "Mistral AI" };
  }
  if (k.includes("glm") || k.includes("zcode")) return { id: "glm", name: "Zhipu GLM" };
  if (k.includes("minimax")) return { id: "minimax", name: "MiniMax" };
  if (k.includes("gpt") || k.includes("openai")) return { id: "gpt", name: "OpenAI / GPT-OSS" };
  if (k.includes("kilo")) return { id: "kilo", name: "Kilo Gateway" };
  return { id: "community", name: "Community / Other" };
}

/**
 * Categorizes a model into a purpose/role bucket.
 */
export function getModelRole(
  key: string,
  model: ResolvedFreeModel
): { id: string; name: string; description: string } {
  let capText = "";
  if (Array.isArray(model.capabilities)) {
    capText = model.capabilities.join(" ");
  } else if (model.capabilities && typeof model.capabilities === "object") {
    capText = Object.entries(model.capabilities)
      .filter(([_, v]) => Boolean(v))
      .map(([k]) => k)
      .join(" ");
  } else if (typeof model.capabilities === "string") {
    capText = model.capabilities;
  }

  const k = `${key} ${model.name || ""} ${capText}`.toLowerCase();

  if (k.includes("coder") || k.includes("codestral") || k.includes("code")) {
    return {
      id: "coding",
      name: "Coding Specialists",
      description: "Models tuned specifically for programming and code completion",
    };
  }

  if (k.includes("r1") || k.includes("qwq") || k.includes("reasoning") || k.includes("thinking")) {
    return {
      id: "reasoning",
      name: "Deep Reasoning",
      description: "Chain-of-thought and deep reasoning models for complex problem solving",
    };
  }

  if (
    k.includes("flash-lite") ||
    k.includes("instant") ||
    k.includes("nano") ||
    k.includes("mini") ||
    k.includes("-8b") ||
    k.includes("-3b") ||
    k.includes("-1b")
  ) {
    return {
      id: "fast",
      name: "Fast & Lightweight",
      description: "Ultra-fast low-latency models for autocomplete and quick tasks",
    };
  }

  return {
    id: "general",
    name: "General & Balanced",
    description: "High-capacity balanced models for versatile assistant workflows",
  };
}

/**
 * Sorts model candidates by connection health, then latency.
 */
export function sortCandidatesByPriority(candidates: FreeTierModelCandidate[]): FreeTierModelCandidate[] {
  return [...candidates].sort((a, b) => {
    const statusWeight = (s: string) => {
      if (s === "connected") return 0;
      if (s === "not_connected") return 1;
      return 2;
    };
    const wA = statusWeight(a.connectionStatus);
    const wB = statusWeight(b.connectionStatus);
    if (wA !== wB) return wA - wB;

    if (a.latencyMs != null && b.latencyMs != null) {
      return a.latencyMs - b.latencyMs;
    }
    if (a.latencyMs != null) return -1;
    if (b.latencyMs != null) return 1;

    return a.provider.name.localeCompare(b.provider.name);
  });
}

/**
 * Generates a collision-free combo name against existing combos and current batch names.
 */
export function generateUniqueComboName(
  baseName: string,
  existingNames: string[] | Set<string>,
  usedInBatch: Set<string> = new Set()
): string {
  const existingSet = existingNames instanceof Set ? existingNames : new Set(existingNames);
  let name = baseName
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!name) name = "free-combo";

  let candidate = name;
  let counter = 2;
  while (existingSet.has(candidate) || usedInBatch.has(candidate)) {
    candidate = `${name}-${counter++}`;
  }
  usedInBatch.add(candidate);
  return candidate;
}

/**
 * Groups free tier models across providers by exact model, family, or role.
 */
export function groupFreeTierModels(
  freeProviders: FreeTierProviderData[],
  mode: "model" | "family" | "role",
  prefix = "free-"
): FreeTierGroup[] {
  const map = new Map<string, FreeTierGroup>();

  for (const pData of freeProviders) {
    for (const model of pData.freeModels) {
      const canonicalKey = extractCanonicalModelKey(model.id);
      let groupId = "";
      let groupName = "";
      let groupDesc: string | undefined;

      if (mode === "model") {
        groupId = canonicalKey || model.id;
        groupName = formatModelGroupTitle(canonicalKey);
      } else if (mode === "family") {
        const fam = getModelFamily(canonicalKey);
        groupId = fam.id;
        groupName = fam.name;
        groupDesc = `Models from the ${fam.name} architecture`;
      } else {
        const role = getModelRole(canonicalKey, model);
        groupId = role.id;
        groupName = role.name;
        groupDesc = role.description;
      }

      if (!map.has(groupId)) {
        const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_.-]/g, "");
        const defaultName = `${cleanPrefix}${groupId}`.replace(/-+/g, "-");
        map.set(groupId, {
          id: groupId,
          name: groupName,
          description: groupDesc,
          defaultComboName: defaultName,
          candidates: [],
        });
      }

      const grp = map.get(groupId)!;
      grp.candidates.push({
        model,
        provider: pData.provider,
        connectionStatus: pData.connectionStatus,
        statusLabel: pData.statusLabel,
        statusDetail: pData.statusDetail,
        latencyMs: pData.testResult?.latencyMs,
      });
    }
  }

  // Sort candidates within each group & sort groups by multi-provider priority
  const result: FreeTierGroup[] = [];
  for (const grp of map.values()) {
    grp.candidates = sortCandidatesByPriority(grp.candidates);
    const uniqueProviders = new Set(grp.candidates.map((c) => c.provider.id)).size;
    grp.badge = `${uniqueProviders} Provider${uniqueProviders > 1 ? "s" : ""}`;
    result.push(grp);
  }

  if (mode === "model") {
    // Show models with 2+ providers first (best fallback targets)
    result.sort((a, b) => {
      const countA = new Set(a.candidates.map((c) => c.provider.id)).size;
      const countB = new Set(b.candidates.map((c) => c.provider.id)).size;
      if (countA !== countB) return countB - countA;
      return a.name.localeCompare(b.name);
    });
  } else {
    result.sort((a, b) => b.candidates.length - a.candidates.length);
  }

  return result;
}

export const VALID_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

/**
 * Validates and packages multi-combo payload items with duplicate checks.
 */
export function buildMultiComboPayload(
  activeGroups: FreeTierGroup[],
  selectedModelValues: Set<string>,
  groupComboNames: Record<string, string>,
  existingComboNames: string[],
  strategy: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c"
): {
  error?: string;
  combos?: Array<{
    name: string;
    models: string[];
    strategy: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c";
  }>;
} {
  const combosToCreate: Array<{
    name: string;
    models: string[];
    strategy: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c";
  }> = [];
  const seenNames = new Set(existingComboNames);

  for (const grp of activeGroups) {
    const rawName = (groupComboNames[grp.id] || grp.defaultComboName).trim();
    if (!rawName) return { error: `Combo name for "${grp.name}" cannot be empty.` };
    if (!VALID_NAME_REGEX.test(rawName)) {
      return { error: `Invalid name "${rawName}". Use only letters, numbers, -, _ and .` };
    }
    if (seenNames.has(rawName)) {
      return { error: `Combo name "${rawName}" already exists. Please choose another.` };
    }
    seenNames.add(rawName);

    const selectedModelsInGroup = grp.candidates
      .filter((c) => selectedModelValues.has(c.model.comboModelValue))
      .map((c) => c.model.comboModelValue);

    if (selectedModelsInGroup.length > 0) {
      combosToCreate.push({
        name: rawName,
        models: selectedModelsInGroup,
        strategy,
      });
    }
  }

  if (combosToCreate.length === 0) return { error: "No valid combos to create." };
  return { combos: combosToCreate };
}
