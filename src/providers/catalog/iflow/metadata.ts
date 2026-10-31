import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

import { resolvePublicCred } from "../../../shared/utils/publicCreds.js";

export const metadata: ProviderRegistryItem = {
  "id": "iflow",
  "name": "iFlow AI",
  "alias": "if",
  "color": "#6366F1",
  "iconBg": "#ffffff",
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
    "clientId": resolvePublicCred("iflow_client_id"),
    "clientSecret": resolvePublicCred("iflow_client_secret"),
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
