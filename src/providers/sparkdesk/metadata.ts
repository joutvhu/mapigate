import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "sparkdesk",
  "name": "SparkDesk",
  "alias": "sparkdesk",
  "aliases": [
    "sparkdesk"
  ],
  "uiAlias": "sparkdesk",
  "color": "#0066FF",
  "image": "/assets/providers/sparkdesk/icon.svg",
  "website": "https://xinghuo.xfyun.cn",
  "notice": {
    "apiKeyUrl": "",
    "text": "SparkDesk provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://spark-api-open.xf-yun.com/v1/chat/completions",
  "baseUrls": [
    "https://spark-api-open.xf-yun.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "sparkdesk-default",
      "name": "SparkDesk Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
