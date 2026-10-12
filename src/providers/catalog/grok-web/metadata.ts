import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "grok-web",
  "name": "Grok Web (Subscription)",
  "alias": "grok-web",
  "aliases": [
    "gw"
  ],
  "uiAlias": "gw",
  "color": "#1DA1F2",
  "image": "/assets/providers/grok-web/icon.png",
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
  "passthroughModels": true
,
  models
};

export const provider = metadata;
export default metadata;
