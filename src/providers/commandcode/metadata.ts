import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "commandcode",
  "name": "Command Code",
  "alias": "commandcode",
  "aliases": [
    "cmc"
  ],
  "uiAlias": "cmc",
  "color": "#000000",
  "image": "/assets/providers/commandcode/icon.png",
  "website": "https://commandcode.ai",
  "notice": {
    "text": "Use your CommandCode CLI API key (starts with user_...) from ~/.commandcode/auth.json or commandcode.ai/studio.",
    "apiKeyUrl": "https://commandcode.ai/studio"
  },
  "category": "apikey",
  "baseUrl": "https://api.commandcode.ai/alpha/generate",
  "baseUrls": [
    "https://api.commandcode.ai/alpha/generate"
  ],
  "validateUrl": "",
  "format": "commandcode",
  "defaultHeaders": {
    "x-command-code-version": "0.25.7",
    "x-cli-environment": "cli"
  },
  "thinkingMode": "auto"
,
  models
};

export const provider = metadata;
export default metadata;
