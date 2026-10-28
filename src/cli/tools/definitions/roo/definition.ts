import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "roo",
  name: "Roo Code",
  image: "/assets/tools/roo/icon.png",
  color: "#FF6B6B",
  iconBg: "#000000",
  description: "Roo AI Assistant",
  configType: "file",
  configPath: "~/.roo/config.json",
  baseUrlPath: "/v1",
  defaultModels: [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-sonnet-4-5",
    "gpt-4o",
    "gpt-4o-mini",
    "deepseek-chat",
    "deepseek-reasoner",
    "qwen-2.5-coder-32b",
  ],
  guideSteps: [
    { step: 1, title: "Open Roo Settings", desc: "Open the Roo Settings panel in VS Code" },
    { step: 2, title: "Select Provider", desc: "Choose API Provider → OpenAI Compatible" },
    { step: 3, title: "Base URL", value: "http://127.0.0.1:20127/v1", copyable: true },
    { step: 4, title: "API Key", value: "mapigate-local", copyable: true },
  ],
  configFileTemplate: `{\n  "apiProvider": "openai-compatible",\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "mapigate-local"\n}`,
};
