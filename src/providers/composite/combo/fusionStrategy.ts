import { logger } from "../../../shared/logger.js";
import {
  FUSION_DEFAULTS,
  type FusionTuning,
  type ModelCallResult,
  type FusionChatOptions,
} from "./types.js";
import {
  flattenToolHistory,
  buildJudgePrompt,
  extractPanelText,
  appendUserTurn,
} from "./judgePrompt.js";

const defaultComboLogger = {
  info: (msg: string, ...args: any[]) => logger.info("COMBO", msg, ...args),
  warn: (msg: string, ...args: any[]) => logger.warn("COMBO", msg, ...args),
};

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

export async function handleFusionChat(options: FusionChatOptions): Promise<ModelCallResult> {
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

  if (panel.length === 1) {
    return handleSingleModel(body, panel[0], false);
  }

  const cfg: Required<FusionTuning> = { ...FUSION_DEFAULTS, ...(tuning || {}) };
  const minPanel = Math.min(Math.max(2, cfg.minPanel), panel.length);
  const judge = judgeModel && judgeModel.trim() ? judgeModel.trim() : panel[0];

  log.info(`[COMBO:Fusion] Combo "${comboName}" | panel=${panel.length} | judge=${judge} | quorum=${minPanel}`);

  const { tools, tool_choice, stream_options, ...rest } = body;
  const panelBody = { ...rest, stream: false };

  if (Array.isArray(panelBody.messages)) {
    panelBody.messages = flattenToolHistory(panelBody.messages);
  } else if (Array.isArray(panelBody.input)) {
    panelBody.input = flattenToolHistory(panelBody.input);
  }

  const calls = panel.map((m) => handleSingleModel(panelBody, m, true));
  const settled = await collectPanel(calls, { ...cfg, minPanel });

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

  if (answers.length === 0) {
    log.warn("[COMBO:Fusion] All panel models failed");
    return { ok: false, status: 503, error: "All fusion panel models failed" };
  }

  if (answers.length === 1) {
    log.info(`[COMBO:Fusion] Only 1 panel model (${answers[0].model}) succeeded; delivering directly`);
    return handleSingleModel(body, answers[0].model, false);
  }

  const judgePrompt = buildJudgePrompt(answers);
  const judgeBody = appendUserTurn(body, judgePrompt);

  log.info(`[COMBO:Fusion] Synthesizing ${answers.length} answers with Judge: ${judge}`);
  return handleSingleModel(judgeBody, judge, false);
}
