import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { metadata } from "./metadata.js";
import { getCodeBuddyCnUsage } from "./quota.js";

const NEUTRAL_PROMPT = "You are a helpful AI assistant that helps with software engineering tasks.";
const AGENT_PATTERN =
  /you are claude code|claude.?code.+official.+cli|anthropic.+official.+cli|anxthxropic.+official.+cli|you are (?:cursor|windsurf|cline|aider|continue|copilot|cody)|you are an? (?:ai )?(?:coding |code )?agent|cc_entrypoint\s*=\s*(?:cli|vscode|jetbrains|gui)|claude.?code.+issues|give feedback.+claude.?code|you are .{0,30}(?:powerful )?ai agent|orchestration capabilities|OhMyOpenCode|<agent-identity>|<Role>|<Behavior_Instructions>/i;

function flattenContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((b: any) => (b && typeof b.text === "string" ? b.text : "")).join("\n");
  }
  return "";
}

export class CodebuddyCnProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getCodeBuddyCnUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    const transformed = { ...(context.body || {}) };
    transformed.stream = true;

    if (Array.isArray(transformed.messages)) {
      transformed.messages = transformed.messages.map((message: any) => {
        if (!message || message.role !== "system") return message;
        const text = flattenContent(message.content);
        if (!text) return message;
        if (text.length > 2000 || AGENT_PATTERN.test(text)) {
          return typeof message.content === "string"
            ? { ...message, content: NEUTRAL_PROMPT }
            : { ...message, content: [{ type: "text", text: NEUTRAL_PROMPT }] };
        }
        return message;
      });
    }

    const eff = transformed.reasoning_effort;
    if (eff === "none" || eff === "off") {
      delete transformed.reasoning_effort;
    } else if (eff) {
      transformed.reasoning_summary = "auto";
    }

    return transformed;
  }

  public override isRateLimitOrQuotaError(status: number, errorText?: string): boolean {
    if (status === 429) return true;
    if (errorText) {
      if (/超出频率限制|frequency limit|限额/i.test(errorText) || errorText.includes("6004")) {
        return true;
      }
    }
    return super.isRateLimitOrQuotaError(status, errorText);
  }
}

export default CodebuddyCnProvider;
