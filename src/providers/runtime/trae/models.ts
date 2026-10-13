import type { RegistryModel } from "../../core/types.js";

export const models: RegistryModel[] = [
  { id: "auto", name: "Auto (Server Picks)", isDefault: true },
  { id: "work", name: "Work (Fast)" },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
  { id: "gemini-3-flash-solo", name: "Gemini 3 Flash" },
  { id: "minimax-m3", name: "MiniMax M3" },
  { id: "minimax-m2.7", name: "MiniMax M2.7" },
  { id: "kimi-k2.5", name: "Kimi K2.5" },
  { id: "gpt-5.4", name: "GPT 5.4" },
  { id: "gpt-5.2", name: "GPT 5.2" },
];
