import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  id: "minimax-code",
  name: "MiniMax Code",
  alias: "mm",
  aliases: ["minimax-code-global", "mmg", "mcode"],
  uiAlias: "mm",
  color: "#FF4D4F",
  iconBg: "#ffffff",
  image: "/assets/providers/minimax-code/icon.png",
  website: "https://agent.minimax.io",
  notice: {
    text: "MiniMax Code agent gateway. Sign in via OAuth Device Code. Supports Global (agent.minimax.io) and China (agent.minimax.cn) clusters."
  },
  category: "oauth",
  authType: "oauth",
  authModes: ["oauth"],
  baseUrl: "https://agent.minimax.io/mavis/api/v1/llm/v1/messages",
  baseUrls: [
    "https://agent.minimax.io/mavis/api/v1/llm/v1/messages",
    "https://agent.minimax.cn/mavis/api/v1/llm/v1/messages"
  ],
  validateUrl: "",
  format: "claude",
  defaultHeaders: {
    "User-Agent": "MiniMaxAgent",
    "X-Mavis-Agent-Id": "main"
  },
  thinkingMode: "auto",
  regions: [
    { id: "global", label: "Global (agent.minimax.io)" },
    { id: "cn", label: "China (agent.minimax.cn)" }
  ],
  defaultRegion: "global",
  hasProviderSpecificData: true,
  oauth: {
    clientId: "mcode-public",
    deviceUrl: "https://account.minimax.io/oauth2/device/code",
    tokenUrl: "https://account.minimax.io/oauth2/token",
    scope: "agent.default",
    audience: "agent-backend",
    refreshLeadMs: 600000,
    scopes: ["agent.default"]
  },
  models,
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
