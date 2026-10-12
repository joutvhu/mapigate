import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "zcode",
  "name": "ZCode (GLM Coding Plan)",
  "alias": "zc",
  "aliases": [
    "zcode",
    "zc"
  ],
  "uiAlias": "zc",
  "color": "#3B82F6",
  "image": "/assets/providers/zcode/icon.png",
  "website": "https://zcode.z.ai",
  "notice": {
    "text": "ZCode runs locally through its native app-server. Mapigate connects via stdio and never stores the Z.ai credential."
  },
  "category": "free",
  "authType": "none",
  "authModes": [
    "none"
  ],
  "noAuth": true,
  "baseUrl": "zcode://app-server/stdio",
  "baseUrls": [
    "zcode://app-server/stdio"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "glm-4-plus",
      "name": "GLM-4 Plus",
      "isDefault": true,
      "contextLength": 128000
    },
    {
      "id": "glm-4-air",
      "name": "GLM-4 Air",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "codegeex-4",
      "name": "CodeGeeX 4",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "glm-5.2",
      "name": "GLM 5.2",
      "isDefault": false,
      "contextLength": 1048576
    },
    {
      "id": "glm-5",
      "name": "GLM 5",
      "isDefault": false,
      "contextLength": 204800
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
