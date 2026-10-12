import type { ProviderRegistryItem } from "../types.js";

import { metadata as clovaStudio } from "../clova-studio/metadata.js";
import { metadata as codebuddyCn } from "../codebuddy-cn/metadata.js";
import { metadata as codebuddyIntl } from "../codebuddy-intl/metadata.js";
import { metadata as codestral } from "../codestral/metadata.js";
import { metadata as codex } from "../codex/metadata.js";
import { metadata as codexAppServer } from "../codex-app-server/metadata.js";
import { metadata as cohere } from "../cohere/metadata.js";
import { metadata as combo } from "../combo/metadata.js";
import { metadata as comfyui } from "../comfyui/metadata.js";
import { metadata as commandcode } from "../commandcode/metadata.js";
import { metadata as coqui } from "../coqui/metadata.js";
import { metadata as coze } from "../coze/metadata.js";
import { metadata as cursor } from "../cursor/metadata.js";
import { metadata as dahl } from "../dahl/metadata.js";
import { metadata as databricks } from "../databricks/metadata.js";
import { metadata as deepgram } from "../deepgram/metadata.js";
import { metadata as deepinfra } from "../deepinfra/metadata.js";
import { metadata as deepseek } from "../deepseek/metadata.js";
import { metadata as devinCli } from "../devin-cli/metadata.js";
import { metadata as devinCliAgentic } from "../devin-cli-agentic/metadata.js";
import { metadata as devinDesktop } from "../devin-desktop/metadata.js";
import { metadata as doubao } from "../doubao/metadata.js";
import { metadata as edgeTts } from "../edge-tts/metadata.js";
import { metadata as elevenlabs } from "../elevenlabs/metadata.js";
import { metadata as exa } from "../exa/metadata.js";
import { metadata as falAi } from "../fal-ai/metadata.js";
import { metadata as featherless } from "../featherless/metadata.js";
import { metadata as firecrawl } from "../firecrawl/metadata.js";
import { metadata as fireworks } from "../fireworks/metadata.js";
import { metadata as fishAudio } from "../fish-audio/metadata.js";
import { metadata as friendliai } from "../friendliai/metadata.js";
import { metadata as gemini } from "../gemini/metadata.js";
import { metadata as geminiCli } from "../gemini-cli/metadata.js";
import { metadata as gigachat } from "../gigachat/metadata.js";
import { metadata as github } from "../github/metadata.js";
import { metadata as gitlab } from "../gitlab/metadata.js";
import { metadata as glm } from "../glm/metadata.js";
import { metadata as glmCn } from "../glm-cn/metadata.js";
import { metadata as googlePse } from "../google-pse/metadata.js";
import { metadata as googleTts } from "../google-tts/metadata.js";

export const metadataChunk2: Record<string, ProviderRegistryItem> = {
  "clova-studio": clovaStudio,
  "codebuddy-cn": codebuddyCn,
  "codebuddy-intl": codebuddyIntl,
  "codestral": codestral,
  "codex": codex,
  "codex-app-server": codexAppServer,
  "cohere": cohere,
  "combo": combo,
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
};
