import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "volcengine-ark",
  "name": "Volcengine Ark",
  "alias": "volcengine-ark",
  "aliases": [
    "ark"
  ],
  "uiAlias": "ark",
  "color": "#1677FF",
  "image": "/assets/providers/volcengine-ark/icon.png",
  "website": "https://ark.cn-beijing.volces.com",
  "notice": {
    "apiKeyUrl": "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey"
  },
  "category": "apikey",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
  "baseUrls": [
    "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto"
,
  models
};

export const provider = metadata;
export default metadata;
