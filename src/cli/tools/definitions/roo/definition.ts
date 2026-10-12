import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "roo",
  name: "Roo Code",
  image: "/providers/roo.png",
  color: "#FF6B6B",
  description: "Roo AI Assistant",
  configType: "file",
  configPath: "~/.roo/config.json",
  baseUrlPath: "/v1",
  guideSteps: [
    { step: 1, title: "Open Roo Settings", desc: "Open the Roo Settings panel in VS Code" },
    { step: 2, title: "Select Provider", desc: "Choose API Provider → OpenAI Compatible" },
    { step: 3, title: "Base URL", value: "http://127.0.0.1:20127/v1", copyable: true },
    { step: 4, title: "API Key", value: "mapigate-local", copyable: true },
  ],
  configFileTemplate: `{\n  "apiProvider": "openai-compatible",\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "mapigate-local"\n}`,
};
