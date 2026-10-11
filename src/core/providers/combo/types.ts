import type { ModelCallResult, SingleModelHandler } from "../types.js";

export type { ModelCallResult, SingleModelHandler };

export interface RotationState {
  index: number;
  consecutiveUseCount: number;
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

export interface FallbackChatOptions {
  body: any;
  models: string[];
  handleSingleModel: SingleModelHandler;
  log?: { info: (...args: any[]) => void; warn: (...args: any[]) => void };
  comboName?: string;
  comboStrategy?: string;
  comboStickyLimit?: number;
  autoSwitch?: boolean;
}

export interface FusionChatOptions {
  body: any;
  models: string[];
  handleSingleModel: SingleModelHandler;
  log?: { info: (...args: any[]) => void; warn: (...args: any[]) => void };
  comboName?: string;
  judgeModel?: string;
  tuning?: FusionTuning;
}
