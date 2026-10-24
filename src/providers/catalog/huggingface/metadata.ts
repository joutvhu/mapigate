import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "huggingface",
  "name": "HuggingFace",
  "alias": "huggingface",
  "aliases": [
    "hf"
  ],
  "uiAlias": "hf",
  "color": "#FFD21E",
  "image": "/assets/providers/huggingface/icon.png",
  "website": "https://huggingface.co",
  "notice": {
    "apiKeyUrl": "https://huggingface.co/settings/tokens",
    "text": "Runs through the Inference Providers router. Image and speech models are billed by the provider selected per model."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://router.huggingface.co/v1",
  "baseUrls": [
    "https://router.huggingface.co/v1"
  ],
  "validateUrl": "https://router.huggingface.co/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto"
,
  models
};

export const provider = metadata;
export default metadata;
