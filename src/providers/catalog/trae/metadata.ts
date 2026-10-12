import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "trae",
  "name": "Trae",
  "alias": "tr",
  "aliases": [
    "marscode"
  ],
  "uiAlias": "tr",
  "color": "#FF6A00",
  "image": "/assets/providers/trae/icon.png",
  "website": "https://www.trae.ai",
  "notice": {
    "signupUrl": "https://www.trae.ai"
  },
  "category": "oauth",
  "authType": "oauth",
  "authModes": [
    "oauth"
  ],
  "baseUrl": "https://core-normal.trae.ai/api/remote/v1",
  "baseUrls": [
    "https://core-normal.trae.ai/api/remote/v1"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "X-Trae-Client-Type": "web",
    "X-Preferenced-Language": "en",
    "Referer": "https://solo.trae.ai/"
  },
  "thinkingMode": "auto",
  "defaultRegion": "cn",
  "oauth": {
    "clientId": "REDACTED_TRAE_CLIENT_ID",
    "clientSecret": "-",
    "platform": "trae",
    "pollInterval": 1500,
    "loginGuidanceUrl": "https://api.marscode.com/cloudide/api/v3/trae/GetLoginGuidance",
    "tokenUrl": "https://api.marscode.com/cloudide/api/v3/trae/oauth/ExchangeToken",
    "exchangeTokenUrl": "https://api.marscode.com/cloudide/api/v3/trae/oauth/ExchangeToken",
    "refreshUrl": "https://api.marscode.com/cloudide/api/v3/trae/oauth/ExchangeToken",
    "userInfoUrl": "https://api.marscode.com/cloudide/api/v3/trae/GetUserInfo",
    "refresh": {
      "encoding": "json"
    }
  }
,
  models
};

export const provider = metadata;
export default metadata;
