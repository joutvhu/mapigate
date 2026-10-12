import type { ModelCapabilities } from "./types.js";

/**
 * Safe floor - every resolved result is merged over this so consumers
 * never need null-checks.
 */
export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  vision: false,
  pdf: false,
  audioInput: false,
  videoInput: false,
  imageOutput: false,
  audioOutput: false,
  search: false,
  tools: true,
  reasoning: false,
  thinkingFormat: null,
  thinkingCanDisable: true,
  thinkingRange: null,
  thinkingEffortSupported: false,
  contextWindow: 200000,
  maxOutput: 64000,
};

const SEP = "[-_/:.]";

// Non-vision models (generators, encoders, audio-only) that might contain vision-like terms
export const NOT_VISION = new RegExp(
  [
    `(^|${SEP})(image|img)(${SEP}|$)`,
    "stable-image", "gen[0-9]_image", "nanobanana", "imagine",
    "t2v", "i2v", "flux", "dall", "sdxl", "diffusion",
    "embed", "rerank", "guard", "moderation",
    "tts", "stt", "whisper", "voice", "speech", "audio",
  ].join("|"),
  "i"
);

// Explicit modality tokens
export const VISION_NAME = new RegExp(
  [
    `(^|${SEP})(vision|vl|vlm|multimodal|omni|visual)(${SEP}|$)`,
    `[0-9]\\.[0-9]+v(${SEP}|$)`,
    `(^|${SEP})glm-[0-9]+v(${SEP}|$)`,
    "(^|[-_/:.])(llava|pixtral|internvl|cogvlm|minicpm-v|moondream|idefics|fuyu)",
  ].join("|"),
  "i"
);

/**
 * Provider-specific capability overrides.
 */
export const PROVIDER_CAPABILITIES: Record<string, Record<string, Partial<ModelCapabilities>>> = {
  nvidia: {
    "minimaxai/minimax-m2.7": { reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 200000, maxOutput: 131072 },
    "minimaxai/minimax-m3": { vision: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 512000, maxOutput: 131072 },
    "deepseek-ai/deepseek-v4-pro": { reasoning: true, thinkingFormat: "openai", contextWindow: 1000000, maxOutput: 65536 },
  },
  "opencode-go": {
    "glm-5.3-flash": { vision: true, videoInput: true, pdf: true, reasoning: true, thinkingFormat: "openai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 },
  },
};

/**
 * Fallback exact model capabilities for models not yet declared in provider metadata.
 */
export const MODEL_CAPABILITIES: Record<string, Partial<ModelCapabilities>> = {
  // Claude flagship models
  "claude-fable-5-1": { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5.5": { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-opus-5-5": { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000, thinkingCanDisable: false },
  "claude-opus-5": { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5": { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-sonnet-5-5": { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 },
  "claude-3-7-sonnet": { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 200000, maxOutput: 64000 },
  "claude-3.7-sonnet": { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget", contextWindow: 200000, maxOutput: 64000 },

  // GLM vision variants
  "glm-5.3-flash": { vision: true, videoInput: true, pdf: true, reasoning: true, thinkingFormat: "zai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 },
  "glm-4.6v": { vision: true, videoInput: true, reasoning: true, thinkingFormat: "zai", contextWindow: 128000, maxOutput: 32768 },
  "glm-4.5v": { vision: true, videoInput: true, reasoning: true, thinkingFormat: "zai", contextWindow: 64000, maxOutput: 16384 },
  "glm-5.2": { reasoning: true, thinkingFormat: "zai", thinkingCanDisable: false, contextWindow: 1000000, maxOutput: 131072 },

  // DeepSeek models
  "deepseek-chat": { vision: false, reasoning: true, thinkingFormat: "deepseek", contextWindow: 128000, maxOutput: 64000 },
  "deepseek-reasoner": { vision: false, reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 128000, maxOutput: 64000 },
  "deepseek-r1": { vision: false, reasoning: true, thinkingFormat: "deepseek", thinkingCanDisable: false, contextWindow: 128000, maxOutput: 64000 },
  "deepseek-v4.1-flash": { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 },
  "deepseek-v4-1-flash": { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 },
  "deepseek-v4-flash-vision-exp": { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 1000000, maxOutput: 384000 },
  "deepseek-flash": { vision: true, reasoning: true, thinkingFormat: "deepseek", contextWindow: 128000, maxOutput: 64000 },

  // Kimi
  "kimi-k3": { vision: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 131072 },
  "kimi-for-coding": { vision: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 262144, maxOutput: 65536 },
  "kimi-k2.7-code": { vision: true, videoInput: true, reasoning: true, thinkingFormat: "kimi", thinkingCanDisable: false, contextWindow: 262144, maxOutput: 65536 },

  // OpenAI image generation
  "gpt-image-1": { imageOutput: true, tools: false },
};
