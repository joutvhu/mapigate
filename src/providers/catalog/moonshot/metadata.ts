import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "moonshot",
  "name": "Moonshot AI (Kimi Platform)",
  "alias": "moonshot",
  "aliases": [
    "kimi-platform",
    "moonshot-intl"
  ],
  "uiAlias": "moonshot",
  "color": "#1E40AF",
  "iconBg": "#ffffff",
  "image": "/assets/providers/moonshot/icon.svg",
  "website": "https://platform.kimi.ai",
  "notice": {
    "apiKeyUrl": "https://platform.kimi.ai/console/api-keys",
    "text": "Moonshot AI / Kimi Open Platform pay-as-you-go API keys (sk-...). For Kimi for Coding subscription, use Kimi for Coding."
  },
  "category": "apikey",
  "authType": "apikey",
  "authModes": ["apikey"],
  "baseUrl": "https://api.moonshot.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.moonshot.ai/v1/chat/completions",
    "https://api.moonshot.cn/v1/chat/completions"
  ],
  "validateUrl": "https://api.moonshot.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "regions": [
    { "id": "intl", "label": "International (api.moonshot.ai)" },
    { "id": "cn", "label": "China (api.moonshot.cn)" }
  ],
  "defaultRegion": "intl",
  "models": [
    {
      "id": "kimi-k2.6",
      "name": "Kimi K2.6",
      "isDefault": true,
      "contextLength": 128000
    },
    {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code",
      "isDefault": false,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
