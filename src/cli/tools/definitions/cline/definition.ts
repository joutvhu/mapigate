import { DEFAULT_V1_URL } from "../../helpers.js";
import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "cline",
  name: "Cline",
  image: "/assets/providers/cline/icon.png",
  color: "#5B9BD5",
  description: "Cline AI Coding Assistant",
  configType: "file",
  configPath: "~/.cline/data/globalState.json",
  baseUrlPath: "/v1",
  defaultModels: [
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-sonnet-4-6",
    "gpt-4o",
    "gpt-4o-mini",
    "o3-mini",
    "o1",
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  guideSteps: [
    { step: 1, title: "Open Cline Settings", desc: "Click the gear icon in the Cline panel" },
    { step: 2, title: "Select Provider", desc: "Choose 'OpenAI Compatible'" },
    { step: 3, title: "Base URL", value: DEFAULT_V1_URL, copyable: true },
    { step: 4, title: "API Key", value: "mapigate-local", copyable: true },
  ],
  configFileTemplate: `{\n  "apiProvider": "openai-compatible",\n  "openAiBaseUrl": "${DEFAULT_V1_URL}",\n  "openAiApiKey": "mapigate-local"\n}`,
};
