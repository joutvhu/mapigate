import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "minimax",
  "name": "Minimax Coding",
  "alias": "minimax",
  "color": "#7C3AED",
  "image": "/assets/providers/minimax/icon.png",
  "website": "https://www.minimaxi.com",
  "notice": {
    "apiKeyUrl": "https://platform.minimaxi.com/user-center/basic-information/interface-key"
  },
  "category": "apikey",
  "baseUrl": "https://api.minimax.io/anthropic/v1/messages",
  "baseUrls": [
    "https://api.minimax.io/anthropic/v1/messages"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {
    "Anthropic-Version": "2023-06-01",
    "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
  },
  "thinkingMode": "auto"
,
  models
};

export const provider = metadata;
export default metadata;
