import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "runwayml",
  "name": "Runway ML",
  "alias": "runwayml",
  "aliases": [
    "runway"
  ],
  "uiAlias": "runway",
  "color": "#000000",
  "iconBg": "#FFFFFF",
  "image": "/assets/providers/runwayml/icon.png",
  "website": "https://runwayml.com",
  "notice": {
    "apiKeyUrl": "https://dev.runwayml.com"
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "gen4_image",
      "name": "Gen-4 Image",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "gen4_image_turbo",
      "name": "Gen-4 Image Turbo",
      "isDefault": false,
      "kind": "image"
    },
    {
      "id": "gen4_turbo",
      "name": "Gen-4 Turbo",
      "isDefault": false,
      "kind": "video"
    },
    {
      "id": "gen3a_turbo",
      "name": "Gen-3 Alpha Turbo",
      "isDefault": false,
      "kind": "video"
    }
  ]
};

export const provider = metadata;
export default metadata;
