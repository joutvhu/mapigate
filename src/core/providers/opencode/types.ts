export const OPENCODE_UA = "opencode/1.18.31";
export const OPENCODE_BASE_URL = "https://opencode.ai";
export const OPENCODE_FINGERPRINT_TOOLS = ["bash", "glob", "grep", "read"] as const;
export const OPENCODE_SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;
export const OPENCODE_REQUEST_RE = /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/;

export const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export type FingerprintFormat = "openai" | "claude" | "flat";

export const RESPONSES_MODELS = new Set([
  "muse-spark-1.2-contributor-free",
  "muse-spark-1.3-contributor-free",
]);

export const MESSAGES_MODELS = new Set(["union-alpha"]);

export function isResponsesModel(modelId?: string): boolean {
  if (!modelId) return false;
  const clean = modelId.replace(/\([^()]+\)\s*$/, "").trim().toLowerCase();
  return RESPONSES_MODELS.has(clean) || clean.startsWith("muse-spark");
}

export function isMessagesModel(modelId?: string): boolean {
  if (!modelId) return false;
  const clean = modelId.replace(/\([^()]+\)\s*$/, "").trim().toLowerCase();
  return MESSAGES_MODELS.has(clean);
}
