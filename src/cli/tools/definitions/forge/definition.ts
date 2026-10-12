import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "forge",
  name: "ForgeCode",
  image: "/providers/forge.png",
  color: "#EAB308",
  iconBg: "#FFFFFF",
  description: "Antinomy HQ ForgeCode agent harness",
  configType: "custom",
  binary: "forge",
  configPath: "~/.forge/config.toml",
  baseUrlPath: "/v1",
  configFileTemplate: `[openai]\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "mapigate-local"`,
};
