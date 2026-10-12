import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "nvidia",
  "name": "NVIDIA NIM",
  "alias": "nvidia",
  "color": "#76B900",
  "iconBg": "#ffffff",
  "image": "/assets/providers/nvidia/icon.png",
  "website": "https://developer.nvidia.com/nim",
  "notice": {
    "text": "Free access for NVIDIA Developer Program members (prototyping & testing).",
    "apiKeyUrl": "https://build.nvidia.com/settings/api-keys"
  },
  "category": "freeTier",
  "authType": "apikey",
  "authModes": [
    "apikey"
  ],
  "baseUrl": "https://integrate.api.nvidia.com/v1/chat/completions",
  "baseUrls": [
    "https://integrate.api.nvidia.com/v1/chat/completions"
  ],
  "validateUrl": "https://integrate.api.nvidia.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  models
};

export const provider = metadata;
export default metadata;
