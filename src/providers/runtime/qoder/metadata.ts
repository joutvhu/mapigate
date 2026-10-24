import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const metadata: ProviderRegistryItem = {
  quotaOrder: [
    "Daily",
    "Weekly",
    "Monthly",
    "Balance"
  ],
  id: "qoder",
  name: "Qoder",
  alias: "qd",
  aliases: ["qoder-cn", "qdcn"],
  uiAlias: "qd",
  color: "#EC4899",
  image: "/assets/providers/qoder/icon.png",
  website: "https://qoder.com",
  notice: {
    signupUrl: "https://qoder.com",
    text: "Qoder AI coding assistant. Supports International (qoder.com) and China (qoder.com.cn) regions via OAuth Device Code or COSY credentials."
  },
  category: "oauth",
  authModes: ["oauth", "apikey"],
  baseUrl: "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation",
  baseUrls: [
    "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation",
    "https://gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation"
  ],
  validateUrl: "",
  format: "openai",
  defaultHeaders: {},
  thinkingMode: "auto",
  regions: [
    { id: "intl", label: "International (qoder.com)" },
    { id: "cn", label: "China (qoder.com.cn)" }
  ],
  defaultRegion: "intl",
  hasProviderSpecificData: true,
  oauth: {
    openApiBaseUrl: "https://openapi.qoder.sh",
    centerBaseUrl: "https://center.qoder.sh",
    chatBaseUrl: "https://api3.qoder.sh",
    deviceTokenUrl: "https://openapi.qoder.sh/api/v1/deviceToken/poll",
    refreshUrl: "https://center.qoder.sh/algo/api/v3/user/refresh_token",
    userInfoUrl: "https://openapi.qoder.sh/api/v1/userinfo",
    quotaUsageUrl: "https://openapi.qoder.sh/api/v2/quota/usage",
    loginUrl: "https://qoder.com/device/selectAccounts"
  },
  models,
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
