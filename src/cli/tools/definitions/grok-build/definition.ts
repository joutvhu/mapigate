import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "grok-build",
  name: "Grok Build",
  image: "/providers/grok-cli.png",
  color: "#1DA1F2",
  iconBg: "#FFFFFF",
  description: "xAI Grok Build TUI coding agent",
  configType: "custom",
  binary: "grok",
  configPath: "~/.grok/config.toml",
  baseUrlPath: "/v1",
  powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "mapigate-local"\ngrok`,
  bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="mapigate-local"\ngrok`,
  configFileTemplate: `[model.mapigate]\ntype = "openai"\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "mapigate-local"`,
};
