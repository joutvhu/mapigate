import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "smelt",
  name: "Smelt",
  image: "/providers/smelt.svg",
  color: "#EF4444",
  description: "Smelt terminal AI coding assistant",
  configType: "custom",
  binary: "smelt",
  configPath: "~/.smelt/config.json",
  baseUrlPath: "/v1",
  configFileTemplate: `{\n  "provider": "openai",\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "mapigate-local"\n}`,
};
