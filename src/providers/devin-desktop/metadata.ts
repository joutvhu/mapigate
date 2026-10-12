import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "devin-desktop",
  "name": "Devin Desktop",
  "alias": "dvd",
  "aliases": [
    "devin-desktop",
    "dvd"
  ],
  "uiAlias": "dvd",
  "color": "#6366F1",
  "image": "/assets/providers/devin-desktop/icon.png",
  "website": "https://devin.ai",
  "notice": {
    "text": "Devin Desktop bridge connecting to local agent session over ACP stdio."
  },
  "category": "free",
  "authType": "none",
  "authModes": [
    "none"
  ],
  "noAuth": true,
  "baseUrl": "devin://acp/stdio",
  "baseUrls": [
    "devin://acp/stdio"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "devin-code-v1",
      "name": "Devin Code v1",
      "isDefault": true,
      "contextLength": 200000
    },
    {
      "id": "swe-1.6",
      "name": "SWE-1.6",
      "isDefault": false,
      "contextLength": 200000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
