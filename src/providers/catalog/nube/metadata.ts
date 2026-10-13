import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "nube",
  "name": "Nube.sh",
  "alias": "nube",
  "aliases": [
    "nube"
  ],
  "uiAlias": "nube",
  "color": "#2563EB",
  "image": "/assets/providers/nube/icon.ico",
  "website": "https://nube.sh",
  "notice": {
    "apiKeyUrl": "https://nube.sh/dashboard/api-keys",
    "text": "OpenAI-compatible gateway (LiteLLM). Bring your own API key — models are resolved live from the account (passthrough)."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://ai.nube.sh/api/v1/chat/completions",
  "baseUrls": [
    "https://ai.nube.sh/api/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "nube-default",
      "name": "Nube.sh Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
