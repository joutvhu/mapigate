import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "codex",
  name: "OpenAI Codex CLI / App",
  image: "/assets/providers/codex/icon.png",
  color: "#10A37F",
  description: "OpenAI Codex CLI",
  configType: "env",
  binary: "codex",
  configPath: "~/.codex/config.toml",
  baseUrlPath: "/v1",
  defaultModels: [
    "o1",
    "o3-mini",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.1-codex-mini",
    "gpt-5.1-codex-max",
    "gpt-5.5-codex",
    "codex-pro",
    "codex",
  ],
  envVars: {
    baseUrl: "OPENAI_BASE_URL",
    apiKey: "OPENAI_API_KEY",
  },
  powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "mapigate-local"\ncodex`,
  bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="mapigate-local"\ncodex`,
  configFileTemplate: `model_provider = "mapigate"\n\n[model_providers.mapigate]\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "mapigate-local"`,
};
