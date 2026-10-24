import type { RegistryModel } from "../../core/types.js";

export const models: RegistryModel[] = [
  { id: "grok-build", name: "Grok Build", isDefault: false, contextLength: 500000 },
  { id: "grok-4.5", name: "Grok 4.5", isDefault: false, contextLength: 500000 },
  { id: "grok-4.5-high", name: "Grok 4.5 (High)", upstreamModelId: "grok-4.5", isDefault: false, contextLength: 500000 },
  { id: "grok-4.5-medium", name: "Grok 4.5 (Medium)", upstreamModelId: "grok-4.5", isDefault: false, contextLength: 500000 },
  { id: "grok-4.5-low", name: "Grok 4.5 (Low)", upstreamModelId: "grok-4.5", isDefault: false, contextLength: 500000 },
  { id: "grok-4.2", name: "Grok 4.2 (Beta)", isDefault: false, contextLength: 200000 },
  { id: "grok-4.1-thinking", name: "Grok 4.1 Thinking", isDefault: false, contextLength: 200000 },
  { id: "grok-4.1-expert", name: "Grok 4.1 Expert", isDefault: false, contextLength: 200000 },
  { id: "grok-4.1-fast", name: "Grok 4.1 Fast", isDefault: false, contextLength: 200000 },
  { id: "grok-4-heavy", name: "Grok 4 Heavy (SuperGrok)", isDefault: false, contextLength: 200000 },
  { id: "grok-4-thinking", name: "Grok 4 Thinking", isDefault: false, contextLength: 200000 },
  { id: "grok-4", name: "Grok 4", isDefault: false, contextLength: 200000 },
  { id: "grok-3-thinking", name: "Grok 3 Thinking", isDefault: false, contextLength: 131072 },
  { id: "grok-3", name: "Grok 3", isDefault: false, contextLength: 131072 },
];
