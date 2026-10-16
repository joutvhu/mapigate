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
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
