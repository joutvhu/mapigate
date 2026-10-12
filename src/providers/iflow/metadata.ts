import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "iflow",
  "name": "iFlow AI",
  "alias": "if",
  "color": "#6366F1",
  "image": "/assets/providers/iflow/icon.png",
  "website": "https://iflow.cn",
  "notice": {
    "signupUrl": "https://iflow.cn"
  },
  "category": "oauth",
  "baseUrl": "https://apis.iflow.cn/v1/chat/completions",
  "baseUrls": [
    "https://apis.iflow.cn/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "User-Agent": "iFlow-Cli"
  },
  "thinkingMode": "auto",
  "oauth": {
    "clientId": "REDACTED_IFLOW_CLIENT_ID",
    "clientSecret": "REDACTED_IFLOW_CLIENT_SECRET",
    "authorizeUrl": "https://iflow.cn/oauth",
    "tokenUrl": "https://iflow.cn/oauth/token",
    "userInfoUrl": "https://iflow.cn/api/oauth/getUserInfo",
    "extraParams": {
      "loginMethod": "phone",
      "type": "phone"
    },
    "refreshLeadMs": 86400000
  }
,
  models
};

export const provider = metadata;
export default metadata;
