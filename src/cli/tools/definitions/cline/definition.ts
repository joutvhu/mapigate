import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "cline",
  name: "Cline",
  image: "/assets/providers/cline/icon.png",
  color: "#5B9BD5",
  description: "Cline AI Coding Assistant",
  configType: "file",
  configPath: "~/.cline/config.json",
  baseUrlPath: "/v1",
  guideSteps: [
    { step: 1, title: "Open Cline Settings", desc: "Click the gear icon in the Cline panel" },
    { step: 2, title: "Select Provider", desc: "Choose 'OpenAI Compatible'" },
    { step: 3, title: "Base URL", value: "http://127.0.0.1:20127/v1", copyable: true },
    { step: 4, title: "API Key", value: "mapigate-local", copyable: true },
  ],
  configFileTemplate: `{\n  "apiProvider": "openai-compatible",\n  "openAiBaseUrl": "http://127.0.0.1:20127/v1",\n  "openAiApiKey": "mapigate-local"\n}`,
};
