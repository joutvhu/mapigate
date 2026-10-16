import { BaseProvider } from "../../core/base/baseProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import {
  OPENCODE_UA,
  OPENCODE_CLIENT,
  OPENCODE_BASE_URL,
  OPENCODE_SESSION_RE,
  isMessagesModel,
  isResponsesModel,
} from "./types.js";
import { getStableSessionId } from "./sessions.js";
import { applyFingerprintTools, restoreToolNames } from "./tools.js";

export function buildOpenCodeUrl(modelId?: string, baseUrl: string = OPENCODE_BASE_URL): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (isResponsesModel(modelId)) return `${base}/inference/v1/responses`;
  if (isMessagesModel(modelId)) return `${base}/inference/v1/messages`;
  return `${base}/inference/v1/chat/completions`;
}

export function buildOpenCodeHeaders(
  reqHeaders: Record<string, string> = {},
  sessionId?: string,
  requestId?: string,
  url?: string
): Record<string, string> {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(reqHeaders)) {
    lower[k.toLowerCase()] = v;
  }

  const downstreamUa = lower["user-agent"] || "";
  const isOpencodeDownstream =
    /opencode\/latest\/\d+\.\d+\.\d+/i.test(downstreamUa) ||
    /opencode\/(?:[2-9]|\d{2,})\.\d+/i.test(downstreamUa);

  const session =
    sessionId ||
    (lower["x-opencode-session"] && OPENCODE_SESSION_RE.test(lower["x-opencode-session"])
      ? lower["x-opencode-session"]
      : getStableSessionId("default"));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": "Bearer public",
    "User-Agent": isOpencodeDownstream ? downstreamUa : OPENCODE_UA,
    "x-opencode-client": lower["x-opencode-client"] || OPENCODE_CLIENT,
    "x-opencode-session": session,
    "x-opencode-session-id": session,
    "x-session-affinity": session,
    "x-session-id": session,
    "x-opencode-project": lower["x-opencode-project"] || "global",
    "Accept": "text/event-stream",
  };

  if (url && (url.endsWith("/messages") || url.includes("/v1/messages"))) {
    headers["anthropic-version"] = "2023-06-01";
  }

  return headers;
}

export class OpenCodeProvider extends BaseProvider {
  public readonly id = "opencode";
  public readonly name = "OpenCode Free";
  public readonly defaultFormat = "openai";
  public override readonly requiresAccount = false;

  private toolMaps = new WeakMap<object, Map<string, string>>();

  public override buildUrl(context: ProviderRequestContext): string {
    return buildOpenCodeUrl(context.targetModel, context.provider?.baseUrl);
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const url = this.buildUrl(context);
    const headers = buildOpenCodeHeaders(
      context.req.headers as Record<string, string>,
      context.account?.id,
      undefined,
      url
    );
    this.applyAnthropicClientHeaders(headers, context);
    return headers;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    const body = { ...context.body };
    body.stream = true;
    const format = context.targetFormat === "claude" ? "claude" : false;
    const toolMap = applyFingerprintTools(body, format);
    if (context.req) {
      this.toolMaps.set(context.req, toolMap);
    }
    return body;
  }

  public transformResponseChunk(chunk: any, context: ProviderRequestContext): any {
    const toolMap = context.req ? this.toolMaps.get(context.req) : undefined;
    if (toolMap) {
      return restoreToolNames(chunk, toolMap);
    }
    return chunk;
  }

  public transformResponseBody(body: any, context: ProviderRequestContext): any {
    const toolMap = context.req ? this.toolMaps.get(context.req) : undefined;
    if (toolMap) {
      return restoreToolNames(body, toolMap);
    }
    return body;
  }
}

export default OpenCodeProvider;
