import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "clova-studio",
  "name": "Naver CLOVA Studio",
  "alias": "clova",
  "aliases": [
    "clova-studio"
  ],
  "uiAlias": "clova-studio",
  "color": "#03C75A",
  "image": "/assets/providers/clova-studio/icon.svg",
  "website": "https://api.ncloud-docs.com/docs/en/ai-naver-clovastudio-summary",
  "notice": {
    "apiKeyUrl": "",
    "text": "Naver CLOVA Studio provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://clovastudio.stream.ntruss.com/v3/chat-completions",
  "baseUrls": [
    "https://clovastudio.stream.ntruss.com/v3/chat-completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "clova-studio-default",
      "name": "Naver CLOVA Studio Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
