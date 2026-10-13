import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import { metadata } from "./metadata.js";
import {
  isCursorApiKey,
  resolveCursorSessionToken,
  invalidateCursorSessionToken,
} from "./auth.js";

export class CursorApiProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override async buildHeaders(
    context: ProviderRequestContext
  ): Promise<Record<string, string>> {
    const rawKey = context.account?.rawApiKey || "";
    let bearerToken = rawKey;

    if (isCursorApiKey(rawKey)) {
      const session = await resolveCursorSessionToken(rawKey);
      bearerToken = session.accessToken;
    }

    const outgoingHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(context.provider?.customHeaders || {}),
    };

    this.applyAnthropicClientHeaders(outgoingHeaders, context);
    return outgoingHeaders;
  }

  public async handleAuthRefresh(
    context: ProviderRequestContext,
    status: number
  ): Promise<boolean> {
    if (status !== 401 || !context.account?.rawApiKey) {
      return false;
    }

    const rawKey = context.account.rawApiKey;
    if (!isCursorApiKey(rawKey)) {
      return false;
    }

    try {
      invalidateCursorSessionToken(rawKey);
      await resolveCursorSessionToken(rawKey);
      return true;
    } catch {
      return false;
    }
  }
}

export default CursorApiProvider;
