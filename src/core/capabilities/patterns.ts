import type { ModelCapabilities } from "./types.js";
import { NOT_VISION, VISION_NAME } from "./constants.js";

/**
 * Name-based vision detection as a last-resort fallback.
 */
export function looksLikeVisionModel(modelId?: string | null): boolean {
  if (!modelId) return false;
  const id = String(modelId).toLowerCase();
  if (NOT_VISION.test(id)) return false;
  return VISION_NAME.test(id);
}

/**
 * Glob pattern match (* = wildcard), case-insensitive and anchored.
 */
export function matchPattern(pattern: string, model: string): boolean {
  if (!pattern || !model) return false;
  const regex = new RegExp(
    "^" + pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$",
    "i"
  );
  return regex.test(model);
}

/**
 * Glob pattern matching ordered from specific to generic.
 */
export const PATTERN_CAPABILITIES: Array<{ pattern: string; caps: Partial<ModelCapabilities> }> = [
  // ── Claude ──
  { pattern: "*claude*opus-5*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*sonnet-5*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-4.6*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive" } },
  { pattern: "*claude*opus-4.7*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive" } },
  { pattern: "*claude*opus-4.8*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive" } },
  { pattern: "*claude*sonnet-4.6*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive" } },
  { pattern: "*claude*sonnet-4.7*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive" } },
  { pattern: "*claude*haiku-6*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*haiku-5*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*haiku-4*", caps: { vision: true, pdf: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude*haiku*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude*opus*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude*sonnet*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude*3.7*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude*3-7*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude-3*", caps: { vision: true } },
  { pattern: "*claude*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },

  // ── Gemini ──
  { pattern: "*gemini*image*", caps: { vision: true, imageOutput: true, contextWindow: 1048576 } },
  { pattern: "*gemini-4*", caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, search: true, thinkingFormat: "gemini-level", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-3.8*", caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, search: true, thinkingFormat: "gemini-level", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-3.7*", caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, search: true, thinkingFormat: "gemini-level", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-2.5*", caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, search: true, thinkingFormat: "gemini-budget", thinkingRange: { min: 0, max: 24576 }, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini-2*", caps: { vision: true, audioInput: true, videoInput: true, search: true, contextWindow: 1048576, maxOutput: 65536 } },
  { pattern: "*gemini*", caps: { vision: true, search: true, contextWindow: 1048576 } },
  { pattern: "*gemma*", caps: { vision: true, contextWindow: 128000 } },

  // ── OpenAI GPT ──
  { pattern: "*gpt-6*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 1050000, maxOutput: 128000 } },
  { pattern: "*gpt-5*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 400000, maxOutput: 128000 } },
  { pattern: "*gpt-4o*", caps: { vision: true, search: true, contextWindow: 128000, maxOutput: 16384 } },
  { pattern: "*gpt-4.1*", caps: { vision: true, contextWindow: 1000000, maxOutput: 32768 } },
  { pattern: "*gpt-4-turbo*", caps: { vision: true, contextWindow: 128000 } },
  { pattern: "*gpt-4*", caps: { contextWindow: 128000 } },
  { pattern: "*gpt-3.5*", caps: { contextWindow: 16385, maxOutput: 4096 } },
  { pattern: "*o1-mini*", caps: { reasoning: true, thinkingFormat: "openai", contextWindow: 128000 } },
  { pattern: "*o1*", caps: { vision: true, reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 100000 } },
  { pattern: "*o3*", caps: { vision: true, reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 100000 } },
  { pattern: "*o4*", caps: { vision: true, reasoning: true, thinkingFormat: "openai", contextWindow: 200000, maxOutput: 100000 } },

  // ── xAI Grok ──
  { pattern: "*grok*image*", caps: { imageOutput: true } },
  { pattern: "*grok-code*", caps: { reasoning: true, thinkingFormat: "openai", contextWindow: 256000 } },
  { pattern: "*grok-4.7*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 500000, maxOutput: 500000 } },
  { pattern: "*grok-4.6*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 500000, maxOutput: 500000 } },
  { pattern: "*grok-4.5*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 500000, maxOutput: 64000 } },
  { pattern: "*grok-4*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 256000 } },
  { pattern: "*grok*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "openai", contextWindow: 128000 } },

  // ── DeepSeek ──
  { pattern: "*deepseek*v4.1*flash*free*", caps: { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 330000, maxOutput: 128000 } },
  { pattern: "*deepseek-v4.*", caps: { vision: true, reasoning: true, thinkingFormat: "deepseek", thinkingEffortSupported: true, contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*deepseek-v4*", caps: { reasoning: true, thinkingFormat: "deepseek", thinkingEffortSupported: true, contextWindow: 1000000, maxOutput: 384000 } },
  { pattern: "*reasoner*", caps: { vision: false, reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 128000 } },
  { pattern: "*deepseek-r*", caps: { vision: false, reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 128000 } },
  { pattern: "*deepseek-chat*", caps: { vision: false, reasoning: true, thinkingFormat: "deepseek", contextWindow: 128000 } },
  { pattern: "*deepseek*", caps: { reasoning: true, thinkingFormat: "deepseek", contextWindow: 128000 } },

  // ── Qwen ──
  { pattern: "*qwen*vl*", caps: { vision: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 262144 } },
  { pattern: "*qwen*omni*", caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 262144, maxOutput: 65536 } },
  { pattern: "*qwen*coder*", caps: { reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000 } },
  { pattern: "*qwen*max*", caps: { vision: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 65536 } },
  { pattern: "*qwen3.5*", caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 65536 } },
  { pattern: "*qwen3.6*", caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 65536 } },
  { pattern: "*qwen3.7*", caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 65536 } },
  { pattern: "*qwen*plus*", caps: { vision: true, reasoning: true, thinkingFormat: "qwen", contextWindow: 1000000, maxOutput: 65536 } },
  { pattern: "*qwq*", caps: { reasoning: true, thinkingFormat: "qwen", thinkingCanDisable: false, contextWindow: 131072 } },
  { pattern: "*qwen*", caps: { reasoning: true, thinkingFormat: "qwen", contextWindow: 262144 } },

  // ── Moonshot / Kimi ──
  { pattern: "*kimi*k3.1*", caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*kimi*k3*", caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*k3.1*", caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*k3*", caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*kimi*coding*", caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 262144, maxOutput: 65536 } },
  { pattern: "*kimi*k2*", caps: { vision: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 262144, maxOutput: 65536 } },
  { pattern: "*kimi*", caps: { vision: true, reasoning: true, thinkingFormat: "kimi", contextWindow: 262144 } },

  // ── Xiaomi MiMo ──
  { pattern: "*mimo*v2.6*", caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*mimo*v2.5*", caps: { vision: true, audioInput: true, videoInput: true, reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 131072 } },
  { pattern: "*mimo*omni*", caps: { vision: true, audioInput: true, reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 262144, maxOutput: 131072 } },
  { pattern: "*mimo*", caps: { vision: true, reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 262144, maxOutput: 131072 } },

  // ── Llama ──
  { pattern: "*llama-4*", caps: { vision: true, contextWindow: 1000000 } },
  { pattern: "*llama*", caps: { contextWindow: 128000 } },

  // ── Mistral ──
  { pattern: "*mistral-large*", caps: { vision: true, contextWindow: 256000 } },
  { pattern: "*codestral*", caps: { contextWindow: 256000 } },
  { pattern: "*mistral*", caps: { contextWindow: 128000 } },
];
