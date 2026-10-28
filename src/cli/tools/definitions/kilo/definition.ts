import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "kilo",
  name: "Kiro Code",
  image: "/assets/providers/kilocode/icon.png",
  color: "#FF6B6B",
  iconBg: "#000000",
  description: "Kiro Code / Kilo Code AI Assistant",
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
  powershellTemplate: `$env:KILO_BASE_URL = "http://127.0.0.1:20127/v1"\nkilo`,
  bashTemplate: `export KILO_BASE_URL="http://127.0.0.1:20127/v1"\nkilo`,
  configFileTemplate: `{\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "mapigate-local"\n}`,
};
