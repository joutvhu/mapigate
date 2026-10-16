import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import { metadata } from "./metadata.js";
import type { ProviderRequestContext } from "../../core/types.js";

export class XiaomiTokenplanProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const region = psd.region || "sgp";
    return `https://token-plan-${region}.xiaomimimo.com/v1/chat/completions`;
  }
}

export default XiaomiTokenplanProvider;
