import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";

export class OpenAiProvider extends OpenAiCompatibleProvider {
  public override readonly id = "openai";
  public override readonly name = "OpenAI";
  public override readonly defaultFormat = "openai";
}

export default OpenAiProvider;
