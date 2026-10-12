import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "codewhale",
  name: "CodeWhale",
  image: "/providers/codewhale.svg",
  color: "#4F46E5",
  description: "CodeWhale terminal coding agent",
  configType: "custom",
  binary: "codewhale",
  configPath: "~/.codewhale/config.toml",
  baseUrlPath: "/v1",
  configFileTemplate: `[openai]\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "mapigate-local"`,
};
