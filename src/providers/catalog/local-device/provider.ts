import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import { metadata } from "./metadata.js";

export class LocalDeviceProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";
  public override readonly requiresApiKey = false;
  public override readonly isLocal = true;
}

export default LocalDeviceProvider;
