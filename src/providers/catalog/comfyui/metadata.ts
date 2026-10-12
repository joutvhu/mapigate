import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "comfyui",
  "name": "ComfyUI",
  "alias": "comfyui",
  "color": "#4CAF50",
  "image": "/assets/providers/comfyui/icon.png",
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

export const provider = metadata;
export default metadata;
