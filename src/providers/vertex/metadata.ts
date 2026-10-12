import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "vertex",
  "name": "Vertex AI",
  "alias": "vertex",
  "aliases": [
    "vx"
  ],
  "uiAlias": "vx",
  "color": "#4285F4",
  "image": "/assets/providers/vertex/icon.png",
  "website": "https://cloud.google.com/vertex-ai",
  "notice": {
    "text": "New Google Cloud accounts get $300 free credits. Requires GCP project + Service Account with Vertex AI API enabled.",
    "apiKeyUrl": "https://console.cloud.google.com/iam-admin/serviceaccounts"
  },
  "category": "freeTier",
  "baseUrl": "https://aiplatform.googleapis.com",
  "baseUrls": [
    "https://aiplatform.googleapis.com"
  ],
  "validateUrl": "",
  "format": "vertex",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "gemini-3.1-pro-preview",
      "name": "Gemini 3.1 Pro Preview",
      "isDefault": false
    },
    {
      "id": "gemini-3.1-flash-lite-preview",
      "name": "Gemini 3.1 Flash Lite Preview",
      "isDefault": false
    },
    {
      "id": "gemini-3-flash-preview",
      "name": "Gemini 3 Flash Preview",
      "isDefault": false
    },
    {
      "id": "gemini-2.5-flash",
      "name": "Gemini 2.5 Flash",
      "isDefault": false
    },
    {
      "id": "veo-3.1-generate-preview",
      "name": "Veo 3.1 (Preview)",
      "isDefault": false,
      "kind": "video"
    },
    {
      "id": "veo-3.1-fast-generate-preview",
      "name": "Veo 3.1 Fast (Preview)",
      "isDefault": false,
      "kind": "video"
    },
    {
      "id": "veo-3.0-generate-001",
      "name": "Veo 3",
      "isDefault": false,
      "kind": "video"
    },
    {
      "id": "veo-2.0-generate-001",
      "name": "Veo 2",
      "isDefault": false,
      "kind": "video"
    }
  ]
};

export const provider = metadata;
export default metadata;
