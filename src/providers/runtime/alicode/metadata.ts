import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const ALIBABA_REGIONS = [
  {
    id: "coding-intl",
    label: "Coding Plan (Intl - sk-sp-*)",
    baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1",
  },
  {
    id: "coding-cn",
    label: "Coding Plan (China - sk-sp-*)",
    baseUrl: "https://coding.dashscope.aliyuncs.com/v1",
  },
  {
    id: "studio-intl",
    label: "Model Studio (Intl - sk-*)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "studio-cn",
    label: "Model Studio (China - sk-*)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "token-plan",
    label: "Token Plan (Singapore / SEA)",
    baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
  },
];

export const metadata: ProviderRegistryItem = {
  id: "alicode",
  name: "Alibaba Cloud (DashScope / Qwen)",
  alias: "alicode",
  aliases: ["alibaba", "alicode-intl", "alims-intl", "alitp-intl", "dashscope", "qwen"],
  uiAlias: "alicode",
  color: "#FF6A00",
  iconBg: "#FFFFFF",
  image: "/assets/providers/alicode/icon.png",
  website: "https://www.alibabacloud.com/product/model-studio",
  notice: {
    apiKeyUrl: "https://modelstudio.console.alibabacloud.com/?apiKey=1",
    text: "Alibaba Cloud unified gateway for Qwen, Kimi, GLM, and MiniMax. Select your cluster or let Mapigate auto-detect from your API key (Coding Plan sk-sp-*, Model Studio sk-*, or Token Plan tp-*)."
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions",
  baseUrls: [
    "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions",
    "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"
  ],
  validateUrl: "",
  format: "openai",
  defaultHeaders: {},
  thinkingMode: "auto",
  regions: [
    { id: "coding-intl", label: "Coding Plan (Intl - sk-sp-*)" },
    { id: "coding-cn", label: "Coding Plan (China - sk-sp-*)" },
    { id: "studio-intl", label: "Model Studio (Intl - sk-*)" },
    { id: "studio-cn", label: "Model Studio (China - sk-*)" },
    { id: "token-plan", label: "Token Plan (Singapore / SEA)" }
  ],
  defaultRegion: "coding-intl",
  hasProviderSpecificData: true,
  models,
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
