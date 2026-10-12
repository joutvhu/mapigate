import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "sdwebui",
  "name": "SD WebUI",
  "alias": "sdwebui",
  "color": "#FF7043",
  "image": "/assets/providers/sdwebui/icon.png",
  "website": "https://github.com/AUTOMATIC1111/stable-diffusion-webui",
  "category": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "stable-diffusion-v1-5",
      "name": "Stable Diffusion v1.5",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "sdxl-base-1.0",
      "name": "SDXL Base 1.0",
      "isDefault": false,
      "kind": "image"
    }
  ]
};

export const provider = metadata;
export default metadata;
