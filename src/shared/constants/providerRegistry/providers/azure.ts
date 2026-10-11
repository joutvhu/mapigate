import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "azure",
  "name": "Azure OpenAI",
  "alias": "azure",
  "color": "#0078D4",
  "image": "/providers/azure.png",
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

export default provider;
