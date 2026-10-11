import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "google-pse",
  "name": "Google PSE",
  "alias": "gpse",
  "color": "#4285F4",
  "image": "/providers/google-pse.png",
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

export default provider;
