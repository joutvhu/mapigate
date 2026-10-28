import type { IncomingMessage, ServerResponse } from "node:http";
import type { CandidateModelItem } from "../../types.js";
import { fetchUpstreamDirect, decompressBuffer } from "../base.js";
import { toolConfig } from "./config.js";
import { resolveModelDisplayName } from "../../../core/capabilities/modelDictionary.js";
import { MitmRepository } from "../../../storage/repositories/mitmRepo.js";

export { decompressBuffer };

function getAutoOrDefaultRank(item: any, defaultModelId?: string): number {
  if (!item || typeof item !== "object") return 99;
  const id = String(item.modelId || item.id || "").trim().toLowerCase();
  const name = String(item.modelName || item.name || "").trim().toLowerCase();

  // Tier 0: Pure Auto
  if (id === "auto" || name === "auto") {
    return 0;
  }

  // Tier 1: Auto aliases / variants
  if (
    id === "kiro-auto" ||
    id.startsWith("auto-") ||
    id.startsWith("auto ") ||
    id.startsWith("auto(") ||
    name.startsWith("auto ") ||
    name.startsWith("auto-") ||
    name.startsWith("auto(")
  ) {
    return 1;
  }

  // Tier 2: Explicit default model or isDefault
  if (
    item.isDefault === true ||
    id === "default" ||
    name === "default" ||
    (defaultModelId && id && id === defaultModelId.toLowerCase())
  ) {
    return 2;
  }

  // Tier 3: Standard models
  return 3;
}

function getModelSortKey(item: any): string {
  if (!item || typeof item !== "object") return "";
  const name = String(item.modelName || item.name || "").trim();
  if (name) return name;
  const id = String(item.modelId || item.id || "").trim();
  return id;
}

export function sortKiroModels(targetArray: any[], defaultModelId?: string): void {
  targetArray.sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    const rankA = getAutoOrDefaultRank(a, defaultModelId);
    const rankB = getAutoOrDefaultRank(b, defaultModelId);

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    const keyA = getModelSortKey(a);
    const keyB = getModelSortKey(b);
    const comp = keyA.localeCompare(keyB, undefined, { sensitivity: "base", numeric: true });
    if (comp !== 0) {
      return comp;
    }

    const idA = String(a.modelId || a.id || "");
    const idB = String(b.modelId || b.id || "");
    return idA.localeCompare(idB, undefined, { sensitivity: "base", numeric: true });
  });
}

export function augmentKiroModelsPayload(
  payload: any,
  additionalCandidates?: CandidateModelItem[]
): any {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  // Preserve exceptions or error bodies unmodified (Fail-open)
  if (payload.__type?.includes("Exception") || payload.Output?.__type?.includes("Exception")) {
    return payload;
  }

  // Determine target array in payload
  let targetArray: any[];
  if (Array.isArray(payload.models)) {
    targetArray = payload.models;
  } else if (Array.isArray(payload.modelSummaries)) {
    targetArray = payload.modelSummaries;
  } else {
    payload.models = [];
    targetArray = payload.models;
  }

  const existingIds = new Set<string>();
  let templateModel: any = null;

  for (const item of targetArray) {
    if (item && typeof item === "object") {
      const id = String(item.modelId || item.id || "").trim();
      if (id) {
        existingIds.add(id.toLowerCase());
      }
      if (!templateModel && (item.capabilities || item.origin)) {
        templateModel = item;
      }
    }
  }

  // Collect candidate models from tool defaults
  const candidates: CandidateModelItem[] = (toolConfig.defaultModels || []).map((id) => ({
    id,
    name: resolveModelDisplayName(id) || id,
  }));

  // Also include any user-configured mappings for kiro
  try {
    const mappings = MitmRepository.getMappings("kiro");
    for (const m of mappings) {
      if (m.sourceModel && !candidates.some((c) => c.id.toLowerCase() === m.sourceModel.toLowerCase())) {
        candidates.push({
          id: m.sourceModel,
          name: resolveModelDisplayName(m.sourceModel) || m.sourceModel,
        });
      }
    }
  } catch {
    // In isolated test runner where database might not be initialized
  }

  if (additionalCandidates && Array.isArray(additionalCandidates)) {
    for (const add of additionalCandidates) {
      if (add.id && !candidates.some((c) => c.id.toLowerCase() === add.id.toLowerCase())) {
        candidates.push(add);
      }
    }
  }

  for (const cand of candidates) {
    const rawId = cand.id.trim();
    if (!rawId || existingIds.has(rawId.toLowerCase())) {
      continue;
    }

    existingIds.add(rawId.toLowerCase());
    const displayName = cand.name || resolveModelDisplayName(rawId) || rawId;

    const injected: any = {
      ...(templateModel ? { ...templateModel } : {}),
      modelId: rawId,
      modelName: displayName,
      description: displayName,
      modelProvider: templateModel?.modelProvider || "Anthropic",
      status: "ACTIVE",
      origin: templateModel?.origin || "AI_EDITOR",
      rateMultiplier: templateModel?.rateMultiplier ?? 1,
      rateUnit: templateModel?.rateUnit ?? "Credit",
      tokenLimits: templateModel?.tokenLimits || { maxInputTokens: 200000 },
      capabilities: {
        ...(templateModel?.capabilities || {}),
        chat: true,
        codeGeneration: true,
      },
      isDefault: false,
    };

    targetArray.push(injected);
  }

  const defaultModelId = String(payload.defaultModel?.modelId || payload.defaultModel?.id || "");

  // Sort models: Auto/default first, all other models alphabetically (including genuine models)
  sortKiroModels(targetArray, defaultModelId);

  if (!payload.defaultModel && targetArray.length > 0) {
    const firstId = targetArray[0].modelId || targetArray[0].id;
    if (firstId) {
      payload.defaultModel = { modelId: firstId };
    }
  }

  return payload;
}

export async function interceptKiroModels(
  req: IncomingMessage,
  res: ServerResponse,
  bodyBuffer: Buffer,
  passthrough: (req: IncomingMessage, res: ServerResponse, buffer: Buffer) => Promise<void>
): Promise<void> {
  try {
    const upstreamRes = await fetchUpstreamDirect(req, bodyBuffer);

    if (upstreamRes.statusCode !== 200) {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      res.end(upstreamRes.body);
      return;
    }

    const encoding = upstreamRes.headers["content-encoding"];
    const decompressed = decompressBuffer(upstreamRes.body, encoding);
    const jsonStr = decompressed.toString("utf-8");
    const parsed = JSON.parse(jsonStr);

    const augmented = augmentKiroModelsPayload(parsed);
    const newBodyStr = JSON.stringify(augmented);
    const newBuffer = Buffer.from(newBodyStr, "utf-8");

    const responseHeaders: Record<string, string | string[] | undefined> = {
      ...upstreamRes.headers,
      "content-type": "application/json; charset=utf-8",
      "content-length": String(newBuffer.length),
    };
    delete responseHeaders["content-encoding"];
    delete responseHeaders["Content-Encoding"];
    delete responseHeaders["transfer-encoding"];
    delete responseHeaders["Transfer-Encoding"];
    responseHeaders["content-length"] = String(newBuffer.length);

    res.writeHead(200, responseHeaders);
    res.end(newBuffer);
  } catch (err: any) {
    console.warn("[MITM Kiro] Model augmentation failed, falling back to passthrough:", err?.message || err);
    await passthrough(req, res, bodyBuffer);
  }
}
