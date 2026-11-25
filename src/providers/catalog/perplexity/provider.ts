import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ModelCallResult, ProviderRequestContext } from "../../core/types.js";
import { buildResponsesRequestPayload } from "../../core/base/responsesPayloadBuilder.js";
import { executeResponsesUpstream } from "../../core/base/responsesExecution.js";
import { metadata } from "./metadata.js";

export class PerplexityProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  private isResponsesOrAgentUrl(context: ProviderRequestContext): boolean {
    const url = this.buildUrl(context).toLowerCase();
    return /\/(?:v1\/)?(?:agent|responses)(?:$|\?)/.test(url);
  }

  public shouldExecute(context: ProviderRequestContext): boolean {
    return this.isResponsesOrAgentUrl(context);
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    if (this.isResponsesOrAgentUrl(context)) {
      return buildResponsesRequestPayload(context, this.resolveUpstreamModelId(context), {
        omitStore: true,
        allowMaxOutputTokens: true,
        allowSamplingParams: true,
      });
    }
    return super.transformRequestBody(context);
  }

  public async execute(context: ProviderRequestContext): Promise<ModelCallResult> {
    return await executeResponsesUpstream(context, this);
  }
}

export default PerplexityProvider;
