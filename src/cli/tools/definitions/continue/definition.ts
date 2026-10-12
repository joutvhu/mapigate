import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "continue",
  name: "Continue",
  image: "/providers/continue.png",
  color: "#7C3AED",
  description: "Continue AI Assistant",
  configType: "file",
  configPath: "~/.continue/config.json",
  baseUrlPath: "/v1",
  guideSteps: [
    { step: 1, title: "Open Continue Config", desc: "Open ~/.continue/config.json or config.yaml" },
    { step: 2, title: "Add Model", desc: "Insert the OpenAI provider configuration pointing to Mapigate" },
  ],
  codeBlock: {
    language: "json",
    code: `{\n  "models": [\n    {\n      "title": "Mapigate Model",\n      "provider": "openai",\n      "model": "claude-sonnet-4-6",\n      "apiBase": "http://127.0.0.1:20127/v1",\n      "apiKey": "mapigate-local"\n    }\n  ]\n}`,
  },
  configFileTemplate: `{\n  "models": [\n    {\n      "title": "Mapigate Model",\n      "provider": "openai",\n      "model": "claude-sonnet-4-6",\n      "apiBase": "http://127.0.0.1:20127/v1",\n      "apiKey": "mapigate-local"\n    }\n  ]\n}`,
};
