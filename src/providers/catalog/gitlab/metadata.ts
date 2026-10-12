import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "gitlab",
  "name": "GitLab Duo",
  "color": "#FC6D26",
  "image": "/assets/providers/gitlab/icon.png",
  "website": "https://gitlab.com",
  "notice": {
    "signupUrl": "https://gitlab.com"
  },
  "category": "oauth",
  "baseUrl": "https://gitlab.com/api/v4/chat/completions",
  "baseUrls": [
    "https://gitlab.com/api/v4/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "oauth": {
    "defaultBaseUrl": "https://gitlab.com",
    "authorizeUrlPath": "/oauth/authorize",
    "tokenUrlPath": "/oauth/token",
    "userInfoUrlPath": "/api/v4/user",
    "scope": "api read_user",
    "codeChallengeMethod": "S256",
    "scopes": [
      "api read_user"
    ]
  },
  "models": []
};

export const provider = metadata;
export default metadata;
