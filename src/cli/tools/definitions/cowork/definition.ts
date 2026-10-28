import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "cowork",
  name: "Claude Cowork",
  image: "/assets/providers/claude/icon.png",
  color: "#D97757",
  iconBg: "#FFFFFF",
  description: "Claude Desktop Cowork (third-party inference)",
  configType: "custom",
  configPath: "~/.claude/cowork.json",
  baseUrlPath: "",
  defaultModels: [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-3-5-haiku",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-3-opus",
  ],
  powershellTemplate: `$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:20127"`,
  bashTemplate: `export ANTHROPIC_BASE_URL="http://127.0.0.1:20127"`,
};
