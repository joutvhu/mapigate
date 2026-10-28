import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "opendesign",
  name: "OpenDesign",
  image: "/assets/tools/opendesign/icon.png",
  color: "#7C3AED",
  description: "Agent-native design skills pack",
  configType: "guide",
  defaultModels: [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-sonnet-4-6",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ],
  guideSteps: [
    { step: 1, title: "Install Plugin", desc: "Install into Claude Code, Cursor, or Codex CLI" },
    { step: 2, title: "Automatic Routing", desc: "Inherits host agent model configuration pointing to Mapigate" },
    { step: 3, title: "Run", desc: "Invoke with /opendesign <prompt>" },
  ],
};
