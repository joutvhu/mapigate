import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { metadata } from "./metadata.js";

export class CursorProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Cursor access token is required (import from Cursor IDE or provide token).",
      };
    }

    // Cursor uses connect+proto on api2.cursor.sh and requires machine ID.
    // Presence of non-empty access token means connection is active.
    return {
      success: true,
      endpointUrl: "https://api2.cursor.sh",
      models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
      count: metadata.models.length,
    };
  }
}

export default CursorProvider;
