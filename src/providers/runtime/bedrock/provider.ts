import { BaseProvider } from "../../core/base/baseProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { buildSignedBedrockHeaders } from "./adapter.js";
import { resolveTargetEffortFromContext, stripModelEffortSuffix } from "../../../core/thinking/effortResolver.js";

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
    const cleanModel = stripModelEffortSuffix(context.targetModel).model || context.targetModel;
    return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(cleanModel)}/${action}`;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    let body = context.body;
    if (body?.anthropic_version === "bedrock-2023-05-31") {
      return body;
    }
    const effortRes = resolveTargetEffortFromContext({
      providerId: context.provider?.id || this.id,
      targetModel: context.targetModel,
      targetEffort: context.targetEffort,
      clientEffort: context.clientEffort,
      body,
      providerThinkingMode: context.provider?.thinkingMode,
    });
    if (context.clientFormat === "openai" || context.clientFormat === "responses") {
      body = AnthropicAdapter.openAiToAnthropic(
        body,
        effortRes.cleanModel,
        context.provider?.id || this.id
      );
    } else {
      body = { ...body };
    }
    delete body.model;
    delete body.stream;
    delete body.reasoning_effort;
    if (effortRes.caps.thinkingFormat === "claude-adaptive" && typeof effortRes.effort === "string") {
      body.output_config = { ...(body.output_config || {}), effort: effortRes.effort };
    } else if (body.output_config && typeof body.output_config === "object" && "effort" in body.output_config) {
      const nextOc = { ...body.output_config };
      delete nextOc.effort;
      if (Object.keys(nextOc).length === 0) delete body.output_config;
      else body.output_config = nextOc;
    }
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
    const body =
      context.body?.anthropic_version === "bedrock-2023-05-31"
        ? context.body
        : this.transformRequestBody(context);

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
