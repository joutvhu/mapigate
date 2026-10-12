import type { ProviderRegistryItem } from "../types.js";

export const metadata: ProviderRegistryItem = {
  "id": "stepfun",
  "name": "StepFun",
  "alias": "stepfun",
  "aliases": [
    "stepfun"
  ],
  "uiAlias": "stepfun",
  "color": "#8B5CF6",
  "image": "/assets/providers/stepfun/icon.svg",
  "website": "https://stepfun.com",
  "notice": {
    "apiKeyUrl": "https://platform.stepfun.ai",
    "text": "This connects to StepFun's China platform (platform.stepfun.com), whose sign-up appears to require a Chinese phone number. Users outside mainland China can instead register at the global StepFun Open Platform (platform.stepfun.ai, operated by Sparkling AI Pte. Ltd., Singapore) with email/Google/Discord login."
  },
  "category": "apikey",
  "authType": "apikey",
  "baseUrl": "https://api.stepfun.com/v1/chat/completions",
  "baseUrls": [
    "https://api.stepfun.com/v1/chat/completions"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "content-type": "application/json"
  },
  "thinkingMode": "auto",
  "models": [
    {
      "id": "stepfun-default",
      "name": "StepFun Default",
      "isDefault": true,
      "contextLength": 128000
    }
  ],
  "passthroughModels": true
};

export const provider = metadata;
export default metadata;
