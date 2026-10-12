import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "gemini",
  "name": "Gemini",
  "alias": "gemini",
  "color": "#4285F4",
  "image": "/assets/providers/gemini/icon.png",
  "website": "https://ai.google.dev",
  "notice": {
    "apiKeyUrl": "https://aistudio.google.com/app/apikey"
  },
  "category": "freeTier",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://generativelanguage.googleapis.com/v1beta/models",
  "baseUrls": [
    "https://generativelanguage.googleapis.com/v1beta/models"
  ],
  "validateUrl": "",
  "format": "gemini",
  "defaultHeaders": {},
  "thinkingMode": "auto"
,
  models
};

export const provider = metadata;
export default metadata;
