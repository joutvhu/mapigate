import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "opendesign",
  name: "OpenDesign",
  image: "/providers/opendesign.png",
  color: "#7C3AED",
  description: "Agent-native design skills pack",
  configType: "guide",
  guideSteps: [
    { step: 1, title: "Install Plugin", desc: "Install into Claude Code, Cursor, or Codex CLI" },
    { step: 2, title: "Automatic Routing", desc: "Inherits host agent model configuration pointing to Mapigate" },
    { step: 3, title: "Run", desc: "Invoke with /opendesign <prompt>" },
  ],
};
