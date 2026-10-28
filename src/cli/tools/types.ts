export interface CliGuideStep {
  step: number;
  title: string;
  desc?: string;
  value?: string;
  type?: "apiKeySelector" | "modelSelector" | string;
  copyable?: boolean;
  docsUrl?: string;
}

export interface CliCodeBlock {
  language: string;
  code: string;
}

export interface CliNote {
  type: "info" | "warning" | "error" | "cloudCheck";
  text: string;
}

export interface CliToolModel {
  id: string;
  name: string;
  alias?: string;
  envKey?: string;
  defaultValue?: string;
  isTopLevel?: boolean;
  mandatory?: boolean;
  contextLength?: number;
  rateMultiplier?: number;
}

export interface CliToolRole {
  id: string;
  label: string;
}

export interface CliToolDefinition {
  id: string;
  name: string;
  image: string;
  color: string;
  iconBg?: string;
  description: string;
  configType: "env" | "file" | "guide" | "custom";
  binary?: string;
  settingsFile?: string;
  configPath?: string;
  defaultPort?: number;
  baseUrlPath?: string;
  envVars?: Record<string, string>;
  modelAliases?: string[];
  defaultModels?: CliToolModel[];
  defaultMappings?: Array<{ sourceModel: string; targetModel: string }>;
  guideSteps?: CliGuideStep[];
  codeBlock?: CliCodeBlock;
  notes?: CliNote[];
  docsUrl?: string;
  installUrl?: string;
  defaultCommand?: string;
  roles?: CliToolRole[];
  powershellTemplate?: string;
  bashTemplate?: string;
  configFileTemplate?: string;
}

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
