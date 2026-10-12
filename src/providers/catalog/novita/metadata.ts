import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "novita",
  "name": "Novita AI",
  "alias": "novita",
  "aliases": [
    "novita"
  ],
  "uiAlias": "novita",
  "color": "#7C3AED",
  "iconBg": "#ffffff",
  "image": "/assets/providers/novita/icon.png",
  "website": "https://novita.ai",
  "notice": {
    "apiKeyUrl": "https://novita.ai/settings/key-management"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.novita.ai/openai/v1/chat/completions",
  "baseUrls": [
    "https://api.novita.ai/openai/v1/chat/completions"
  ],
  "validateUrl": "https://api.novita.ai/openai/v1/models",
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
