import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "volcengine-coding-plan",
  "name": "Volcengine Coding Plan",
  "alias": "vecp",
  "aliases": [
    "volcengine-coding-plan",
    "vecp"
  ],
  "uiAlias": "vecp",
  "color": "#3B82F6",
  "image": "/assets/providers/volcengine-coding-plan/icon.png",
  "website": "https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan",
  "notice": {
    "apiKeyUrl": "https://console.volcengine.com/ark/region:cn-beijing/apiKey",
    "text": "ByteDance Volcano Ark dedicated Coding Plan subscription endpoint (/api/coding/v3)."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
  "baseUrls": [
    "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "passthroughModels": true
,
  models
};

export const provider = metadata;
export default metadata;
