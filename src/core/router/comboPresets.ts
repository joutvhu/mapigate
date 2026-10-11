/**
 * Build Cursor / Claude default combo presets.
 * Combo names match client-native model IDs (no provider prefix);
 * each is seeded with the matching prefixed Mapigate model so routing works.
 */

import { CLI_TOOLS } from "../../shared/constants/cliTools.js";
import { getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";

export const VALID_COMBO_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
export const PRESET_SOURCES = new Set(["cursor", "claude"]);

const CURSOR_ALIAS = "cursor";
const CLAUDE_ALIAS = "claude";

/** Extra Claude Code aliases not listed in defaultModels. */
const CLAUDE_EXTRA_ALIAS_TARGETS: Record<string, string> = {
  default: "claude/claude-sonnet-4-6",
  opusplan: "claude/claude-opus-4-6-thinking",
};

export function isValidComboPresetName(name: string): boolean {
  return typeof name === "string" && name.length > 0 && VALID_COMBO_NAME_REGEX.test(name);
}

function pushItem(
  name: string,
  models: string[],
  seen?: Set<string>
): { name: string; models: string[] } | null {
  if (!isValidComboPresetName(name)) return null;
  if (seen?.has(name)) return null;
  if (!Array.isArray(models) || models.length === 0) return null;
  seen?.add(name);
  return { name, models };
}

function itemsFromModelList(
  modelList: Array<{ id?: string; name?: string } | string>,
  providerAlias: string,
  seen: Set<string>
): Array<{ name: string; models: string[] }> {
  const out: Array<{ name: string; models: string[] }> = [];
  for (const entry of modelList || []) {
    const id = typeof entry === "string" ? entry : entry?.id;
    if (!id) continue;
    const target = id.includes("/") ? id : `${providerAlias}/${id}`;
    const item = pushItem(id, [target], seen);
    if (item) out.push(item);
  }
  return out;
}

/**
 * Build Cursor default presets.
 * Prefer live catalog when provided; then DB provider models; otherwise static registry.
 */
export function buildCursorPresetItems(
  opts: { liveModels?: Array<{ id: string; name?: string } | string> } = {}
): Array<{ name: string; models: string[] }> {
  const seen = new Set<string>();

  if (Array.isArray(opts.liveModels) && opts.liveModels.length > 0) {
    return itemsFromModelList(opts.liveModels, CURSOR_ALIAS, seen);
  }

  // Check active provider in database
  try {
    const dbProvider = ProviderRepository.getProviderById("cursor");
    if (dbProvider && Array.isArray(dbProvider.models) && dbProvider.models.length > 0) {
      return itemsFromModelList(dbProvider.models, CURSOR_ALIAS, seen);
    }
  } catch {
    // Database might not be initialized yet
  }

  // Fallback to provider registry
  const reg = getRegistryProvider("cursor");
  const regModels = reg?.models || [];
  return itemsFromModelList(regModels, CURSOR_ALIAS, seen);
}

/**
 * Build Claude default presets from cc registry, CLI_TOOLS default models, and Claude Code aliases.
 */
export function buildClaudePresetItems(): Array<{ name: string; models: string[] }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; models: string[] }> = [];

  // 1. Default CLI tool models
  const claudeTool = CLI_TOOLS.claude || {};
  for (const entry of claudeTool.defaultModels || []) {
    const name = entry.alias || entry.id;
    const target = entry.defaultValue || entry.id;
    if (!name || !target) continue;
    const prefixedTarget = target.includes("/") ? target : `${CLAUDE_ALIAS}/${target}`;
    const item = pushItem(name, [prefixedTarget], seen);
    if (item) out.push(item);
  }

  // 2. Extra Claude aliases
  for (const alias of claudeTool.modelAliases || []) {
    if (seen.has(alias)) continue;
    const target = CLAUDE_EXTRA_ALIAS_TARGETS[alias];
    if (!target) continue;
    const item = pushItem(alias, [target], seen);
    if (item) out.push(item);
  }

  // 3. Provider models from DB or Registry
  try {
    const dbProvider = ProviderRepository.getProviderById("claude");
    if (dbProvider && Array.isArray(dbProvider.models) && dbProvider.models.length > 0) {
      const dbItems = itemsFromModelList(dbProvider.models, CLAUDE_ALIAS, seen);
      out.push(...dbItems);
    } else {
      const reg = getRegistryProvider("claude");
      if (reg && Array.isArray(reg.models) && reg.models.length > 0) {
        const regItems = itemsFromModelList(reg.models, CLAUDE_ALIAS, seen);
        out.push(...regItems);
      }
    }
  } catch {
    // Fallback if DB not ready
  }

  return out;
}

/**
 * Build presets for a given source ("cursor" | "claude") annotated with whether they already exist.
 */
export function buildPresetItems(
  source: string,
  opts: {
    liveModels?: Array<{ id: string; name?: string } | string>;
    existingNames?: Iterable<string>;
  } = {}
): Array<{ name: string; models: string[]; exists: boolean }> {
  if (!PRESET_SOURCES.has(source)) return [];

  const items =
    source === "cursor"
      ? buildCursorPresetItems({ liveModels: opts.liveModels })
      : buildClaudePresetItems();

  const existing = new Set(opts.existingNames || []);
  return items.map((item) => ({
    ...item,
    exists: existing.has(item.name),
  }));
}
