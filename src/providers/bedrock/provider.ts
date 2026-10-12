import { BaseProvider } from "../base/baseProvider.js";
import type { ProviderRequestContext } from "../types.js";
import { AnthropicAdapter } from "../../core/adapters/anthropicAdapter.js";
import { buildSignedBedrockHeaders } from "./adapter.js";

export class BedrockProvider extends BaseProvider {
  public readonly id = "bedrock";
  public readonly name = "AWS Bedrock";
  public readonly defaultFormat = "claude";
  public override readonly requiresAccount = false;
  public override readonly streamType = "eventstream" as const;

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const region = psd.region || "us-east-1";
    const isStreaming = context.body?.stream !== false && !context.isPanel;
    const action = isStreaming ? "invoke-with-response-stream" : "invoke";
    return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(context.targetModel)}/${action}`;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    let body = context.body;
    if (context.clientFormat === "openai") {
      body = AnthropicAdapter.openAiToAnthropic(body);
    } else {
      body = { ...body };
    }
    delete body.model;
    delete body.stream;
    body.anthropic_version = "bedrock-2023-05-31";
    return body;
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const baseHeaders = await super.buildHeaders(context);
    const url = this.buildUrl(context);
    const psd = context.account?.providerSpecificData || {};
    const region = psd.region || "us-east-1";
    const bearerToken = context.account?.rawApiKey || "";
    const isStreaming = context.body?.stream !== false && !context.isPanel;
    const body = this.transformRequestBody(context);

    return buildSignedBedrockHeaders({
      url,
      region,
      accessKeyId: psd.accessKeyId || "",
      secretAccessKey: bearerToken,
      sessionToken: psd.sessionToken,
      headers: baseHeaders,
      body,
      isStreaming,
    });
  }
}

export default BedrockProvider;
