import type { MitmToolConfig } from "../../types.js";

export const toolConfig: MitmToolConfig = {
  id: "kiro",
  name: "Kiro IDE",
  image: "/providers/kiro.png",
  desc: "Intercept Amazon Kiro IDE requests via MITM proxy",
  hosts: [
    "runtime.us-east-1.kiro.dev",
    "q.us-east-1.amazonaws.com",
    "codewhisperer.us-east-1.amazonaws.com",
  ],
  urlPatterns: [
    "/generateAssistantResponse",
    "/responses",
  ],
  defaultHost: "127.0.0.1 runtime.us-east-1.kiro.dev\n127.0.0.1 q.us-east-1.amazonaws.com\n127.0.0.1 codewhisperer.us-east-1.amazonaws.com",
};
