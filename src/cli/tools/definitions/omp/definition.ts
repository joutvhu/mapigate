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
  defaultModels: [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "gpt-4o",
    "gpt-4o-mini",
    "deepseek-chat",
    "deepseek-reasoner",
    "qwen-2.5-coder-32b",
  ],
  configFileTemplate: `providers:\n  mapigate:\n    type: openai\n    base_url: http://127.0.0.1:20127/v1\n    api_key: mapigate-local`,
};
