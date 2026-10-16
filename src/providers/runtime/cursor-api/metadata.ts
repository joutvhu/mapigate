import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  id: "cursor-api",
  name: "Cursor API",
  alias: "cua",
  aliases: [
    "cua",
    "cursor-api",
  ],
  uiAlias: "cua",
  color: "#00D4AA",
  iconBg: "#ffffff",
  image: "/assets/providers/cursor-api/icon.png",
  website: "https://cursor.com/dashboard/api",
  notice: {
    apiKeyUrl: "https://cursor.com/dashboard/api",
    text: "Cursor User API Key (crsr_...) from cursor.com/dashboard/api. Keys are exchanged automatically for session tokens.",
  },
  category: "apikey",
  authType: "apikey",
  baseUrl: "https://api2.cursor.sh",
  baseUrls: [
    "https://api2.cursor.sh",
  ],
  validateUrl: "",
  format: "openai",
  defaultHeaders: {
    "content-type": "application/json",
  },
  thinkingMode: "auto",
  models,
  passthroughModels: true,
};

export const provider = metadata;
export default metadata;
