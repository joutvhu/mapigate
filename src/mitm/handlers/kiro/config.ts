import type { MitmToolConfig } from "../../types.js";

export const toolConfig: MitmToolConfig = {
  id: "kiro",
  name: "Kiro IDE",
  image: "/assets/providers/kiro/icon.png",
  desc: "Intercept Amazon Kiro IDE requests via MITM proxy",
  iconBg: "#9046ff",
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
  matchesHost: (h: string) =>
    h.includes("kiro.dev") ||
    h.includes("q.us-east-1.amazonaws.com") ||
    h.includes("codewhisperer.us-east-1.amazonaws.com"),
  isChatRequest: (req) => {
    const rawTarget = req.headers?.["x-amz-target"];
    const target = Array.isArray(rawTarget) ? rawTarget[0] : String(rawTarget || "");
    return target.includes("GenerateAssistantResponse") || target.includes("CreateResponse");
  },
};
