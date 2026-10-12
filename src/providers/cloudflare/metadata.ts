import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "cloudflare",
  "name": "Cloudflare Workers AI",
  "alias": "cloudflare",
  "aliases": [
    "cloudflare-ai",
    "cf"
  ],
  "uiAlias": "cf",
  "color": "#F38020",
  "image": "/assets/providers/cloudflare/icon.svg",
  "website": "https://developers.cloudflare.com/workers-ai/",
  "notice": {
    "text": "Workers AI free tier. Requires a Cloudflare API token and Account ID.",
    "apiKeyUrl": "https://dash.cloudflare.com/profile/api-tokens"
  },
  "category": "freeTier",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1/chat/completions",
  "baseUrls": [
    "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "hasProviderSpecificData": true
,
  models
};

export const provider = metadata;
export default metadata;
