import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "bazaarlink",
  "name": "Bazaarlink",
  "alias": "bzl",
  "aliases": [
    "bazaar-link"
  ],
  "uiAlias": "bzl",
  "color": "#DC2626",
  "image": "/assets/providers/bazaarlink/icon.png",
  "website": "https://bazaarlink.ai",
  "notice": {
    "apiKeyUrl": "https://bazaarlink.ai"
  },
  "category": "freeTier",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://bazaarlink.ai/api/v1/chat/completions",
  "baseUrls": [
    "https://bazaarlink.ai/api/v1/chat/completions"
  ],
  "validateUrl": "https://bazaarlink.ai/api/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto"
,
  models
};

export const provider = metadata;
export default metadata;
