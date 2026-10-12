import type { RegistryModel } from "../types.js";

export const models: RegistryModel[] = [
  {"id":"venice-uncensored-1-2","name":"Venice Uncensored 1.2","isDefault":false},
  {"id":"zai-org-glm-5","name":"GLM-5","isDefault":false},
  {"id":"qwen3-235b-a22b-instruct-2507","name":"Qwen3 235B A22B Instruct","isDefault":false},
  {"id":"qwen3-coder-480b-a35b-instruct-turbo","name":"Qwen3 Coder 480B A35B Turbo","isDefault":false},
  {"id":"qwen3-vl-235b-a22b","name":"Qwen3 VL 235B A22B","isDefault":false},
  {"id":"deepseek-v4-pro","name":"DeepSeek V4 Pro","isDefault":false},
  {"id":"llama-3.3-70b","name":"Llama 3.3 70B","isDefault":false},
  {"id":"hermes-3-llama-3.1-405b","name":"Hermes 3 Llama 3.1 405B","isDefault":false},
  {"id":"mistral-small-3-2-24b-instruct","name":"Mistral Small 3.2 24B","isDefault":false},
  {"id":"text-embedding-3-large","name":"Text Embedding 3 Large","isDefault":false,"kind":"embedding"},
  {"id":"text-embedding-bge-m3","name":"BGE-M3 Embedding","isDefault":false,"kind":"embedding"},
  {"id":"text-embedding-qwen3-8b","name":"Qwen3 8B Embedding","isDefault":false,"kind":"embedding"},
  {"id":"venice-sd35","name":"Venice SD3.5","isDefault":false,"kind":"image"},
  {"id":"flux-2-pro","name":"FLUX.2 Pro","isDefault":false,"kind":"image"},
  {"id":"gpt-image-2","name":"GPT Image 2 (via Venice)","isDefault":false,"kind":"image"},
];
