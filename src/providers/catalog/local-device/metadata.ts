import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "local-device",
  "name": "Local Device",
  "alias": "local-device",
  "color": "#64748B",
  "image": "/assets/providers/local-device/icon.png",
  "category": "freeTier",
  "authType": "none",
  "requiresApiKey": false,
  "isLocal": true,
  "noAuth": true,
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": []
};

export const provider = metadata;
export default metadata;
