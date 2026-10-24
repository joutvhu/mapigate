import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
    "Coding Tokens",
    "Standard Tokens",
    "Balance"
  ],
  id: "minimax",
  name: "MiniMax",
  alias: "minimax",
  aliases: ["minimax-cn", "minimax-coding"],
  color: "#7C3AED",
  image: "/assets/providers/minimax/icon.png",
  website: "https://www.minimax.io",
  notice: {
    apiKeyUrl: "https://platform.minimax.io/user-center/basic-information/interface-key",
    text: "MiniMax official API key gateway for MiniMax M3, M2.7, M2.5, speech, and image models. Supports Global (api.minimax.io) and China (api.minimaxi.com) regions."
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  baseUrl: "https://api.minimax.io/anthropic/v1/messages",
  baseUrls: [
    "https://api.minimax.io/anthropic/v1/messages",
    "https://api.minimaxi.com/anthropic/v1/messages"
  ],
  validateUrl: "",
  format: "claude",
  defaultHeaders: {
    "Anthropic-Version": "2023-06-01",
    "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
  },
  thinkingMode: "auto",
  regions: [
    { id: "global", label: "Global (api.minimax.io)" },
    { id: "cn", label: "China (api.minimaxi.com)" }
  ],
  defaultRegion: "global",
  hasProviderSpecificData: true,
  models,
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
