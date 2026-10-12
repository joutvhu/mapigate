import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "tavily",
  "name": "Tavily",
  "alias": "tavily",
  "color": "#5B21B6",
  "image": "/assets/providers/tavily/icon.png",
  "website": "https://tavily.com",
  "notice": {
    "apiKeyUrl": "https://app.tavily.com/home"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": []
};

export const provider = metadata;
export default metadata;
