import type { CliToolDefinition } from "../../types.js";

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

    // OpenAI GPT & Codex
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.3-codex",

    // Google Gemini
    "gemini-4-neon",
    "gemini-4-carbon",
    "gemini-4-hydrogen",
    "gemini-4-argon",
    "gemini-3.8-flash",
    "gemini-3.1-pro",
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
    "glm-5.3",
    "glm-5.3-flash",
    "deepseek-v4.1-flash",
  ],
  guideSteps: [
    {
      step: 1,
      title: "Enable Security First",
      desc: "Before exposing port 20128 to the internet, enable Master Password in Settings and turn on Require API Key in Endpoint & Key.",
    },
    {
      step: 2,
      title: "Expose Local Gateway",
      desc: "Cursor routes requests through its cloud servers, so 127.0.0.1 is unreachable. Start an HTTPS tunnel (e.g. cloudflared or ngrok):",
      value: "cloudflared tunnel --url http://127.0.0.1:20128",
      copyable: true,
    },
    {
      step: 3,
      title: "Open Cursor Settings",
      desc: "In Cursor, go to Settings → Models → API Keys",
    },
    {
      step: 4,
      title: "Enable OpenAI API & Override Base URL",
      desc: "Toggle 'Use OpenAI API Key' and 'Override OpenAI Base URL' on, then enter your tunnel URL with /v1 (e.g. https://<your-tunnel>.trycloudflare.com/v1)",
    },
    {
      step: 5,
      title: "Set API Key",
      desc: "Enter a Mapigate API Key created in Endpoint & Key (do not use a dummy key when exposed via tunnel)",
      type: "apiKeySelector",
    },
    {
      step: 6,
      title: "Add Custom Model",
      desc: "Click '+ Add Custom Model' and enter a custom model ID or alias mapped in Tools & Mappings (avoid built-in Cursor model names if Cursor rejects them as invalid)",
    },
  ],
  notes: [
    {
      type: "warning",
      text: "Security Warning: Exposing port 20128 via a public tunnel makes your gateway reachable from the internet. Always enable Master Password (Settings) and Require API Key (Endpoint & Key) before starting the tunnel, and stop the tunnel when not in use.",
    },
    {
      type: "info",
      text: "Why a tunnel is required: Cursor sends requests from its cloud backend (api2.cursor.sh) to your Base URL, so local addresses like http://127.0.0.1:20128/v1 cannot be reached directly.",
    },
  ],
};
