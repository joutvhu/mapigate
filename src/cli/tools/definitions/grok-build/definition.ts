import { DEFAULT_V1_URL } from "../../helpers.js";
import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "grok-build",
  name: "Grok Build",
  image: "/assets/tools/grok-build/icon.png",
  color: "#1DA1F2",
  iconBg: "#FFFFFF",
  description: "xAI Grok Build TUI coding agent",
  configType: "custom",
  binary: "grok",
  configPath: "~/.grok/config.toml",
  baseUrlPath: "/v1",
  defaultModels: [
    "grok-build",
    "grok-3",
    "grok-3-mini",
    "grok-2",
    "grok-2-mini",
    "grok-beta",
  ],
  powershellTemplate: `$env:OPENAI_BASE_URL = "${DEFAULT_V1_URL}"\n$env:OPENAI_API_KEY = "mapigate-local"\ngrok`,
  bashTemplate: `export OPENAI_BASE_URL="${DEFAULT_V1_URL}"\nexport OPENAI_API_KEY="mapigate-local"\ngrok`,
  configFileTemplate: `[model.mapigate]\ntype = "openai"\nbase_url = "${DEFAULT_V1_URL}"\napi_key = "mapigate-local"`,
};
