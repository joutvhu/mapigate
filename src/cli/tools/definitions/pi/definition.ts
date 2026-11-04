import { DEFAULT_V1_URL } from "../../helpers.js";
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
  defaultModels: [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "gpt-4o",
    "gpt-4o-mini",
    "deepseek-chat",
    "deepseek-reasoner",
    "qwen-2.5-coder-32b",
  ],
  configFileTemplate: `{\n  "providers": {\n    "mapigate": {\n      "type": "openai",\n      "baseUrl": "${DEFAULT_V1_URL}",\n      "apiKey": "mapigate-local"\n    }\n  }\n}`,
};
