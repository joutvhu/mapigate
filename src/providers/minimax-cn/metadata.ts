import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
      "Coding Tokens",
      "Standard Tokens",
      "Balance"
  ],
  "id": "minimax-cn",
  "name": "Minimax (China)",
  "alias": "minimax-cn",
  "color": "#DC2626",
  "image": "/assets/providers/minimax-cn/icon.png",
  "website": "https://www.minimaxi.com",
  "notice": {
    "apiKeyUrl": "https://platform.minimaxi.com/user-center/basic-information/interface-key"
  },
  "category": "apikey",
  "baseUrl": "https://api.minimaxi.com/anthropic/v1/messages",
  "baseUrls": [
    "https://api.minimaxi.com/anthropic/v1/messages"
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
