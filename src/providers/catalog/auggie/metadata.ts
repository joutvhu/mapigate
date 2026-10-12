import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "auggie",
  "name": "Augment (Auggie CLI)",
  "alias": "aug",
  "aliases": [
    "auggie",
    "aug",
    "augment"
  ],
  "uiAlias": "aug",
  "color": "#8B5CF6",
  "image": "/assets/providers/auggie/icon.svg",
  "website": "https://augmentcode.com",
  "notice": {
    "text": "Augment (Auggie CLI) requires the auggie binary installed and authenticated locally (auggie login). Mapigate connects via stdio and never stores your credentials."
  },
  "category": "free",
  "authType": "none",
  "authModes": [
    "none"
  ],
  "noAuth": true,
  "baseUrl": "auggie://cli/stdio",
  "baseUrls": [
    "auggie://cli/stdio"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "passthroughModels": true
,
  models
};

export const provider = metadata;
export default metadata;
