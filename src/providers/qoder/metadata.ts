import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Daily",
      "Weekly",
      "Monthly",
      "Balance"
  ],
  "id": "qoder",
  "name": "Qoder",
  "alias": "qd",
  "uiAlias": "qd",
  "color": "#EC4899",
  "image": "/assets/providers/qoder/icon.png",
  "website": "https://qoder.com",
  "notice": {
    "signupUrl": "https://qoder.com"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation",
  "baseUrls": [
    "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "oauth": {
    "openApiBaseUrl": "https://openapi.qoder.sh",
    "centerBaseUrl": "https://center.qoder.sh",
    "chatBaseUrl": "https://api3.qoder.sh",
    "deviceTokenUrl": "https://openapi.qoder.sh/api/v1/deviceToken/poll",
    "refreshUrl": "https://center.qoder.sh/algo/api/v3/user/refresh_token",
    "userInfoUrl": "https://openapi.qoder.sh/api/v1/userinfo",
    "quotaUsageUrl": "https://openapi.qoder.sh/api/v2/quota/usage",
    "loginUrl": "https://qoder.com/device/selectAccounts"
  }
,
  models
};

export const provider = metadata;
export default metadata;
