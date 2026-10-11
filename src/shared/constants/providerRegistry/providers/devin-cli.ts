import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "devin-cli",
  "name": "Devin CLI",
  "alias": "dv",
  "aliases": [
    "devin"
  ],
  "uiAlias": "dv",
  "color": "#6366F1",
  "image": "/providers/devin-cli.png",
  "website": "https://devin.ai",
  "notice": {
    "signupUrl": "https://cli.devin.ai",
    "text": "Install: `curl -fsSL https://cli.devin.ai/install.sh | bash` (macOS: `brew install --cask devin-cli`, Windows PowerShell: `irm https://static.devin.ai/cli/setup.ps1 | iex`). Then run `devin auth login`. No API key needed."
  },
  "category": "free",
  "authType": "none",
  "authModes": [
    "none"
  ],
  "noAuth": true,
  "baseUrl": "devin://acp/stdio",
  "baseUrls": [
    "devin://acp/stdio"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "swe-1.6-fast",
      "name": "SWE-1.6 Fast",
      "isDefault": false
    },
    {
      "id": "swe-1.6",
      "name": "SWE-1.6",
      "isDefault": false
    },
    {
      "id": "swe-1.5-fast",
      "name": "SWE-1.5 Fast",
      "isDefault": false
    },
    {
      "id": "swe-1.5",
      "name": "SWE-1.5",
      "isDefault": false
    },
    {
      "id": "claude-opus-4.7-max",
      "name": "Claude Opus 4.7 Max",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "claude-opus-4.7-high",
      "name": "Claude Opus 4.7 High",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "claude-opus-4.7-medium",
      "name": "Claude Opus 4.7 Medium",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "claude-opus-4.7-low",
      "name": "Claude Opus 4.7 Low",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "claude-sonnet-4.6-thinking-1m",
      "name": "Claude Sonnet 4.6 Thinking 1M",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "claude-sonnet-4.6-thinking",
      "name": "Claude Sonnet 4.6 Thinking",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "claude-sonnet-4.6",
      "name": "Claude Sonnet 4.6",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "claude-opus-4.6-thinking",
      "name": "Claude Opus 4.6 Thinking",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "claude-opus-4.6",
      "name": "Claude Opus 4.6",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "claude-sonnet-4.5",
      "name": "Claude Sonnet 4.5",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "claude-haiku-4.5",
      "name": "Claude Haiku 4.5",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.5-xhigh",
      "name": "GPT-5.5 XHigh",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.5-high",
      "name": "GPT-5.5 High",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.5-medium",
      "name": "GPT-5.5 Medium",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.5-low",
      "name": "GPT-5.5 Low",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.4-high",
      "name": "GPT-5.4 High",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.4-medium",
      "name": "GPT-5.4 Medium",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.4-low",
      "name": "GPT-5.4 Low",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.3-codex-high",
      "name": "GPT-5.3 Codex High",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.3-codex-medium",
      "name": "GPT-5.3 Codex Medium",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.3-codex-low",
      "name": "GPT-5.3 Codex Low",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.2-high",
      "name": "GPT-5.2 High",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.2-medium",
      "name": "GPT-5.2 Medium",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gpt-5.2-low",
      "name": "GPT-5.2 Low",
      "isDefault": false,
      "contextLength": 200000
    },
    {
      "id": "gemini-3.1-pro-high",
      "name": "Gemini 3.1 Pro High",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "gemini-3.1-pro-low",
      "name": "Gemini 3.1 Pro Low",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "gemini-3.0-flash-high",
      "name": "Gemini 3 Flash High",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "gemini-2.5-pro",
      "name": "Gemini 2.5 Pro",
      "isDefault": false,
      "contextLength": 1000000
    },
    {
      "id": "deepseek-v4",
      "name": "DeepSeek V4",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6",
      "isDefault": false,
      "contextLength": 262144
    },
    {
      "id": "glm-5.1",
      "name": "GLM-5.1",
      "isDefault": false,
      "contextLength": 204800
    }
  ]
};

export default provider;
