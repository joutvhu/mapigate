import chalk from "chalk";
import { ALL_TOOL_HANDLERS, resolveToolHandlers, ToolInspectionResult } from "./toolConfigs.js";
import { maskKey } from "../ui/display.js";

export interface ShowOptions {
  tools?: string[];
  json?: boolean;
}

export async function inspectTool(toolHandler: any): Promise<ToolInspectionResult> {
  const result: ToolInspectionResult = {
    id: toolHandler.id,
    name: toolHandler.name,
    files: toolHandler.paths(),
    configured: false,
  };

  try {
    const s = await toolHandler.show();
    result.configured = Boolean(s.baseUrl || s.apiKey || Object.keys(s.models || {}).length);
    result.baseUrl = s.baseUrl || null;
    result.apiKey = s.apiKey ? maskKey(s.apiKey) : null;
    result.models = s.models || {};
    if (typeof s.active === "boolean") {
      result.active = s.active;
    }
  } catch (err: any) {
    result.error = err.message;
  }

  return result;
}

export function printToolRecord(r: ToolInspectionResult): void {
  if (r.error) {
    console.log(`❌ ${chalk.bold(r.name)}: ${chalk.red(r.error)}`);
    return;
  }

  if (!r.configured) {
    console.log(`• ${chalk.bold(r.name)}: ${chalk.dim(`not configured for Mapigate (${r.files[0] || "no file"})`)}`);
    return;
  }

  const inactive = r.active === false ? `  ${chalk.yellow("(Mapigate config present but not active provider)")}` : "";
  console.log(`✅ ${chalk.green.bold(r.name)}${inactive}`);
  console.log(`   File:     ${chalk.gray(r.files.join(", "))}`);
  console.log(`   Base URL: ${chalk.cyan(r.baseUrl || "(none)")}`);
  console.log(`   API Key:  ${chalk.gray(r.apiKey || "(none)")}`);

  const entries = Object.entries(r.models || {});
  if (!entries.length) {
    console.log(`   Models:   ${chalk.dim("(none set — tool default applies)")}`);
  } else {
    const width = Math.max(...entries.map(([k]) => k.length));
    console.log(`   Models:`);
    for (const [k, v] of entries) {
      console.log(`     ${k.padEnd(width)}  ${chalk.white(v)}`);
    }
  }
}

export async function runShow(toolsArgs: string[] = [], options: ShowOptions = {}): Promise<void> {
  const toolList = options.tools && options.tools.length > 0 ? options.tools : toolsArgs;
  const handlers = resolveToolHandlers(toolList);

  const records: ToolInspectionResult[] = [];
  for (const h of handlers) {
    records.push(await inspectTool(h));
  }

  if (options.json) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  console.log(`\n${chalk.bold("Mapigate AI Coding Tool Configurations:")}`);
  console.log(`───────────────────────────────────────────────────────`);
  records.forEach((r, i) => {
    if (i > 0) console.log();
    printToolRecord(r);
  });
  console.log(`───────────────────────────────────────────────────────\n`);
}
