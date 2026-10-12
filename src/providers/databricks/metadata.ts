import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "databricks",
  "name": "Databricks Mosaic AI",
  "alias": "databricks",
  "aliases": [
    "databricks"
  ],
  "uiAlias": "databricks",
  "color": "#FF3621",
  "image": "/assets/providers/databricks/icon.svg",
  "website": "https://www.databricks.com",
  "notice": {
    "apiKeyUrl": "https://docs.databricks.com/en/dev-tools/auth/pat.html",
    "text": "Databricks Mosaic AI serving endpoints (OpenAI-compatible)."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://adb-0000000000000000.0.azuredatabricks.net/serving-endpoints",
  "baseUrls": [
    "https://adb-0000000000000000.0.azuredatabricks.net/serving-endpoints"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "databricks-meta-llama-3-3-70b-instruct",
      "name": "Databricks Llama 3.3 70B Instruct",
      "isDefault": true,
      "contextLength": 131072
    },
    {
      "id": "databricks-dbrx-instruct",
      "name": "Databricks DBRX Instruct",
      "isDefault": false,
      "contextLength": 32768
    },
    {
      "id": "databricks-gpt-5",
      "name": "Databricks GPT-5",
      "isDefault": false,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
