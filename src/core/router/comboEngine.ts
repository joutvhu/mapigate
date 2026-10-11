/**
 * 3-Strategy Combo Routing Engine
 *
 * Implements Fallback, Round-Robin (with sticky usage count),
 * and Fusion (parallel fan-out to panel + Judge Model synthesis).
 */

import { getCapabilitiesForModel } from "../capabilities/index.js";
import { HARD_CAPS, detectRequiredCapabilities } from "./capacityAdapter.js";
import { logger } from "../../shared/logger.js";

const defaultComboLogger = {
  info: (msg: string, ...args: any[]) => logger.info("COMBO", msg, ...args),
  warn: (msg: string, ...args: any[]) => logger.warn("COMBO", msg, ...args),
};

const TOOL_CALL_PREFIX = "[Called tools: ";
const TOOL_RESULT_PREFIX = "[Tool result: ";

export interface RotationState {
  index: number;
  consecutiveUseCount: number;
}

export const comboRotationState = new Map<string, RotationState>();

export function normalizeStickyLimit(stickyLimit?: number | string): number {
  const parsed = Number.parseInt(String(stickyLimit), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function rotateModelsFromIndex(models: string[], currentIndex: number): string[] {
  const rotated = [...models];
  for (let i = 0; i < currentIndex; i++) {
    const moved = rotated.shift();
    if (moved) rotated.push(moved);
  }
  return rotated;
}

/**
 * Get rotated model list based on strategy (round-robin with sticky limit).
 */
export function getRotatedModels(
  models: string[],
  comboName: string,
  strategy: string,
  stickyLimit: number | string = 1
): string[] {
  if (!models || models.length <= 1 || strategy !== "round-robin") {
    return models;
  }

  const rotationKey = comboName || "__default__";
  const normalizedStickyLimit = normalizeStickyLimit(stickyLimit);
  const existingState = comboRotationState.get(rotationKey);
  const state = existingState || { index: 0, consecutiveUseCount: 0 };

  const currentIndex = state.index % models.length;
  const rotated = rotateModelsFromIndex(models, currentIndex);
  const nextUseCount = state.consecutiveUseCount + 1;

  if (nextUseCount >= normalizedStickyLimit) {
    comboRotationState.set(rotationKey, {
      index: (currentIndex + 1) % models.length,
      consecutiveUseCount: 0,
    });
  } else {
    comboRotationState.set(rotationKey, {
      index: currentIndex,
      consecutiveUseCount: nextUseCount,
    });
  }

  return rotated;
}

/**
 * Reset in-memory rotation state.
 */
export function resetComboRotation(comboName?: string): void {
  if (comboName) comboRotationState.delete(comboName);
  else comboRotationState.clear();
}

/**
 * Reorder models so that ones satisfying the required capabilities float to the front.
 */
export function reorderByCapabilities(models: string[], required: Set<string>): string[] {
  if (!required || required.size === 0 || !Array.isArray(models) || models.length <= 1) {
    return models;
  }
  const hard = [...required].filter((c) => HARD_CAPS.has(c));
  const soft = [...required].filter((c) => !HARD_CAPS.has(c));

  const tierOf = (m: string) => {
    const slash = typeof m === "string" ? m.indexOf("/") : -1;
    const provider = slash > 0 ? m.slice(0, slash) : "";
    const model = slash > 0 ? m.slice(slash + 1) : m;
    const caps = getCapabilitiesForModel(provider, model);
    if (!hard.every((c) => caps[c] === true)) return 2;
    return soft.every((c) => caps[c] === true) ? 0 : 1;
  };

  return models
    .map((m, i) => ({ m, i, t: tierOf(m) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.m);
}

/**
 * Flattens tool calls and results in message history to plain prose,
 * preventing panel models in Fusion from looping on structured tool calls.
 */
export function flattenToolHistory(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((msg) => msg)
    .map((msg) => {
      if (msg.role === "tool" || msg.role === "function") {
        const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
        return { role: "assistant", content: `${TOOL_RESULT_PREFIX}${text}]` };
      }

      if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
        const { tool_calls, ...rest } = msg;
        const names = tool_calls.map((c: any) => c?.function?.name || c?.name || "tool").join(", ");
        const base = typeof rest.content === "string" ? rest.content : "";
        return { ...rest, content: `${base}${base ? "\n" : ""}${TOOL_CALL_PREFIX}${names}]` };
      }

      if (Array.isArray(msg.content)) {
        const hasToolUse = msg.content.some((c: any) => c.type === "tool_use");
        const hasToolResult = msg.content.some((c: any) => c.type === "tool_result");

        if (hasToolUse || hasToolResult) {
          const textParts: string[] = [];
          const toolNames: string[] = [];
          const toolResults: string[] = [];

          for (const block of msg.content) {
            if (block.type === "text" && block.text) textParts.push(block.text);
            if (block.type === "tool_use") toolNames.push(block.name || "tool");
            if (block.type === "tool_result") {
              const resText = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
              toolResults.push(resText);
            }
          }

          const { ...rest } = msg;
          let newContent = textParts.join("\n");
          if (toolNames.length > 0) {
            newContent = `${newContent}${newContent ? "\n" : ""}${TOOL_CALL_PREFIX}${toolNames.join(", ")}]`;
          }
          if (toolResults.length > 0) {
            newContent = `${newContent}${newContent ? "\n" : ""}${TOOL_RESULT_PREFIX}${toolResults.join("\n")}]`;
          }
          return { ...rest, content: newContent };
        }
      }

      return msg;
    });
}

/**
 * Builds the judge synthesis prompt for Fusion routing.
 */
export function buildJudgePrompt(answers: Array<{ model: string; text: string }>): string {
  const panel = answers
    .map((a, i) => `[Source ${i + 1}]\n${a.text}`)
    .join("\n\n");

  return [
    `You are the JUDGE in a model-fusion panel. ${answers.length} expert models independently answered the user's most recent request. Their responses are below, anonymized by source.`,
    "",
    "Do NOT mention that multiple models were used, and do NOT refer to the sources. Produce ONE authoritative final answer addressed directly to the user.",
    "",
    "First, internally analyze the panel along these dimensions: consensus (points most sources agree on — treat as higher-confidence), contradictions (where they disagree — resolve with your own judgment), partial coverage, unique insights only one source surfaced, and blind spots every source missed. Then write the best possible final answer grounded in that analysis — more complete and correct than any single response, with no filler.",
    "",
    "=== PANEL RESPONSES ===",
    panel,
    "=== END PANEL RESPONSES ===",
    "",
    "Now write the final answer to the user's original request.",
  ].join("\n");
}

export function extractPanelText(json: any): string {
  if (!json || typeof json !== "object") return "";

  // OpenAI chat completion
  const choice = json.choices?.[0];
  if (choice) {
    const msg = choice.message ?? choice.delta ?? {};
    if (typeof msg.content === "string" && msg.content.trim()) return msg.content;
    if (Array.isArray(msg.content)) {
      const t = msg.content
        .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
        .join("");
      if (t.trim()) return t;
    }
    if (typeof choice.text === "string" && choice.text.trim()) return choice.text;
  }

  // Claude messages
  if (Array.isArray(json.content)) {
    const t = json.content
      .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("");
    if (t.trim()) return t;
  } else if (typeof json.content === "string" && json.content.trim()) {
    return json.content;
  }

  // Gemini candidates
  const parts = json.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const t = parts.map((p: any) => p?.text || "").join("");
    if (t.trim()) return t;
  }

  // Responses API
  if (Array.isArray(json.output)) {
    const t = json.output
      .flatMap((o: any) => (Array.isArray(o.content) ? o.content.map((c: any) => c?.text || "") : []))
      .join("");
    if (t.trim()) return t;
  }

  return "";
}

export function appendUserTurn(body: any, text: string): any {
  const next = { ...body };
  if (Array.isArray(body.messages)) {
    next.messages = [...body.messages, { role: "user", content: text }];
  } else if (Array.isArray(body.input)) {
    next.input = [...body.input, { role: "user", content: text }];
  } else if (Array.isArray(body.contents)) {
    next.contents = [...body.contents, { role: "user", parts: [{ text }] }];
  } else {
    next.messages = [{ role: "user", content: text }];
  }
  return next;
}

export interface FusionTuning {
  minPanel?: number;
  stragglerGraceMs?: number;
  panelHardTimeoutMs?: number;
}

export const FUSION_DEFAULTS: Required<FusionTuning> = {
  minPanel: 2,
  stragglerGraceMs: 8000,
  panelHardTimeoutMs: 90000,
};

/**
 * Collect panel responses with quorum grace timer.
 */
export function collectPanel<T = any>(
  calls: Promise<T>[],
  tuning: { minPanel: number; stragglerGraceMs?: number; panelHardTimeoutMs?: number }
): Promise<Array<T | { __timeout?: boolean; __error?: any }>> {
  const minPanel = tuning.minPanel;
  const stragglerGraceMs = tuning.stragglerGraceMs ?? FUSION_DEFAULTS.stragglerGraceMs;
  const panelHardTimeoutMs = tuning.panelHardTimeoutMs ?? FUSION_DEFAULTS.panelHardTimeoutMs;

  return new Promise((resolve) => {
    const out: Array<T | { __timeout?: boolean; __error?: any }> = new Array(calls.length);
    let settled = 0;
    let ok = 0;
    let finished = false;
    let graceTimer: any = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(hardTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve(out);
    };

    const hardTimer = setTimeout(finish, panelHardTimeoutMs);

    calls.forEach((p, i) => {
      Promise.resolve(p)
        .then((v: any) => {
          out[i] = v;
          if (v && (v.ok || (v.status && v.status >= 200 && v.status < 300))) {
            ok++;
          }
        })
        .catch((e) => {
          out[i] = { __error: e };
        })
        .finally(() => {
          settled++;
          if (settled === calls.length) {
            return finish();
          }
          if (ok >= minPanel && !graceTimer) {
            graceTimer = setTimeout(finish, stragglerGraceMs);
          }
        });
    });
  });
}

/**
 * Evaluates whether an error should trigger a fallback to the next model.
 */
export function checkFallbackError(
  status: number,
  errorText?: string
): { shouldFallback: boolean; cooldownMs?: number } {
  // Rate limit
  if (status === 429) {
    return { shouldFallback: true, cooldownMs: 1500 };
  }

  // Transient gateway / server errors
  if (status === 502 || status === 503 || status === 504) {
    return { shouldFallback: true, cooldownMs: 1000 };
  }

  // Other server errors
  if (status >= 500) {
    return { shouldFallback: true, cooldownMs: 500 };
  }

  // Quota / overloaded errors disguised as 400/401/403/404
  const lower = (errorText || "").toLowerCase();
  const isQuotaOrLimit =
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("insufficient") ||
    lower.includes("balance") ||
    lower.includes("overloaded") ||
    lower.includes("capacity") ||
    lower.includes("resource_exhausted");

  if (isQuotaOrLimit) {
    return { shouldFallback: true, cooldownMs: 1000 };
  }

  return { shouldFallback: false };
}

export interface ModelCallResult {
  ok: boolean;
  status: number;
  text?: string;
  json?: any;
  error?: string;
  modelUsed?: string;
}

export type SingleModelHandler = (
  body: any,
  modelStr: string,
  isPanel?: boolean
) => Promise<ModelCallResult>;

/**
 * Executes Fallback combo strategy across sequential models.
 */
export async function handleFallbackChat(options: {
  body: any;
  models: string[];
  handleSingleModel: SingleModelHandler;
  log?: { info: (...args: any[]) => void; warn: (...args: any[]) => void };
  comboName?: string;
  comboStrategy?: string;
  comboStickyLimit?: number;
  autoSwitch?: boolean;
}): Promise<ModelCallResult> {
  const {
    body,
    models,
    handleSingleModel,
    log = defaultComboLogger,
    comboName = "",
    comboStrategy = "fallback",
    comboStickyLimit = 1,
    autoSwitch = true,
  } = options;

  let candidateModels = getRotatedModels(models, comboName, comboStrategy, comboStickyLimit);

  if (autoSwitch) {
    const required = detectRequiredCapabilities(body);
    if (required.size > 0) {
      candidateModels = reorderByCapabilities(candidateModels, required);
    }
  }

  let lastStatus = 503;
  let lastError = "All combo models failed";

  for (let i = 0; i < candidateModels.length; i++) {
    const modelStr = candidateModels[i];
    log.info(`[COMBO:Fallback] Trying model ${i + 1}/${candidateModels.length}: ${modelStr}`);

    try {
      const res = await handleSingleModel(body, modelStr, false);

      if (res.ok) {
        log.info(`[COMBO:Fallback] Model ${modelStr} succeeded`);
        return { ...res, modelUsed: modelStr };
      }

      const errText = res.error || res.text || String(res.status);
      const { shouldFallback, cooldownMs } = checkFallbackError(res.status, errText);

      lastStatus = res.status;
      lastError = errText;

      if (!shouldFallback) {
        log.warn(`[COMBO:Fallback] Model ${modelStr} failed with unretryable error ${res.status}: ${errText}`);
        return { ...res, modelUsed: modelStr };
      }

      if (cooldownMs && cooldownMs > 0 && cooldownMs <= 3000 && i < candidateModels.length - 1) {
        await new Promise((r) => setTimeout(r, cooldownMs));
      }
    } catch (err: any) {
      lastStatus = 500;
      lastError = err.message || String(err);
      log.warn(`[COMBO:Fallback] Model ${modelStr} threw exception: ${lastError}`);
    }
  }

  return {
    ok: false,
    status: lastStatus,
    error: lastError,
  };
}

/**
 * Executes Fusion combo strategy: fan out to panel in parallel, collect prose,
 * and synthesize with Judge Model.
 */
export async function handleFusionChat(options: {
  body: any;
  models: string[];
  handleSingleModel: SingleModelHandler;
  log?: { info: (...args: any[]) => void; warn: (...args: any[]) => void };
  comboName?: string;
  judgeModel?: string;
  tuning?: FusionTuning;
}): Promise<ModelCallResult> {
  const {
    body,
    models,
    handleSingleModel,
    log = defaultComboLogger,
    comboName = "",
    judgeModel,
    tuning,
  } = options;

  const panel = Array.isArray(models) ? models.filter(Boolean) : [];
  if (panel.length === 0) {
    return { ok: false, status: 400, error: "Fusion combo has no models" };
  }

  // If only 1 model in fusion combo, answer directly without fusion overhead
  if (panel.length === 1) {
    return handleSingleModel(body, panel[0], false);
  }

  const cfg: Required<FusionTuning> = { ...FUSION_DEFAULTS, ...(tuning || {}) };
  const minPanel = Math.min(Math.max(2, cfg.minPanel), panel.length);
  const judge = judgeModel && judgeModel.trim() ? judgeModel.trim() : panel[0];

  log.info(`[COMBO:Fusion] Combo "${comboName}" | panel=${panel.length} | judge=${judge} | quorum=${minPanel}`);

  // 1. Prepare panel request: stream=false, strip tools
  const { tools, tool_choice, stream_options, ...rest } = body;
  const panelBody = { ...rest, stream: false };

  if (Array.isArray(panelBody.messages)) {
    panelBody.messages = flattenToolHistory(panelBody.messages);
  } else if (Array.isArray(panelBody.input)) {
    panelBody.input = flattenToolHistory(panelBody.input);
  }

  // 2. Parallel fan-out to all panel models
  const calls = panel.map((m) => handleSingleModel(panelBody, m, true));
  const settled = await collectPanel(calls, { ...cfg, minPanel });

  // 3. Collect successful panel responses
  const answers: Array<{ model: string; text: string }> = [];
  for (let i = 0; i < settled.length; i++) {
    const res: any = settled[i];
    const m = panel[i];
    if (!res || res.__timeout || res.__error) {
      log.warn(`[COMBO:Fusion] Panel model ${m} timed out or failed`);
      continue;
    }
    if (!res.ok) {
      log.warn(`[COMBO:Fusion] Panel model ${m} returned status ${res.status}`);
      continue;
    }

    const text = res.json ? extractPanelText(res.json) : res.text || "";
    if (text.trim()) {
      answers.push({ model: m, text: text.trim() });
    }
  }

  // 4. Degrade gracefully if not enough answers
  if (answers.length === 0) {
    log.warn("[COMBO:Fusion] All panel models failed");
    return { ok: false, status: 503, error: "All fusion panel models failed" };
  }

  if (answers.length === 1) {
    log.info(`[COMBO:Fusion] Only 1 panel model (${answers[0].model}) succeeded; delivering directly`);
    return handleSingleModel(body, answers[0].model, false);
  }

  // 5. Synthesize final answer with Judge Model
  const judgePrompt = buildJudgePrompt(answers);
  const judgeBody = appendUserTurn(body, judgePrompt);

  log.info(`[COMBO:Fusion] Synthesizing ${answers.length} answers with Judge: ${judge}`);
  return handleSingleModel(judgeBody, judge, false);
}
