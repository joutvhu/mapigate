import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "ovhcloud",
  "name": "OVHcloud AI",
  "alias": "ovh",
  "aliases": [
    "ovhcloud"
  ],
  "uiAlias": "ovhcloud",
  "color": "#2563EB",
  "image": "/providers/ovhcloud.svg",
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

export default provider;
