import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "codewhale",
  name: "CodeWhale",
  image: "/assets/tools/codewhale/icon.svg",
  color: "#4F46E5",
  description: "CodeWhale terminal coding agent",
  configType: "custom",
  binary: "codewhale",
  configPath: "~/.codewhale/config.toml",
  baseUrlPath: "/v1",
  defaultModels: [
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "deepseek-chat",
    "deepseek-reasoner",
    "deepseek-ai/deepseek-v4-pro",
    "deepseek-ai/deepseek-v4-flash",
    "glm-5.3",
    "glm-5.3-flash",
    "kimi-k3",
    "kimi-k2.7-code",
    "claude-sonnet-4-6",
  ],
  configFileTemplate: `[openai]\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "mapigate-local"`,
};
