import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "opencode",
  "name": "OpenCode Free",
  "alias": "oc",
  "aliases": [
    "oc",
    "opencode-free"
  ],
  "uiAlias": "oc",
  "color": "#E87040",
  "image": "/assets/providers/opencode/icon.png",
  "website": "https://opencode.ai",
  "category": "free",
  "authType": "none",
  "requiresApiKey": false,
  "noAuth": true,
  "baseUrl": "https://opencode.ai",
  "baseUrls": [
    "https://opencode.ai"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "x-opencode-client": "cli"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "muse-spark-1.2-contributor-free",
      "name": "Muse Spark 1.2 Contributor Free",
      "isDefault": false
    },
    {
      "id": "muse-spark-1.3-contributor-free",
      "name": "Muse Spark 1.3 Contributor Free",
      "isDefault": false
    },
    {
      "id": "union-alpha",
      "name": "Union Alpha Free",
      "isDefault": false
    },
    {
      "id": "jev-1.13-free",
      "name": "Jev 1.13 Free",
      "isDefault": false,
      "kind": "systemone"
    },
    {
      "id": "deepseek-v4.1-flash-free",
      "name": "DeepSeek V4.1 Flash Free",
      "isDefault": false,
      "capabilities": {
        "vision": true,
        "reasoning": true,
        "thinkingFormat": "deepseek",
        "contextWindow": 330000,
        "maxOutput": 128000
      }
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
