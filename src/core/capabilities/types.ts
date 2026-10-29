/**
 * Model Capabilities Catalog Types
 */

export interface ModelCapabilities {
  vision: boolean;
  pdf: boolean;
  audioInput: boolean;
  videoInput: boolean;
  imageOutput: boolean;
  audioOutput: boolean;
  search: boolean;
  tools: boolean;
  reasoning: boolean;
  thinkingFormat: string | null;
  thinkingCanDisable: boolean;
  thinkingOffType?: string;
  forcedToolChoice?: boolean;
  thinkingRange: { min: number; max: number } | null;
  thinkingEffortSupported: boolean;
  contextWindow: number;
  maxOutput: number;
  [key: string]: any;
}
