import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type {
  ProviderRequestContext,
  SingleModelHandler,
  ModelCallResult,
  ProviderProbeContext,
  ProviderProbeResult,
} from "../../core/types.js";
import { metadata } from "./metadata.js";
import { executeCursor } from "./executor.js";
import { fetchCursorCatalog } from "./cursorModels.js";

export class CursorProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public async execute(
    context: ProviderRequestContext,
    _dispatchSingleModel: SingleModelHandler
  ): Promise<ModelCallResult> {
    return executeCursor(context);
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const rawToken = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!rawToken) {
      return {
        success: false,
        error: "Cursor access token is required (import from Cursor IDE or provide token).",
      };
    }

    const cleanToken = rawToken.includes("::") ? rawToken.split("::")[1] : rawToken;
    const psd = (context.account?.providerSpecificData || context.providerSpecificData || {}) as Record<string, any>;
    const machineId = psd.machineId || undefined;
    const timeoutMs = context.timeoutMs || 10_000;

    try {
      const catalog = await fetchCursorCatalog({ accessToken: cleanToken, machineId }, undefined, timeoutMs);
      const models = catalog.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        contextLength: 128000,
      }));

      return {
        success: true,
        endpointUrl: "https://agent.api5.cursor.sh",
        models: models.length ? models : metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
        count: models.length || metadata.models.length,
      };
    } catch (err: any) {
      const status = err?.status;
      const isAuthError = status === 401 || status === 403;
      return {
        success: false,
        error: `Cursor live probing failed: ${err.message || String(err)}`,
        authError: isAuthError ? `Authentication failed (HTTP ${status}): Invalid or expired Cursor access token` : undefined,
      };
    }
  }
}

export default CursorProvider;
