import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Monthly Tokens",
      "Weekly Quota"
  ],
  "id": "xiaomi-mimo",
  "name": "Xiaomi MiMo",
  "alias": "xiaomi-mimo",
  "aliases": [
    "mimo",
    "mimo-desktop",
    "xmd"
  ],
  "uiAlias": "mimo",
  "color": "#FF6900",
  "image": "/assets/providers/xiaomi-mimo/icon.png",
  "website": "https://xiaomimimo.com",
  "notice": {
    "apiKeyUrl": "https://platform.xiaomimimo.com/console/api-keys",
    "signupUrl": "https://mimo.xiaomimimo.com/desktop/invite/"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://api.xiaomimimo.com/v1/chat/completions",
  "baseUrls": [
    "https://api.xiaomimimo.com/v1/chat/completions"
  ],
  "validateUrl": "https://token-plan-sgp.xiaomimimo.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "regions": [
    {
      "id": "cn",
      "label": "China (中国大陆)"
    },
    {
      "id": "sgp",
      "label": "Singapore (新加坡)"
    },
    {
      "id": "ams",
      "label": "Europe · Amsterdam (欧洲)"
    },
    {
      "id": "ru",
      "label": "Russia (俄罗斯)"
    },
    {
      "id": "in",
      "label": "India (印度)"
    }
  ],
  "defaultRegion": "sgp",
  "hasProviderSpecificData": true,
  "oauth": {
    "custom": true,
    "authorizeUrl": "https://platform.xiaomimimo.com/authorize",
    "callbackParam": "u",
    "kn": "mimocode"
  },
  "models": [
    {
      "id": "mimo-v2.6-pro",
      "name": "MiMo V2.6 Pro",
      "upstreamModelId": "xiaomi/mimo-v2.6-pro",
      "isDefault": false
    },
    {
      "id": "mimo-v2.6-flash",
      "name": "MiMo V2.6 Flash",
      "upstreamModelId": "xiaomi/mimo-v2.6-flash",
      "isDefault": false
    },
    {
      "id": "mimo-v2.6-pro-ultraspeed",
      "name": "MiMo V2.6 Pro UltraSpeed",
      "upstreamModelId": "xiaomi/mimo-v2.6-pro-ultraspeed",
      "isDefault": false
    },
    {
      "id": "mimo-v2.5-pro",
      "name": "MiMo V2.5 Pro",
      "isDefault": false
    },
    {
      "id": "mimo-v2.5",
      "name": "MiMo V2.5",
      "isDefault": false
    },
    {
      "id": "mimo-v2-omni",
      "name": "MiMo V2 Omni",
      "isDefault": false
    },
    {
      "id": "mimo-v2-flash",
      "name": "MiMo V2 Flash",
      "isDefault": false
    },
    {
      "id": "mimo-v2.5-tts",
      "name": "MiMo V2.5 TTS",
      "isDefault": false,
      "kind": "tts"
    }
  ]
};

export const provider = metadata;
export default metadata;
