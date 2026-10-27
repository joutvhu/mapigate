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
    "/models",
  ],
  defaultHost: "127.0.0.1 api.individual.githubcopilot.com",
  matchesHost: (h: string) => h.includes("githubcopilot.com") || h.includes("copilot-proxy.githubusercontent.com"),
  isModelListRequest: (req) => {
    const url = (req.url || "").toLowerCase();
    return url === "/models" || url.startsWith("/models?") || url.endsWith("/models");
  },
  defaultModels: [
    "gpt-4o",
    "gpt-4o-mini",
    "claude-3.7-sonnet",
    "claude-3.5-sonnet",
    "claude-3.5-haiku",
    "o1",
    "o3-mini",
    "deepseek-chat",
    "deepseek-reasoner",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
  ],
};
