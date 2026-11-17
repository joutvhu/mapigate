import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import { metadata } from "./metadata.js";

export class BaiduProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override transformRequestBody(context: ProviderRequestContext): any {
    const body = super.transformRequestBody(context);
    if (body && typeof body === "object" && "thinking" in body) {
      const next = { ...body };
      delete next.thinking;
      return next;
    }
    return body;
  }
}

export default BaiduProvider;
