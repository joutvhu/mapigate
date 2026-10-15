import type { MitmToolConfig } from "../../types.js";

export const toolConfig: MitmToolConfig = {
  id: "copilot",
  name: "GitHub Copilot",
  image: "/assets/providers/github/icon.png",
  desc: "Intercept GitHub Copilot requests in VS Code via MITM proxy",
  hosts: [
    "api.individual.githubcopilot.com",
    "copilot-proxy.githubusercontent.com",
  ],
  urlPatterns: [
    "/chat/completions",
    "/v1/messages",
    "/responses",
  ],
  defaultHost: "127.0.0.1 api.individual.githubcopilot.com",
  matchesHost: (h: string) => h.includes("githubcopilot.com") || h.includes("copilot-proxy.githubusercontent.com"),
};
