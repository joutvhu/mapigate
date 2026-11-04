import { DEFAULT_BASE_URL } from "../../helpers.js";
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
  defaultModels: [
    "auto",
    "claude-3.5-sonnet",
    "claude-3.7-sonnet",
    "claude-sonnet-4",
    "claude-sonnet-4.6",
    "claude-opus-4.8",
    "gpt-4o",
    "gpt-4o-mini",
    "o1",
    "o3-mini",
    "gpt-5-mini",
    "gpt-5.2-codex",
    "gpt-5.3-codex",
    "gemini-2.0-flash",
    "gemini-2.5-pro",
    "gemini-3.7-flash",
  ],
  guideSteps: [
    {
      step: 1,
      title: "Method A: Local MITM Proxy (Recommended)",
      desc: "Enable MITM Interceptor in Mapigate. Copilot traffic to api.githubcopilot.com will be intercepted and redirected automatically.",
    },
    {
      step: 2,
      title: "Method B: VS Code Copilot Extension Proxy",
      desc: "Install a Copilot proxy extension in VS Code and set the Gateway Server URL to:",
      value: DEFAULT_BASE_URL,
      copyable: true,
    },
    {
      step: 3,
      title: "Select Model",
      desc: "In Copilot Chat, pick any model routed through Mapigate.",
    },
  ],
};
