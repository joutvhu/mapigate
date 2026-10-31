import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";
import { resolvePublicCred } from "../../../shared/utils/publicCreds.js";

export const metadata: ProviderRegistryItem = {
  "id": "kimi",
  "name": "Kimi for Coding",
  "alias": "kimi",
  "aliases": [
    "kimi-coding",
    "kimi-code",
    "kmc"
  ],
  "color": "#1E3A8A",
  "image": "/assets/providers/kimi/icon.png",
  "website": "https://www.kimi.ai",
  "notice": {
    "signupUrl": "https://www.kimi.ai/code",
    "text": "Kimi for Coding subscription via OAuth Device Code (kimi.ai / kimi.com). For pay-as-you-go API keys (sk-...), use Moonshot AI (Kimi Platform)."
  },
  "category": "oauth",
  "authModes": [
    "oauth"
  ],
  "baseUrl": "https://api.kimi.com/coding/v1/messages",
  "baseUrls": [
    "https://api.kimi.com/coding/v1/messages"
  ],
  "validateUrl": "https://api.kimi.com/coding/v1/usages",
  "format": "claude",
  "defaultHeaders": {
    "Anthropic-Version": "2023-06-01",
    "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
  },
  "thinkingMode": "auto",
  "regions": [
    { "id": "intl", "label": "International (kimi.ai - Google / Email)" },
    { "id": "cn", "label": "China (kimi.com - Phone / WeChat)" }
  ],
  "defaultRegion": "intl",
  "oauth": {
    "clientId": resolvePublicCred("kimi_client_id"),
    "deviceCodeUrl": "https://auth.kimi.ai/api/oauth/device_authorization",
    "tokenUrl": "https://auth.kimi.ai/api/oauth/token",
    "refreshUrl": "https://auth.kimi.ai/api/oauth/token",
    "refreshLeadMs": 300000,
    "authorizeDeviceUrl": "https://www.kimi.ai/code/authorize_device"
  },
  models
};

export const provider = metadata;
export default metadata;
