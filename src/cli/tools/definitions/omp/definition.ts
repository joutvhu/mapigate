import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "omp",
  name: "Oh My Pi",
  image: "/assets/tools/omp/icon.png",
  color: "#EC4899",
  description: "Oh My Pi terminal AI agent with auto-discovery support",
  configType: "custom",
  binary: "omp",
  configPath: "~/.omp/agent/models.yml",
  baseUrlPath: "/v1",
  configFileTemplate: `providers:\n  mapigate:\n    type: openai\n    base_url: http://127.0.0.1:20127/v1\n    api_key: mapigate-local`,
};
