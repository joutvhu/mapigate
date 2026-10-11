import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "selfhosted-embedding",
  "name": "Self-hosted Embedding",
  "alias": "selfhosted-embedding",
  "color": "#ffffffff",
  "image": "/providers/selfhosted-embedding.png",
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

export default provider;
