import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
    "Session",
    "Weekly",
    "Requests",
    "Tokens",
    "Balance"
  ],
  id: "grok-cli",
  name: "SuperGrok (grok.com)",
  alias: "gcli",
  aliases: ["grok-web", "grok-build", "gb", "gcli", "gw", "supergrok"],
  uiAlias: "gcli",
  color: "#1DA1F2",
  iconBg: "#ffffff",
  image: "/assets/providers/grok-cli/icon.png",
  website: "https://grok.com",
  notice: {
    text: "Grok consumer subscription gateway (grok.com). Supports OAuth Device Code (SuperGrok / Grok Build via cli-chat-proxy.grok.com) or Web Cookie sessions.",
    signupUrl: "https://grok.com/supergrok"
  },
  category: "oauth",
  authType: "oauth",
  authModes: ["oauth", "cookie"],
  baseUrl: "https://cli-chat-proxy.grok.com/v1/responses",
  baseUrls: [
    "https://cli-chat-proxy.grok.com/v1/responses",
    "https://grok.com/rest/app-chat/conversations/new"
  ],
  validateUrl: "",
  format: "openai-responses",
  defaultHeaders: {
    "User-Agent": "grok-shell/1.0.44 (linux; x86_64)",
    "x-grok-client-identifier": "grok-shell",
    "x-grok-client-version": "1.0.44"
  },
  thinkingMode: "high",
  thinkingOptions: ["low", "medium", "high", "xhigh"],
  oauth: {
    clientId: "b1a00492-073a-47ea-816f-4c329264a828",
    deviceCodeUrl: "https://auth.x.ai/oauth2/device/code",
    tokenUrl: "https://auth.x.ai/oauth2/token",
    refreshUrl: "https://auth.x.ai/oauth2/token",
    scope: "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write",
    referrer: "grok-build",
    refreshLeadMs: 300000,
    scopes: [
      "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write"
    ]
  },
  models,
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
