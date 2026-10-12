import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "google-pse",
  "name": "Google PSE",
  "alias": "gpse",
  "color": "#4285F4",
  "image": "/assets/providers/google-pse/icon.png",
  "website": "https://programmablesearchengine.google.com",
  "notice": {
    "apiKeyUrl": "https://programmablesearchengine.google.com/controlpanel/create"
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
