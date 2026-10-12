import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "bluesminds",
  "name": "BluesMinds",
  "alias": "bm",
  "aliases": [
    "blue-sminds"
  ],
  "uiAlias": "bm",
  "color": "#2563EB",
  "image": "/assets/providers/bluesminds/icon.png",
  "website": "https://bluesminds.com",
  "notice": {
    "apiKeyUrl": "https://bluesminds.com"
  },
  "category": "apikey",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://api.bluesminds.com/v1/chat/completions",
  "baseUrls": [
    "https://api.bluesminds.com/v1/chat/completions"
  ],
  "validateUrl": "https://api.bluesminds.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto"
,
  models
};

export const provider = metadata;
export default metadata;
