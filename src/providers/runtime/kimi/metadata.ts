import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";
import { resolvePublicCred } from "../../../shared/utils/publicCreds.js";

export const metadata: ProviderRegistryItem = {
  "id": "kimi",
  "name": "Kimi",
  "alias": "kimi",
  "aliases": [
    "kimi-coding",
    "kmc"
  ],
  "color": "#1E3A8A",
  "image": "/assets/providers/kimi/icon.png",
  "website": "https://kimi.moonshot.cn",
  "notice": {
    "apiKeyUrl": "https://platform.moonshot.ai/console/api-keys",
    "signupUrl": "https://www.kimi.com/code"
  },
  "category": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://api.kimi.com/coding/v1/messages",
  "baseUrls": [
    "https://api.kimi.com/coding/v1/messages"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {
    "Anthropic-Version": "2023-06-01",
    "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
  },
  "thinkingMode": "auto",
  "oauth": {
    "clientId": resolvePublicCred("kimi_client_id"),
    "deviceCodeUrl": "https://auth.kimi.com/api/oauth/device_authorization",
    "tokenUrl": "https://auth.kimi.com/api/oauth/token",
    "refreshUrl": "https://auth.kimi.com/api/oauth/token",
    "refreshLeadMs": 300000,
    "authorizeDeviceUrl": "https://www.kimi.com/code/authorize_device"
  }
,
  models
};

export const provider = metadata;
export default metadata;
