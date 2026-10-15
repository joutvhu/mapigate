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
  envVars: {
    baseUrl: "OPENAI_BASE_URL",
    apiKey: "OPENAI_API_KEY",
  },
  powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "mapigate-local"\namp`,
  bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="mapigate-local"\namp`,
  guideSteps: [
    { step: 1, title: "Install Amp", desc: "Install Amp CLI via official instructions" },
    { step: 2, title: "Configure Env", desc: "Set OPENAI_BASE_URL and OPENAI_API_KEY", value: "http://127.0.0.1:20127/v1", copyable: true },
    { step: 3, title: "Run", desc: "amp --model claude-sonnet-4-6" },
  ],
};
