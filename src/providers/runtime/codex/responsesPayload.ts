import { buildResponsesRequestPayload } from "../../core/base/responsesPayloadBuilder.js";
import type { ProviderRequestContext } from "../../core/types.js";
import {
  convertSystemToDeveloperRole,
  sanitizeCodexTools,
  stripStoredItemReferences,
} from "./schemaSanitizer.js";

const DEFAULT_CODEX_INSTRUCTIONS = "You are a helpful coding assistant.";

export function buildCodexResponsesPayload(
  context: ProviderRequestContext,
  upstreamModel: string
): Record<string, any> {
  const out = buildResponsesRequestPayload(context, upstreamModel, {
    defaultInstructions: DEFAULT_CODEX_INSTRUCTIONS,
    forceStoreFalse: true,
    forceStream: true,
    allowMaxOutputTokens: false,
    allowSamplingParams: false,
    includePromptCacheKey: true,
  });

  sanitizeCodexTools(out);
  convertSystemToDeveloperRole(out);
  stripStoredItemReferences(out);

  return out;
}
