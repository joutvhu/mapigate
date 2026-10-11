import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "xiaomi-tokenplan",
  "name": "Xiaomi MiMo (Token Plan)",
  "alias": "xiaomi-tokenplan",
  "aliases": [
    "xmtp"
  ],
  "uiAlias": "xmtp",
  "color": "#FF6700",
  "image": "/providers/xiaomi-tokenplan.png",
  "website": "https://platform.xiaomimimo.com/console/plan-manage",
  "notice": {
    "text": "Xiaomi MiMo Token Plan subscription (API key starts with tp-). Token Plan keys are cluster-specific — select the region matching your subscription.",
    "apiKeyUrl": "https://platform.xiaomimimo.com/console/plan-manage"
  },
  "category": "apikey",
  "baseUrl": "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
  "baseUrls": [
    "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions"
  ],
  "validateUrl": "https://token-plan-sgp.xiaomimimo.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "regions": [
    {
      "id": "sgp",
      "label": "Singapore (新加坡)"
    },
    {
      "id": "cn",
      "label": "China (中国大陆)"
    },
    {
      "id": "ams",
      "label": "Amsterdam (阿姆斯特丹)"
    }
  ],
  "defaultRegion": "sgp",
  "hasProviderSpecificData": true,
  "models": [
    {
      "id": "mimo-v2.6-pro",
      "name": "MiMo V2.6 Pro",
      "isDefault": false
    },
    {
      "id": "mimo-v2.6-flash",
      "name": "MiMo V2.6 Flash",
      "isDefault": false
    },
    {
      "id": "mimo-v2.5-pro",
      "name": "MiMo V2.5 Pro",
      "isDefault": false
    },
    {
      "id": "mimo-v2.5-pro-claude",
      "name": "MiMo V2.5 Pro (Claude Native)",
      "upstreamModelId": "mimo-v2.5-pro",
      "isDefault": false
    },
    {
      "id": "mimo-v2.5",
      "name": "MiMo V2.5",
      "isDefault": false
    },
    {
      "id": "mimo-v2-pro",
      "name": "MiMo V2 Pro",
      "isDefault": false
    },
    {
      "id": "mimo-v2-omni",
      "name": "MiMo V2 Omni",
      "isDefault": false
    },
    {
      "id": "mimo-v2-tts",
      "name": "MiMo V2 TTS",
      "isDefault": false
    },
    {
      "id": "mimo-v2.5-tts",
      "name": "MiMo V2.5 TTS",
      "isDefault": false
    },
    {
      "id": "mimo-v2.5-tts-voiceclone",
      "name": "MiMo V2.5 TTS Voice Clone",
      "isDefault": false
    },
    {
      "id": "mimo-v2.5-tts-voicedesign",
      "name": "MiMo V2.5 TTS Voice Design",
      "isDefault": false
    }
  ]
};

export default provider;
