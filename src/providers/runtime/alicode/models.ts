import type { RegistryModel } from "../../core/types.js";

export const models: RegistryModel[] = [
  { id: "qwen3.8-max-preview", name: "Qwen3.8 Max Preview", isDefault: false, contextLength: 128000 },
  { id: "qwen3.7-max", name: "Qwen3.7 Max", isDefault: false, contextLength: 128000 },
  { id: "qwen3.7-plus", name: "Qwen3.7 Plus", isDefault: false, contextLength: 128000 },
  { id: "qwen3.6-flash", name: "Qwen3.6 Flash", isDefault: false, contextLength: 128000 },
  { id: "qwen3.5-plus", name: "Qwen3.5 Plus", isDefault: true, contextLength: 128000 },
  { id: "qwen3-coder-next", name: "Qwen3 Coder Next", isDefault: false, contextLength: 128000 },
  { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus", isDefault: false, contextLength: 128000 },
  { id: "qwen3-max-2026-01-23", name: "Qwen3 Max", isDefault: false, contextLength: 128000 },
  { id: "kimi-k2.5", name: "Kimi K2.5", isDefault: false, contextLength: 262144 },
  { id: "glm-5.2", name: "GLM 5.2", isDefault: false, contextLength: 128000 },
  { id: "glm-5", name: "GLM 5", isDefault: false, contextLength: 128000 },
  { id: "glm-4.7", name: "GLM 4.7", isDefault: false, contextLength: 128000 },
  { id: "MiniMax-M2.5", name: "MiniMax M2.5", isDefault: false, contextLength: 245760 },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", isDefault: false, contextLength: 1048576 }
];
