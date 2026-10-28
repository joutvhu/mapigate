import type { IncomingMessage, ServerResponse } from "node:http";
import type { CandidateModelItem } from "../../types.js";
import { fetchUpstreamDirect, decompressBuffer } from "../base.js";
import { toolConfig } from "./config.js";
import { resolveModelDisplayName } from "../../../core/capabilities/modelDictionary.js";
import { MitmRepository } from "../../../storage/repositories/mitmRepo.js";

export function augmentAntigravityModelsPayload(
  payload: any,
  additionalCandidates?: CandidateModelItem[]
): any {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  // Preserve error bodies unmodified (Fail-open)
  if (payload.error) {
    return payload;
  }

  // Antigravity models response structure:
  // {
  //   models: { [modelId]: ModelDetails },
  //   defaultAgentModelId: string,
  //   agentModelSorts: [ { displayName: string, groups: [ { displayName: string, modelIds: string[] } ] } ]
  // }
  if (!payload.models || typeof payload.models !== "object" || Array.isArray(payload.models)) {
    payload.models = {};
  }

  const existingModelKeys = new Set(Object.keys(payload.models).map((k) => k.toLowerCase()));
  const sampleTemplate =
    (Object.values(payload.models).find((m: any) => m && !m.unavailableReason && !m.unavailable_reason) as any) ||
    (Object.values(payload.models)[0] as any) ||
    null;

  // Clean deprecated models map if present
  if (payload.deprecatedModelIds && typeof payload.deprecatedModelIds === "object") {
    for (const key of Object.keys(payload.deprecatedModelIds)) {
      if (/argon|claude|gemini/i.test(key)) {
        delete payload.deprecatedModelIds[key];
      }
    }
  }
  if (payload.deprecated_model_ids && typeof payload.deprecated_model_ids === "object") {
    for (const key of Object.keys(payload.deprecated_model_ids)) {
      if (/argon|claude|gemini/i.test(key)) {
        delete payload.deprecated_model_ids[key];
      }
    }
  }

  // Collect candidate models from tool defaults
  const candidates: CandidateModelItem[] = (toolConfig.defaultModels || []).map((id) => ({
    id,
    name: resolveModelDisplayName(id) || id,
  }));

  // Also include user-configured mappings for antigravity
  try {
    const mappings = MitmRepository.getMappings("antigravity");
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

  // Ensure agentModelSorts exists
  const sortsKey =
    payload.agentModelSorts !== undefined
      ? "agentModelSorts"
      : payload.agent_model_sorts !== undefined
      ? "agent_model_sorts"
      : "agentModelSorts";

  if (!Array.isArray(payload[sortsKey])) {
    payload[sortsKey] = [
      {
        displayName: "Recommended",
        groups: [
          { displayName: "Gemini", modelIds: [] },
          { displayName: "Claude", modelIds: [] },
          { displayName: "Mapigate Models", modelIds: [] },
        ],
      },
    ];
  }

  const primarySort = payload[sortsKey][0] || {};
  if (!primarySort.groups || !Array.isArray(primarySort.groups)) {
    primarySort.groups = [];
  }

  // Group helpers
  let geminiGroup = primarySort.groups.find((g: any) =>
    /gemini/i.test(g.displayName || g.display_name || "")
  );
  let claudeGroup = primarySort.groups.find((g: any) =>
    /claude/i.test(g.displayName || g.display_name || "")
  );
  let mapigateGroup = primarySort.groups.find((g: any) =>
    /mapigate|custom/i.test(g.displayName || g.display_name || "")
  );

  if (!mapigateGroup) {
    mapigateGroup = { displayName: "Mapigate Models", modelIds: [] };
    primarySort.groups.push(mapigateGroup);
  }

  for (const cand of candidates) {
    const rawId = cand.id.trim();
    if (!rawId) continue;
    const lowerId = rawId.toLowerCase();
    const displayName = cand.name || resolveModelDisplayName(rawId) || rawId;

    // 1. Inject into payload.models if not already present, or clean unavailable flags if already present
    if (!existingModelKeys.has(lowerId)) {
      existingModelKeys.add(lowerId);
      payload.models[rawId] = {
        ...(sampleTemplate ? { ...sampleTemplate } : {}),
        model: rawId,
        displayName,
        disabled: false,
        preview: false,
        supportsImages: true,
        supportsAdaptiveThinking: true,
      };
      delete payload.models[rawId].tagTitle;
      delete payload.models[rawId].tagDescription;
      delete payload.models[rawId].unavailableReason;
      delete payload.models[rawId].unavailable_reason;
      delete payload.models[rawId].disabledReason;
      delete payload.models[rawId].disabled_reason;
    } else {
      // Find matching key in payload.models
      const matchKey = Object.keys(payload.models).find((k) => k.toLowerCase() === lowerId) || rawId;
      if (payload.models[matchKey] && typeof payload.models[matchKey] === "object") {
        payload.models[matchKey].model = payload.models[matchKey].model || matchKey;
        payload.models[matchKey].displayName = payload.models[matchKey].displayName || displayName;
        payload.models[matchKey].disabled = false;
        payload.models[matchKey].preview = false;
        payload.models[matchKey].supportsAdaptiveThinking = true;
        delete payload.models[matchKey].tagTitle;
        delete payload.models[matchKey].tagDescription;
        delete payload.models[matchKey].unavailableReason;
        delete payload.models[matchKey].unavailable_reason;
        delete payload.models[matchKey].disabledReason;
        delete payload.models[matchKey].disabled_reason;
      }
    }

    // 2. Ensure model ID is present in agentModelSorts so Antigravity UI renders it in dropdown
    const targetGroup = lowerId.includes("claude")
      ? claudeGroup || mapigateGroup
      : lowerId.includes("gemini")
      ? geminiGroup || mapigateGroup
      : mapigateGroup;

    const modelIdsKey =
      targetGroup.modelIds !== undefined
        ? "modelIds"
        : targetGroup.model_ids !== undefined
        ? "model_ids"
        : "modelIds";

    if (!Array.isArray(targetGroup[modelIdsKey])) {
      targetGroup[modelIdsKey] = [];
    }

    const hasInGroup = targetGroup[modelIdsKey].some(
      (m: string) => String(m).toLowerCase() === lowerId
    );
    if (!hasInGroup) {
      targetGroup[modelIdsKey].push(rawId);
    }
  }

  // Also ensure no model in payload.models remains marked as disabled or unavailable
  for (const [, modelObj] of Object.entries(payload.models as Record<string, any>)) {
    if (modelObj && typeof modelObj === "object") {
      modelObj.disabled = false;
      if (/unavailable/i.test(modelObj.tagTitle || "") || /unavailable/i.test(modelObj.tagDescription || "")) {
        delete modelObj.tagTitle;
        delete modelObj.tagDescription;
      }
      delete modelObj.unavailableReason;
      delete modelObj.unavailable_reason;
      delete modelObj.disabledReason;
      delete modelObj.disabled_reason;
    }
  }

  // Ensure defaultAgentModelId is set
  const defaultKey =
    payload.defaultAgentModelId !== undefined
      ? "defaultAgentModelId"
      : payload.default_agent_model_id !== undefined
      ? "default_agent_model_id"
      : "defaultAgentModelId";

  if (!payload[defaultKey] && Object.keys(payload.models).length > 0) {
    payload[defaultKey] = Object.keys(payload.models)[0];
  }

  return payload;
}

export async function interceptAntigravityModels(
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

    const augmented = augmentAntigravityModelsPayload(parsed);
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
    console.warn(
      "[MITM Antigravity] Model augmentation failed, falling back to passthrough:",
      err?.message || err
    );
    await passthrough(req, res, bodyBuffer);
  }
}
