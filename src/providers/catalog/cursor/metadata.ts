import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  "id": "cursor",
  "name": "Cursor IDE",
  "alias": "cu",
  "uiAlias": "cu",
  "color": "#00D4AA",
  "image": "/assets/providers/cursor/icon.png",
  "website": "https://cursor.com",
  "notice": {
    "signupUrl": "https://cursor.com"
  },
  "category": "oauth",
  "baseUrl": "https://api2.cursor.sh",
  "baseUrls": [
    "https://api2.cursor.sh"
  ],
  "validateUrl": "",
  "format": "cursor",
  "defaultHeaders": {
    "connect-accept-encoding": "gzip",
    "connect-protocol-version": "1",
    "Content-Type": "application/connect+proto",
    "User-Agent": "connect-es/1.6.1"
  },
  "thinkingMode": "auto",
  "oauth": {
    "apiEndpoint": "https://api2.cursor.sh",
    "chatEndpoint": "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
    "modelsEndpoint": "/agent.v1.AgentService/GetUsableModels",
    "api3Endpoint": "https://api3.cursor.sh",
    "agentEndpoint": "https://agent.api5.cursor.sh",
    "agentNonPrivacyEndpoint": "https://agentn.api5.cursor.sh",
    "clientVersion": "3.12.17",
    "clientType": "ide",
    "dbKeys": {
      "accessToken": "cursorAuth/accessToken",
      "machineId": "storage.serviceMachineId"
    }
  }
,
  models
};

export const provider = metadata;
export default metadata;
