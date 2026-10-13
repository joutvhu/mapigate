import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "internlm",
  "name": "InternLM (Intern-S1)",
  "alias": "internlm",
  "aliases": [
    "internlm"
  ],
  "uiAlias": "internlm",
  "color": "#4F46E5",
  "image": "/assets/providers/internlm/icon.png",
  "website": "https://internlm.intern-ai.org.cn/",
  "notice": {
    "apiKeyUrl": "",
    "text": "InternLM (Intern-S1) provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://chat.intern-ai.org.cn/api/v1/chat/completions",
  "baseUrls": [
    "https://chat.intern-ai.org.cn/api/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "internlm-default",
      "name": "InternLM (Intern-S1) Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
