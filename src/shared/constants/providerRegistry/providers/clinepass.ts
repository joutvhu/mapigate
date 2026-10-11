import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "clinepass",
  "name": "ClinePass",
  "alias": "clinepass",
  "uiAlias": "clinepass",
  "color": "#5B9BD5",
  "image": "/providers/clinepass.png",
  "website": "https://cline.bot",
  "notice": {
    "signupUrl": "https://app.cline.bot"
  },
  "category": "oauth",
  "authModes": [
    "apikey",
    "oauth"
  ],
  "baseUrl": "https://api.cline.bot/api/v1/chat/completions",
  "baseUrls": [
    "https://api.cline.bot/api/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "HTTP-Referer": "https://cline.bot",
    "X-Title": "Cline"
  },
  "thinkingMode": "auto",
  "thinkingOptions": [
    "auto",
    "on",
    "off"
  ],
  "oauth": {
    "appBaseUrl": "https://app.cline.bot",
    "apiBaseUrl": "https://api.cline.bot",
    "authorizeUrl": "https://api.cline.bot/api/v1/auth/authorize",
    "tokenUrl": "https://api.cline.bot/api/v1/auth/token",
    "refreshUrl": "https://api.cline.bot/api/v1/auth/refresh"
  },
  "models": [
    {
      "id": "cline-pass/glm-5.2",
      "name": "GLM-5.2 (ClinePass)",
      "isDefault": false
    },
    {
      "id": "cline-pass/kimi-k2.7-code",
      "name": "Kimi K2.7 Code (ClinePass)",
      "isDefault": false
    },
    {
      "id": "cline-pass/kimi-k2.6",
      "name": "Kimi K2.6 (ClinePass)",
      "isDefault": false
    },
    {
      "id": "cline-pass/deepseek-v4-pro",
      "name": "DeepSeek V4 Pro (ClinePass)",
      "isDefault": false
    },
    {
      "id": "cline-pass/deepseek-v4-flash",
      "name": "DeepSeek V4 Flash (ClinePass)",
      "isDefault": false
    },
    {
      "id": "cline-pass/mimo-v2.5",
      "name": "MiMo-V2.5 (ClinePass)",
      "isDefault": false
    },
    {
      "id": "cline-pass/mimo-v2.5-pro",
      "name": "MiMo-V2.5-Pro (ClinePass)",
      "isDefault": false
    },
    {
      "id": "cline-pass/minimax-m3",
      "name": "MiniMax M3 (ClinePass)",
      "isDefault": false
    },
    {
      "id": "cline-pass/qwen3.7-max",
      "name": "Qwen3.7 Max (ClinePass)",
      "isDefault": false
    },
    {
      "id": "cline-pass/qwen3.7-plus",
      "name": "Qwen3.7 Plus (ClinePass)",
      "isDefault": false
    }
  ]
};

export default provider;
