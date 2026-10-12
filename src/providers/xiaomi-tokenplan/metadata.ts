import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Monthly Tokens",
      "Weekly Quota"
  ],
  "id": "xiaomi-tokenplan",
  "name": "Xiaomi MiMo (Token Plan)",
  "alias": "xiaomi-tokenplan",
  "aliases": [
    "xmtp"
  ],
  "uiAlias": "xmtp",
  "color": "#FF6700",
  "image": "/assets/providers/xiaomi-tokenplan/icon.png",
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
  "hasProviderSpecificData": true
,
  models
};

export const provider = metadata;
export default metadata;
