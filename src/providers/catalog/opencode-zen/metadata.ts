import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "opencode-zen",
  "name": "OpenCode Zen",
  "alias": "ocz",
  "aliases": [
    "opencode-zen"
  ],
  "uiAlias": "ocz",
  "color": "#E87040",
  "image": "/assets/providers/opencode-zen/icon.png",
  "website": "https://opencode.ai/auth",
  "notice": {
    "text": "OpenCode Zen PAYG: pay-as-you-go, key from https://opencode.ai/auth. Same models as Zen: paid + free tiers on the fast lane.",
    "apiKeyUrl": "https://opencode.ai/auth"
  },
  "category": "apikey",
  "baseUrl": "https://opencode.ai/zen/v1/chat/completions",
  "baseUrls": [
    "https://opencode.ai/zen/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "passthroughModels": true,
  "freeTier": {
    "scope": "models",
    "match": ["*-free", "*:free", "*contributor-free*"],
    "limitType": "requests",
    "note": "Free models on OpenCode fast lane"
  },
  models
};

export const provider = metadata;
export default metadata;
