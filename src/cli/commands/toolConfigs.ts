/**
 * Backward-compatible facade for CLI tool configurators
 * Re-exports configurators, registry helpers, and types from src/cli/tools/.
 */

export {
  ALL_TOOL_HANDLERS,
  SUPPORTED_TOOL_IDS,
  TOOL_ALIASES,
  resolveToolHandlers,
  resolveToolHandlersWithValidation,
  CliToolRegistry,
} from "../tools/registry.js";

export { pruneTomlSection } from "../tools/helpers.js";
export { CLAUDE_MODELS } from "../tools/configurators/claude.js";

export type {
  ToolInspectionResult,
  ToolApplyContext,
  ToolConfigHandler,
  ICliToolConfigurator,
  ResolveToolResult,
} from "../tools/types.js";
