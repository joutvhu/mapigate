import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "zed",
  "name": "Zed",
  "alias": "zd",
  "uiAlias": "zd",
  "color": "#A855F7",
  "image": "/providers/zed.png",
  "website": "https://zed.dev",
  "notice": {
    "signupUrl": "https://zed.dev/native_app_signin"
  },
  "category": "oauth",
  "authType": "oauth",
  "baseUrl": "https://cloud.zed.dev/completions",
  "baseUrls": [
    "https://cloud.zed.dev/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "oauth": {
    "authorizeUrl": "https://zed.dev/native_app_signin",
    "platform": "zed",
    "rsaKeyExchange": true
  },
  "models": [],
  "passthroughModels": true
};

export default provider;
