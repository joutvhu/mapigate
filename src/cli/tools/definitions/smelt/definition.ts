import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "smelt",
  name: "Smelt",
  image: "/assets/tools/smelt/icon.svg",
  color: "#EF4444",
  description: "Smelt terminal AI coding assistant",
  configType: "custom",
  binary: "smelt",
  configPath: "~/.smelt/config.json",
  baseUrlPath: "/v1",
  defaultModels: [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "gpt-4o",
    "gpt-4o-mini",
    "deepseek-chat",
    "deepseek-coder",
    "qwen-2.5-coder-32b",
  ],
  configFileTemplate: `{\n  "provider": "openai",\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "mapigate-local"\n}`,
};
