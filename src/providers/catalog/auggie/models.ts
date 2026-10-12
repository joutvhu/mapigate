import type { RegistryModel } from "../../core/types.js";

export const models: RegistryModel[] = [
  {"id":"sonnet4.6","name":"Sonnet 4.6","isDefault":true,"contextLength":200000},
  {"id":"sonnet4.6-500k","name":"Sonnet 4.6 (500K)","isDefault":false,"contextLength":500000},
  {"id":"sonnet4.5","name":"Sonnet 4.5","isDefault":false,"contextLength":200000},
  {"id":"sonnet5-high","name":"Claude Sonnet 5","isDefault":false,"contextLength":200000},
  {"id":"opus4.6","name":"Opus 4.6","isDefault":false,"contextLength":200000},
  {"id":"opus4.6-500k","name":"Opus 4.6 (500K)","isDefault":false,"contextLength":500000},
  {"id":"gemini-3.1-pro-preview","name":"Gemini 3.1 Pro","isDefault":false,"contextLength":1000000},
  {"id":"gpt5","name":"GPT-5","isDefault":false,"contextLength":200000},
  {"id":"gpt5.5","name":"GPT-5.5","isDefault":false,"contextLength":200000},
  {"id":"glm-5.2","name":"GLM 5.2","isDefault":false,"contextLength":200000},
  {"id":"kimi-k2.7","name":"Kimi K2.7 Code","isDefault":false,"contextLength":131000},
];
