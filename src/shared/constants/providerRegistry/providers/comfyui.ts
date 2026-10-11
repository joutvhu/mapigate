import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "comfyui",
  "name": "ComfyUI",
  "alias": "comfyui",
  "color": "#4CAF50",
  "image": "/providers/comfyui.png",
  "website": "https://github.com/comfyanonymous/ComfyUI",
  "category": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "flux-dev",
      "name": "FLUX Dev",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "sdxl",
      "name": "SDXL",
      "isDefault": false,
      "kind": "image"
    }
  ]
};

export default provider;
