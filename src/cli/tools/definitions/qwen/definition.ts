import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "qwen",
  name: "Qwen Code",
  image: "/providers/qwen.png",
  color: "#10B981",
  description: "Alibaba Qwen Code CLI",
  configType: "file",
  binary: "qwen",
  configPath: "~/.qwen/settings.json",
  baseUrlPath: "/v1",
  guideSteps: [
    { step: 1, title: "Install Qwen Code", desc: "npm install -g @qwen-code/qwen-code" },
    { step: 2, title: "Save Config", desc: "Copy the JSON below into ~/.qwen/settings.json" },
  ],
  codeBlock: {
    language: "json",
    code: `{\n  "security": {\n    "auth": {\n      "selectedType": "openai",\n      "apiKey": "mapigate-local",\n      "baseUrl": "http://127.0.0.1:20127/v1"\n    }\n  },\n  "model": {\n    "name": "claude-sonnet-4-6"\n  }\n}`,
  },
  configFileTemplate: `{\n  "security": {\n    "auth": {\n      "selectedType": "openai",\n      "apiKey": "mapigate-local",\n      "baseUrl": "http://127.0.0.1:20127/v1"\n    }\n  },\n  "model": {\n    "name": "claude-sonnet-4-6"\n  }\n}`,
};
