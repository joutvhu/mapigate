import { AnthropicCompatibleProvider } from "../../core/base/anthropicProvider.js";
import { metadata } from "./metadata.js";

export class KimiProvider extends AnthropicCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "claude";
}

export default KimiProvider;
