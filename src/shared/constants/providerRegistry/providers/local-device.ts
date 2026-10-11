import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "local-device",
  "name": "Local Device",
  "alias": "local-device",
  "color": "#64748B",
  "image": "/providers/local-device.png",
  "category": "freeTier",
  "authType": "none",
  "noAuth": true,
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": []
};

export default provider;
