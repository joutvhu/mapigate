import type { IProvider } from "./types.js";
import { getRegistryProvider } from "./metadataRegistry.js";
import { OpenAiCompatibleProvider } from "./base/openAiProvider.js";
import { AnthropicCompatibleProvider } from "./base/anthropicProvider.js";
import { ComboProvider } from "../core/providers/combo/index.js";
import { AntigravityProvider } from "../core/providers/antigravity/index.js";
import { AzureProvider } from "../core/providers/azure/index.js";
import { BedrockProvider } from "../core/providers/bedrock/index.js";
import { ClaudeProvider } from "../core/providers/claude/index.js";
import { CloudflareProvider } from "../core/providers/cloudflare/index.js";
import { CodexProvider } from "../core/providers/codex/index.js";
import { DeepSeekProvider } from "../core/providers/deepseek/index.js";
import { GeminiProvider } from "../core/providers/gemini/index.js";
import { GitHubProvider } from "../core/providers/github/index.js";
import { GlmProvider } from "../core/providers/glm/index.js";
import { GrokProvider } from "../core/providers/grok/index.js";
import { KiroProvider } from "../core/providers/kiro/index.js";
import { MimoProvider } from "../core/providers/mimo/index.js";
import { MiniMaxProvider } from "../core/providers/minimax/index.js";
import { OllamaProvider } from "../core/providers/ollama/index.js";
import { OpenCodeProvider } from "../core/providers/opencode/index.js";
import { QoderProvider } from "../core/providers/qoder/index.js";
import { XKiroProvider } from "../core/providers/xkiro/index.js";

export class ProviderRegistry {
  private static initialized = false;
  private static providers: Map<string, IProvider> = new Map();
  private static aliases: Map<string, string> = new Map([
    ["copilot", "github"],
    ["xiaomi-tokenplan", "mimo"],
    ["xmtp", "mimo"],
    ["xiaomi-mimo", "mimo"],
    ["grok-cli", "grok"],
    ["gemini-cli", "gemini"],
    ["glm-cn", "glm"],
    ["minimax-cn", "minimax"],
    ["qoder-cn", "qoder"],
    ["anthropic", "claude"],
    ["ollama-local", "ollama"],
    ["oc", "opencode"],
    ["cloudflare-ai", "cloudflare"],
  ]);

  public static initializeBuiltins(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.register(new ComboProvider());
    this.register(new AntigravityProvider());
    this.register(new AzureProvider());
    this.register(new BedrockProvider());
    this.register(new ClaudeProvider(), ["anthropic"]);
    this.register(new CloudflareProvider(), ["cloudflare-ai"]);
    this.register(new CodexProvider());
    this.register(new DeepSeekProvider());
    this.register(new GeminiProvider(), ["gemini-cli"]);
    this.register(new GitHubProvider(), ["copilot"]);
    this.register(new GlmProvider(), ["glm-cn"]);
    this.register(new GrokProvider(), ["grok-cli"]);
    this.register(new KiroProvider());
    this.register(new MimoProvider(), ["xiaomi-tokenplan", "xmtp", "xiaomi-mimo"]);
    this.register(new MiniMaxProvider(), ["minimax-cn"]);
    this.register(new OllamaProvider(), ["ollama-local"]);
    this.register(new OpenCodeProvider(), ["oc"]);
    this.register(new QoderProvider(), ["qoder-cn"]);
    this.register(new XKiroProvider());
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
