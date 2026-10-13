import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "modelscope",
  name: "ModelScope",
  alias: "ms",
  aliases: [
    "ms",
    "modelscope",
  ],
  uiAlias: "ms",
  color: "#624AFF",
  iconBg: "#FFFFFF",
  image: "/assets/providers/modelscope/icon.svg",
  website: "https://modelscope.cn",
  notice: {
    apiKeyUrl: "https://modelscope.cn/my/myaccesstoken",
    text: "Alibaba ModelScope (魔搭) API-Inference BYOK endpoint with free tier access to Qwen 2.5 Coder and DeepSeek models.",
  },
  category: "apikey",
  authType: "apikey",
  baseUrl: "https://api-inference.modelscope.cn/v1/chat/completions",
  baseUrls: [
    "https://api-inference.modelscope.cn/v1/chat/completions",
  ],
  validateUrl: "",
  format: "openai",
  defaultHeaders: {
    "content-type": "application/json",
  },
  thinkingMode: "auto",
  models: [
    {
      id: "Qwen/Qwen2.5-Coder-32B-Instruct",
      name: "Qwen 2.5 Coder 32B Instruct",
      isDefault: true,
      contextLength: 131072,
    },
    {
      id: "Qwen/Qwen2.5-Coder-7B-Instruct",
      name: "Qwen 2.5 Coder 7B Instruct",
      isDefault: false,
      contextLength: 131072,
    },
    {
      id: "deepseek-ai/DeepSeek-V3",
      name: "DeepSeek V3",
      isDefault: false,
      contextLength: 65536,
    },
    {
      id: "deepseek-ai/DeepSeek-R1",
      name: "DeepSeek R1",
      isDefault: false,
      contextLength: 65536,
    },
  ],
  passthroughModels: true,
};

export const provider = metadata;
export default metadata;
