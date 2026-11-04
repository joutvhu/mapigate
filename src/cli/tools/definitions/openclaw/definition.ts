import { DEFAULT_V1_URL } from "../../helpers.js";
import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "openclaw",
  name: "Open Claw",
  image: "/assets/tools/openclaw/icon.png",
  color: "#FF6B35",
  iconBg: "#FFFFFF",
  description: "Open Claw AI Assistant",
  configType: "custom",
  binary: "openclaw",
  configPath: "~/.openclaw/config.json",
  baseUrlPath: "/v1",
  envVars: {
    baseUrl: "OPENCLAW_BASE_URL",
    apiKey: "OPENCLAW_API_KEY",
  },
  defaultModels: [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "gpt-4o",
    "gpt-4o-mini",
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  powershellTemplate: `$env:OPENCLAW_BASE_URL = "${DEFAULT_V1_URL}"\n$env:OPENCLAW_API_KEY = "mapigate-local"\nopenclaw`,
  bashTemplate: `export OPENCLAW_BASE_URL="${DEFAULT_V1_URL}"\nexport OPENCLAW_API_KEY="mapigate-local"\nopenclaw`,
  configFileTemplate: `{\n  "baseUrl": "${DEFAULT_V1_URL}",\n  "apiKey": "mapigate-local"\n}`,
};
