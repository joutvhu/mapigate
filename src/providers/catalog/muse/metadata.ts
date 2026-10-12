import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "muse",
  "name": "Muse (Meta Model API)",
  "alias": "muse",
  "aliases": [
    "muse-ai",
    "meta-model-api",
    "muse-code",
    "muse-subscription"
  ],
  "uiAlias": "muse",
  "color": "#0866FF",
  "image": "/assets/providers/muse/icon.png",
  "website": "https://muse.ai",
  "notice": {
    "text": "Sign in with your Meta account (Muse Code subscription) or paste a Model API key from dev.meta.ai. Subscription keys are minted per account; Meta may train on contributor-tier data.",
    "apiKeyUrl": "https://dev.meta.ai",
    "signupUrl": "https://muse.ai"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://api.meta.ai/v1/chat/completions",
  "baseUrls": [
    "https://api.meta.ai/v1/chat/completions"
  ],
  "validateUrl": "https://api.meta.ai/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "oauth": {
    "clientId": "1031625952748946",
    "deviceCodeUrl": "https://auth.meta.com/oidc/device/authorization/",
    "tokenUrl": "https://auth.meta.com/oidc/device/token/"
  },
  "models": [
    {
      "id": "muse-spark-1.3",
      "name": "Muse Spark 1.3",
      "isDefault": false
    },
    {
      "id": "muse-spark-1.2",
      "name": "Muse Spark 1.2",
      "isDefault": false
    },
    {
      "id": "muse-spark-1.1",
      "name": "Muse Spark 1.1",
      "isDefault": false
    },
    {
      "id": "muse-spark-1.3-contributor",
      "name": "Muse Spark 1.3 Contributor",
      "isDefault": false
    },
    {
      "id": "muse-spark-1.2-contributor",
      "name": "Muse Spark 1.2 Contributor",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
