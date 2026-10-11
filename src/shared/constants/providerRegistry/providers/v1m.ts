import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "v1m",
  "name": "v1m (System One)",
  "alias": "v1m",
  "aliases": [
    "systemone",
    "jev"
  ],
  "uiAlias": "v1m",
  "color": "#6366F1",
  "image": "/providers/v1m.png",
  "website": "https://v1m.ir",
  "notice": {
    "text": "v1m System One calibrated decision engine. Fast probabilistic evaluations over state and questions.",
    "apiKeyUrl": "https://v1m.ir"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "hasProviderSpecificData": true,
  "models": [
    {
      "id": "rev-latest",
      "name": "v1m Rev Latest (Calibrated)",
      "isDefault": false,
      "kind": "systemone"
    },
    {
      "id": "v1m-decision-engine",
      "name": "v1m Decision Engine",
      "isDefault": false,
      "kind": "systemone"
    }
  ]
};

export default provider;
