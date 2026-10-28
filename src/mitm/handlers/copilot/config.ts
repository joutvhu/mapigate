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
    "auto",
    "claude-haiku-4.5",
    "claude-haiku-5.5",
    "claude-sonnet-4",
    "claude-sonnet-4.6",
    "claude-sonnet-5",
    "claude-sonnet-5.5",
    "claude-opus-4.8",
    "claude-opus-5",
    "claude-opus-5.5",
    "gpt-5-mini",
    "gpt-5.2",
    "gpt-5.2-codex",
    "gpt-5.3-codex",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-6-luna",
    "gpt-6.1-terra",
    "mai-code-1.1-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "grok-4.5",
    "grok-4.6",
    "grok-4.7",
    "kimi-k3",
  ],
};
