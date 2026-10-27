import type { Request, Response } from "express";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { runProxyPipeline } from "./pipeline.js";
import { extractHeader, mergeAnthropicBeta } from "../../providers/base/baseProvider.js";

export { extractHeader, mergeAnthropicBeta };
export { executeSingleModel } from "./singleModelExecutor.js";
export { ResponseLogger } from "./responseLogger.js";
export { executeUpstreamFetch } from "./proxyDispatcher.js";
export * from "./types.js";

export async function handleProxyRequest(
  req: Request,
  res: Response,
  clientFormat: "openai" | "anthropic" | "responses"
): Promise<void> {
  const endpointSettings = SettingsRepository.getEndpointSettings();
  const allKeys = SettingsRepository.getGatewayApiKeys();

  const authHeader = (req.headers["authorization"] as string) || "";
  const apiKeyHeader = (req.headers["x-api-key"] as string) || "";
  let providedKey = "";
  if (authHeader.startsWith("Bearer ")) {
    providedKey = authHeader.substring(7).trim();
  } else if (authHeader) {
    providedKey = authHeader.trim();
  } else if (apiKeyHeader) {
    providedKey = apiKeyHeader.trim();
  }

  // Resolve client gateway API key if provided
  let matchedKey = providedKey ? allKeys.find((k) => k.key === providedKey) : undefined;

  if (endpointSettings.requireApiKey) {
    const activeKeys = allKeys.filter((k) => k.isActive);
    if (activeKeys.length === 0 || !matchedKey || !matchedKey.isActive) {
      if (clientFormat === "anthropic") {
        res.status(401).json({
          type: "error",
          error: {
            type: "authentication_error",
            message: "Unauthorized: Invalid or missing gateway API key.",
          },
        });
      } else {
        res.status(401).json({
          error: {
            message: "Unauthorized: Invalid or missing gateway API key.",
            type: "authentication_error",
            code: "invalid_api_key",
          },
        });
      }
      return;
    }
  }

  if (matchedKey) {
    (req as any).apiKeyId = matchedKey.id;
    (req as any).apiKeyName = matchedKey.name;
    SettingsRepository.recordGatewayApiKeyUsage(matchedKey.id);
  }

  await runProxyPipeline(req, res, clientFormat);
}

export const handleChatProxy = handleProxyRequest;
