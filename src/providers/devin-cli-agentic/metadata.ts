import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "devin-cli-agentic",
  "name": "Devin CLI Agentic",
  "alias": "dva",
  "aliases": [
    "devin-cli-agentic",
    "dva"
  ],
  "uiAlias": "dva",
  "color": "#4F46E5",
  "image": "/assets/providers/devin-cli-agentic/icon.png",
  "website": "https://docs.devin.ai/work-with-devin/devin-cli",
  "notice": {
    "text": "Official Devin CLI agentic workflow bridge over local stdio."
  },
  "category": "free",
  "authType": "none",
  "authModes": [
    "none"
  ],
  "noAuth": true,
  "baseUrl": "devin://cli/stdio",
  "baseUrls": [
    "devin://cli/stdio"
  ],
  "validateUrl": "",
  "format": "claude",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "devin-agentic",
      "name": "Devin Agentic",
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
