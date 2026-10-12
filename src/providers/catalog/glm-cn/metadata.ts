import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Session",
      "Weekly",
      "Balance"
  ],
  "id": "glm-cn",
  "name": "GLM (China)",
  "alias": "glm-cn",
  "color": "#DC2626",
  "image": "/assets/providers/glm-cn/icon.png",
  "website": "https://open.bigmodel.cn",
  "notice": {
    "apiKeyUrl": "https://open.bigmodel.cn/usercenter/apikeys"
  },
  "category": "apikey",
  "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
  "baseUrls": [
    "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions"
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
