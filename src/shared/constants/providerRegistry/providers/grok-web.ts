import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "grok-web",
  "name": "Grok Web (Subscription)",
  "alias": "grok-web",
  "aliases": [
    "gw"
  ],
  "uiAlias": "gw",
  "color": "#1DA1F2",
  "image": "/providers/grok-web.png",
  "website": "https://grok.com",
  "category": "webCookie",
  "authType": "cookie",
  "baseUrl": "https://grok.com/rest/app-chat/conversations/new",
  "baseUrls": [
    "https://grok.com/rest/app-chat/conversations/new"
  ],
  "validateUrl": "",
  "format": "grok-web",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "grok-3",
      "name": "Grok 3",
      "isDefault": false
    },
    {
      "id": "grok-3-mini",
      "name": "Grok 3 Mini (Thinking)",
      "isDefault": false
    },
    {
      "id": "grok-3-thinking",
      "name": "Grok 3 Thinking",
      "isDefault": false
    },
    {
      "id": "grok-4",
      "name": "Grok 4",
      "isDefault": false
    },
    {
      "id": "grok-4-mini",
      "name": "Grok 4 Mini (Thinking)",
      "isDefault": false
    },
    {
      "id": "grok-4-thinking",
      "name": "Grok 4 Thinking",
      "isDefault": false
    },
    {
      "id": "grok-4-heavy",
      "name": "Grok 4 Heavy (SuperGrok)",
      "isDefault": false
    },
    {
      "id": "grok-4.1-mini",
      "name": "Grok 4.1 Mini (Thinking)",
      "isDefault": false
    },
    {
      "id": "grok-4.1-fast",
      "name": "Grok 4.1 Fast",
      "isDefault": false
    },
    {
      "id": "grok-4.1-expert",
      "name": "Grok 4.1 Expert",
      "isDefault": false
    },
    {
      "id": "grok-4.1-thinking",
      "name": "Grok 4.1 Thinking",
      "isDefault": false
    },
    {
      "id": "grok-4.2",
      "name": "Grok 4.2 (4.20 Beta)",
      "isDefault": false
    }
  ],
  "passthroughModels": true
};

export default provider;
