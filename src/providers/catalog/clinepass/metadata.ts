import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "clinepass",
  "name": "ClinePass",
  "alias": "clinepass",
  "uiAlias": "clinepass",
  "color": "#5B9BD5",
  "image": "/assets/providers/clinepass/icon.png",
  "website": "https://cline.bot",
  "notice": {
    "signupUrl": "https://app.cline.bot"
  },
  "category": "oauth",
  "authModes": [
    "apikey",
    "oauth"
  ],
  "baseUrl": "https://api.cline.bot/api/v1/chat/completions",
  "baseUrls": [
    "https://api.cline.bot/api/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "HTTP-Referer": "https://cline.bot",
    "X-Title": "Cline"
  },
  "thinkingMode": "auto",
  "thinkingOptions": [
    "auto",
    "on",
    "off"
  ],
  "oauth": {
    "appBaseUrl": "https://app.cline.bot",
    "apiBaseUrl": "https://api.cline.bot",
    "authorizeUrl": "https://api.cline.bot/api/v1/auth/authorize",
    "tokenUrl": "https://api.cline.bot/api/v1/auth/token",
    "refreshUrl": "https://api.cline.bot/api/v1/auth/refresh"
  }
,
  models
};

export const provider = metadata;
export default metadata;
