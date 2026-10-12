import type { RegistryModel } from "../../core/types.js";

export const models: RegistryModel[] = [
  {"id":"minimaxai/minimax-m2.7","name":"MiniMax M2.7","isDefault":false},
  {"id":"minimaxai/minimax-m3","name":"MiniMax M3","isDefault":false},
  {"id":"z-ai/glm-5.2","name":"GLM 5.2","isDefault":false},
  {"id":"deepseek-ai/deepseek-v4-pro","name":"DeepSeek V4 Pro","isDefault":false},
  {"id":"deepseek-ai/deepseek-v4-flash","name":"DeepSeek V4 Flash","isDefault":false},
  {"id":"moonshotai/kimi-k2.6","name":"Kimi K2.6","isDefault":false},
  {"id":"nvidia/nemotron-3-ultra-550b-a55b","name":"Nemotron 3 Ultra","isDefault":false},
  {"id":"nvidia/nv-embedqa-e5-v5","name":"NV EmbedQA E5 v5","isDefault":false,"kind":"embedding"},
  {"id":"nvidia/parakeet-ctc-1.1b-asr","name":"Parakeet CTC 1.1B","isDefault":false,"kind":"stt"},
  {"id":"fastpitch","name":"FastPitch","isDefault":false,"kind":"tts"},
  {"id":"tacotron2","name":"Tacotron2","isDefault":false,"kind":"tts"},
];
