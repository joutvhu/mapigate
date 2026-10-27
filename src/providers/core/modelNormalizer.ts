import type { ProviderModelInput, RegistryModel } from "./types.js";
import { resolveModelDisplayName } from "../../core/capabilities/modelDictionary.js";

/**
 * Normalizes a single model declaration (string ID or partial RegistryModel)
 * into a complete RegistryModel with a resolved display name.
 */
export function normalizeRegistryModel(input: ProviderModelInput): RegistryModel {
  if (typeof input === "string") {
    return {
      id: input,
      name: resolveModelDisplayName(input),
    };
  }
  return {
    ...input,
    id: input.id,
    name: input.name || resolveModelDisplayName(input.id),
  };
}

/**
 * Normalizes an array of model declarations.
 */
export function normalizeRegistryModels(inputs?: ProviderModelInput[] | null): RegistryModel[] {
  if (!Array.isArray(inputs)) return [];
  return inputs.map(normalizeRegistryModel);
}
