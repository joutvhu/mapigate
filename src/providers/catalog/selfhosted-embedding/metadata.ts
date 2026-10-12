import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "selfhosted-embedding",
  "name": "Self-hosted Embedding",
  "alias": "selfhosted-embedding",
  "color": "#ffffffff",
  "image": "/assets/providers/selfhosted-embedding/icon.png",
  "website": "https://github.com/ggml-org/llama.cpp",
  "category": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "embedding",
      "name": "Self-hosted embedding model",
      "isDefault": false,
      "kind": "embedding"
    }
  ]
};

export const provider = metadata;
export default metadata;
