import type { IProvider } from "./types.js";
import { getRegistryProvider } from "./metadataRegistry.js";
import { OpenAiCompatibleProvider } from "./base/openAiProvider.js";
import { AnthropicCompatibleProvider } from "./base/anthropicProvider.js";
import { registerAllGeneratedProviders } from "../generated/providersRegistry.js";

export class ProviderRegistry {
  private static initialized = false;
  private static providers: Map<string, IProvider> = new Map();
  private static aliases: Map<string, string> = new Map([
    ["copilot", "github"],
    ["xmtp", "xiaomi-tokenplan"],
    ["xiaomi-mimo", "mimo"],
    ["grok-cli", "grok"],
    ["xai", "grok"],
    ["gemini-cli", "gemini"],
    ["glm-cn", "glm"],
    ["minimax-cn", "minimax"],
    ["qoder-cn", "qoder"],
    ["anthropic", "claude"],
    ["ollama-cloud", "ollama"],
    ["oc", "opencode"],
    ["cloudflare-ai", "cloudflare"],
  ]);

  public static initializeBuiltins(): void {
    if (this.initialized) return;
    this.initialized = true;

    registerAllGeneratedProviders(this);
  }

  public static register(provider: IProvider, aliases: string[] = []): void {
    const key = provider.id.toLowerCase();
    this.providers.set(key, provider);
    for (const alias of aliases) {
      this.aliases.set(alias.toLowerCase(), key);
    }
  }

  public static unregister(id: string): void {
    const key = id.toLowerCase();
    this.providers.delete(key);
    for (const [alias, target] of this.aliases.entries()) {
      if (target === key) {
        this.aliases.delete(alias);
      }
    }
  }

  public static resolveCanonicalId(id: string): string {
    const lower = (id || "").toLowerCase();
    return this.aliases.get(lower) || getRegistryProvider(lower)?.id || lower;
  }

  public static get(providerId: string): IProvider {
    if (!this.initialized) {
      this.initializeBuiltins();
    }
    const lower = (providerId || "").toLowerCase();
    if (lower === "combo" || lower.startsWith("combo:") || lower.startsWith("combo/")) {
      const combo = this.providers.get("combo");
      if (combo) return combo;
    }

    const canonicalId = this.resolveCanonicalId(lower);
    const registered = this.providers.get(canonicalId);
    if (registered) {
      return registered;
    }

    // Dynamic catalog fallback instantiation
    const catalogItem = getRegistryProvider(canonicalId);
    if (catalogItem) {
      const isAnthropic = catalogItem.format === "claude";
      const prov: IProvider = isAnthropic
        ? new AnthropicCompatibleProvider({
            id: catalogItem.id,
            name: catalogItem.name,
            format: catalogItem.format,
          })
        : new OpenAiCompatibleProvider({
            id: catalogItem.id,
            name: catalogItem.name,
            format: catalogItem.format,
          });
      this.providers.set(canonicalId, prov);
      return prov;
    }

    // Default generic OpenAI compatible provider
    const fallback = new OpenAiCompatibleProvider({ id: lower, name: providerId, format: "openai" });
    this.providers.set(lower, fallback);
    return fallback;
  }

  public static getAll(): IProvider[] {
    if (!this.initialized) {
      this.initializeBuiltins();
    }
    return Array.from(this.providers.values());
  }

  public static clear(): void {
    this.providers.clear();
    this.initialized = false;
  }
}
