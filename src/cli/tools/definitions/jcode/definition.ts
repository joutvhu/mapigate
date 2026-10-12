import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "jcode",
  name: "Jcode",
  image: "/providers/jcode.png",
  color: "#FF6B35",
  iconBg: "#FFFFFF",
  description: "High-performance Rust-based coding agent harness",
  configType: "custom",
  binary: "jcode",
  configPath: "~/.jcode/config.toml",
  baseUrlPath: "/v1",
  powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "mapigate-local"\njcode`,
  bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="mapigate-local"\njcode`,
  configFileTemplate: `[model_provider.openai]\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "mapigate-local"`,
};
