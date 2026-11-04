import { DEFAULT_V1_URL } from "../../helpers.js";
import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "continue",
  name: "Continue",
  image: "/assets/tools/continue/icon.png",
  color: "#7C3AED",
  description: "Continue AI Assistant",
  configType: "file",
  configPath: "~/.continue/config.json",
  baseUrlPath: "/v1",
  defaultModels: [
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-3-5-haiku",
    "gpt-4o",
    "gpt-4o-mini",
    "o3-mini",
    "o1",
    "deepseek-chat",
    "deepseek-reasoner",
    "codestral",
    "qwen2.5-coder",
  ],
  guideSteps: [
    { step: 1, title: "Open Continue Config", desc: "Open ~/.continue/config.json or config.yaml" },
    { step: 2, title: "Add Model", desc: "Insert the OpenAI provider configuration pointing to Mapigate" },
  ],
  codeBlock: {
    language: "json",
    code: `{\n  "models": [\n    {\n      "title": "Mapigate Model",\n      "provider": "openai",\n      "model": "claude-sonnet-4-6",\n      "apiBase": "${DEFAULT_V1_URL}",\n      "apiKey": "mapigate-local"\n    }\n  ]\n}`,
  },
  configFileTemplate: `{\n  "models": [\n    {\n      "title": "Mapigate Model",\n      "provider": "openai",\n      "model": "claude-sonnet-4-6",\n      "apiBase": "${DEFAULT_V1_URL}",\n      "apiKey": "mapigate-local"\n    }\n  ]\n}`,
};
