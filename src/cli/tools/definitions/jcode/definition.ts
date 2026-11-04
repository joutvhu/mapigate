import { DEFAULT_V1_URL } from "../../helpers.js";
import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "jcode",
  name: "Jcode",
  image: "/assets/tools/jcode/icon.png",
  color: "#FF6B35",
  iconBg: "#FFFFFF",
  description: "High-performance Rust-based coding agent harness",
  configType: "custom",
  binary: "jcode",
  configPath: "~/.jcode/config.toml",
  baseUrlPath: "/v1",
  defaultModels: [
    "claude-sonnet-4-6",
    "claude-opus-5",
    "gpt-6.1-sol",
    "gemini-3.1-pro",
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "gpt-4o",
  ],
  powershellTemplate: `$env:OPENAI_BASE_URL = "${DEFAULT_V1_URL}"\n$env:OPENAI_API_KEY = "mapigate-local"\njcode`,
  bashTemplate: `export OPENAI_BASE_URL="${DEFAULT_V1_URL}"\nexport OPENAI_API_KEY="mapigate-local"\njcode`,
  configFileTemplate: `[model_provider.openai]\nbase_url = "${DEFAULT_V1_URL}"\napi_key = "mapigate-local"`,
};
