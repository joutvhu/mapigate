import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "codebuddy-cn",
  "name": "CodeBuddy CN",
  "alias": "cbcn",
  "uiAlias": "cbcn",
  "color": "#006EFF",
  "image": "/assets/providers/codebuddy-cn/icon.png",
  "website": "https://copilot.tencent.com",
  "notice": {
    "signupUrl": "https://copilot.tencent.com"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://copilot.tencent.com/v2/chat/completions",
  "baseUrls": [
    "https://copilot.tencent.com/v2/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "User-Agent": "CLI/2.108.1 CodeBuddy/2.108.1",
    "X-Product": "SaaS",
    "X-IDE-Type": "CLI",
    "X-IDE-Name": "CLI",
    "x-requested-with": "XMLHttpRequest",
    "x-codebuddy-request": "1"
  },
  "thinkingMode": "auto",
  "oauth": {
    "baseUrl": "https://copilot.tencent.com",
    "stateUrl": "https://copilot.tencent.com/v2/plugin/auth/state",
    "tokenUrl": "https://copilot.tencent.com/v2/plugin/auth/token",
    "refreshUrl": "https://copilot.tencent.com/v2/plugin/auth/token/refresh",
    "userAgent": "CLI/2.63.2 CodeBuddy/2.63.2",
    "platform": "CLI",
    "pollInterval": 5000
  }
,
  models
};

export const provider = metadata;
export default metadata;
