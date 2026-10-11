export interface ToolInspectionResult {
  id: string;
  name: string;
  files: string[];
  configured: boolean;
  baseUrl?: string | null;
  apiKey?: string | null;
  models?: Record<string, string>;
  active?: boolean;
  error?: string;
}

export interface ToolApplyContext {
  baseUrl: string;
  apiKey: string;
  model?: string;
  claudeModels?: Record<string, string>;
}

export interface ToolConfigHandler {
  id: string;
  name: string;
  paths: () => string[];
  show: () => Promise<{ baseUrl?: string; apiKey?: string; models?: Record<string, string>; active?: boolean }>;
  apply: (ctx: ToolApplyContext) => Promise<string[]>;
  reset: () => Promise<string[]>;
}

export type ICliToolConfigurator = ToolConfigHandler;

export interface ResolveToolResult {
  handlers: ToolConfigHandler[];
  unrecognized: string[];
}
