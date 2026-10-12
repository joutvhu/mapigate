import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "siliconflow",
  "name": "SiliconFlow",
  "alias": "siliconflow",
  "color": "#5B6EF5",
  "image": "/assets/providers/siliconflow/icon.png",
  "website": "https://cloud.siliconflow.com",
  "notice": {
    "apiKeyUrl": "https://cloud.siliconflow.com/account/ak"
  },
  "category": "apikey",
  "baseUrl": "https://api.siliconflow.com/v1/chat/completions",
  "baseUrls": [
    "https://api.siliconflow.com/v1/chat/completions"
  ],
  "validateUrl": "https://api.siliconflow.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto"
,
  models
};

export const provider = metadata;
export default metadata;
