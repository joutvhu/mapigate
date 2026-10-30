import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "gitlab",
  "name": "GitLab Duo",
  "color": "#FC6D26",
  "image": "/assets/providers/gitlab/icon.png",
  "website": "https://gitlab.com",
  "notice": {
    "apiKeyUrl": "https://gitlab.com/-/user_settings/personal_access_tokens",
    "signupUrl": "https://gitlab.com",
    "text": "GitLab has no shared sign-in app, so connect with a Personal Access Token (glpat-..., scopes api + read_user)."
  },
  "category": "apikey",
  "authType": "apikey",
  "authModes": ["apikey"],
  "baseUrl": "https://gitlab.com/api/v4/chat/completions",
  "baseUrls": [
    "https://gitlab.com/api/v4/chat/completions"
  ],
  "validateUrl": "https://gitlab.com/api/v4/user",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    { "id": "gitlab-duo-chat", "name": "GitLab Duo Chat", "contextLength": 128000 },
    { "id": "claude-3-7-sonnet", "name": "Claude 3.7 Sonnet (GitLab Duo)", "contextLength": 200000 },
    { "id": "claude-3-5-sonnet", "name": "Claude 3.5 Sonnet (GitLab Duo)", "contextLength": 200000 },
    { "id": "gpt-4o", "name": "GPT-4o (GitLab Duo)", "contextLength": 128000 },
    { "id": "mistral-large", "name": "Mistral Large (GitLab Duo)", "contextLength": 128000 }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
