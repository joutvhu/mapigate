import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  "id": "watsonx",
  "name": "IBM watsonx.ai",
  "alias": "watsonx",
  "aliases": [
    "watsonx",
    "ibm-watsonx"
  ],
  "uiAlias": "watsonx",
  "color": "#052FAD",
  "image": "/assets/providers/watsonx/icon.png",
  "website": "https://www.ibm.com/products/watsonx-ai",
  "notice": {
    "apiKeyUrl": "https://cloud.ibm.com/iam/apikeys",
    "text": "IBM watsonx.ai enterprise AI platform gateway endpoint."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://ca-tor.ml.cloud.ibm.com/ml/gateway/v1/chat/completions",
  "baseUrls": [
    "https://ca-tor.ml.cloud.ibm.com/ml/gateway/v1/chat/completions"
  ],
  "validateUrl": "https://ca-tor.ml.cloud.ibm.com/ml/gateway/v1/models",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "ibm/granite-34b-code-instruct",
      "name": "Granite 34B Code Instruct",
      "isDefault": true,
      "contextLength": 128000
    },
    {
      "id": "ibm/granite-20b-code-instruct",
      "name": "Granite 20B Code Instruct",
      "isDefault": false,
      "contextLength": 128000
    },
    {
      "id": "meta-llama/llama-3-3-70b-instruct",
      "name": "Llama 3.3 70B Instruct",
      "isDefault": false,
      "contextLength": 131072
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
