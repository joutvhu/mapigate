import type { ProviderRegistryItem } from "../../core/types.js";
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
  "iconBg": "#FFFFFF",
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
    "User-Agent": "cli",
    "x-command-code-version": "1.88.5",
    "x-cli-environment": "production",
    "x-cli-surface": "cli",
    "x-taste-learning": "false"
  },
  "thinkingMode": "auto",
  "passthroughModels": true,
  "supportsAutoImport": true,
  "autoImportHint": "Import API key directly from ~/.commandcode/auth.json",
  models
};

export const provider = metadata;
export default metadata;
