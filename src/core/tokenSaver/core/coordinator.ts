import type {
  TokenSaverContext,
  TokenSaverCoordinatorSummary,
  TokenSaverResult,
  TokenSaverSettings,
  TokenSaverConfig,
} from "./types.js";
import { DEFAULT_TOKEN_SAVER_SETTINGS } from "./types.js";
import { TokenSaverRegistry } from "./registry.js";

/**
 * Orchestrates token saving methods across active request payloads.
 * Strictly guarantees fail-open: never throws an exception or breaks payload delivery.
 */
export class TokenSaverCoordinator {
  public static process(
    body: any,
    context?: TokenSaverContext,
    settings?: Partial<TokenSaverSettings>
  ): TokenSaverCoordinatorSummary {
    const summary: TokenSaverCoordinatorSummary = {
      tokensSaved: 0,
      originalTokens: 0,
      compressedTokens: 0,
      results: [],
    };

    if (!body || typeof body !== "object") {
      return summary;
    }

    const mergedSettings: TokenSaverSettings = {
      ...DEFAULT_TOKEN_SAVER_SETTINGS,
      ...(settings || {}),
    };

    const registeredMethods = TokenSaverRegistry.getAll();

    for (const method of registeredMethods) {
      try {
        const config: TokenSaverConfig = this.resolveMethodConfig(method.id, mergedSettings);
        if (!config.enabled) {
          continue;
        }

        const res: TokenSaverResult = method.process(body, config, context);
        if (res) {
          summary.results.push(res);
          if (res.applied) {
            summary.tokensSaved += res.tokensSaved || 0;
            if (res.originalTokens !== undefined) {
              summary.originalTokens += res.originalTokens;
            }
            if (res.compressedTokens !== undefined) {
              summary.compressedTokens += res.compressedTokens;
            }
          }
        }
      } catch (err: any) {
        // Fail-open: catch any error, record failure result, and continue
        summary.results.push({
          methodId: method.id,
          applied: false,
          tokensSaved: 0,
          details: { error: err?.message || String(err) },
        });
      }
    }

    // If original tokens wasn't computed by compressors, estimate from tokensSaved
    if (summary.originalTokens === 0 && summary.tokensSaved > 0) {
      summary.originalTokens = summary.compressedTokens + summary.tokensSaved;
    }

    return summary;
  }

  private static resolveMethodConfig(
    methodId: string,
    settings: TokenSaverSettings
  ): TokenSaverConfig {
    const id = methodId.toLowerCase();
    switch (id) {
      case "rtk":
        return {
          enabled: settings.rtkEnabled ?? true,
        };
      case "caveman":
        return {
          enabled: settings.cavemanEnabled ?? false,
          level: settings.cavemanLevel || "lite",
        };
      case "ponytail":
        return {
          enabled: settings.ponytailEnabled ?? false,
          level: settings.ponytailLevel || "lite",
        };
      default:
        // Generic fallback for custom registered methods
        return {
          enabled: Boolean(settings[`${id}Enabled`]),
          level: settings[`${id}Level`],
        };
    }
  }
}
