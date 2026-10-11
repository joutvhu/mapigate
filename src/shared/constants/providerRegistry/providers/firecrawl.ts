import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "firecrawl",
  "name": "Firecrawl",
  "alias": "firecrawl",
  "color": "#F59E0B",
  "image": "/providers/firecrawl.png",
  "website": "https://firecrawl.dev",
  "notice": {
    "apiKeyUrl": "https://www.firecrawl.dev/app/api-keys"
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

export default provider;
