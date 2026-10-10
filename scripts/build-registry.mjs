import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const m = await import('file:///f:/Documents/Library/AI/9router/open-sse/providers/registry/index.js');
  const imgDir = 'F:/Documents/Library/AI/routen/src/web/public/providers';
  const existingImages = new Set(fs.readdirSync(imgDir));

  function getImage(id, alias) {
    if (existingImages.has(id + '.png')) return '/providers/' + id + '.png';
    if (existingImages.has(id + '.svg')) return '/providers/' + id + '.svg';
    if (alias && existingImages.has(alias + '.png')) return '/providers/' + alias + '.png';
    if (id.startsWith('minimax-code')) return '/providers/minimax.png';
    if (id.startsWith('opencode')) return '/providers/opencode.png';
    if (id.startsWith('ollama')) return '/providers/ollama.png';
    return '/providers/openai.png';
  }

  function getCategory(cat) {
    if (cat === 'oauth' || cat === 'webCookie') return 'oauth';
    if (cat === 'freeTier' || cat === 'free') return 'freeTier';
    if (cat === 'apikey') return 'apikey';
    return 'custom';
  }

  const entries = {};
  for (const p of m.default) {
    const defaultHeaders = { ...(p.transport?.headers || {}) };
    const baseUrl = p.transport?.baseUrl || (p.transport?.baseUrls && p.transport.baseUrls[0]) || '';
    const baseUrls = p.transport?.baseUrls || (baseUrl ? [baseUrl] : []);
    const validateUrl = p.transport?.validateUrl || '';
    const format = p.transport?.format || 'openai';
    const thinkingOptions = p.thinkingConfig?.options || undefined;
    const thinkingMode = p.thinkingConfig?.defaultMode || 'auto';
    const models = (p.models || []).map(mod => ({
      id: mod.id,
      name: mod.name || mod.id,
      upstreamModelId: mod.upstreamModelId || undefined,
      isDefault: Boolean(mod.isDefault || mod.mandatory)
    }));

    entries[p.id] = {
      id: p.id,
      name: p.display?.name || p.id,
      alias: p.alias || undefined,
      color: p.display?.color || undefined,
      image: getImage(p.id, p.alias),
      category: getCategory(p.category),
      baseUrl,
      baseUrls,
      validateUrl,
      format,
      defaultHeaders,
      thinkingMode,
      thinkingOptions,
      models
    };
  }

  const code = `export interface RegistryModel {
  id: string;
  name: string;
  upstreamModelId?: string;
  isDefault?: boolean;
}

export interface ProviderRegistryItem {
  id: string;
  name: string;
  alias?: string;
  color?: string;
  image?: string;
  category: "oauth" | "freeTier" | "apikey" | "custom";
  baseUrl: string;
  baseUrls?: string[];
  validateUrl?: string;
  format: string;
  defaultHeaders: Record<string, string>;
  thinkingMode?: string;
  thinkingOptions?: string[];
  models: RegistryModel[];
}

export const PROVIDER_REGISTRY: Record<string, ProviderRegistryItem> = ${JSON.stringify(entries, null, 2)};

export function getRegistryProvider(id: string): ProviderRegistryItem | undefined {
  return PROVIDER_REGISTRY[id];
}

export function getAllRegistryProviders(): ProviderRegistryItem[] {
  return Object.values(PROVIDER_REGISTRY);
}
`;

  fs.writeFileSync('F:/Documents/Library/AI/routen/src/shared/constants/providerRegistry.ts', code, 'utf8');
  console.log('Successfully wrote providerRegistry.ts with', Object.keys(entries).length, 'providers.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
