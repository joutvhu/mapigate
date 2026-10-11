import type { ProviderRegistryItem } from "./types.js";

export * from "./types.js";

import { provider as p_360ai } from "./providers/360ai.js";
import { provider as agnes } from "./providers/agnes.js";
import { provider as ai21 } from "./providers/ai21.js";
import { provider as aimlapi } from "./providers/aimlapi.js";
import { provider as alicode } from "./providers/alicode.js";
import { provider as alicodeIntl } from "./providers/alicode-intl.js";
import { provider as alimsIntl } from "./providers/alims-intl.js";
import { provider as alitpIntl } from "./providers/alitp-intl.js";
import { provider as amazonQ } from "./providers/amazon-q.js";
import { provider as antLing } from "./providers/ant-ling.js";
import { provider as anthropic } from "./providers/anthropic.js";
import { provider as antigravity } from "./providers/antigravity.js";
import { provider as apiAirforce } from "./providers/api-airforce.js";
import { provider as arceeAi } from "./providers/arcee-ai.js";
import { provider as assemblyai } from "./providers/assemblyai.js";
import { provider as atria } from "./providers/atria.js";
import { provider as auggie } from "./providers/auggie.js";
import { provider as awsPolly } from "./providers/aws-polly.js";
import { provider as azure } from "./providers/azure.js";
import { provider as bai } from "./providers/bai.js";
import { provider as baichuan } from "./providers/baichuan.js";
import { provider as baidu } from "./providers/baidu.js";
import { provider as bailianCodingPlan } from "./providers/bailian-coding-plan.js";
import { provider as baseten } from "./providers/baseten.js";
import { provider as bazaarlink } from "./providers/bazaarlink.js";
import { provider as bedrock } from "./providers/bedrock.js";
import { provider as bedrockXai } from "./providers/bedrock-xai.js";
import { provider as blackForestLabs } from "./providers/black-forest-labs.js";
import { provider as blackbox } from "./providers/blackbox.js";
import { provider as bluesminds } from "./providers/bluesminds.js";
import { provider as braveSearch } from "./providers/brave-search.js";
import { provider as byteplus } from "./providers/byteplus.js";
import { provider as cartesia } from "./providers/cartesia.js";
import { provider as cerebras } from "./providers/cerebras.js";
import { provider as chutes } from "./providers/chutes.js";
import { provider as claude } from "./providers/claude.js";
import { provider as cline } from "./providers/cline.js";
import { provider as clinepass } from "./providers/clinepass.js";
import { provider as cloudflareAi } from "./providers/cloudflare-ai.js";
import { provider as clovaStudio } from "./providers/clova-studio.js";
import { provider as codebuddyCn } from "./providers/codebuddy-cn.js";
import { provider as codebuddyIntl } from "./providers/codebuddy-intl.js";
import { provider as codestral } from "./providers/codestral.js";
import { provider as codex } from "./providers/codex.js";
import { provider as codexAppServer } from "./providers/codex-app-server.js";
import { provider as cohere } from "./providers/cohere.js";
import { provider as comfyui } from "./providers/comfyui.js";
import { provider as commandcode } from "./providers/commandcode.js";
import { provider as coqui } from "./providers/coqui.js";
import { provider as coze } from "./providers/coze.js";
import { provider as cursor } from "./providers/cursor.js";
import { provider as dahl } from "./providers/dahl.js";
import { provider as databricks } from "./providers/databricks.js";
import { provider as deepgram } from "./providers/deepgram.js";
import { provider as deepinfra } from "./providers/deepinfra.js";
import { provider as deepseek } from "./providers/deepseek.js";
import { provider as devinCli } from "./providers/devin-cli.js";
import { provider as devinCliAgentic } from "./providers/devin-cli-agentic.js";
import { provider as devinDesktop } from "./providers/devin-desktop.js";
import { provider as doubao } from "./providers/doubao.js";
import { provider as edgeTts } from "./providers/edge-tts.js";
import { provider as elevenlabs } from "./providers/elevenlabs.js";
import { provider as exa } from "./providers/exa.js";
import { provider as falAi } from "./providers/fal-ai.js";
import { provider as featherless } from "./providers/featherless.js";
import { provider as firecrawl } from "./providers/firecrawl.js";
import { provider as fireworks } from "./providers/fireworks.js";
import { provider as fishAudio } from "./providers/fish-audio.js";
import { provider as friendliai } from "./providers/friendliai.js";
import { provider as gemini } from "./providers/gemini.js";
import { provider as geminiCli } from "./providers/gemini-cli.js";
import { provider as gigachat } from "./providers/gigachat.js";
import { provider as github } from "./providers/github.js";
import { provider as gitlab } from "./providers/gitlab.js";
import { provider as glm } from "./providers/glm.js";
import { provider as glmCn } from "./providers/glm-cn.js";
import { provider as googlePse } from "./providers/google-pse.js";
import { provider as googleTts } from "./providers/google-tts.js";
import { provider as grokCli } from "./providers/grok-cli.js";
import { provider as grokWeb } from "./providers/grok-web.js";
import { provider as groq } from "./providers/groq.js";
import { provider as huggingface } from "./providers/huggingface.js";
import { provider as hyperbolic } from "./providers/hyperbolic.js";
import { provider as iflow } from "./providers/iflow.js";
import { provider as internlm } from "./providers/internlm.js";
import { provider as inworld } from "./providers/inworld.js";
import { provider as jinaAi } from "./providers/jina-ai.js";
import { provider as jinaReader } from "./providers/jina-reader.js";
import { provider as kiloGateway } from "./providers/kilo-gateway.js";
import { provider as kilocode } from "./providers/kilocode.js";
import { provider as kimchi } from "./providers/kimchi.js";
import { provider as kimi } from "./providers/kimi.js";
import { provider as kiro } from "./providers/kiro.js";
import { provider as lambdaAi } from "./providers/lambda-ai.js";
import { provider as linkup } from "./providers/linkup.js";
import { provider as liquid } from "./providers/liquid.js";
import { provider as llm7 } from "./providers/llm7.js";
import { provider as localDevice } from "./providers/local-device.js";
import { provider as longcat } from "./providers/longcat.js";
import { provider as maritalk } from "./providers/maritalk.js";
import { provider as metaLlama } from "./providers/meta-llama.js";
import { provider as mimoFree } from "./providers/mimo-free.js";
import { provider as minimax } from "./providers/minimax.js";
import { provider as minimaxCn } from "./providers/minimax-cn.js";
import { provider as minimaxCode } from "./providers/minimax-code.js";
import { provider as minimaxCodeGlobal } from "./providers/minimax-code-global.js";
import { provider as mistral } from "./providers/mistral.js";
import { provider as mmf } from "./providers/mmf.js";
import { provider as modal } from "./providers/modal.js";
import { provider as moonshot } from "./providers/moonshot.js";
import { provider as morph } from "./providers/morph.js";
import { provider as muse } from "./providers/muse.js";
import { provider as nanobanana } from "./providers/nanobanana.js";
import { provider as nanogpt } from "./providers/nanogpt.js";
import { provider as nebius } from "./providers/nebius.js";
import { provider as nousResearch } from "./providers/nous-research.js";
import { provider as novita } from "./providers/novita.js";
import { provider as nscale } from "./providers/nscale.js";
import { provider as nube } from "./providers/nube.js";
import { provider as nvidia } from "./providers/nvidia.js";
import { provider as ollama } from "./providers/ollama.js";
import { provider as ollamaCloud } from "./providers/ollama-cloud.js";
import { provider as ollamaLocal } from "./providers/ollama-local.js";
import { provider as ollamaSearch } from "./providers/ollama-search.js";
import { provider as openai } from "./providers/openai.js";
import { provider as opencode } from "./providers/opencode.js";
import { provider as opencodeGo } from "./providers/opencode-go.js";
import { provider as opencodeZen } from "./providers/opencode-zen.js";
import { provider as openferenceApi } from "./providers/openference-api.js";
import { provider as openrouter } from "./providers/openrouter.js";
import { provider as ovhcloud } from "./providers/ovhcloud.js";
import { provider as perplexity } from "./providers/perplexity.js";
import { provider as perplexityAgent } from "./providers/perplexity-agent.js";
import { provider as perplexityWeb } from "./providers/perplexity-web.js";
import { provider as pioneer } from "./providers/pioneer.js";
import { provider as plamo } from "./providers/plamo.js";
import { provider as playht } from "./providers/playht.js";
import { provider as poolside } from "./providers/poolside.js";
import { provider as predibase } from "./providers/predibase.js";
import { provider as qoder } from "./providers/qoder.js";
import { provider as qoderCn } from "./providers/qoder-cn.js";
import { provider as recraft } from "./providers/recraft.js";
import { provider as reka } from "./providers/reka.js";
import { provider as runwayml } from "./providers/runwayml.js";
import { provider as sambanova } from "./providers/sambanova.js";
import { provider as sarvam } from "./providers/sarvam.js";
import { provider as scaleway } from "./providers/scaleway.js";
import { provider as sdwebui } from "./providers/sdwebui.js";
import { provider as sealion } from "./providers/sealion.js";
import { provider as searchapi } from "./providers/searchapi.js";
import { provider as searxng } from "./providers/searxng.js";
import { provider as selfhostedEmbedding } from "./providers/selfhosted-embedding.js";
import { provider as selfhostedStt } from "./providers/selfhosted-stt.js";
import { provider as selfhostedTts } from "./providers/selfhosted-tts.js";
import { provider as sensenova } from "./providers/sensenova.js";
import { provider as serper } from "./providers/serper.js";
import { provider as siliconflow } from "./providers/siliconflow.js";
import { provider as snowflake } from "./providers/snowflake.js";
import { provider as sparkdesk } from "./providers/sparkdesk.js";
import { provider as stabilityAi } from "./providers/stability-ai.js";
import { provider as stepfun } from "./providers/stepfun.js";
import { provider as synthetic } from "./providers/synthetic.js";
import { provider as tavily } from "./providers/tavily.js";
import { provider as tencent } from "./providers/tencent.js";
import { provider as tinyfish } from "./providers/tinyfish.js";
import { provider as together } from "./providers/together.js";
import { provider as tokenharbor } from "./providers/tokenharbor.js";
import { provider as tokenrouter } from "./providers/tokenrouter.js";
import { provider as topaz } from "./providers/topaz.js";
import { provider as tortoise } from "./providers/tortoise.js";
import { provider as trae } from "./providers/trae.js";
import { provider as typhoon } from "./providers/typhoon.js";
import { provider as upstage } from "./providers/upstage.js";
import { provider as v0Vercel } from "./providers/v0-vercel.js";
import { provider as v1m } from "./providers/v1m.js";
import { provider as venice } from "./providers/venice.js";
import { provider as vercelAiGateway } from "./providers/vercel-ai-gateway.js";
import { provider as vertex } from "./providers/vertex.js";
import { provider as vertexPartner } from "./providers/vertex-partner.js";
import { provider as volcengineAgentPlan } from "./providers/volcengine-agent-plan.js";
import { provider as volcengineArk } from "./providers/volcengine-ark.js";
import { provider as volcengineCodingPlan } from "./providers/volcengine-coding-plan.js";
import { provider as voyageAi } from "./providers/voyage-ai.js";
import { provider as watsonx } from "./providers/watsonx.js";
import { provider as windsurf } from "./providers/windsurf.js";
import { provider as writer } from "./providers/writer.js";
import { provider as xai } from "./providers/xai.js";
import { provider as xiaomiMimo } from "./providers/xiaomi-mimo.js";
import { provider as xiaomiTokenplan } from "./providers/xiaomi-tokenplan.js";
import { provider as xkiro } from "./providers/xkiro.js";
import { provider as xquik } from "./providers/xquik.js";
import { provider as yi } from "./providers/yi.js";
import { provider as youcom } from "./providers/youcom.js";
import { provider as zai } from "./providers/zai.js";
import { provider as zcode } from "./providers/zcode.js";
import { provider as zed } from "./providers/zed.js";

export const PROVIDER_REGISTRY: Record<string, ProviderRegistryItem> = {
  "360ai": p_360ai,
  "agnes": agnes,
  "ai21": ai21,
  "aimlapi": aimlapi,
  "alicode": alicode,
  "alicode-intl": alicodeIntl,
  "alims-intl": alimsIntl,
  "alitp-intl": alitpIntl,
  "amazon-q": amazonQ,
  "ant-ling": antLing,
  "anthropic": anthropic,
  "antigravity": antigravity,
  "api-airforce": apiAirforce,
  "arcee-ai": arceeAi,
  "assemblyai": assemblyai,
  "atria": atria,
  "auggie": auggie,
  "aws-polly": awsPolly,
  "azure": azure,
  "bai": bai,
  "baichuan": baichuan,
  "baidu": baidu,
  "bailian-coding-plan": bailianCodingPlan,
  "baseten": baseten,
  "bazaarlink": bazaarlink,
  "bedrock": bedrock,
  "bedrock-xai": bedrockXai,
  "black-forest-labs": blackForestLabs,
  "blackbox": blackbox,
  "bluesminds": bluesminds,
  "brave-search": braveSearch,
  "byteplus": byteplus,
  "cartesia": cartesia,
  "cerebras": cerebras,
  "chutes": chutes,
  "claude": claude,
  "cline": cline,
  "clinepass": clinepass,
  "cloudflare-ai": cloudflareAi,
  "clova-studio": clovaStudio,
  "codebuddy-cn": codebuddyCn,
  "codebuddy-intl": codebuddyIntl,
  "codestral": codestral,
  "codex": codex,
  "codex-app-server": codexAppServer,
  "cohere": cohere,
  "comfyui": comfyui,
  "commandcode": commandcode,
  "coqui": coqui,
  "coze": coze,
  "cursor": cursor,
  "dahl": dahl,
  "databricks": databricks,
  "deepgram": deepgram,
  "deepinfra": deepinfra,
  "deepseek": deepseek,
  "devin-cli": devinCli,
  "devin-cli-agentic": devinCliAgentic,
  "devin-desktop": devinDesktop,
  "doubao": doubao,
  "edge-tts": edgeTts,
  "elevenlabs": elevenlabs,
  "exa": exa,
  "fal-ai": falAi,
  "featherless": featherless,
  "firecrawl": firecrawl,
  "fireworks": fireworks,
  "fish-audio": fishAudio,
  "friendliai": friendliai,
  "gemini": gemini,
  "gemini-cli": geminiCli,
  "gigachat": gigachat,
  "github": github,
  "gitlab": gitlab,
  "glm": glm,
  "glm-cn": glmCn,
  "google-pse": googlePse,
  "google-tts": googleTts,
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
  "siliconflow": siliconflow,
  "snowflake": snowflake,
  "sparkdesk": sparkdesk,
  "stability-ai": stabilityAi,
  "stepfun": stepfun,
  "synthetic": synthetic,
  "tavily": tavily,
  "tencent": tencent,
  "tinyfish": tinyfish,
  "together": together,
  "tokenharbor": tokenharbor,
  "tokenrouter": tokenrouter,
  "topaz": topaz,
  "tortoise": tortoise,
  "trae": trae,
  "typhoon": typhoon,
  "upstage": upstage,
  "v0-vercel": v0Vercel,
  "v1m": v1m,
  "venice": venice,
  "vercel-ai-gateway": vercelAiGateway,
  "vertex": vertex,
  "vertex-partner": vertexPartner,
  "volcengine-agent-plan": volcengineAgentPlan,
  "volcengine-ark": volcengineArk,
  "volcengine-coding-plan": volcengineCodingPlan,
  "voyage-ai": voyageAi,
  "watsonx": watsonx,
  "windsurf": windsurf,
  "writer": writer,
  "xai": xai,
  "xiaomi-mimo": xiaomiMimo,
  "xiaomi-tokenplan": xiaomiTokenplan,
  "xkiro": xkiro,
  "xquik": xquik,
  "yi": yi,
  "youcom": youcom,
  "zai": zai,
  "zcode": zcode,
  "zed": zed,
};

export function getRegistryProvider(id: string): ProviderRegistryItem | undefined {
  if (PROVIDER_REGISTRY[id]) return PROVIDER_REGISTRY[id];
  const lower = id.toLowerCase();
  for (const item of Object.values(PROVIDER_REGISTRY)) {
    if (item.id.toLowerCase() === lower) return item;
    if (item.alias?.toLowerCase() === lower) return item;
    if (item.uiAlias?.toLowerCase() === lower) return item;
    if (item.aliases?.some((a) => a.toLowerCase() === lower)) return item;
  }
  return undefined;
}

export function getAllRegistryProviders(): ProviderRegistryItem[] {
  return Object.values(PROVIDER_REGISTRY);
}
