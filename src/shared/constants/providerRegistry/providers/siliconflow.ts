import type { ProviderRegistryItem } from "../types.js";

export const provider: ProviderRegistryItem = {
  "id": "siliconflow",
  "name": "SiliconFlow",
  "alias": "siliconflow",
  "color": "#5B6EF5",
  "image": "/providers/siliconflow.png",
  "website": "https://cloud.siliconflow.com",
  "notice": {
    "apiKeyUrl": "https://cloud.siliconflow.com/account/ak"
  },
  "category": "apikey",
  "baseUrl": "https://api.siliconflow.com/v1/chat/completions",
  "baseUrls": [
    "https://api.siliconflow.com/v1/chat/completions"
  ],
  "validateUrl": "https://api.siliconflow.com/v1/models",
  "format": "openai",
  "defaultHeaders": {},
  "thinkingMode": "auto",
  "models": [
    {
      "id": "deepseek-ai/DeepSeek-V4-Pro",
      "name": "DeepSeek V4 Pro",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-V4-Flash",
      "name": "DeepSeek V4 Flash",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-V3.2",
      "name": "DeepSeek V3.2",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-V3.2-Exp",
      "name": "DeepSeek V3.2 Exp",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-V3.1",
      "name": "DeepSeek V3.1",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-V3.1-Terminus",
      "name": "DeepSeek V3.1 Terminus",
      "isDefault": false
    },
    {
      "id": "deepseek-ai/DeepSeek-R1",
      "name": "DeepSeek R1",
      "isDefault": false
    },
    {
      "id": "Qwen/Qwen3.5-397B-A17B",
      "name": "Qwen 3.5 397B A17B",
      "isDefault": false
    },
    {
      "id": "Qwen/Qwen3.5-122B-A10B",
      "name": "Qwen 3.5 122B A10B",
      "isDefault": false
    },
    {
      "id": "zai-org/GLM-5.1",
      "name": "GLM 5.1",
      "isDefault": false
    },
    {
      "id": "zai-org/GLM-5",
      "name": "GLM 5",
      "isDefault": false
    },
    {
      "id": "moonshotai/Kimi-K2.6",
      "name": "Kimi K2.6",
      "isDefault": false
    },
    {
      "id": "moonshotai/Kimi-K2.5",
      "name": "Kimi K2.5",
      "isDefault": false
    },
    {
      "id": "openai/gpt-oss-120b",
      "name": "GPT OSS 120B",
      "isDefault": false
    },
    {
      "id": "MiniMaxAI/MiniMax-M2.5",
      "name": "MiniMax M2.5",
      "isDefault": false
    },
    {
      "id": "inclusionAI/Ling-flash-2.0",
      "name": "Ling Flash 2.0",
      "isDefault": false
    }
  ]
};

export default provider;
