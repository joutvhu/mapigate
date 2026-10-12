import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "firecrawl",
  "name": "Firecrawl",
  "alias": "firecrawl",
  "color": "#F59E0B",
  "image": "/assets/providers/firecrawl/icon.png",
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

export const provider = metadata;
export default metadata;
