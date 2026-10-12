import { OpenAiCompatibleProvider } from "../base/openAiProvider.js";
import { metadata } from "./metadata.js";

export class OvhcloudProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";
}

export default OvhcloudProvider;
