import crypto from "node:crypto";
import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type {
  ModelCallResult,
  ProviderProbeContext,
  ProviderProbeResult,
  ProviderRequestContext,
} from "../../core/types.js";
import { metadata } from "./metadata.js";
import { executeCommandCode } from "./executor.js";
import { buildCommandCodeHeaders } from "./headers.js";
import { buildCommandCodePayload } from "./converter.js";

export class CommandcodeProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "commandcode";

  public async execute(context: ProviderRequestContext): Promise<ModelCallResult> {
    return await executeCommandCode(context);
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Command Code API key is required (starts with user_...)",
      };
    }

    const timeoutMs = context.timeoutMs || 8000;
    const url = "https://api.commandcode.ai/alpha/generate";
    const body = buildCommandCodePayload(
      "deepseek/deepseek-v4-pro",
      {
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      },
      crypto.randomUUID()
    );

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: buildCommandCodeHeaders({
          apiKey: token,
          sessionId: body.threadId,
          accept: "text/event-stream",
          customHeaders: context.customHeaders,
        }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: url,
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      const errText = await res.text().catch(() => "");
      try {
        const errJson: any = JSON.parse(errText);
        const errMsg = errJson?.error?.message || errJson?.message || "";
        if (errMsg.toLowerCase().includes("insufficient credits")) {
          return {
            success: true,
            endpointUrl: url,
            models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
            count: metadata.models.length,
          };
        }
        if (res.status === 401 || res.status === 403) {
          return {
            success: false,
            error: `Authentication failed (HTTP ${res.status}): ${errMsg || "Invalid Command Code API key"}`,
            authError: errMsg || "Invalid API key",
          };
        }
        return {
          success: false,
          error: `Endpoint ${url} returned HTTP ${res.status}: ${errMsg || errText}`,
        };
      } catch {
        return {
          success: false,
          error: `Endpoint ${url} returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Command Code: ${msg}`,
      };
    }
  }
}

export default CommandcodeProvider;
