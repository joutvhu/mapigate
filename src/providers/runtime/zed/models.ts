import type { RegistryModel } from "../../core/types.js";

export const models: RegistryModel[] = [
  // OpenAI Hosted Models
  { id: "gpt-6-luna", name: "GPT-6 Luna", contextLength: 400000 },
  { id: "gpt-6-sol", name: "GPT-6 Sol", contextLength: 400000 },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", contextLength: 400000 },
  { id: "gpt-6-astra", name: "GPT-6 Astra", contextLength: 400000 },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", contextLength: 400000 },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", contextLength: 400000 },
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", contextLength: 400000 },
  { id: "gpt-5.5-pro", name: "GPT-5.5 pro", contextLength: 400000 },
  { id: "gpt-5.5", name: "GPT-5.5", contextLength: 400000 },
  { id: "gpt-5.4-pro", name: "GPT-5.4 pro", contextLength: 400000 },
  { id: "gpt-5.4", name: "GPT-5.4", contextLength: 400000 },
  { id: "gpt-5.3-codex", name: "GPT-5.3-Codex", contextLength: 400000 },
  { id: "gpt-5.2-codex", name: "GPT-5.2-Codex", contextLength: 400000 },
  { id: "gpt-5.2", name: "GPT-5.2", contextLength: 400000 },
  { id: "gpt-5-mini", name: "GPT-5 mini", contextLength: 400000 },
  { id: "gpt-5-nano", name: "GPT-5 nano", contextLength: 400000 },
  { id: "gpt-4o", name: "GPT-4o", contextLength: 128000 },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", contextLength: 128000 },

  // Anthropic Hosted Models
  { id: "claude-fable-5.1", name: "Claude Fable 5.1", contextLength: 1000000 },
  { id: "claude-fable-5", name: "Claude Fable 5", contextLength: 1000000 },
  { id: "claude-opus-5.5", name: "Claude Opus 5.5", contextLength: 1000000 },
  { id: "claude-opus-5", name: "Claude Opus 5", contextLength: 1000000 },
  { id: "claude-opus-4.8", name: "Claude Opus 4.8", contextLength: 1000000 },
  { id: "claude-opus-4.7", name: "Claude Opus 4.7", contextLength: 1000000 },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", contextLength: 1000000 },
  { id: "claude-opus-4.5", name: "Claude Opus 4.5", contextLength: 200000 },
  { id: "claude-sonnet-5.5", name: "Claude Sonnet 5.5", contextLength: 1000000 },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", contextLength: 1000000 },
  { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", contextLength: 1000000 },
  { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", contextLength: 200000 },
  { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", contextLength: 200000 },
  { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet", contextLength: 200000 },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", contextLength: 200000 },
  { id: "claude-3-5-haiku", name: "Claude 3.5 Haiku", contextLength: 200000 },

  // Google Hosted Models
  { id: "gemini-4-argon", name: "Gemini 4 Argon", contextLength: 1000000 },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", contextLength: 200000 },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", contextLength: 1000000 },
  { id: "gemini-3-flash", name: "Gemini 3 Flash", contextLength: 1000000 },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextLength: 1000000 },
  { id: "gemini-2.0-pro-exp-02-05", name: "Gemini 2.0 Pro Exp", contextLength: 1000000 },

  // Legacy / Other
  { id: "grok-2", name: "Grok 2", contextLength: 128000 },
];

export function getModelsForZedPlan(rawPlan?: string): RegistryModel[] {
  const plan = String(rawPlan || "").toLowerCase().trim();
  if (plan === "zed_free" || plan === "free") {
    return [];
  }
  if (plan === "zed_pro_trial" || plan === "pro_trial" || plan === "trial") {
    // Zed Pro Trial strictly includes GPT-6 Luna only
    return models.filter((m) => m.id === "gpt-6-luna");
  }
  if (plan === "zed_student" || plan === "student") {
    // Student plan excludes Claude Fable, Claude Opus, GPT-6 Astra, GPT-5.5 pro, GPT-5.4 pro
    return models.filter((m) => {
      const id = m.id.toLowerCase();
      if (id.includes("fable") || id.includes("opus")) return false;
      if (id === "gpt-6-astra" || id === "gpt-5.5-pro" || id === "gpt-5.4-pro") return false;
      return true;
    });
  }
  // Zed Pro, Zed Business, Zed VIP, or general access
  return models;
}

