import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "vertex-partner",
  "name": "Vertex Partner",
  "alias": "vertex-partner",
  "aliases": [
    "vxp"
  ],
  "uiAlias": "vxp",
  "color": "#34A853",
  "image": "/assets/providers/vertex-partner/icon.png",
  "website": "https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-partner-models",
  "notice": {
    "apiKeyUrl": "https://console.cloud.google.com/iam-admin/serviceaccounts"
  },
  "category": "apikey",
  "baseUrl": "https://aiplatform.googleapis.com",
  "baseUrls": [
    "https://aiplatform.googleapis.com"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "deepseek-ai/deepseek-v3.2-maas",
      "name": "DeepSeek V3.2 (Vertex)",
      "isDefault": false
    },
    {
      "id": "qwen/qwen3-next-80b-a3b-thinking-maas",
      "name": "Qwen3 Next 80B Thinking (Vertex)",
      "isDefault": false
    },
    {
      "id": "qwen/qwen3-next-80b-a3b-instruct-maas",
      "name": "Qwen3 Next 80B Instruct (Vertex)",
      "isDefault": false
    },
    {
      "id": "zai-org/glm-5-maas",
      "name": "GLM-5 (Vertex)",
      "isDefault": false
    }
  ]
};

export const provider = metadata;
export default metadata;
