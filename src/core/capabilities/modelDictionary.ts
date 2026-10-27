/**
 * Canonical Model Dictionary & Display Name Resolver
 * 
 * Provides standard human-readable display names for common AI coding models.
 * Automatically derives reasoning and effort tiers (High, Medium, Low, Extra Low, Thinking)
 * as well as tags (:free, -preview, -beta) and date versions from the model ID.
 */

export const STANDARD_MODELS: Record<string, string> = {
  // ── Claude (Anthropic) ──
  "claude-fable-5-1": "Claude Fable 5.1",
  "claude-fable-5.1": "Claude Fable 5.1",
  "claude-fable-5": "Claude Fable 5",
  "claude-fable": "Claude Fable",
  "claude-opus-5.5": "Claude Opus 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-5.5": "Claude Sonnet 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-haiku-5.5": "Claude Haiku 5.5",
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-opus-5": "Claude Opus 5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-haiku-5": "Claude Haiku 5",
  "claude-haiku-6": "Claude Haiku 6",
  "claude-opus-4.8": "Claude Opus 4.8",
  "claude-opus-4-8": "Claude Opus 4.8",
  "claude-opus-4.7": "Claude Opus 4.7",
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-sonnet-4.7": "Claude Sonnet 4.7",
  "claude-sonnet-4-7": "Claude Sonnet 4.7",
  "claude-sonnet-4.6": "Claude Sonnet 4.6",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-opus-4.6": "Claude Opus 4.6",
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-sonnet-4.5": "Claude Sonnet 4.5",
  "claude-sonnet-4-5": "Claude Sonnet 4.5",
  "claude-opus-4.5": "Claude Opus 4.5",
  "claude-opus-4-5": "Claude Opus 4.5",
  "claude-haiku-4.5": "Claude Haiku 4.5",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-sonnet-4": "Claude Sonnet 4",
  "claude-opus-4": "Claude Opus 4",
  "claude-haiku-4": "Claude Haiku 4",
  "claude-3-7-sonnet": "Claude 3.7 Sonnet",
  "claude-3.7-sonnet": "Claude 3.7 Sonnet",
  "claude-3-5-sonnet": "Claude 3.5 Sonnet",
  "claude-3.5-sonnet": "Claude 3.5 Sonnet",
  "claude-3-5-haiku": "Claude 3.5 Haiku",
  "claude-3.5-haiku": "Claude 3.5 Haiku",
  "claude-3-opus": "Claude 3 Opus",
  "claude-3-haiku": "Claude 3 Haiku",

  // ── OpenAI & Codex ──
  "gpt-6.1-sol": "GPT-6.1 Sol",
  "gpt-6-astra": "GPT-6.0 Astra",
  "gpt-6-sol": "GPT-6.0 Sol",
  "gpt-6-luna": "GPT-6.0 Luna",
  "gpt-6": "GPT-6",
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-5.5-codex": "GPT-5.5 Codex",
  "gpt-5.5": "GPT-5.5",
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 Mini",
  "gpt-5.4-nano": "GPT-5.4 Nano",
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "gpt-5.2-codex": "GPT-5.2 Codex",
  "gpt-5.2": "GPT-5.2",
  "gpt-5.1": "GPT-5.1",
  "gpt-5": "GPT-5",
  "gpt-5-mini": "GPT-5 Mini",
  "gpt-5-nano": "GPT-5 Nano",
  "codex-pro": "Codex Pro",
  "codex-auto-review": "Codex Auto Review",
  "gpt-4.5": "GPT-4.5",
  "gpt-4.5-preview": "GPT-4.5 Preview",
  "gpt-4.1": "GPT-4.1",
  "gpt-4.1-mini": "GPT-4.1 Mini",
  "gpt-4.1-nano": "GPT-4.1 Nano",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4-turbo": "GPT-4 Turbo",
  "gpt-4": "GPT-4",
  "gpt-3.5-turbo": "GPT-3.5 Turbo",
  "o4-mini": "o4 Mini",
  "o4": "o4",
  "o3-pro": "o3 Pro",
  "o3-mini": "o3 Mini",
  "o3": "o3",
  "o1-pro": "o1 Pro",
  "o1": "o1",
  "o1-mini": "o1 Mini",
  "o1-preview": "o1 Preview",

  // ── Google Gemini & Gemma ──
  "gemini-4-argon": "Gemini 4 Argon",
  "gemini-4-ultra": "Gemini 4 Ultra",
  "gemini-4-pro": "Gemini 4 Pro",
  "gemini-4-flash": "Gemini 4 Flash",
  "gemini-4": "Gemini 4",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-3.8-pro": "Gemini 3.8 Pro",
  "gemini-3.7-flash": "Gemini 3.7 Flash",
  "gemini-3.7-pro": "Gemini 3.7 Pro",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-3.6-pro": "Gemini 3.6 Pro",
  "gemini-3.5-flash": "Gemini 3.5 Flash",
  "gemini-3.5-pro": "Gemini 3.5 Pro",
  "gemini-3.1-pro": "Gemini 3.1 Pro",
  "gemini-3-flash": "Gemini 3 Flash",
  "gemini-3-pro": "Gemini 3 Pro",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.0-pro": "Gemini 2.0 Pro",
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-2.0-flash-lite": "Gemini 2.0 Flash Lite",
  "gemini-2.0-flash-thinking": "Gemini 2.0 Flash Thinking",
  "gemini-1.5-pro": "Gemini 1.5 Pro",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
  "gemini-1.5-flash-8b": "Gemini 1.5 Flash 8B",
  "gemma-3-27b": "Gemma 3 27B",
  "gemma-3-12b": "Gemma 3 12B",
  "gemma-3-4b": "Gemma 3 4B",
  "gemma-2-27b": "Gemma 2 27B",
  "gemma-2-9b": "Gemma 2 9B",

  // ── DeepSeek ──
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "deepseek-v4-1-flash": "DeepSeek V4.1 Flash",
  "deepseek-v4.1": "DeepSeek V4.1",
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek-v4": "DeepSeek V4",
  "deepseek-flash": "DeepSeek Flash",
  "deepseek-3.2": "DeepSeek 3.2",
  "deepseek-3-2": "DeepSeek 3.2",
  "deepseek-v3.2": "DeepSeek V3.2",
  "deepseek-v3": "DeepSeek V3",
  "deepseek-chat": "DeepSeek V3",
  "deepseek-r1": "DeepSeek R1",
  "deepseek-reasoner": "DeepSeek R1",
  "deepseek-coder": "DeepSeek Coder",
  "deepseek-coder-v2": "DeepSeek Coder V2",

  // ── Qwen (Alibaba) ──
  "qwen3.8-flash": "Qwen 3.8 Flash",
  "qwen3.7-plus": "Qwen 3.7 Plus",
  "qwen3.7": "Qwen 3.7",
  "qwen3.6": "Qwen 3.6",
  "qwen3.5": "Qwen 3.5",
  "qwen3-coder-next": "Qwen3 Coder Next",
  "qwen3-coder": "Qwen3 Coder Next",
  "qwen3-max": "Qwen3 Max",
  "qwen-2.5-coder-32b": "Qwen 2.5 Coder 32B",
  "qwen-2.5-coder-14b": "Qwen 2.5 Coder 14B",
  "qwen-2.5-coder-7b": "Qwen 2.5 Coder 7B",
  "qwen-2.5-coder-1.5b": "Qwen 2.5 Coder 1.5B",
  "qwen-2.5-72b-instruct": "Qwen 2.5 72B Instruct",
  "qwen-2.5-32b-instruct": "Qwen 2.5 32B Instruct",
  "qwen-2.5-14b-instruct": "Qwen 2.5 14B Instruct",
  "qwen-2.5-7b-instruct": "Qwen 2.5 7B Instruct",
  "qwq-32b": "QwQ 32B",
  "qwq-plus": "QwQ Plus",

  // ── Moonshot / Kimi ──
  "kimi-k3.1-pro": "Kimi K3.1 Pro",
  "kimi-k3.1": "Kimi K3.1",
  "kimi-k3-1": "Kimi K3.1",
  "kimi-k3": "Kimi K3",
  "kimi-for-coding": "Kimi For Coding",
  "kimi-k2.8-preview": "Kimi K2.8 Preview",
  "kimi-k2.8": "Kimi K2.8",
  "kimi-k2.7-code": "Kimi K2.7 Code",
  "kimi-k2.7": "Kimi K2.7",
  "kimi-k2.6": "Kimi K2.6",
  "kimi-k2.5": "Kimi K2.5",
  "kimi-k1.5": "Kimi K1.5",
  "moonshot-v1": "Moonshot V1",

  // ── Xiaomi MiMo ──
  "mimo-v2.6": "MiMo V2.6",
  "mimo-v2.5": "MiMo V2.5",
  "mimo-omni": "MiMo Omni",
  "mimo-v2": "MiMo V2",

  // ── MiniMax ──
  "minimax-m3": "MiniMax M3",
  "minimax-m3-free": "MiniMax M3 (Free)",
  "minimax-m2.7": "MiniMax M2.7",
  "minimax-m2.5": "MiniMax M2.5",
  "minimax-m2-5": "MiniMax M2.5",
  "minimax-m2.1": "MiniMax M2.1",
  "minimax-m2-1": "MiniMax M2.1",
  "minimax-text-01": "MiniMax Text 01",
  "minimax-abab6.5s": "MiniMax Abab 6.5s",

  // ── ByteDance Doubao ──
  "doubao-seed-evolving": "Doubao Seed Evolving",
  "doubao-seed-2-1-turbo": "Doubao Seed 2.1 Turbo",
  "doubao-seed-2.1-turbo": "Doubao Seed 2.1 Turbo",
  "doubao-seed-2-0-mini": "Doubao Seed 2.0 Mini",
  "doubao-seed-2.0-mini": "Doubao Seed 2.0 Mini",
  "doubao-seed-2.0": "Doubao Seed 2.0",

  // ── GLM (Zhipu AI) ──
  "glm-5.3-flash": "GLM-5.3 Flash",
  "glm-5.3": "GLM-5.3",
  "glm-5.2": "GLM-5.2",
  "glm-5.1": "GLM-5.1",
  "glm-5": "GLM-5",
  "glm5": "GLM-5",
  "glm-4.7-flash": "GLM-4.7 Flash",
  "glm-4.6": "GLM-4.6",
  "glm-4-plus": "GLM-4 Plus",
  "glm-4-flash": "GLM-4 Flash",
  "glm-4-long": "GLM-4 Long",
  "glm-4-zero": "GLM-4 Zero",

  // ── Meta Llama ──
  "llama-4-scout": "Llama 4 Scout",
  "llama-4": "Llama 4",
  "llama-3.3-70b-instruct": "Llama 3.3 70B Instruct",
  "llama-3.2-3b-instruct": "Llama 3.2 3B Instruct",
  "llama-3.2-1b-instruct": "Llama 3.2 1B Instruct",
  "llama-3.1-405b-instruct": "Llama 3.1 405B Instruct",
  "llama-3.1-70b-instruct": "Llama 3.1 70B Instruct",
  "llama-3.1-8b-instruct": "Llama 3.1 8B Instruct",

  // ── Mistral ──
  "codestral-latest": "Codestral Latest",
  "codestral-2501": "Codestral 2501",
  "devstral": "Devstral",
  "mistral-large-latest": "Mistral Large Latest",
  "mistral-small-3.1-24b-instruct": "Mistral Small 3.1 24B Instruct",
  "mistral-small-latest": "Mistral Small Latest",
  "ministral-8b": "Ministral 8B",
  "ministral-3b": "Ministral 3B",

  // ── Microsoft AI ──
  "mai-code-1.1-flash": "MAI-Code 1.1 Flash",
  "mai-code-1.1": "MAI-Code 1.1",

  // ── Common MITM / Agent Modes ──
  "auto": "Auto (Agent Mode)",
  "simple-task": "Simple Task",
  "gpt-oss-120b": "GPT-OSS 120B",
};

// Suffix matcher: dates (8 digits), thinking tiers (high, medium, low, extra-low, thinking), version/tags (:free, -preview, -beta, -latest, @date, etc.)
const SUFFIX_REGEX = /[-_:@](extra-low|high-thinking|medium-thinking|low-thinking|high|medium|low|thinking|free|preview|latest|beta|eco|instruct|chat|v[0-9]+(?:\.[0-9]+)*|[0-9]{8})$/i;

function formatSuffixTag(raw: string): string {
  const s = raw.toLowerCase();
  switch (s) {
    case "high":
      return " (High)";
    case "medium":
      return " (Medium)";
    case "low":
      return " (Low)";
    case "extra-low":
      return " (Extra Low)";
    case "thinking":
      return " (Thinking)";
    case "high-thinking":
      return " (High Thinking)";
    case "medium-thinking":
      return " (Medium Thinking)";
    case "low-thinking":
      return " (Low Thinking)";
    case "free":
      return " (Free)";
    case "preview":
      return " (Preview)";
    case "beta":
      return " (Beta)";
    case "eco":
      return " (Eco)";
    default:
      if (/^v[0-9]+(?:\.[0-9]+)*$/i.test(s)) {
        return ` ${s.toUpperCase()}`;
      }
      return "";
  }
}

/**
 * Format fallback name for uncataloged models by replacing '-' and '_' with spaces
 * and capitalizing words while preserving common acronyms and version strings.
 */
export function formatModelDisplayNameFallback(modelId: string): string {
  if (!modelId) return "";
  const cleaned = modelId.includes("/") ? modelId.split("/").pop()! : modelId;

  return cleaned
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => {
      // Keep known acronyms or versions as uppercase
      if (/^(gpt|llm|ai|api|vl|dall|tts|stt|oss|r1|v[0-9]+|b|k)$/i.test(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function lookupStandardModel(key: string): string | undefined {
  if (!key) return undefined;
  if (STANDARD_MODELS[key]) return STANDARD_MODELS[key];
  const lower = key.toLowerCase();
  if (STANDARD_MODELS[lower]) return STANDARD_MODELS[lower];

  // Try dot-to-dash or dash-to-dot variant
  const dotToDash = lower.replace(/\./g, "-");
  if (STANDARD_MODELS[dotToDash]) return STANDARD_MODELS[dotToDash];
  const dashToDot = lower.replace(/-/g, ".");
  if (STANDARD_MODELS[dashToDot]) return STANDARD_MODELS[dashToDot];

  return undefined;
}

/**
 * Resolves a human-friendly display name from an arbitrary model ID.
 * Examples:
 *   "gemini-4-argon-high"               -> "Gemini 4 Argon (High)"
 *   "claude-sonnet-5.5-thinking"        -> "Claude Sonnet 5.5 (Thinking)"
 *   "claude-opus-4.5-medium"            -> "Claude Opus 4.5 (Medium)"
 *   "anthropic/claude-3-5-sonnet-20241022" -> "Claude 3.5 Sonnet"
 *   "openrouter/claude-3-5-sonnet:free" -> "Claude 3.5 Sonnet (Free)"
 */
export function resolveModelDisplayName(rawId?: string | null): string {
  if (!rawId) return "";

  // 1. Strip vendor prefixes (e.g. "anthropic/claude-3-5-sonnet" -> "claude-3-5-sonnet")
  let cleanId = rawId.includes("/") ? rawId.split("/").pop()! : rawId;
  cleanId = cleanId.trim();

  // Strip brackets like [1m]
  let contextTag = "";
  if (/\[1m\]/i.test(cleanId)) {
    contextTag = " (1M Context)";
    cleanId = cleanId.replace(/\[1m\]/i, "");
  }

  // 2. Direct exact match in standard dictionary
  const directMatch = lookupStandardModel(cleanId);
  if (directMatch) {
    return `${directMatch}${contextTag}`;
  }

  // 3. Suffix separation in a loop (supports multiple suffixes like -high:free or -thinking-high)
  let baseId = cleanId;
  const suffixTags: string[] = [];
  let stripping = true;

  while (stripping) {
    const match = baseId.match(SUFFIX_REGEX);
    if (match && match.index !== undefined && match.index > 0) {
      const rawSuffix = match[1];
      const tag = formatSuffixTag(rawSuffix);
      if (tag) {
        suffixTags.unshift(tag);
      }
      baseId = baseId.slice(0, match.index);
      // If baseId matches a known standard model without further stripping, finish loop
      if (lookupStandardModel(baseId)) {
        break;
      }
    } else {
      stripping = false;
    }
  }

  const baseMatch = lookupStandardModel(baseId);
  const combinedSuffixTag = suffixTags.join("");

  if (baseMatch) {
    return `${baseMatch}${combinedSuffixTag}${contextTag}`;
  }

  // 4. Fallback formatting
  const formatted = formatModelDisplayNameFallback(baseId);
  return `${formatted || baseId}${combinedSuffixTag}${contextTag}`;
}

/**
 * Returns canonical model list as a deduplicated array of { id, name }
 */
export function getCanonicalModelList(): Array<{ id: string; name: string }> {
  const seen = new Set<string>();
  const list: Array<{ id: string; name: string }> = [];

  for (const [id, name] of Object.entries(STANDARD_MODELS)) {
    // Only return preferred/canonical slug form (avoid redundant duplicates in UI list)
    if (!seen.has(name)) {
      seen.add(name);
      list.push({ id, name });
    }
  }

  return list;
}
