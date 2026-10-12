import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "volcengine-agent-plan",
  "name": "Volcengine Agent Plan",
  "alias": "veap",
  "aliases": [
    "volcengine-agent-plan",
    "veap"
  ],
  "uiAlias": "veap",
  "color": "#2563EB",
  "image": "/assets/providers/volcengine-agent-plan/icon.png",
  "website": "https://console.volcengine.com/ark/region:cn-beijing/subscription/agent-plan",
  "notice": {
    "apiKeyUrl": "https://console.volcengine.com/ark/region:cn-beijing/apiKey",
    "text": "ByteDance Volcano Ark dedicated Agent Plan subscription endpoint (/api/plan/v3)."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions",
  "baseUrls": [
    "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions"
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
