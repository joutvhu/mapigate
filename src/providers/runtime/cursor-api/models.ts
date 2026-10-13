import type { RegistryModel } from "../../core/types.js";

export const models: RegistryModel[] = [
  { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", isDefault: true, contextLength: 200000 },
  { id: "claude-3.7-sonnet", name: "Claude 3.7 Sonnet", isDefault: false, contextLength: 200000 },
  { id: "claude-3.7-sonnet-thinking", name: "Claude 3.7 Sonnet Thinking", isDefault: false, contextLength: 200000 },
  { id: "gpt-4o", name: "GPT-4o", isDefault: false, contextLength: 128000 },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", isDefault: false, contextLength: 128000 },
  { id: "o1", name: "o1", isDefault: false, contextLength: 200000 },
  { id: "o1-mini", name: "o1-mini", isDefault: false, contextLength: 128000 },
  { id: "o3-mini", name: "o3-mini", isDefault: false, contextLength: 200000 },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", isDefault: false, contextLength: 1048576 },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", isDefault: false, contextLength: 1048576 },
  { id: "deepseek-v3", name: "DeepSeek V3", isDefault: false, contextLength: 128000 },
  { id: "deepseek-r1", name: "DeepSeek R1", isDefault: false, contextLength: 128000 },
];
