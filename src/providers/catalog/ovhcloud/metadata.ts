import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "ovhcloud",
  "name": "OVHcloud AI",
  "alias": "ovh",
  "aliases": [
    "ovhcloud"
  ],
  "uiAlias": "ovhcloud",
  "color": "#2563EB",
  "iconBg": "#ffffff",
  "image": "/assets/providers/ovhcloud/icon.svg",
  "website": "https://www.ovhcloud.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "OVHcloud AI provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",
  "baseUrls": [
    "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "ovhcloud-default",
      "name": "OVHcloud AI Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
