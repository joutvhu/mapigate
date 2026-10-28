import type { IncomingMessage, ServerResponse } from "node:http";
import type { CandidateModelItem } from "../../types.js";
import { fetchUpstreamDirect, decompressBuffer } from "../base.js";
import { toolConfig } from "./config.js";
import { resolveModelDisplayName } from "../../../core/capabilities/modelDictionary.js";
import { MitmRepository } from "../../../storage/repositories/mitmRepo.js";

export function guessCopilotVendor(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes("claude")) return "anthropic";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("gemini")) return "google";
  if (lower.includes("qwen")) return "alibaba";
  if (lower.includes("minimax")) return "minimax";
  if (lower.includes("glm")) return "zhipu";
  if (lower.includes("grok") || lower.includes("xai")) return "xai";
  if (lower.includes("kimi") || lower.includes("moonshot")) return "moonshot";
  if (lower.includes("mai")) return "microsoft";
  return "openai";
}

export function augmentCopilotModelsPayload(
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

  // Determine target array in payload (Copilot uses OpenAI-style { data: [...] })
  let targetArray: any[];
  if (Array.isArray(payload.data)) {
    targetArray = payload.data;
  } else if (Array.isArray(payload.models)) {
    targetArray = payload.models;
  } else {
    payload.data = [];
    targetArray = payload.data;
  }

  const existingIds = new Set<string>();
  let templateModel: any = null;

  for (const item of targetArray) {
    if (item && typeof item === "object") {
      const id = String(item.id || item.modelId || "").trim();
      if (id) {
        existingIds.add(id.toLowerCase());
      }
      // Unlock existing models so they appear as selectable in VS Code without requiring upgrade
      item.model_picker_enabled = true;
      if (item.billing && typeof item.billing === "object") {
        item.billing.is_premium = false;
        item.billing.restricted_to = [];
      }
      if (item.policy && typeof item.policy === "object") {
        item.policy.state = "enabled";
      }
      if (!templateModel && item.capabilities) {
        templateModel = item;
      }
    }
  }

  // Collect candidate models from tool defaults
  const candidates: CandidateModelItem[] = (toolConfig.defaultModels || []).map((id) => ({
    id,
    name: resolveModelDisplayName(id) || id,
  }));

  // Also include user-configured mappings for copilot
  try {
    const mappings = MitmRepository.getMappings("copilot");
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
      id: rawId,
      name: displayName,
      version: rawId,
      vendor: guessCopilotVendor(rawId),
      model_picker_enabled: true,
      is_chat_default: false,
      is_chat_fallback: false,
      policy: {
        ...(templateModel?.policy || {}),
        state: "enabled",
      },
      billing: {
        ...(templateModel?.billing || {}),
        is_premium: false,
        multiplier: 0,
        restricted_to: [],
      },
      capabilities: {
        ...(templateModel?.capabilities || {}),
        family: rawId,
        type: "chat",
        tokenizer: templateModel?.capabilities?.tokenizer || "o200k_base",
        limits: {
          max_prompt_tokens: 128000,
          max_output_tokens: 8192,
          max_context_window_tokens: 136192,
          ...(templateModel?.capabilities?.limits || {}),
        },
        supports: {
          tool_calls: true,
          vision: true,
          streaming: true,
          prediction: false,
          ...(templateModel?.capabilities?.supports || {}),
        },
      },
    };

    targetArray.push(injected);
  }

  return payload;
}

export async function interceptCopilotModels(
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

    const augmented = augmentCopilotModelsPayload(parsed);
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
    delete responseHeaders["etag"];
    delete responseHeaders["ETag"];
    responseHeaders["content-length"] = String(newBuffer.length);

    res.writeHead(200, responseHeaders);
    res.end(newBuffer);
  } catch (err: any) {
    console.warn("[MITM Copilot] Model augmentation failed, falling back to passthrough:", err?.message || err);
    await passthrough(req, res, bodyBuffer);
  }
}
