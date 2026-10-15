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
  powershellTemplate: `$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:20127"`,
  bashTemplate: `export ANTHROPIC_BASE_URL="http://127.0.0.1:20127"`,
};
