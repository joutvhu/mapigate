/**
 * Model Capabilities Catalog
 * 
 * Maps models to their input/output modalities and runtime features.
 * Order of resolution (first match wins):
 *   1. PROVIDER_CAPABILITIES[provider][model] (provider-specific override)
 *   2. MODEL_CAPABILITIES[model]              (canonical exact id)
 *   3. PATTERN_CAPABILITIES                    (glob pattern match)
 *   4. DEFAULT_CAPABILITIES                    (safe floor)
 */

export interface ModelCapabilities {
  vision: boolean;
  pdf: boolean;
  audioInput: boolean;
  videoInput: boolean;
  imageOutput: boolean;
  audioOutput: boolean;
  search: boolean;
  tools: boolean;
  reasoning: boolean;
  thinkingFormat: string | null;
  thinkingCanDisable: boolean;
  thinkingRange: { min: number; max: number } | null;
  thinkingEffortSupported: boolean;
  contextWindow: number;
  maxOutput: number;
  [key: string]: any;
}

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
const NOT_VISION = new RegExp(
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
const VISION_NAME = new RegExp(
  [
    `(^|${SEP})(vision|vl|vlm|multimodal|omni|visual)(${SEP}|$)`,
    `[0-9]\\.[0-9]+v(${SEP}|$)`,
    `(^|${SEP})glm-[0-9]+v(${SEP}|$)`,
    "(^|[-_/:.])(llava|pixtral|internvl|cogvlm|minicpm-v|moondream|idefics|fuyu)",
  ].join("|"),
  "i"
);

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
 * Canonical exact model capabilities overrides.
 */
export const MODEL_CAPABILITIES: Record<string, Partial<ModelCapabilities>> = {
  // Claude flagship models with 1M context + adaptive thinking
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
 * Glob pattern matching ordered from specific to generic.
 */
export const PATTERN_CAPABILITIES: Array<{ pattern: string; caps: Partial<ModelCapabilities> }> = [
  // ── Claude ──
  { pattern: "*claude*opus-5*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*sonnet-5*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 } },
  { pattern: "*claude*opus-4.6*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive" } },
  { pattern: "*claude*opus-4.7*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive" } },
  { pattern: "*claude*opus-4.8*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive" } },
  { pattern: "*claude*sonnet-4.6*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive" } },
  { pattern: "*claude*sonnet-4.7*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-adaptive" } },
  { pattern: "*claude*haiku*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude*opus*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude*sonnet*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude*3.7*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude*3-7*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },
  { pattern: "*claude-3*", caps: { vision: true } },
  { pattern: "*claude*", caps: { vision: true, reasoning: true, search: true, thinkingFormat: "claude-budget" } },

  // ── Gemini ──
  { pattern: "*gemini*image*", caps: { vision: true, imageOutput: true, contextWindow: 1048576 } },
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

  // ── DeepSeek ──
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

/**
 * Resolve capabilities for a given provider/model.
 */
export function getCapabilitiesForModel(provider?: string | null, model?: string): ModelCapabilities {
  if (!model) return { ...DEFAULT_CAPABILITIES };

  const baseModel = model.includes("/") ? model.split("/").pop()! : model;

  // 1. Provider-specific override
  if (provider && PROVIDER_CAPABILITIES[provider]) {
    const pCaps = PROVIDER_CAPABILITIES[provider];
    if (pCaps[model]) return { ...DEFAULT_CAPABILITIES, ...pCaps[model] };
    if (pCaps[baseModel]) return { ...DEFAULT_CAPABILITIES, ...pCaps[baseModel] };
  }

  // 2. Canonical exact model match
  if (MODEL_CAPABILITIES[baseModel]) {
    const res = { ...DEFAULT_CAPABILITIES, ...MODEL_CAPABILITIES[baseModel] };
    if (!res.vision && looksLikeVisionModel(model)) res.vision = true;
    return res;
  }
  if (MODEL_CAPABILITIES[model]) {
    const res = { ...DEFAULT_CAPABILITIES, ...MODEL_CAPABILITIES[model] };
    if (!res.vision && looksLikeVisionModel(model)) res.vision = true;
    return res;
  }

  // 3. Pattern match
  for (const { pattern, caps } of PATTERN_CAPABILITIES) {
    if (matchPattern(pattern, baseModel) || matchPattern(pattern, model)) {
      const res = { ...DEFAULT_CAPABILITIES, ...caps };
      if (!res.vision && looksLikeVisionModel(model)) res.vision = true;
      return res;
    }
  }

  // 4. Fallback floor + name heuristic
  const res = { ...DEFAULT_CAPABILITIES };
  if (!res.vision && looksLikeVisionModel(model)) res.vision = true;
  return res;
}

/**
 * Aggregate capabilities across a combo list of model strings.
 * Union: vision, pdf, audioInput, videoInput, imageOutput, audioOutput, search.
 * Intersection: tools.
 * Primary (first model): reasoning, thinking fields.
 * Conservative: contextWindow = min, maxOutput = max.
 */
export function aggregateComboCapabilities(
  comboModels: string[],
  comboLookup?: Record<string, string[]> | null,
  _depth = 0
): ModelCapabilities | null {
  if (!comboModels || comboModels.length === 0 || _depth > 6) return null;

  const allCaps: ModelCapabilities[] = comboModels.map((fullId) => {
    // Nested combo support: if bare name without slash is in comboLookup, recurse
    if (!fullId.includes("/") && comboLookup?.[fullId]) {
      const nested = aggregateComboCapabilities(comboLookup[fullId], comboLookup, _depth + 1);
      if (nested) return nested;
    }

    const slash = fullId.indexOf("/");
    const provider = slash === -1 ? null : fullId.slice(0, slash);
    const model = slash === -1 ? fullId : fullId.slice(slash + 1);
    return getCapabilitiesForModel(provider, model);
  });

  const first = allCaps[0];

  return {
    vision: allCaps.some((c) => c.vision),
    pdf: allCaps.some((c) => c.pdf),
    audioInput: allCaps.some((c) => c.audioInput),
    videoInput: allCaps.some((c) => c.videoInput),
    imageOutput: allCaps.some((c) => c.imageOutput),
    audioOutput: allCaps.some((c) => c.audioOutput),
    search: allCaps.some((c) => c.search),
    tools: allCaps.every((c) => c.tools),
    reasoning: first.reasoning,
    thinkingFormat: first.thinkingFormat,
    thinkingCanDisable: first.thinkingCanDisable,
    thinkingRange: first.thinkingRange,
    thinkingEffortSupported: first.thinkingEffortSupported,
    contextWindow: Math.min(...allCaps.map((c) => c.contextWindow)),
    maxOutput: Math.max(...allCaps.map((c) => c.maxOutput)),
  };
}
