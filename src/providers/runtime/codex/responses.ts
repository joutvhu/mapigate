import type { IProvider, ModelCallResult, ProviderRequestContext } from "../../core/types.js";
import { executeResponsesUpstream } from "../../core/base/responsesExecution.js";

export async function executeCodexResponses(
  context: ProviderRequestContext,
  provider: IProvider
): Promise<ModelCallResult> {
  return await executeResponsesUpstream(context, provider);
}
