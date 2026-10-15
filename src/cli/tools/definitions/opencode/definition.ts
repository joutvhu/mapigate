import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "opencode",
  name: "OpenCode",
  image: "/assets/providers/opencode/icon.png",
  color: "#E87040",
  description: "OpenCode AI Terminal Assistant",
  configType: "custom",
  binary: "opencode",
  configPath: "~/.config/opencode/opencode.json",
  baseUrlPath: "/v1",
  envVars: {
    baseUrl: "OPENCODE_BASE_URL",
    apiKey: "OPENCODE_API_KEY",
  },
  powershellTemplate: `$env:OPENCODE_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENCODE_API_KEY = "mapigate-local"\nopencode`,
  bashTemplate: `export OPENCODE_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENCODE_API_KEY="mapigate-local"\nopencode`,
  configFileTemplate: `{\n  "provider": {\n    "mapigate": {\n      "options": {\n        "baseURL": "http://127.0.0.1:20127/v1",\n        "apiKey": "mapigate-local"\n      }\n    }\n  }\n}`,
};
