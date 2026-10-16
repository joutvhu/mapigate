import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "nous-research",
  "name": "Nous Research",
  "alias": "nous",
  "aliases": [
    "nous-research"
  ],
  "uiAlias": "nous-research",
  "color": "#2563EB",
  "iconBg": "#ffffff",
  "image": "/assets/providers/nous-research/icon.png",
  "website": "https://portal.nousresearch.com/help",
  "notice": {
    "apiKeyUrl": "",
    "text": "Nous Research provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://inference-api.nousresearch.com/v1/chat/completions",
  "baseUrls": [
    "https://inference-api.nousresearch.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "nous-research-default",
      "name": "Nous Research Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
