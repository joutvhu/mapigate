import { TokenSaverRegistry } from "./core/registry.js";
import { RtkMethod } from "./methods/rtk/method.js";
import { CavemanMethod } from "./methods/caveman/method.js";
import { PonytailMethod } from "./methods/ponytail/method.js";
import { CustomPromptMethod } from "./methods/customPrompt/method.js";

// Register default built-in methods on module load
TokenSaverRegistry.register(new RtkMethod());
TokenSaverRegistry.register(new CavemanMethod());
TokenSaverRegistry.register(new PonytailMethod());
TokenSaverRegistry.register(new CustomPromptMethod());

export * from "./core/index.js";
export * from "./methods/rtk/index.js";
export * from "./methods/caveman/index.js";
export * from "./methods/ponytail/index.js";
export * from "./methods/customPrompt/index.js";

export interface CompressionStats {
  originalTokens: number;
  compressedTokens: number;
  tokensSaved: number;
}

/**
 * Backward-compatible adapter for existing RtkCompressor consumers.
 */
export class RtkCompressor {
  public static compressText(output: string): { text: string; tokensSaved: number } {
    const res = RtkMethod.compressText(output);
    return { text: res.text, tokensSaved: res.tokensSaved };
  }

  public static compressPayloadInPlace(body: any): {
    originalTokens: number;
    compressedTokens: number;
    tokensSaved: number;
  } {
    const res = RtkMethod.compressPayloadInPlace(body);
    return {
      originalTokens: res.originalTokens,
      compressedTokens: res.compressedTokens,
      tokensSaved: res.tokensSaved,
    };
  }
}
