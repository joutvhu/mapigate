import type {
  ITokenSaverMethod,
  TokenSaverConfig,
  TokenSaverContext,
  TokenSaverResult,
} from "../../core/types.js";
import { rtkMetadata } from "./metadata.js";
import { RAW_CAP, type FilterFunction } from "./constants.js";
import { autoDetectFilter, safeApply } from "./autodetect.js";

export class RtkMethod implements ITokenSaverMethod {
  public readonly id = rtkMetadata.id;
  public readonly name = rtkMetadata.name;
  public readonly type = rtkMetadata.type;
  public readonly description = rtkMetadata.description;

  public process(
    body: any,
    config: TokenSaverConfig,
    _context?: TokenSaverContext
  ): TokenSaverResult {
    if (config?.enabled === false || !body || typeof body !== "object") {
      return { methodId: this.id, applied: false, tokensSaved: 0 };
    }

    try {
      const stats = RtkMethod.compressPayloadInPlace(body);
      return {
        methodId: this.id,
        applied: stats.tokensSaved > 0,
        tokensSaved: stats.tokensSaved,
        originalTokens: stats.originalTokens,
        compressedTokens: stats.compressedTokens,
        details: { hits: stats.hits },
      };
    } catch {
      return { methodId: this.id, applied: false, tokensSaved: 0 };
    }
  }

  /**
   * Safely compress tool output text
   */
  public static compressText(output: string): {
    text: string;
    tokensSaved: number;
    filterName?: string;
  } {
    if (!output || typeof output !== "string" || output.length < 150) {
      return { text: output, tokensSaved: 0 };
    }

    if (output.length > RAW_CAP) {
      return { text: output, tokensSaved: 0 };
    }

    // Do NOT compress JSON structures
    const trimmed = output.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        JSON.parse(trimmed);
        return { text: output, tokensSaved: 0 };
      } catch {
        // Not valid JSON, proceed
      }
    }

    try {
      const origLen = output.length;
      let result = output;
      let appliedFilter: string | undefined;

      const detectedFilter: FilterFunction | null = autoDetectFilter(output);
      if (detectedFilter) {
        const filtered = safeApply(detectedFilter, output);
        if (filtered && filtered.length > 0 && filtered.length < origLen) {
          result = filtered;
          appliedFilter = detectedFilter.filterName || detectedFilter.name;
        }
      }

      // Safety invariant: Fail-open. Never return empty, never grow the input.
      if (!result || result.trim().length === 0 || result.length >= origLen) {
        return { text: output, tokensSaved: 0 };
      }

      const origEstimate = Math.ceil(origLen / 4);
      const compEstimate = Math.ceil(result.length / 4);
      const saved = Math.max(0, origEstimate - compEstimate);

      return {
        text: result,
        tokensSaved: saved,
        filterName: appliedFilter,
      };
    } catch {
      return { text: output, tokensSaved: 0 };
    }
  }

  /**
   * Compress OpenAI, Claude, or Kiro payload in-place
   */
  public static compressPayloadInPlace(body: any): {
    originalTokens: number;
    compressedTokens: number;
    tokensSaved: number;
    hits: Array<{ shape: string; filter?: string; savedTokens: number }>;
  } {
    const hits: Array<{ shape: string; filter?: string; savedTokens: number }> = [];
    let totalSaved = 0;
    let totalOrig = 0;
    let totalComp = 0;

    if (!body || typeof body !== "object") {
      return { originalTokens: 0, compressedTokens: 0, tokensSaved: 0, hits };
    }

    try {
      // 1. Kiro wire format (conversationState)
      if (body.conversationState) {
        const state = body.conversationState;
        const allMessages = [...(Array.isArray(state?.history) ? state.history : [])];
        if (state?.currentMessage) allMessages.push(state.currentMessage);

        for (const msg of allMessages) {
          const toolResults = msg?.userInputMessage?.userInputMessageContext?.toolResults;
          if (!Array.isArray(toolResults)) continue;

          for (const tr of toolResults) {
            // Preserve error traces
            if (tr.status === "error") continue;
            if (!Array.isArray(tr.content)) continue;

            for (const part of tr.content) {
              if (part && typeof part.text === "string") {
                const { text, tokensSaved, filterName } = this.compressText(part.text);
                if (tokensSaved > 0) {
                  totalOrig += Math.ceil(part.text.length / 4);
                  totalComp += Math.ceil(text.length / 4);
                  totalSaved += tokensSaved;
                  hits.push({ shape: "kiro-tool-result", filter: filterName, savedTokens: tokensSaved });
                  part.text = text;
                }
              }
            }
          }
        }
        return { originalTokens: totalOrig, compressedTokens: totalComp, tokensSaved: totalSaved, hits };
      }

      // 2. OpenAI messages & OpenAI Responses input
      const items = Array.isArray(body.messages)
        ? body.messages
        : Array.isArray(body.input)
        ? body.input
        : null;

      if (items) {
        for (const msg of items) {
          if (!msg) continue;

          // Shape: OpenAI Responses function_call_output
          if (msg.type === "function_call_output") {
            if (msg.is_error === true || msg.status === "error") continue;
            if (typeof msg.output === "string") {
              const { text, tokensSaved, filterName } = this.compressText(msg.output);
              if (tokensSaved > 0) {
                totalOrig += Math.ceil(msg.output.length / 4);
                totalComp += Math.ceil(text.length / 4);
                totalSaved += tokensSaved;
                hits.push({ shape: "responses-function-output", filter: filterName, savedTokens: tokensSaved });
                msg.output = text;
              }
            } else if (Array.isArray(msg.output)) {
              for (const part of msg.output) {
                if (part && part.type === "input_text" && typeof part.text === "string") {
                  const { text, tokensSaved, filterName } = this.compressText(part.text);
                  if (tokensSaved > 0) {
                    totalOrig += Math.ceil(part.text.length / 4);
                    totalComp += Math.ceil(text.length / 4);
                    totalSaved += tokensSaved;
                    hits.push({ shape: "responses-input-text", filter: filterName, savedTokens: tokensSaved });
                    part.text = text;
                  }
                }
              }
            }
            continue;
          }

          // Shape: OpenAI tool role with string content
          if (msg.role === "tool" && typeof msg.content === "string") {
            if (msg.is_error === true || msg.status === "error") continue;
            const { text, tokensSaved, filterName } = this.compressText(msg.content);
            if (tokensSaved > 0) {
              totalOrig += Math.ceil(msg.content.length / 4);
              totalComp += Math.ceil(text.length / 4);
              totalSaved += tokensSaved;
              hits.push({ shape: "openai-tool", filter: filterName, savedTokens: tokensSaved });
              msg.content = text;
            }
            continue;
          }

          // Shape: OpenAI tool role with array content
          if (msg.role === "tool" && Array.isArray(msg.content)) {
            if (msg.is_error === true || msg.status === "error") continue;
            for (const part of msg.content) {
              if (part && part.type === "text" && typeof part.text === "string") {
                const { text, tokensSaved, filterName } = this.compressText(part.text);
                if (tokensSaved > 0) {
                  totalOrig += Math.ceil(part.text.length / 4);
                  totalComp += Math.ceil(text.length / 4);
                  totalSaved += tokensSaved;
                  hits.push({ shape: "openai-tool-array", filter: filterName, savedTokens: tokensSaved });
                  part.text = text;
                }
              }
            }
            continue;
          }

          // Shape: Anthropic tool_result blocks in content array
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (!block || block.type !== "tool_result") continue;
              // Preserve error traces
              if (block.is_error === true) continue;

              if (typeof block.content === "string") {
                const { text, tokensSaved, filterName } = this.compressText(block.content);
                if (tokensSaved > 0) {
                  totalOrig += Math.ceil(block.content.length / 4);
                  totalComp += Math.ceil(text.length / 4);
                  totalSaved += tokensSaved;
                  hits.push({ shape: "claude-tool-result", filter: filterName, savedTokens: tokensSaved });
                  block.content = text;
                }
              } else if (Array.isArray(block.content)) {
                for (const part of block.content) {
                  if (part && part.type === "text" && typeof part.text === "string") {
                    const { text, tokensSaved, filterName } = this.compressText(part.text);
                    if (tokensSaved > 0) {
                      totalOrig += Math.ceil(part.text.length / 4);
                      totalComp += Math.ceil(text.length / 4);
                      totalSaved += tokensSaved;
                      hits.push({ shape: "claude-tool-result-array", filter: filterName, savedTokens: tokensSaved });
                      part.text = text;
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // Fail-open
    }

    return {
      originalTokens: totalOrig,
      compressedTokens: totalComp,
      tokensSaved: totalSaved,
      hits,
    };
  }
}
