import type { ProviderOAuthHandler } from "./oauthTypes.js";
import { GenericOAuthHandler } from "./genericOAuthHandler.js";
import { antigravityOAuthHandler } from "../runtime/antigravity/oauth.js";
import { geminiOAuthHandler } from "../runtime/gemini/oauth.js";
import { claudeOAuthHandler } from "../runtime/claude/oauth.js";
import { codexOAuthHandler } from "../runtime/codex/oauth.js";
import { cursorOAuthHandler } from "../runtime/cursor/import.js";
import { kiroOAuthHandler } from "../runtime/kiro/import.js";
import { githubOAuthHandler } from "../runtime/github/oauth.js";
import { kimiOAuthHandler } from "../runtime/kimi/oauth.js";
import { glmOAuthHandler } from "../runtime/glm/oauth.js";
import { minimaxOAuthHandler } from "../runtime/minimax/oauth.js";
import { clineOAuthHandler } from "../runtime/cline/oauth.js";

/**
 * Central registry for provider OAuth handlers.
 * Supports registering specialized handlers, aliasing provider identifiers,
 * and falling back to GenericOAuthHandler for standard metadata-driven OAuth providers.
 */
export class OAuthHandlerRegistry {
  private static handlers: Map<string, ProviderOAuthHandler> = new Map();
  private static aliases: Map<string, string> = new Map([
    ["gemini-cli", "gemini"],
    ["kimi-coding", "kimi"],
    ["clinepass", "cline"],
    ["minimax-code", "minimax"],
    ["minimax-code-global", "minimax"],
    ["copilot", "github"],
  ]);
  private static defaultGenericHandler = new GenericOAuthHandler();

  /**
   * Registers a specialized OAuth handler for a provider ID.
   */
  public static register(id: string, handler: ProviderOAuthHandler): void {
    if (!id) return;
    this.handlers.set(id.toLowerCase().trim(), handler);
  }

  /**
   * Registers an alias pointing to a canonical provider ID.
   */
  public static registerAlias(alias: string, canonicalId: string): void {
    if (!alias || !canonicalId) return;
    this.aliases.set(alias.toLowerCase().trim(), canonicalId.toLowerCase().trim());
  }

  /**
   * Resolves the canonical provider ID following registered aliases.
   */
  public static resolveId(id: string): string {
    const key = id.toLowerCase().trim();
    return this.aliases.get(key) || key;
  }

  /**
   * Retrieves an OAuth handler for the given provider ID or alias.
   * If no specialized handler is registered, returns a GenericOAuthHandler fallback.
   */
  public static get(id: string): ProviderOAuthHandler {
    if (!id) return this.defaultGenericHandler;
    const canonicalId = this.resolveId(id);
    const handler = this.handlers.get(canonicalId);
    if (handler) {
      return handler;
    }
    return new GenericOAuthHandler(canonicalId);
  }

  /**
   * Returns a map of all registered specialized handlers.
   */
  public static getAll(): Map<string, ProviderOAuthHandler> {
    return this.handlers;
  }

  /**
   * Clears all registered handlers (used in testing).
   */
  public static clear(): void {
    this.handlers.clear();
  }

  /**
   * Initializes built-in specialized OAuth handlers.
   */
  public static initializeBuiltins(): void {
    this.register("antigravity", antigravityOAuthHandler);
    this.register("gemini", geminiOAuthHandler);
    this.register("claude", claudeOAuthHandler);
    this.register("codex", codexOAuthHandler);
    this.register("cursor", cursorOAuthHandler);
    this.register("kiro", kiroOAuthHandler);
    this.register("github", githubOAuthHandler);
    this.register("kimi", kimiOAuthHandler);
    this.register("glm", glmOAuthHandler);
    this.register("minimax", minimaxOAuthHandler);
    this.register("cline", clineOAuthHandler);
  }
}
