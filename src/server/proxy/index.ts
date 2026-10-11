import type { Request, Response } from "express";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { runProxyPipeline } from "./pipeline.js";
import { extractHeader, mergeAnthropicBeta } from "../../core/providers/base/baseProvider.js";

export { extractHeader, mergeAnthropicBeta };
export { executeSingleModel } from "./singleModelExecutor.js";
export { ResponseLogger } from "./responseLogger.js";
export { executeUpstreamFetch } from "./proxyDispatcher.js";
export * from "./types.js";

export async function handleProxyRequest(
  req: Request,
  res: Response,
  clientFormat: "openai" | "anthropic"
): Promise<void> {
  const endpointSettings = SettingsRepository.getEndpointSettings();
  if (endpointSettings.requireApiKey) {
    const activeKeys = SettingsRepository.getGatewayApiKeys().filter((k) => k.isActive);
    if (activeKeys.length > 0) {
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

      const isValid = activeKeys.some((k) => k.key === providedKey);
      if (!isValid) {
        res.status(401).json({
          error: {
            message: "Unauthorized: Invalid or missing gateway API key.",
            type: "authentication_error",
            code: "invalid_api_key",
          },
        });
        return;
      }
    }
  }

  await runProxyPipeline(req, res, clientFormat);
}

export const handleChatProxy = handleProxyRequest;
