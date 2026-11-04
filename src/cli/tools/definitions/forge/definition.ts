import { DEFAULT_V1_URL } from "../../helpers.js";
import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "forge",
  name: "ForgeCode",
  image: "/assets/tools/forge/icon.png",
  color: "#EAB308",
  iconBg: "#FFFFFF",
  description: "Antinomy HQ ForgeCode agent harness",
  configType: "custom",
  binary: "forge",
  configPath: "~/.forge/config.toml",
  baseUrlPath: "/v1",
  defaultModels: [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "gpt-4o",
    "gpt-4o-mini",
    "o3-mini",
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  configFileTemplate: `[openai]\nbase_url = "${DEFAULT_V1_URL}"\napi_key = "mapigate-local"`,
};
