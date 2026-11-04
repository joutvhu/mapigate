import { DEFAULT_V1_URL } from "../../helpers.js";
import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "kilo",
  name: "Kilo Code",
  image: "/assets/providers/kilocode/icon.png",
  color: "#FF6B6B",
  iconBg: "#000000",
  description: "Kilo Code AI Assistant",
  configType: "custom",
  binary: "kilo",
  configPath: "~/.kilo/config.json",
  baseUrlPath: "/v1",
  defaultModels: [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-sonnet-4-6",
    "gpt-4o",
    "gpt-4o-mini",
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  powershellTemplate: `$env:KILO_BASE_URL = "${DEFAULT_V1_URL}"\nkilo`,
  bashTemplate: `export KILO_BASE_URL="${DEFAULT_V1_URL}"\nkilo`,
  configFileTemplate: `{\n  "baseUrl": "${DEFAULT_V1_URL}",\n  "apiKey": "mapigate-local"\n}`,
};
