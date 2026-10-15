import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "kilo",
  name: "Kiro Code",
  image: "/assets/providers/kilocode/icon.png",
  color: "#FF6B6B",
  description: "Kiro Code / Kilo Code AI Assistant",
  configType: "custom",
  binary: "kilo",
  configPath: "~/.kilo/config.json",
  baseUrlPath: "/v1",
  powershellTemplate: `$env:KILO_BASE_URL = "http://127.0.0.1:20127/v1"\nkilo`,
  bashTemplate: `export KILO_BASE_URL="http://127.0.0.1:20127/v1"\nkilo`,
  configFileTemplate: `{\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "mapigate-local"\n}`,
};
