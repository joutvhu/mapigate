import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "crush",
  name: "Crush",
  image: "/assets/tools/crush/icon.png",
  color: "#FB923C",
  iconBg: "#6b50ff",
  description: "Charm Crush terminal AI coding agent",
  configType: "custom",
  binary: "crush",
  configPath: "~/.config/crush/crush.json",
  baseUrlPath: "/v1",
  defaultModels: [
    "large",
    "small",
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "gpt-4o",
    "gpt-4o-mini",
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  configFileTemplate: `{\n  "providers": {\n    "mapigate": {\n      "type": "openai",\n      "base_url": "http://127.0.0.1:20127/v1",\n      "api_key": "mapigate-local"\n    }\n  }\n}`,
};
