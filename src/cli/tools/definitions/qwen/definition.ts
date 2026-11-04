import { DEFAULT_V1_URL } from "../../helpers.js";
import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "qwen",
  name: "Qwen Code",
  image: "/assets/providers/qwen/icon.png",
  color: "#10B981",
  description: "Alibaba Qwen Code CLI",
  configType: "file",
  binary: "qwen",
  configPath: "~/.qwen/settings.json",
  baseUrlPath: "/v1",
  defaultModels: [
    "qwen-max",
    "qwen-plus",
    "qwen-turbo",
    "qwen-2.5-coder-32b",
    "qwen-coder-plus",
    "qwen2.5-coder-32b-instruct",
    "claude-sonnet-4-6",
  ],
  guideSteps: [
    { step: 1, title: "Install Qwen Code", desc: "npm install -g @qwen-code/qwen-code" },
    { step: 2, title: "Save Config", desc: "Copy the JSON below into ~/.qwen/settings.json" },
  ],
  codeBlock: {
    language: "json",
    code: `{\n  "security": {\n    "auth": {\n      "selectedType": "openai",\n      "apiKey": "mapigate-local",\n      "baseUrl": "${DEFAULT_V1_URL}"\n    }\n  },\n  "model": {\n    "name": "claude-sonnet-4-6"\n  }\n}`,
  },
  configFileTemplate: `{\n  "security": {\n    "auth": {\n      "selectedType": "openai",\n      "apiKey": "mapigate-local",\n      "baseUrl": "${DEFAULT_V1_URL}"\n    }\n  },\n  "model": {\n    "name": "claude-sonnet-4-6"\n  }\n}`,
};
