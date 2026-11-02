import type { ProviderRegistryItem } from "../../core/types.js";

export const metadata: ProviderRegistryItem = {
  id: "runcrate",
  name: "Runcrate",
  alias: "runcrate",
  aliases: ["rc"],
  uiAlias: "rc",
  color: "#1A2B79",
  image: "/assets/providers/runcrate/icon.png",
  website: "https://www.runcrate.ai",
  notice: {
    apiKeyUrl: "https://www.runcrate.ai/dashboard/api-keys",
  },
  category: "apikey",
  authType: "apikey",
  baseUrl: "https://api.runcrate.ai/v1/chat/completions",
  baseUrls: ["https://api.runcrate.ai/v1/chat/completions"],
  validateUrl: "https://api.runcrate.ai/v1/models",
  format: "openai",
  defaultHeaders: {},
  thinkingMode: "auto",
  models: [
    { id: "deepseek-ai/DeepSeek-V4.1-Flash", name: "DeepSeek V4.1 Flash", isDefault: false },
    { id: "deepseek-ai/DeepSeek-V4.1-Flash-1017", name: "DeepSeek V4.1 Flash 1017", isDefault: false },
    { id: "zai-org/GLM-5.3", name: "GLM 5.3", isDefault: false },
    { id: "zai-org/GLM-5.3-Flash", name: "GLM 5.3 Flash", isDefault: false },
    { id: "Qwen/Qwen3.8-Flash", name: "Qwen 3.8 Flash", isDefault: false },
    { id: "openai/gpt-oss-120b", name: "gpt-oss 120B", isDefault: false },
  ],
  passthroughModels: true,
};

export const provider = metadata;
export default metadata;
