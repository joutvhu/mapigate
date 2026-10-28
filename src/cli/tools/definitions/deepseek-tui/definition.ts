import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "deepseek-tui",
  name: "DeepSeek TUI",
  image: "/assets/tools/deepseek-tui/icon.png",
  color: "#4D6BFE",
  iconBg: "#FFFFFF",
  description: "DeepSeek Terminal Coding Agent (Rust TUI)",
  configType: "file",
  binary: "deepseek",
  configPath: "~/.deepseek/config.toml",
  baseUrlPath: "/v1",
  defaultModels: [
    "deepseek-chat",
    "deepseek-reasoner",
    "deepseek-coder",
  ],
  powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "mapigate-local"\ndeepseek`,
  bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="mapigate-local"\ndeepseek`,
  configFileTemplate: `[provider]\nname = "openai"\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "mapigate-local"\nmodel = "claude-sonnet-4-6"`,
};
