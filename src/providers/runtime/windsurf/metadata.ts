import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  id: "windsurf",
  name: "Windsurf",
  alias: "ws",
  uiAlias: "ws",
  color: "#14B8A6",
  image: "/assets/providers/windsurf/icon.png",
  website: "https://windsurf.com",
  notice: { signupUrl: "https://windsurf.com" },
  category: "oauth",
  authType: "oauth",
  authModes: ["oauth", "apikey"],
  baseUrl: "https://server.codeium.com/exa.language_server_pb.LanguageServerService/GetChatMessage",
  baseUrls: ["https://server.codeium.com/exa.language_server_pb.LanguageServerService/GetChatMessage"],
  validateUrl: "",
  format: "openai",
  defaultHeaders: {
    "Content-Type": "application/grpc-web+proto",
    Accept: "application/grpc-web+proto",
    "X-Grpc-Web": "1",
  },
  thinkingMode: "auto",
  oauth: {
    clientId: "REDACTED_WINDSURF_CLIENT_ID",
    firebaseApiKey: "REDACTED_FIREBASE_API_KEY",
    registerUrl: "https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser",
    apiServerUrl: "https://server.codeium.com",
    platform: "windsurf",
  },
  models,
};

export const provider = metadata;
export default metadata;
