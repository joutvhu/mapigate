import type {
  IProvider,
  ProviderRequestContext,
  SingleModelHandler,
  ModelCallResult,
} from "../../core/types.js";
import { handleFallbackChat } from "./fallbackStrategy.js";
import { handleFusionChat } from "./fusionStrategy.js";

export class ComboProvider implements IProvider {
  public readonly id = "combo";
  public readonly name = "Composite Combo";
  public readonly defaultFormat = "openai";
  public readonly requiresAccount = false;

  public buildUrl(_context: ProviderRequestContext): string {
    return "";
  }

  public buildHeaders(_context: ProviderRequestContext): Record<string, string> {
    return {};
  }

  public transformRequestBody(context: ProviderRequestContext): any {
    return context.body;
  }

  public supportsQuota(): boolean {
    return false;
  }

  public async execute(
    context: ProviderRequestContext,
    dispatchSingleModel: SingleModelHandler
  ): Promise<ModelCallResult> {
    const combo = context.combo;
    const models = combo?.models && combo.models.length > 0 ? combo.models : [context.targetModel];
    const strategy = combo?.strategy || "fallback";
    const comboName = combo?.name || context.targetModel;

    if (strategy === "fusion" && models.length > 1) {
      return await handleFusionChat({
        body: context.body,
        models,
        handleSingleModel: dispatchSingleModel,
        comboName,
      });
    }

    if (strategy === "round-robin") {
      return await handleFallbackChat({
        body: context.body,
        models,
        handleSingleModel: dispatchSingleModel,
        comboName,
        comboStrategy: "round-robin",
        comboStickyLimit: 1,
      });
    }

    return await handleFallbackChat({
      body: context.body,
      models,
      handleSingleModel: dispatchSingleModel,
      comboName,
      comboStrategy: "fallback",
    });
  }
}

export default ComboProvider;
