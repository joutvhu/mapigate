import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "opencode-zen",
  "name": "OpenCode Zen",
  "alias": "ocz",
  "aliases": [
    "opencode-zen"
  ],
  "uiAlias": "ocz",
  "color": "#E87040",
  "image": "/providers/opencode.png",
  "website": "https://opencode.ai/auth",
  "notice": {
    "text": "OpenCode Zen PAYG: pay-as-you-go, key from https://opencode.ai/auth. Same models as Zen: paid + free tiers on the fast lane.",
    "apiKeyUrl": "https://opencode.ai/auth"
  },
  "category": "apikey",
  "baseUrl": "https://opencode.ai/zen/v1/chat/completions",
  "baseUrls": [
    "https://opencode.ai/zen/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "claude-fable-5",
      "name": "Claude Fable 5",
      "isDefault": false
    },
    {
      "id": "claude-fable-5-1",
      "name": "Claude Fable 5.1",
      "isDefault": false
    },
    {
      "id": "claude-opus-5",
      "name": "Claude Opus 5",
      "isDefault": false
    },
    {
      "id": "claude-opus-4-8",
      "name": "Claude Opus 4.8",
      "isDefault": false
    },
    {
      "id": "claude-opus-4-7",
      "name": "Claude Opus 4.7",
      "isDefault": false
    },
    {
      "id": "claude-opus-4-6",
      "name": "Claude Opus 4.6",
      "isDefault": false
    },
    {
      "id": "claude-opus-4-5",
      "name": "Claude Opus 4.5",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-5",
      "name": "Claude Sonnet 5",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4-6",
      "name": "Claude Sonnet 4.6",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4-5",
      "name": "Claude Sonnet 4.5",
      "isDefault": false
    },
    {
      "id": "claude-sonnet-4",
      "name": "Claude Sonnet 4",
      "isDefault": false
    },
    {
      "id": "claude-haiku-4-5",
      "name": "Claude Haiku 4.5",
      "isDefault": false
    },
    {
      "id": "gemini-3.6-flash",
      "name": "Gemini 3.6 Flash",
      "isDefault": false
    },
    {
      "id": "gemini-3.8-flash",
      "name": "Gemini 3.8 Flash",
      "isDefault": false
    },
    {
      "id": "gemini-3.7-flash",
      "name": "Gemini 3.7 Flash",
      "isDefault": false
    },
    {
      "id": "gemini-3.5-flash-lite",
      "name": "Gemini 3.5 Flash Lite",
      "isDefault": false
    },
    {
      "id": "gemini-3.5-flash",
      "name": "Gemini 3.5 Flash",
      "isDefault": false
    },
    {
      "id": "gemini-3.1-pro",
      "name": "Gemini 3.1 Pro",
      "isDefault": false
    },
    {
      "id": "gemini-3-flash",
      "name": "Gemini 3 Flash",
      "isDefault": false
    },
    {
      "id": "gpt-6-astra",
      "name": "GPT 6 Astra",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-sol",
      "name": "GPT 5.6 Sol",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-terra",
      "name": "GPT 5.6 Terra",
      "isDefault": false
    },
    {
      "id": "gpt-5.6-luna",
      "name": "GPT 5.6 Luna",
      "isDefault": false
    },
    {
      "id": "gpt-5.5",
      "name": "GPT 5.5",
      "isDefault": false
    },
    {
      "id": "gpt-5.5-pro",
      "name": "GPT 5.5 Pro",
      "isDefault": false
    },
    {
      "id": "gpt-5.4",
      "name": "GPT 5.4",
      "isDefault": false
    },
    {
      "id": "gpt-5.4-pro",
      "name": "GPT 5.4 Pro",
      "isDefault": false
    },
    {
      "id": "gpt-5.4-mini",
      "name": "GPT 5.4 Mini",
      "isDefault": false
    },
    {
      "id": "gpt-5.4-nano",
      "name": "GPT 5.4 Nano",
      "isDefault": false
    },
    {
      "id": "gpt-5.3-codex-spark",
      "name": "GPT 5.3 Codex Spark",
      "isDefault": false
    },
    {
      "id": "gpt-5.3-codex",
      "name": "GPT 5.3 Codex",
      "isDefault": false
    },
    {
      "id": "gpt-5.2",
      "name": "GPT 5.2",
      "isDefault": false
    },
    {
      "id": "gpt-5.2-codex",
      "name": "GPT 5.2 Codex",
      "isDefault": false
    },
    {
      "id": "gpt-5.1",
      "name": "GPT 5.1",
      "isDefault": false
    },
    {
      "id": "gpt-5.1-codex-max",
      "name": "GPT 5.1 Codex Max",
      "isDefault": false
    },
    {
      "id": "gpt-5.1-codex",
      "name": "GPT 5.1 Codex",
      "isDefault": false
    },
    {
      "id": "gpt-5.1-codex-mini",
      "name": "GPT 5.1 Codex Mini",
      "isDefault": false
    },
    {
      "id": "gpt-5",
      "name": "GPT 5",
      "isDefault": false
    },
    {
      "id": "gpt-5-codex",
      "name": "GPT 5 Codex",
      "isDefault": false
    },
    {
      "id": "gpt-5-nano",
      "name": "GPT 5 Nano",
      "isDefault": false
    },
    {
      "id": "grok-build-0.1",
      "name": "Grok Build 0.1",
      "isDefault": false
    },
    {
      "id": "grok-4.6",
      "name": "Grok 4.6",
      "isDefault": false
    },
    {
      "id": "grok-4.5",
      "name": "Grok 4.5",
      "isDefault": false
    },
    {
      "id": "muse-spark-1.3",
      "name": "Muse Spark 1.3",
      "isDefault": false
    },
    {
      "id": "muse-spark-1.2",
      "name": "Muse Spark 1.2",
      "isDefault": false
    },
    {
      "id": "qwen3.6-plus",
      "name": "Qwen 3.6 Plus",
      "isDefault": false
    },
    {
      "id": "qwen3.5-plus",
      "name": "Qwen 3.5 Plus",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-flash-vision-exp",
      "name": "DeepSeek V4 Flash Vision Exp",
      "isDefault": false
    },
    {
      "id": "glm-5.3-flash",
      "name": "GLM 5.3 Flash (Vision)",
      "isDefault": false
    },
    {
      "id": "glm-5.3",
      "name": "GLM 5.3",
      "isDefault": false
    },
    {
      "id": "glm-5.2",
      "name": "GLM 5.2",
      "isDefault": false
    },
    {
      "id": "glm-5.1",
      "name": "GLM 5.1",
      "isDefault": false
    },
    {
      "id": "glm-5",
      "name": "GLM 5",
      "isDefault": false
    },
    {
      "id": "minimax-m3",
      "name": "MiniMax M3",
      "isDefault": false
    },
    {
      "id": "minimax-m2.7",
      "name": "MiniMax M2.7",
      "isDefault": false
    },
    {
      "id": "minimax-m2.5",
      "name": "MiniMax M2.5",
      "isDefault": false
    },
    {
      "id": "kimi-k3",
      "name": "Kimi K3",
      "isDefault": false
    },
    {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "isDefault": false
    },
    {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6",
      "isDefault": false
    },
    {
      "id": "kimi-k2.5",
      "name": "Kimi K2.5",
      "isDefault": false
    },
    {
      "id": "big-pickle",
      "name": "Big Pickle",
      "isDefault": false
    },
    {
      "id": "union-alpha",
      "name": "Union Alpha",
      "isDefault": false
    },
    {
      "id": "deepseek-v4-flash-free",
      "name": "DeepSeek V4 Flash Free",
      "isDefault": false
    },
    {
      "id": "mimo-v2.6-flash-free",
      "name": "MiMo V2.6 Flash Free",
      "isDefault": false
    },
    {
      "id": "mimo-v2.5-free",
      "name": "MiMo V2.5 Free",
      "isDefault": false
    },
    {
      "id": "ling-3.0-flash-fin-free",
      "name": "Ling 3.0 Flash Fin Free",
      "isDefault": false
    },
    {
      "id": "nemotron-3-ultra-free",
      "name": "Nemotron 3 Ultra Free",
      "isDefault": false
    },
    {
      "id": "nemotron-3.5-lightning-free",
      "name": "Nemotron 3.5 Lightning Free",
      "isDefault": false
    },
    {
      "id": "muse-spark-1.3-contributor-free",
      "name": "Muse Spark 1.3 Contributor Free",
      "isDefault": false
    },
    {
      "id": "muse-spark-1.2-contributor-free",
      "name": "Muse Spark 1.2 Contributor Free",
      "isDefault": false
    },
    {
      "id": "jev-1.13",
      "name": "Jev 1.13",
      "isDefault": false,
      "kind": "systemone"
    },
    {
      "id": "jev-1.13-free",
      "name": "Jev 1.13 Free",
      "isDefault": false,
      "kind": "systemone"
    }
  ],
  "passthroughModels": true
};

export default provider;
