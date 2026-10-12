import type { ProviderRegistryItem } from "../types.js";

import { metadata as novita } from "../novita/metadata.js";
import { metadata as nscale } from "../nscale/metadata.js";
import { metadata as nube } from "../nube/metadata.js";
import { metadata as nvidia } from "../nvidia/metadata.js";
import { metadata as ollama } from "../ollama/metadata.js";
import { metadata as ollamaCloud } from "../ollama-cloud/metadata.js";
import { metadata as ollamaLocal } from "../ollama-local/metadata.js";
import { metadata as ollamaSearch } from "../ollama-search/metadata.js";
import { metadata as openai } from "../openai/metadata.js";
import { metadata as opencode } from "../opencode/metadata.js";
import { metadata as opencodeGo } from "../opencode-go/metadata.js";
import { metadata as opencodeZen } from "../opencode-zen/metadata.js";
import { metadata as openferenceApi } from "../openference-api/metadata.js";
import { metadata as openrouter } from "../openrouter/metadata.js";
import { metadata as ovhcloud } from "../ovhcloud/metadata.js";
import { metadata as perplexity } from "../perplexity/metadata.js";
import { metadata as perplexityAgent } from "../perplexity-agent/metadata.js";
import { metadata as perplexityWeb } from "../perplexity-web/metadata.js";
import { metadata as pioneer } from "../pioneer/metadata.js";
import { metadata as plamo } from "../plamo/metadata.js";
import { metadata as playht } from "../playht/metadata.js";
import { metadata as poolside } from "../poolside/metadata.js";
import { metadata as predibase } from "../predibase/metadata.js";
import { metadata as qoder } from "../qoder/metadata.js";
import { metadata as qoderCn } from "../qoder-cn/metadata.js";
import { metadata as recraft } from "../recraft/metadata.js";
import { metadata as reka } from "../reka/metadata.js";
import { metadata as runwayml } from "../runwayml/metadata.js";
import { metadata as sambanova } from "../sambanova/metadata.js";
import { metadata as sarvam } from "../sarvam/metadata.js";
import { metadata as scaleway } from "../scaleway/metadata.js";
import { metadata as sdwebui } from "../sdwebui/metadata.js";
import { metadata as sealion } from "../sealion/metadata.js";
import { metadata as searchapi } from "../searchapi/metadata.js";
import { metadata as searxng } from "../searxng/metadata.js";
import { metadata as selfhostedEmbedding } from "../selfhosted-embedding/metadata.js";
import { metadata as selfhostedStt } from "../selfhosted-stt/metadata.js";
import { metadata as selfhostedTts } from "../selfhosted-tts/metadata.js";
import { metadata as sensenova } from "../sensenova/metadata.js";
import { metadata as serper } from "../serper/metadata.js";

export const metadataChunk4: Record<string, ProviderRegistryItem> = {
  "novita": novita,
  "nscale": nscale,
  "nube": nube,
  "nvidia": nvidia,
  "ollama": ollama,
  "ollama-cloud": ollamaCloud,
  "ollama-local": ollamaLocal,
  "ollama-search": ollamaSearch,
  "openai": openai,
  "opencode": opencode,
  "opencode-go": opencodeGo,
  "opencode-zen": opencodeZen,
  "openference-api": openferenceApi,
  "openrouter": openrouter,
  "ovhcloud": ovhcloud,
  "perplexity": perplexity,
  "perplexity-agent": perplexityAgent,
  "perplexity-web": perplexityWeb,
  "pioneer": pioneer,
  "plamo": plamo,
  "playht": playht,
  "poolside": poolside,
  "predibase": predibase,
  "qoder": qoder,
  "qoder-cn": qoderCn,
  "recraft": recraft,
  "reka": reka,
  "runwayml": runwayml,
  "sambanova": sambanova,
  "sarvam": sarvam,
  "scaleway": scaleway,
  "sdwebui": sdwebui,
  "sealion": sealion,
  "searchapi": searchapi,
  "searxng": searxng,
  "selfhosted-embedding": selfhostedEmbedding,
  "selfhosted-stt": selfhostedStt,
  "selfhosted-tts": selfhostedTts,
  "sensenova": sensenova,
  "serper": serper,
};
