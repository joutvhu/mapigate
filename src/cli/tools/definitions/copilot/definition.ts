import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "copilot",
  name: "GitHub Copilot",
  image: "/assets/providers/github/icon.png",
  color: "#1F6FEB",
  iconBg: "#FFFFFF",
  description: "GitHub Copilot in VS Code / CLI",
  configType: "guide",
  binary: "copilot",
  docsUrl: "https://marketplace.visualstudio.com/items?itemName=GitHub.copilot",
  guideSteps: [
    {
      step: 1,
      title: "VS Code Copilot",
      desc: "Use Mapigate MITM Proxy to transparently intercept api.githubcopilot.com, or use the Copilot configuration extension.",
    },
    {
      step: 2,
      title: "Set Server URL",
      desc: "Point endpoint to Mapigate server URL:",
      value: "http://127.0.0.1:20127",
      copyable: true,
    },
    {
      step: 3,
      title: "Select Model",
      desc: "In Copilot Chat, pick any model routed through Mapigate.",
    },
  ],
};
