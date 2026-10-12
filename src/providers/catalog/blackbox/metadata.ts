import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "blackbox",
  "name": "Blackbox AI",
  "alias": "blackbox",
  "aliases": [
    "bb"
  ],
  "uiAlias": "bb",
  "color": "#5B5FEF",
  "image": "/assets/providers/blackbox/icon.png",
  "website": "https://blackbox.ai",
  "notice": {
    "apiKeyUrl": "https://www.blackbox.ai/api-management"
  },
  "category": "apikey",
  "baseUrl": "https://api.blackbox.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.blackbox.ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "thinkingOptions": [
    "auto",
    "none",
    "low",
    "medium",
    "high",
    "xhigh"
  ]
,
  models
};

export const provider = metadata;
export default metadata;
