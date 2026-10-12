import type { ProviderRegistryItem } from "../types.js";

import { metadata as grok } from "../grok/metadata.js";
import { metadata as grokCli } from "../grok-cli/metadata.js";
import { metadata as grokWeb } from "../grok-web/metadata.js";
import { metadata as groq } from "../groq/metadata.js";
import { metadata as huggingface } from "../huggingface/metadata.js";
import { metadata as hyperbolic } from "../hyperbolic/metadata.js";
import { metadata as iflow } from "../iflow/metadata.js";
import { metadata as internlm } from "../internlm/metadata.js";
import { metadata as inworld } from "../inworld/metadata.js";
import { metadata as jinaAi } from "../jina-ai/metadata.js";
import { metadata as jinaReader } from "../jina-reader/metadata.js";
import { metadata as kiloGateway } from "../kilo-gateway/metadata.js";
import { metadata as kilocode } from "../kilocode/metadata.js";
import { metadata as kimchi } from "../kimchi/metadata.js";
import { metadata as kimi } from "../kimi/metadata.js";
import { metadata as kiro } from "../kiro/metadata.js";
import { metadata as lambdaAi } from "../lambda-ai/metadata.js";
import { metadata as linkup } from "../linkup/metadata.js";
import { metadata as liquid } from "../liquid/metadata.js";
import { metadata as llm7 } from "../llm7/metadata.js";
import { metadata as localDevice } from "../local-device/metadata.js";
import { metadata as longcat } from "../longcat/metadata.js";
import { metadata as maritalk } from "../maritalk/metadata.js";
import { metadata as metaLlama } from "../meta-llama/metadata.js";
import { metadata as mimo } from "../mimo/metadata.js";
import { metadata as mimoFree } from "../mimo-free/metadata.js";
import { metadata as minimax } from "../minimax/metadata.js";
import { metadata as minimaxCn } from "../minimax-cn/metadata.js";
import { metadata as minimaxCode } from "../minimax-code/metadata.js";
import { metadata as minimaxCodeGlobal } from "../minimax-code-global/metadata.js";
import { metadata as mistral } from "../mistral/metadata.js";
import { metadata as mmf } from "../mmf/metadata.js";
import { metadata as modal } from "../modal/metadata.js";
import { metadata as moonshot } from "../moonshot/metadata.js";
import { metadata as morph } from "../morph/metadata.js";
import { metadata as muse } from "../muse/metadata.js";
import { metadata as nanobanana } from "../nanobanana/metadata.js";
import { metadata as nanogpt } from "../nanogpt/metadata.js";
import { metadata as nebius } from "../nebius/metadata.js";
import { metadata as nousResearch } from "../nous-research/metadata.js";

export const metadataChunk3: Record<string, ProviderRegistryItem> = {
  "grok": grok,
  "grok-cli": grokCli,
  "grok-web": grokWeb,
  "groq": groq,
  "huggingface": huggingface,
  "hyperbolic": hyperbolic,
  "iflow": iflow,
  "internlm": internlm,
  "inworld": inworld,
  "jina-ai": jinaAi,
  "jina-reader": jinaReader,
  "kilo-gateway": kiloGateway,
  "kilocode": kilocode,
  "kimchi": kimchi,
  "kimi": kimi,
  "kiro": kiro,
  "lambda-ai": lambdaAi,
  "linkup": linkup,
  "liquid": liquid,
  "llm7": llm7,
  "local-device": localDevice,
  "longcat": longcat,
  "maritalk": maritalk,
  "meta-llama": metaLlama,
  "mimo": mimo,
  "mimo-free": mimoFree,
  "minimax": minimax,
  "minimax-cn": minimaxCn,
  "minimax-code": minimaxCode,
  "minimax-code-global": minimaxCodeGlobal,
  "mistral": mistral,
  "mmf": mmf,
  "modal": modal,
  "moonshot": moonshot,
  "morph": morph,
  "muse": muse,
  "nanobanana": nanobanana,
  "nanogpt": nanogpt,
  "nebius": nebius,
  "nous-research": nousResearch,
};
