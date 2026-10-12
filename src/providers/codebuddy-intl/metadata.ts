import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "codebuddy-intl",
  "name": "CodeBuddy",
  "alias": "cbai",
  "uiAlias": "cbai",
  "color": "#006EFF",
  "image": "/assets/providers/codebuddy-intl/icon.png",
  "website": "https://www.codebuddy.ai",
  "notice": {
    "signupUrl": "https://www.codebuddy.ai"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://www.codebuddy.ai/v2/chat/completions",
  "baseUrls": [
    "https://www.codebuddy.ai/v2/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "User-Agent": "IDE/2.108.1 CodeBuddy/2.108.1",
    "X-Product": "SaaS",
    "X-IDE-Type": "IDE",
    "X-IDE-Name": "IDE",
    "x-requested-with": "XMLHttpRequest",
    "x-codebuddy-request": "1"
  },
  "thinkingMode": "auto",
  "oauth": {
    "baseUrl": "https://www.codebuddy.ai",
    "stateUrl": "https://www.codebuddy.ai/v2/plugin/auth/state",
    "tokenUrl": "https://www.codebuddy.ai/v2/plugin/auth/token",
    "refreshUrl": "https://www.codebuddy.ai/v2/plugin/auth/token/refresh",
    "userAgent": "IDE/2.63.2 CodeBuddy/2.63.2",
    "platform": "ide",
    "pollInterval": 5000
  }
,
  models
};

export const provider = metadata;
export default metadata;
