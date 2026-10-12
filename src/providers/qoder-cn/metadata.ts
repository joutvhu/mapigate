import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "qoder-cn",
  "name": "Qoder CN",
  "alias": "qdcn",
  "uiAlias": "qdcn",
  "color": "#EC4899",
  "image": "/assets/providers/qoder-cn/icon.png",
  "website": "https://qoder.com.cn",
  "notice": {
    "signupUrl": "https://qoder.com.cn"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation",
  "baseUrls": [
    "https://gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "oauth": {
    "openApiBaseUrl": "https://openapi.qoder.com.cn",
    "centerBaseUrl": "https://gateway.qoder.com.cn",
    "chatBaseUrl": "https://gateway.qoder.com.cn",
    "deviceTokenUrl": "https://openapi.qoder.com.cn/api/v1/deviceToken/poll",
    "refreshUrl": "https://gateway.qoder.com.cn/algo/api/v3/user/refresh_token",
    "userInfoUrl": "https://openapi.qoder.com.cn/api/v1/userinfo",
    "quotaUsageUrl": "https://openapi.qoder.com.cn/api/v2/quota/usage",
    "loginUrl": "https://qoder.com.cn/device/selectAccounts"
  }
,
  models
};

export const provider = metadata;
export default metadata;
