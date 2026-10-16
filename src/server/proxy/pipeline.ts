import type { Request, Response } from "express";
import { stripModelContextMarker } from "../../core/router/ruleEngine.js";
import { TokenSaverCoordinator } from "../../core/tokenSaver/index.js";
import { ComboRepository } from "../../storage/repositories/comboRepo.js";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { UsageRepository } from "../../storage/repositories/usageRepo.js";
import { ProviderRegistry } from "../../providers/registry.js";
import type { ProviderRequestContext, SingleModelHandler, ModelCallResult } from "../../providers/types.js";
import {
  detectRequiredCapabilities,
  augmentModelsWithCapacityAdapter,
} from "../../core/router/capacityAdapter.js";
import { executeSingleModel } from "./singleModelExecutor.js";
import { ResponseLogger } from "./responseLogger.js";
import { logger, LogSymbol, tagForSession } from "../../shared/logger.js";
import { AnthropicAdapter } from "../../core/adapters/anthropicAdapter.js";
import { convertOpenAiResponseToResponsesApi } from "../../core/adapters/responsesAdapter.js";
import { sanitizeErrorMessage } from "../../shared/utils/errorSanitizer.js";
import crypto from "node:crypto";

export async function runProxyPipeline(
  req: Request,
  res: Response,
  clientFormat: "openai" | "anthropic" | "responses"
): Promise<void> {
  const startTime = Date.now();
  const requestId = req.reqId || crypto.randomUUID();
  const reqTag = req.reqTag || tagForSession(requestId);
  req.reqId = requestId;
  req.reqTag = reqTag;

  const body = req.body || {};
  const clientTool = (req.headers["x-client-tool"] as string) || (req.headers["user-agent"] as string) || "unknown";
  const rawModel = body.model || "default";

  const { model: strippedModel, contextMarker, is1mContext } = stripModelContextMarker(body.model);
  if (contextMarker && strippedModel) {
    body.model = strippedModel;
  }
  const cleanModel = strippedModel || rawModel;

  const tokenSaverSettings = SettingsRepository.getTokenSaverSettings();
  const tokenSaverSummary = TokenSaverCoordinator.process(
    body,
    {
      clientFormat,
      targetFormat: clientFormat === "anthropic" ? "claude" : "openai",
      model: cleanModel,
      clientTool,
    },
    tokenSaverSettings
  );

  const rtkStats = {
    originalTokens: tokenSaverSummary.originalTokens,
    compressedTokens: tokenSaverSummary.compressedTokens,
    tokensSaved: tokenSaverSummary.tokensSaved,
  };

  if (tokenSaverSummary.tokensSaved > 0) {
    const orig =
      tokenSaverSummary.originalTokens ||
      tokenSaverSummary.compressedTokens + tokenSaverSummary.tokensSaved;
    const pct = orig > 0 ? Math.round((tokenSaverSummary.tokensSaved / orig) * 100) : 0;
    logger.line(reqTag, LogSymbol.SAVER, `TOKEN SAVER: saved ${tokenSaverSummary.tokensSaved} tokens (-${pct}%)`);
  }

  for (const r of tokenSaverSummary.results) {
    if (r.applied && (r.methodId === "caveman" || r.methodId === "ponytail")) {
      logger.line(
        reqTag,
        LogSymbol.SAVER,
        `TOKEN SAVER: injected [${r.methodId.toUpperCase()}] prompt (level: ${r.details?.level || "default"})`
      );
    }
  }

  const allCombos = ComboRepository.getAllCombos();
  const comboLookup = cleanModel.startsWith("combo/") ? cleanModel.slice(6) : cleanModel;
  const isComboCandidate = !cleanModel.includes("/") || cleanModel.startsWith("combo/");
  const activeCombo = isComboCandidate
    ? allCombos.find(
        (c) =>
          c.isActive &&
          (c.name.toLowerCase() === comboLookup.toLowerCase() || c.id.toLowerCase() === comboLookup.toLowerCase())
      )
    : undefined;

  let candidateModels: string[];
  let comboName = "";

  if (activeCombo && activeCombo.models.length > 0) {
    candidateModels = [...activeCombo.models];
    comboName = activeCombo.name;
    logger.line(
      reqTag,
      LogSymbol.COMBO,
      `COMBO "${comboName}" (${activeCombo.strategy}) · candidates: [${candidateModels.join(", ")}]`
    );
  } else {
    candidateModels = [cleanModel];
  }

  const requiredCaps = detectRequiredCapabilities(body);
  if (requiredCaps.size > 0) {
    const adapterSettings = SettingsRepository.getCapacityAdapterSettings();
    candidateModels = augmentModelsWithCapacityAdapter(candidateModels, requiredCaps, adapterSettings);
    logger.line(
      reqTag,
      LogSymbol.COMBO,
      `CAPACITY ADAPTER: required [${[...requiredCaps].join(", ")}] · models: [${candidateModels.join(", ")}]`
    );
  }

  UsageRepository.startPendingRequest({
    id: requestId,
    model: rawModel,
    provider: comboName ? "combo" : (candidateModels[0]?.split("/")[0] || "unknown"),
  });

  if (typeof res?.on === "function") {
    res.on("close", () => {
      UsageRepository.endPendingRequest(requestId);
    });
  }

  const handleSingleModel: SingleModelHandler = async (modelBody, modelStr, isPanel = false) => {
    return executeSingleModel({
      req,
      res,
      body: modelBody,
      modelStr,
      clientFormat,
      isPanel,
      requestId,
      startTime,
      clientTool,
      rawModel,
      rtkStats,
      is1mContext,
      reqTag,
    });
  };

  const context: ProviderRequestContext = {
    req,
    res,
    targetModel: comboName ? comboName : cleanModel,
    clientFormat,
    targetFormat: clientFormat === "anthropic" ? "claude" : "openai",
    body,
    combo: activeCombo ? { ...activeCombo, models: candidateModels } : undefined,
    is1mContext,
    reqTag,
    requestId,
    startTime,
    clientTool,
    rawModel,
    rtkStats,
  };

  try {
    let result: ModelCallResult;

    if (activeCombo) {
      const comboProvider = ProviderRegistry.get("combo");
      if (comboProvider.execute) {
        result = await comboProvider.execute(context, handleSingleModel);
      } else {
        result = await handleSingleModel(body, candidateModels[0] || cleanModel, false);
      }
    } else {
      result = await handleSingleModel(body, cleanModel, false);
    }

    if (result.ok && !res.headersSent) {
      let respData = result.json || result.text;
      if (respData !== undefined) {
        if (typeof respData === "object") {
          if (clientFormat === "responses") {
            respData = convertOpenAiResponseToResponsesApi(respData);
          } else if (clientFormat === "anthropic") {
            respData = AnthropicAdapter.openAiResponseToAnthropic(respData, requestId);
          }
          res.status(result.status || 200).json(respData);
        } else {
          res.status(result.status || 200).send(respData);
        }
      }
    }

    if (!result.ok && !res.headersSent) {
      const durationMs = Date.now() - startTime;
      const status = result.status || 503;
      const rawErrMsg = result.error || "All combo models failed";
      const errMsg = sanitizeErrorMessage(rawErrMsg);

      logger.errorLine(
        reqTag,
        LogSymbol.ERROR,
        `REQUEST FAILED ${status} · ${comboName || candidateModels[0] || rawModel} · ${durationMs}ms\n    ${errMsg}`
      );

      UsageRepository.endPendingRequest(requestId, true);

      ResponseLogger.logFailure({
        requestId,
        startTime,
        durationMs,
        clientTool,
        rawModel,
        actualModel: candidateModels[0] || rawModel,
        providerId: comboName ? "combo" : "unknown",
        status,
        errorMessage: errMsg,
        tokensSavedByRtk: rtkStats.tokensSaved,
        is1mContext,
        requestHeaders: req.headers as Record<string, string>,
        requestBody: body,
      });

      res.status(status).json({
        error: {
          message: errMsg,
          type: status === 429 ? "rate_limit_error" : "service_unavailable",
        },
      });
    }
  } catch (err: any) {
    const totalDuration = Date.now() - startTime;
    const sanitizedMsg = sanitizeErrorMessage(err.message || "Internal server error");
    const sanitizedStack = sanitizeErrorMessage(err.stack || err.message || "Internal server error");

    logger.errorLine(
      reqTag,
      LogSymbol.ERROR,
      `REQUEST EXCEPTION · ${rawModel} · ${totalDuration}ms\n    ${sanitizedStack}`
    );
    UsageRepository.endPendingRequest(requestId, true);

    if (!res.headersSent) {
      res.status(500).json({ error: { message: sanitizedMsg } });
    } else if (!res.writableEnded) {
      res.end();
    }

    ResponseLogger.logFailure({
      requestId,
      startTime,
      durationMs: totalDuration,
      clientTool,
      rawModel,
      actualModel: rawModel,
      providerId: comboName || "unknown",
      status: 500,
      errorMessage: sanitizedMsg,
      tokensSavedByRtk: rtkStats.tokensSaved,
      is1mContext,
      requestHeaders: req.headers as Record<string, string>,
      requestBody: body,
    });
  }
}
