import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "api-airforce",
  "name": "API.airforce",
  "alias": "af",
  "aliases": [
    "airforce"
  ],
  "uiAlias": "af",
  "color": "#0EA5E9",
  "image": "/assets/providers/api-airforce/icon.png",
  "website": "https://api.airforce",
  "notice": {
    "apiKeyUrl": "https://api.airforce"
  },
  "category": "freeTier",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://api.airforce/v1/chat/completions",
  "baseUrls": [
    "https://api.airforce/v1/chat/completions"
  ],
  "validateUrl": "https://api.airforce/v1/models",
  "format": "openai",
  "defaultHeaders": {
    "HTTP-Referer": "https://endpoint-proxy.local",
    "X-Title": "Endpoint Proxy"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "gpt-oss-120b",
      "name": "GPT-OSS 120B (Free)",
      "isDefault": false,
      "contextLength": 131072
    },
    {
      "id": "gpt-oss-20b",
      "name": "GPT-OSS 20B (Free)",
      "isDefault": false,
      "contextLength": 131072
    },
    {
      "id": "kimi-k2.7-code",
      "name": "Kimi K2.7 Code (Free)",
      "isDefault": false,
      "contextLength": 262144
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
