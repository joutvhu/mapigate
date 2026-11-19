import type { CliToolDefinition } from "../../types.js";
import { DEFAULT_V1_URL } from "../../helpers.js";

export const definition: CliToolDefinition = {
  id: "cursor",
  name: "Cursor",
  image: "/assets/providers/cursor/icon.png",
  color: "#000000",
  iconBg: "#FFFFFF",
  description: "Cursor AI Code Editor",
  configType: "guide",
  binary: "cursor",
  docsUrl: "https://cursor.com",
  defaultModels: [
    // Anthropic Claude
    "claude-opus-5.5",
    "claude-opus-5",
    "claude-opus-4.8",
    "claude-opus-4.7",
    "claude-opus-4.6",
    "claude-opus-4.5",
    "claude-sonnet-5.5",
    "claude-sonnet-5",
    "claude-sonnet-4.6",
    "claude-sonnet-4.5",
    "claude-sonnet-4",
    "claude-fable-5.2",
    "claude-fable-5.1",
    "claude-fable-5",
    "claude-haiku-5.5",
    "claude-haiku-4.5",
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",

    // OpenAI GPT & Codex
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.3-codex",
    "codex-5.3",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5-mini",
    "gpt-4o",
    "gpt-4o-mini",

    // Google Gemini
    "gemini-4-neon",
    "gemini-4-carbon",
    "gemini-4-hydrogen",
    "gemini-4-argon",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.1-pro",
    "gemini-3-flash",
    "gemini-2.5-flash",

    // xAI Grok
    "grok-4.7",
    "grok-4.6",
    "grok-4.5",

    // Cursor & Muse
    "composer-2.5",
    "cursor-small",
    "muse-wonder",
    "muse-spark-1.3",

    // Kimi, GLM & DeepSeek
    "kimi-k3",
    "kimi-k2.7-code",
    "glm-5.3",
    "glm-5.3-flash",
    "glm-5.2",
    "deepseek-v4.1-flash-1017",
  ],
  guideSteps: [
    { step: 1, title: "Open Settings", desc: "In Cursor, go to Settings → Models" },
    { step: 2, title: "Enable OpenAI API", desc: "Toggle 'OpenAI API key' on" },
    { step: 3, title: "Override Base URL", desc: "Enter Mapigate OpenAI-compatible endpoint:", value: DEFAULT_V1_URL, copyable: true },
    { step: 4, title: "Set API Key", desc: "Enter any non-empty string, e.g. 'mapigate-local'", value: "mapigate-local", copyable: true },
    { step: 5, title: "Add Custom Model", desc: "Click 'Add Custom Model' and enter your preferred model ID" },
  ],
};
