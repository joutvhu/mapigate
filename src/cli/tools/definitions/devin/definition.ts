import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "devin",
  name: "Devin CLI",
  image: "/assets/providers/devin/icon.png",
  color: "#6366F1",
  description: "Cognition Devin CLI",
  configType: "guide",
  binary: "devin",
  installUrl: "https://cli.devin.ai",
  guideSteps: [
    { step: 1, title: "Install Devin CLI", desc: "Install via official installer at cli.devin.ai" },
    { step: 2, title: "Authenticate", desc: "Run devin auth login in terminal" },
    { step: 3, title: "Ready", desc: "Devin CLI runs locally and connects with Mapigate" },
  ],
};
