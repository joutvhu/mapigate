import type { ProviderRegistryItem } from "../types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "windsurf",
  "name": "Windsurf",
  "alias": "ws",
  "uiAlias": "ws",
  "color": "#14B8A6",
  "image": "/assets/providers/windsurf/icon.png",
  "website": "https://windsurf.com",
  "notice": {
    "signupUrl": "https://windsurf.com"
  },
  "category": "oauth",
  "authType": "oauth",
  "authModes": [
    "oauth",
    "apikey"
  ],
  "baseUrl": "https://server.codeium.com/exa.language_server_pb.LanguageServerService/GetChatMessage",
  "baseUrls": [
    "https://server.codeium.com/exa.language_server_pb.LanguageServerService/GetChatMessage"
  ],
  "validateUrl": "",
  "format": "openai",
  "defaultHeaders": {
    "Content-Type": "application/grpc-web+proto",
    "Accept": "application/grpc-web+proto",
    "X-Grpc-Web": "1"
  },
  "thinkingMode": "auto",
  "oauth": {
    "clientId": "REDACTED_WINDSURF_CLIENT_ID",
    "firebaseApiKey": "REDACTED_FIREBASE_API_KEY",
    "firebaseSignInUrl": "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
    "registerUrl": "https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser",
    "apiServerUrl": "https://server.codeium.com",
    "auth1ApiServerUrl": "https://server.self-serve.windsurf.com",
    "platform": "windsurf",
    "quotaUrl": "https://windsurf.com/_backend/exa.seat_management_pb.SeatManagementService/GetPlanStatus"
  }
,
  models
};

export const provider = metadata;
export default metadata;
