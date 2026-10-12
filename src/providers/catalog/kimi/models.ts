import type { RegistryModel } from "../../core/types.js";

export const models: RegistryModel[] = [
  {
    "id": "kimi-k3",
    "name": "Kimi K3",
    "isDefault": false,
    "capabilities": {
      "vision": true,
      "videoInput": true,
      "reasoning": true,
      "thinkingFormat": "kimi",
      "thinkingCanDisable": false,
      "contextWindow": 1048576,
      "maxOutput": 131072
    }
  },
  {"id":"k3","name":"Kimi K3 (Code)","isDefault":false},
  {
    "id": "kimi-for-coding",
    "name": "Kimi for Coding",
    "isDefault": false,
    "capabilities": {
      "vision": true,
      "videoInput": true,
      "reasoning": true,
      "thinkingFormat": "kimi",
      "thinkingCanDisable": false,
      "contextWindow": 262144,
      "maxOutput": 65536
    }
  },
  {"id":"kimi-for-coding-highspeed","name":"Kimi for Coding Highspeed","isDefault":false},
  {
    "id": "kimi-k2.7-code",
    "name": "Kimi K2.7 Code",
    "isDefault": false,
    "capabilities": {
      "vision": true,
      "videoInput": true,
      "reasoning": true,
      "thinkingFormat": "kimi",
      "thinkingCanDisable": false,
      "contextWindow": 262144,
      "maxOutput": 65536
    }
  },
  {"id":"kimi-k2.7-code-highspeed","name":"Kimi K2.7 Code Highspeed","isDefault":false},
  {"id":"kimi-k2.6","name":"Kimi K2.6","isDefault":false},
  {"id":"kimi-k2.5","name":"Kimi K2.5","isDefault":false},
  {"id":"kimi-k2.5-thinking","name":"Kimi K2.5 Thinking","isDefault":false},
  {"id":"kimi-latest","name":"Kimi Latest","isDefault":false},
];
