import { DEFAULT_V1_URL } from "../../helpers.js";
import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "amp",
  name: "Amp CLI",
  image: "/assets/tools/amp/icon.png",
  color: "#F97316",
  description: "Sourcegraph Amp coding assistant CLI",
  configType: "env",
  binary: "amp",
  baseUrlPath: "/v1",
  defaultModels: [
    "claude-sonnet-4-6",
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-opus-5",
    "claude-fable-5.1",
    "gpt-5.6",
    "gpt-6-astra",
    "glm-5.3-flash",
    "gpt-4o",
  ],
  envVars: {
    baseUrl: "OPENAI_BASE_URL",
    apiKey: "OPENAI_API_KEY",
  },
  powershellTemplate: `$env:OPENAI_BASE_URL = "${DEFAULT_V1_URL}"\n$env:OPENAI_API_KEY = "mapigate-local"\namp`,
  bashTemplate: `export OPENAI_BASE_URL="${DEFAULT_V1_URL}"\nexport OPENAI_API_KEY="mapigate-local"\namp`,
  guideSteps: [
    { step: 1, title: "Install Amp", desc: "Install Amp CLI via official instructions" },
    { step: 2, title: "Configure Env", desc: "Set OPENAI_BASE_URL and OPENAI_API_KEY", value: DEFAULT_V1_URL, copyable: true },
    { step: 3, title: "Run", desc: "amp --model claude-sonnet-4-6" },
  ],
};
