import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: ["Rolling", "Weekly", "Monthly"],
  "id": "opencode-go",
  "name": "OpenCode Go",
  "alias": "opencode-go",
  "aliases": [
    "ocg"
  ],
  "uiAlias": "ocg",
  "color": "#E87040",
  "image": "/assets/providers/opencode-go/icon.png",
  "website": "https://opencode.ai/auth",
  "notice": {
    "text": "OpenCode Go subscription: $5/mo (then 10/mo). Access to Kimi, GLM, Qwen, MiMo, MiniMax models.",
    "apiKeyUrl": "https://opencode.ai/auth"
  },
  "category": "apikey",
  "baseUrl": "https://opencode.ai/inference/go/openai/v1/chat/completions",
  "baseUrls": [
    "https://opencode.ai/inference/go/openai/v1/chat/completions"
  ],
  "validateUrl": "",
  "modelsUrl": "https://opencode.ai/inference/go/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "passthroughModels": true
,
  models
};

export const provider = metadata;
export default metadata;
