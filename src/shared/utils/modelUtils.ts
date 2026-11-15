/**
 * Model Identifier Normalization & Fuzzy Equivalence Utilities
 *
 * Normalizes model names and slugs so that dot-separated versions (e.g. "k3.1", "3.5", "4.5")
 * and dash-separated versions (e.g. "k3-1", "3-5", "4-5") match interchangeably.
 */

/**
 * Normalizes a model identifier into a canonical comparison key:
 * - Lowercases and trims
 * - Strips leading "models/" prefix
 * - Optionally strips vendor prefixes (e.g. "moonshotai/")
 * - Replaces all dots (.) with dashes (-)
 * - Replaces whitespace and underscores with dashes (-)
 * - Collapses consecutive dashes and trims boundary dashes
 *
 * Examples:
 *   "kimi-k3.1-pro"      -> "kimi-k3-1-pro"
 *   "kimi-k3-1-pro"      -> "kimi-k3-1-pro"
 *   "Claude Sonnet 4.5"  -> "claude-sonnet-4-5"
 *   "models/gpt-4.5"     -> "gpt-4-5"
 */
export function normalizeModelCompareKey(model?: string | null, stripVendor = false): string {
  if (!model) return "";
  let clean = String(model).trim().toLowerCase();
  clean = clean.replace(/^models\//, "");
  if (stripVendor && clean.includes("/")) {
    clean = clean.split("/").pop()!;
  }
  return clean
    .replace(/\./g, "-")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Checks whether two model identifiers are equivalent, treating '.' and '-' as interchangeable.
 * Also checks vendor-stripped base IDs when one has a vendor prefix and the other does not.
 *
 * Examples:
 *   areModelNamesEquivalent("kimi-k3.1-pro", "kimi-k3-1-pro") -> true
 *   areModelNamesEquivalent("moonshotai/kimi-k3.1-pro", "kimi-k3-1-pro") -> true
 *   areModelNamesEquivalent("Claude Sonnet 4.5", "claude-sonnet-4-5") -> true
 */
export function areModelNamesEquivalent(modelA?: string | null, modelB?: string | null): boolean {
  if (!modelA || !modelB) return false;
  if (modelA.toLowerCase() === modelB.toLowerCase()) return true;

  const keyA = normalizeModelCompareKey(modelA);
  const keyB = normalizeModelCompareKey(modelB);
  if (keyA === keyB) return true;

  // Only strip vendor if one side has a vendor prefix and the other does not
  // (e.g. "moonshotai/kimi-k3.1-pro" vs "kimi-k3-1-pro")
  const hasSlashA = modelA.includes("/");
  const hasSlashB = modelB.includes("/");
  if (hasSlashA !== hasSlashB) {
    const baseKeyA = normalizeModelCompareKey(modelA, true);
    const baseKeyB = normalizeModelCompareKey(modelB, true);
    return baseKeyA === baseKeyB;
  }

  return false;
}
