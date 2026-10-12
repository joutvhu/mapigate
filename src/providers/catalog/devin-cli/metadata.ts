import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "devin-cli",
  "name": "Devin CLI",
  "alias": "dv",
  "aliases": [
    "devin"
  ],
  "uiAlias": "dv",
  "color": "#6366F1",
  "image": "/assets/providers/devin-cli/icon.png",
  "website": "https://devin.ai",
  "notice": {
    "signupUrl": "https://cli.devin.ai",
    "text": "Install: `curl -fsSL https://cli.devin.ai/install.sh | bash` (macOS: `brew install --cask devin-cli`, Windows PowerShell: `irm https://static.devin.ai/cli/setup.ps1 | iex`). Then run `devin auth login`. No API key needed."
  },
  "category": "free",
  "authType": "none",
  "authModes": [
    "none"
  ],
  "noAuth": true,
  "baseUrl": "devin://acp/stdio",
  "baseUrls": [
    "devin://acp/stdio"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto"
,
  models
};

export const provider = metadata;
export default metadata;
