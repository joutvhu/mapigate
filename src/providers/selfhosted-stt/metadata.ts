import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "selfhosted-stt",
  "name": "Self-hosted STT",
  "alias": "selfhosted-stt",
  "color": "#ffffffff",
  "image": "/assets/providers/selfhosted-stt/icon.png",
  "website": "https://github.com/ggml-org/whisper.cpp",
  "category": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "whisper-1",
      "name": "Whisper (self-hosted)",
      "isDefault": false,
      "kind": "stt"
    }
  ]
};

export const provider = metadata;
export default metadata;
