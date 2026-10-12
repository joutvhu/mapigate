import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "azure",
  "name": "Azure OpenAI",
  "alias": "azure",
  "color": "#0078D4",
  "image": "/assets/providers/azure/icon.png",
  "website": "https://azure.microsoft.com/en-us/products/ai-services/openai-service",
  "notice": {
    "apiKeyUrl": "https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI"
  },
  "category": "apikey",
  "baseUrl": "",
  "baseUrls": [],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "hasProviderSpecificData": true,
  "models": []
};

export const provider = metadata;
export default metadata;
