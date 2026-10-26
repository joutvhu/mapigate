import { LogRepository } from "../../storage/repositories/logRepo.js";
import { RequestDetailsRepository } from "../../storage/repositories/requestDetailsRepo.js";
import { UsageRepository } from "../../storage/repositories/usageRepo.js";
import { calculateCostFromTokens } from "../../core/usage/pricing.js";
import { appendStructuredLog } from "../utils/consoleLogBuffer.js";

export interface LogSuccessOptions {
  requestId: string;
  startTime: number;
  durationMs: number;
  clientTool: string;
  rawModel: string;
  targetModel: string;
  providerId: string;
  accountId?: string;
  accountName?: string;
  apiKeyId?: string;
  apiKeyName?: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  tokensSavedByRtk: number;
  ttftMs?: number;
  is1mContext?: boolean;
  requestHeaders: Record<string, string>;
  requestBody: any;
  providerRequest?: { url: string; headers: Record<string, string>; body: any };
  providerResponse?: { status: number; headers: Record<string, string>; body?: any };
  clientResponse?: { status: number; headers: Record<string, string>; body: any };
}

export interface LogFailureOptions {
  requestId: string;
  startTime: number;
  durationMs: number;
  clientTool: string;
  rawModel: string;
  actualModel: string;
  providerId: string;
  apiKeyId?: string;
  apiKeyName?: string;
  status: number;
  errorMessage: string;
  tokensSavedByRtk: number;
  is1mContext?: boolean;
  requestHeaders: Record<string, string>;
  requestBody: any;
}

export class ResponseLogger {
  public static logSuccess(options: LogSuccessOptions): number {
    const {
      requestId,
      startTime,
      durationMs,
      clientTool,
      rawModel,
      targetModel,
      providerId,
      accountId,
      accountName,
      apiKeyId,
      apiKeyName,
      promptTokens,
      completionTokens,
      cachedTokens,
      cacheCreationTokens,
      reasoningTokens,
      tokensSavedByRtk,
      ttftMs,
      is1mContext,
      requestHeaders,
      requestBody,
      providerRequest,
      providerResponse,
      clientResponse,
    } = options;

    const calculatedCost = calculateCostFromTokens(
      {
        promptTokens,
        completionTokens,
        cachedTokens,
        cacheCreationTokens,
        reasoningTokens,
      },
      targetModel,
      providerId
    );

    LogRepository.saveLog({
      id: requestId,
      timestamp: startTime,
      clientTool,
      requestedModel: rawModel,
      actualModel: targetModel,
      providerId,
      promptTokens,
      completionTokens,
      tokensSavedByRtk,
      cachedTokens,
      cacheCreationTokens,
      cost: calculatedCost,
      accountId,
      accountName,
      apiKeyId,
      apiKeyName,
      durationMs,
      status: "success",
    });

    RequestDetailsRepository.saveRequestDetail({
      id: requestId,
      timestamp: new Date(startTime).toISOString(),
      provider: providerId,
      model: targetModel,
      connectionId: accountId,
      accountName,
      clientTool,
      status: 200,
      is1mContext,
      latency: { totalMs: durationMs, ttftMs: ttftMs ?? durationMs },
      tokens: {
        promptTokens,
        completionTokens,
        cachedTokens,
        cacheCreationTokens,
        tokensSavedByRtk,
      },
      cost: calculatedCost,
      request: { headers: requestHeaders, body: requestBody },
      providerRequest,
      providerResponse,
      response: clientResponse || {
        status: 200,
        headers: {},
        body: {},
      },
    });

    UsageRepository.endPendingRequest(requestId);

    return calculatedCost;
  }

  public static logFailure(options: LogFailureOptions): void {
    const {
      requestId,
      startTime,
      durationMs,
      clientTool,
      rawModel,
      actualModel,
      providerId,
      status,
      errorMessage,
      tokensSavedByRtk,
      is1mContext,
      apiKeyId,
      apiKeyName,
      requestHeaders,
      requestBody,
    } = options;

    LogRepository.saveLog({
      id: requestId,
      timestamp: startTime,
      clientTool,
      requestedModel: rawModel,
      actualModel,
      providerId,
      promptTokens: 0,
      completionTokens: 0,
      tokensSavedByRtk,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      cost: 0,
      apiKeyId,
      apiKeyName,
      durationMs,
      status: status === 429 ? "rate_limited" : "error",
      errorMessage: errorMessage.slice(0, 500),
    });

    RequestDetailsRepository.saveRequestDetail({
      id: requestId,
      timestamp: new Date(startTime).toISOString(),
      provider: providerId,
      model: rawModel,
      clientTool,
      status,
      is1mContext,
      latency: { totalMs: durationMs },
      tokens: {
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        tokensSavedByRtk,
      },
      cost: 0,
      request: { headers: requestHeaders, body: requestBody },
      errorMessage: errorMessage.slice(0, 500),
    });

    appendStructuredLog({
      id: requestId,
      timestamp: startTime,
      level: status === 429 ? "warn" : "error",
      category: "proxy",
      message: `${clientTool || "client"} · ${actualModel || rawModel} -> ${status} (${errorMessage.slice(0, 100)})`,
      requestId,
      gateway: {
        clientTool,
        requestedModel: rawModel,
        actualModel,
        providerId,
        statusCode: status,
        durationMs,
        stage: "error",
      },
      error: {
        status,
        message: errorMessage,
      },
      rawText: `[ERROR] ${status} ${errorMessage}`,
    });

    UsageRepository.endPendingRequest(requestId, true, providerId);
  }
}
