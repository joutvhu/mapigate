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
  modelSynonyms: {
    "auto (kiro agent)": "auto",
    "auto-(kiro-agent)": "auto",
    "kiro-auto": "auto",
    "claude-sonnet-4-5": "claude-sonnet-4.5",
    "claude-haiku-4-5": "claude-haiku-4.5",
    "claude-sonnet-5-5": "claude-sonnet-5",
    "deepseek-3-2": "deepseek-3.2",
    "minimax-m2-5": "minimax-m2.5",
    "minimax-m2-1": "minimax-m2.1",
    "glm5": "glm-5",
    "qwen-3-coder-next": "qwen3-coder-next",
    "qwen3-coder": "qwen3-coder-next",
  },
  modelPatterns: [
    { match: /auto.*kiro|kiro.*auto/i, alias: "auto" },
    { match: /claude.*sonnet.*4[.-]5/i, alias: "claude-sonnet-4.5" },
    { match: /claude.*haiku.*4[.-]5/i, alias: "claude-haiku-4.5" },
    { match: /claude.*sonnet.*4/i, alias: "claude-sonnet-4" },
    { match: /claude.*sonnet.*5/i, alias: "claude-sonnet-5" },
    { match: /deepseek.*3[.-]2/i, alias: "deepseek-3.2" },
    { match: /minimax.*2[.-]5/i, alias: "minimax-m2.5" },
    { match: /minimax.*2[.-]1/i, alias: "minimax-m2.1" },
    { match: /glm.*5/i, alias: "glm-5" },
    { match: /sol/i, alias: "gpt-5.6-sol" },
    { match: /terra/i, alias: "gpt-5.6-terra" },
    { match: /luna/i, alias: "gpt-5.6-luna" },
    { match: /qwen.*3.*coder/i, alias: "qwen3-coder-next" },
  ],
};
