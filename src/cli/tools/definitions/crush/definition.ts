import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "crush",
  name: "Crush",
  image: "/providers/crush.png",
  color: "#FB923C",
  description: "Charm Crush terminal AI coding agent",
  configType: "custom",
  binary: "crush",
  configPath: "~/.config/crush/crush.json",
  baseUrlPath: "/v1",
  configFileTemplate: `{\n  "providers": {\n    "mapigate": {\n      "type": "openai",\n      "base_url": "http://127.0.0.1:20127/v1",\n      "api_key": "mapigate-local"\n    }\n  }\n}`,
};
