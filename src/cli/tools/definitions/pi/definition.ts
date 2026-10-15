import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "pi",
  name: "Pi (pi-coding-agent)",
  image: "/assets/tools/pi/icon.svg",
  color: "#6366F1",
  description: "Pi coding agent — minimal, extensible agent harness",
  configType: "custom",
  binary: "pi",
  configPath: "~/.pi/agent/models.json",
  baseUrlPath: "/v1",
  configFileTemplate: `{\n  "providers": {\n    "mapigate": {\n      "type": "openai",\n      "baseUrl": "http://127.0.0.1:20127/v1",\n      "apiKey": "mapigate-local"\n    }\n  }\n}`,
};
