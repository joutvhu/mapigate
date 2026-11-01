import type { ProviderRegistryItem } from "../../core/types.js";
import { models } from "./models.js";

export const ALIBABA_REGIONS = [
  // 1. Coding Plan & Token Plan
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
    id: "token-plan",
    label: "Token Plan (Singapore - tp-*)",
    baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "token-plan-cn",
    label: "Token Plan (Beijing - tp-*)",
    baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
  },
  // 2. Model Studio (Pay-as-you-go) Regions
  {
    id: "ap-southeast-1",
    label: "Singapore (ap-southeast-1)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "cn-beijing",
    label: "China North 2 / Beijing (cn-beijing)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "cn-hongkong",
    label: "China / Hong Kong (cn-hongkong)",
    baseUrl: "https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "us-east-1",
    label: "US / Virginia (us-east-1)",
    baseUrl: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "eu-central-1",
    label: "Germany / Frankfurt (eu-central-1)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "ap-northeast-1",
    label: "Japan / Tokyo (ap-northeast-1)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  // Legacy Aliases
  {
    id: "studio-intl",
    label: "Model Studio (Intl - Legacy)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "studio-cn",
    label: "Model Studio (China - Legacy)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
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
    text: "Alibaba Cloud unified gateway for Qwen, Kimi, GLM, and MiniMax. Supports Model Studio Pay-as-you-go (with custom workspace URLs), Token Plan, and Coding Plan."
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
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
    "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions"
  ],
  validateUrl: "",
  format: "openai",
  defaultHeaders: {},
  thinkingMode: "auto",
  regions: [
    { id: "coding-intl", label: "Coding Plan (Intl - sk-sp-*)" },
    { id: "coding-cn", label: "Coding Plan (China - sk-sp-*)" },
    { id: "token-plan", label: "Token Plan (Singapore - tp-*)" },
    { id: "token-plan-cn", label: "Token Plan (Beijing - tp-*)" },
    { id: "ap-southeast-1", label: "Singapore (ap-southeast-1)" },
    { id: "cn-beijing", label: "China North 2 - Beijing (cn-beijing)" },
    { id: "cn-hongkong", label: "China - Hong Kong (cn-hongkong)" },
    { id: "us-east-1", label: "US - Virginia (us-east-1)" },
    { id: "eu-central-1", label: "Germany - Frankfurt (eu-central-1)" },
    { id: "ap-northeast-1", label: "Japan - Tokyo (ap-northeast-1)" },
    { id: "studio-intl", label: "Model Studio (Intl - sk-*)" },
    { id: "studio-cn", label: "Model Studio (China - sk-*)" }
  ],
  defaultRegion: "coding-intl",
  hasProviderSpecificData: true,
  models,
  passthroughModels: true
};

export const provider = metadata;
export default metadata;
