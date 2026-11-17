import { AnthropicCompatibleProvider } from "../../core/base/anthropicProvider.js";
import type {
  ProviderUsageContext,
  RawProviderQuotaResult,
} from "../../../core/usage/types.js";
import type {
  ProviderProbeContext,
  ProviderProbeResult,
  ProviderRequestContext,
} from "../../core/types.js";
import { metadata } from "./metadata.js";
import { getKimiUsage } from "./quota.js";

const UNSUPPORTED_BETA_BLOCK_TYPES = new Set([
  "tool_reference",
  "mcp_toolset",
  "server_tool_use",
  "web_search_tool_result",
]);

function sanitizeKimiClaudeBody(rawBody: any): any {
  if (!rawBody || typeof rawBody !== "object") return rawBody;
  const body = structuredClone(rawBody);

  const toolsMap = new Map<string, any>();
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if (!tool || typeof tool !== "object") continue;
      if (typeof tool.type === "string" && (tool.type.startsWith("tool_search_tool_") || tool.type === "mcp_toolset")) {
        continue;
      }
      const name = typeof tool.name === "string" ? tool.name.trim() : "";
      if (!name || toolsMap.has(name)) continue;
      const cleanTool = { ...tool };
      delete cleanTool.defer_loading;
      toolsMap.set(name, cleanTool);
    }
  }

  if (Array.isArray(body.messages)) {
    const nextMessages: any[] = [];
    for (const msg of body.messages) {
      if (!msg || typeof msg !== "object") continue;
      if (!Array.isArray(msg.content)) {
        nextMessages.push(msg);
        continue;
      }
      const nextContent: any[] = [];
      for (const block of msg.content) {
        if (!block || typeof block !== "object") {
          nextContent.push(block);
          continue;
        }
        if (block.type === "tool_addition") {
          const toolDef = block.tool && typeof block.tool === "object" ? block.tool : block;
          const name = typeof toolDef.name === "string" ? toolDef.name.trim() : "";
          if (name && !toolsMap.has(name)) {
            toolsMap.set(name, {
              name,
              ...(toolDef.description !== undefined ? { description: toolDef.description } : {}),
              input_schema: toolDef.input_schema || { type: "object", properties: {} },
            });
          }
          continue;
        }
        if (typeof block.type === "string" && UNSUPPORTED_BETA_BLOCK_TYPES.has(block.type)) {
          continue;
        }
        nextContent.push(block);
      }
      if (nextContent.length > 0) {
        nextMessages.push({ ...msg, content: nextContent });
      }
    }
    body.messages = nextMessages;
  }

  if (toolsMap.size > 0) {
    body.tools = Array.from(toolsMap.values());
  } else if (Array.isArray(body.tools)) {
    delete body.tools;
  }

  return body;
}

export class KimiProvider extends AnthropicCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "claude";

  public override transformRequestBody(context: ProviderRequestContext): any {
    const body = super.transformRequestBody(context);
    const targetFormat = context.targetFormat || this.defaultFormat;
    if (targetFormat === "claude") {
      return sanitizeKimiClaudeBody(body);
    }
    return body;
  }

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getKimiUsage(
      context.account.rawApiKey,
      context.account.rawApiKey,
      context.account.providerSpecificData
    );
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const raw = (context.account?.rawApiKey || "").trim();
    let token = raw;
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        token = parsed.accessToken || parsed.access_token || token;
      } catch {}
    }

    const headers = await super.buildHeaders(context);
    const psd = (context.account?.providerSpecificData || {}) as any;
    if (psd.deviceId) {
      headers["X-Msh-Device-Id"] = psd.deviceId;
    }
    headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const raw = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!raw) {
      return {
        success: false,
        error: "Kimi for Coding OAuth token is required.",
      };
    }

    let token = raw;
    const psd = (context.account?.providerSpecificData || context.providerSpecificData || {}) as any;
    const deviceId: string | undefined = psd?.deviceId;
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        token = parsed.accessToken || parsed.access_token || token;
      } catch {}
    }

    const timeoutMs = context.timeoutMs || 8000;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(deviceId ? { "X-Msh-Device-Id": deviceId } : {}),
      ...(context.customHeaders || {}),
    };

    try {
      const res = await fetch("https://api.kimi.com/coding/v1/usages", {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: "https://api.kimi.com/coding/v1",
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid or expired Kimi for Coding subscription token`,
          authError: "Invalid or expired Kimi for Coding subscription token",
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        success: false,
        error: `Endpoint returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Kimi: ${msg}`,
      };
    }
  }
}

export default KimiProvider;
