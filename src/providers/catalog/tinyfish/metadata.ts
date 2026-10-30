import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "tinyfish",
  "name": "TinyFish",
  "alias": "tinyfish",
  "color": "#FF6700",
  "image": "/assets/providers/tinyfish/icon.png",
  "website": "https://www.tinyfish.ai/",
  "notice": {
    "apiKeyUrl": "https://agent.tinyfish.ai/api-keys"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.search.tinyfish.ai",
  "baseUrls": [
    "https://api.search.tinyfish.ai",
    "https://api.fetch.tinyfish.ai",
    "https://agent.tinyfish.ai/v1"
  ],
  "validateUrl": "https://api.search.tinyfish.ai/usage?limit=1",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "tinyfish/search",
      "name": "TinyFish Web Search",
      "contextLength": 128000
    },
    {
      "id": "tinyfish/fetch",
      "name": "TinyFish Web Fetch",
      "contextLength": 128000
    },
    {
      "id": "tinyfish/agent",
      "name": "TinyFish Web Agent",
      "contextLength": 128000
    }
  ]
};

export const provider = metadata;
export default metadata;
