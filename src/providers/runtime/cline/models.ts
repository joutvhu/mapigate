import type { RegistryModel } from "../../core/types.js";

export const models: RegistryModel[] = [
  { id: "anthropic/claude-opus-4.7", name: "Claude Opus 4.7", isDefault: false },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", isDefault: true },
  { id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6", isDefault: false },
  { id: "openai/gpt-5.3-codex", name: "GPT-5.3 Codex", isDefault: false },
  { id: "openai/gpt-5.4", name: "GPT-5.4", isDefault: false },
  { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", isDefault: false },
  { id: "google/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview", isDefault: false },
  { id: "cline-pass/glm-5.2", name: "GLM-5.2 (ClinePass)", isDefault: false },
  { id: "cline-pass/kimi-k2.7-code", name: "Kimi K2.7 Code (ClinePass)", isDefault: false },
  { id: "cline-pass/kimi-k2.6", name: "Kimi K2.6 (ClinePass)", isDefault: false },
  { id: "cline-pass/deepseek-v4-pro", name: "DeepSeek V4 Pro (ClinePass)", isDefault: false },
  { id: "cline-pass/deepseek-v4-flash", name: "DeepSeek V4 Flash (ClinePass)", isDefault: false },
  { id: "cline-pass/mimo-v2.5", name: "MiMo-V2.5 (ClinePass)", isDefault: false },
  { id: "cline-pass/mimo-v2.5-pro", name: "MiMo-V2.5-Pro (ClinePass)", isDefault: false },
  { id: "cline-pass/minimax-m3", name: "MiniMax M3 (ClinePass)", isDefault: false },
  { id: "cline-pass/qwen3.7-max", name: "Qwen3.7 Max (ClinePass)", isDefault: false },
  { id: "cline-pass/qwen3.7-plus", name: "Qwen3.7 Plus (ClinePass)", isDefault: false },
];
