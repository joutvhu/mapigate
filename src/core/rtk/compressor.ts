import { compressGitDiff } from "./filters/gitDiff.js";
import { compressTerminalLogs } from "./filters/terminalLogs.js";

export interface CompressionStats {
  originalTokens: number;
  compressedTokens: number;
  tokensSaved: number;
}

export class RtkCompressor {
  /**
   * Safely compress tool output text
   */
  public static compressText(output: string): { text: string; tokensSaved: number } {
    if (!output || typeof output !== "string" || output.length < 150) {
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
      let result = output;
      result = compressGitDiff(result);
      result = compressTerminalLogs(result);
      result = result.replace(/\n{3,}/g, "\n\n");

      const origEstimate = Math.ceil(output.length / 4);
      const compEstimate = Math.ceil(result.length / 4);
      const saved = Math.max(0, origEstimate - compEstimate);

      return { text: result, tokensSaved: saved };
    } catch {
      // Fail-open: never fail request on compression error
      return { text: output, tokensSaved: 0 };
    }
  }

  /**
   * Compress OpenAI or Anthropic payload in-place
   */
  public static compressPayloadInPlace(body: any): CompressionStats {
    let totalSaved = 0;
    let totalOrig = 0;
    let totalComp = 0;

    if (!body || typeof body !== "object") {
      return { originalTokens: 0, compressedTokens: 0, tokensSaved: 0 };
    }

    try {
      // 1. OpenAI messages shape
      if (Array.isArray(body.messages)) {
        for (const msg of body.messages) {
          if (msg && msg.role === "tool" && typeof msg.content === "string") {
            const { text, tokensSaved } = this.compressText(msg.content);
            if (tokensSaved > 0) {
              totalOrig += Math.ceil(msg.content.length / 4);
              totalComp += Math.ceil(text.length / 4);
              totalSaved += tokensSaved;
              msg.content = text;
            }
          }

          // 2. Anthropic message content blocks
          if (msg && Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (
                block &&
                block.type === "tool_result" &&
                !block.is_error &&
                typeof block.content === "string"
              ) {
                const { text, tokensSaved } = this.compressText(block.content);
                if (tokensSaved > 0) {
                  totalOrig += Math.ceil(block.content.length / 4);
                  totalComp += Math.ceil(text.length / 4);
                  totalSaved += tokensSaved;
                  block.content = text;
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
    };
  }
}
