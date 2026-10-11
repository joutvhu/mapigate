import type { Request, Response } from "express";
import { stripModelContextMarker } from "../../core/router/ruleEngine.js";
import { RtkCompressor } from "../../core/rtk/compressor.js";
import { ComboRepository } from "../../storage/repositories/comboRepo.js";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { UsageRepository } from "../../storage/repositories/usageRepo.js";
import { ProviderRegistry } from "../../core/providers/registry.js";
import type { ProviderRequestContext, SingleModelHandler, ModelCallResult } from "../../core/providers/types.js";
import {
  detectRequiredCapabilities,
  augmentModelsWithCapacityAdapter,
} from "../../core/router/capacityAdapter.js";
import { executeSingleModel } from "./singleModelExecutor.js";
import { ResponseLogger } from "./responseLogger.js";
import { logger, LogSymbol, tagForSession } from "../../shared/logger.js";
import crypto from "node:crypto";

export async function runProxyPipeline(
  req: Request,
  res: Response,
  clientFormat: "openai" | "anthropic"
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

  const rtkStats = RtkCompressor.compressPayloadInPlace(body);
  if (rtkStats.tokensSaved > 0) {
    const orig = rtkStats.originalTokens || (rtkStats.compressedTokens + rtkStats.tokensSaved);
    const pct = orig > 0 ? Math.round((rtkStats.tokensSaved / orig) * 100) : 0;
    logger.line(reqTag, LogSymbol.SAVER, `RTK: saved ${rtkStats.tokensSaved} tokens (-${pct}%)`);
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

    if (!result.ok && !res.headersSent) {
      const durationMs = Date.now() - startTime;
      const status = result.status || 503;
      const errMsg = result.error || "All combo models failed";

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
    logger.errorLine(
      reqTag,
      LogSymbol.ERROR,
      `REQUEST EXCEPTION · ${rawModel} · ${totalDuration}ms\n    ${err.stack || err.message}`
    );
    UsageRepository.endPendingRequest(requestId, true);

    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message || "Internal server error" } });
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
      errorMessage: err.message || "Internal server error",
      tokensSavedByRtk: rtkStats.tokensSaved,
      is1mContext,
      requestHeaders: req.headers as Record<string, string>,
      requestBody: body,
    });
  }
}
