import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "snowflake",
  "name": "Snowflake Cortex",
  "alias": "snowflake",
  "aliases": [
    "snowflake"
  ],
  "uiAlias": "snowflake",
  "color": "#29B5E8",
  "image": "/providers/snowflake.svg",
  "website": "https://www.snowflake.com",
  "notice": {
    "apiKeyUrl": "",
    "text": "Snowflake Cortex provider endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://{account}.snowflakecomputing.com/api/v2",
  "baseUrls": [
    "https://{account}.snowflakecomputing.com/api/v2"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "snowflake-default",
      "name": "Snowflake Cortex Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export default provider;
