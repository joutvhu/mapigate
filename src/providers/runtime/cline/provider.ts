import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import { metadata } from "./metadata.js";

export function getClineAccessToken(token: string): string {
  if (typeof token !== "string") return "";
  const trimmed = token.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase().startsWith("workos:")) return trimmed;
  const isWorkOsJwt = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(trimmed);
  return isWorkOsJwt ? `workos:${trimmed}` : trimmed;
}

export class ClineProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const rawApiKey = context.account?.rawApiKey || "";
    if (rawApiKey) {
      const accessToken = getClineAccessToken(rawApiKey);
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }
    }
    headers["X-Title"] = "Cline";
    headers["HTTP-Referer"] = "https://cline.bot";
    return headers;
  }
}

export default ClineProvider;
