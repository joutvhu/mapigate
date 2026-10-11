import chalk from "chalk";
import { DEFAULT_PORT, DEFAULT_HOST, APP_NAME } from "../../shared/constants/index.js";
import { resolveToolHandlers, SUPPORTED_TOOL_IDS } from "./toolConfigs.js";
import { maskKey } from "../ui/display.js";

export interface ConnectOptions {
  tools?: string;
  apiKey?: string;
  model?: string;
  sonnet?: string;
  opus?: string;
  haiku?: string;
  reset?: boolean;
  printEnv?: boolean;
}

export async function runConnect(target?: string, options: ConnectOptions = {}): Promise<void> {
  let serverUrl = `http://${DEFAULT_HOST === "0.0.0.0" ? "127.0.0.1" : DEFAULT_HOST}:${DEFAULT_PORT}`;
  let specifiedTool: string | null = null;

  if (target) {
    if (target.startsWith("http://") || target.startsWith("https://")) {
      serverUrl = target.replace(/\/+$/, "");
    } else if (SUPPORTED_TOOL_IDS.includes(target.toLowerCase()) || target.toLowerCase() === "all" || target.toLowerCase() === "cursor") {
      specifiedTool = target.toLowerCase();
    } else {
      serverUrl = target.startsWith("localhost") || target.startsWith("127.0.0.1") ? `http://${target}` : target;
    }
  }

  const apiKey = options.apiKey || "mapigate-local";
  const defaultModel = options.model || "claude-sonnet-4-6";

  const claudeModels: Record<string, string> = {};
  if (options.sonnet) claudeModels["sonnet"] = options.sonnet;
  if (options.opus) claudeModels["opus"] = options.opus;
  if (options.haiku) claudeModels["haiku"] = options.haiku;

  // If specific tool like cursor is requested that only has guide
  if (specifiedTool === "cursor") {
    console.log(`\n${chalk.bold(`${APP_NAME} Configuration for Cursor:`)}`);
    console.log(`──────────────────────────────────────────`);
    console.log(`1. Open Cursor Settings -> Models -> OpenAI API Key`);
    console.log(`2. Override Base URL: ${chalk.green(`${serverUrl}/v1`)}`);
    console.log(`3. API Key: ${chalk.cyan(apiKey)}`);
    console.log(`4. Add custom model ID: ${chalk.cyan(defaultModel)}`);
    console.log(`──────────────────────────────────────────\n`);
    return;
  }

  // Parse tool list
  const toolListRaw: string[] = [];
  if (options.tools) {
    toolListRaw.push(...options.tools.split(",").map((s) => s.trim()));
  } else if (specifiedTool) {
    toolListRaw.push(specifiedTool);
  } else {
    toolListRaw.push("all");
  }

  const handlers = resolveToolHandlers(toolListRaw);

  if (options.reset) {
    console.log(`\n${chalk.bold(`Resetting ${handlers.length} tool(s) to defaults...`)}`);
    for (const h of handlers) {
      const files = await h.reset();
      console.log(`  ${chalk.yellow("↺")} ${h.name}: reset (${files.join(", ")})`);
    }
    console.log(`\n${chalk.green("Reset completed successfully.")}\n`);
    return;
  }

  console.log(`\n${chalk.bold(`Configuring AI Coding Tools for ${APP_NAME}:`)}`);
  console.log(`  Gateway Base: ${chalk.cyan(serverUrl)}`);
  console.log(`  API Key:      ${chalk.gray(maskKey(apiKey))}`);
  console.log(`  Model:        ${chalk.white(defaultModel)}`);
  console.log(`──────────────────────────────────────────`);

  for (const h of handlers) {
    try {
      const written = await h.apply({
        baseUrl: serverUrl,
        apiKey,
        model: defaultModel,
        claudeModels,
      });
      console.log(`  ${chalk.green("✓")} ${chalk.bold(h.name)}: configured (${chalk.gray(written.join(", "))})`);
    } catch (err: any) {
      console.log(`  ${chalk.red("✗")} ${chalk.bold(h.name)}: ${chalk.red(err.message)}`);
    }
  }

  if (options.printEnv) {
    console.log(`\n${chalk.bold("OpenAI-Compatible Environment Variables:")}`);
    console.log(`${chalk.yellow("PowerShell (Windows):")}`);
    console.log(`  $env:OPENAI_BASE_URL = "${serverUrl}/v1"`);
    console.log(`  $env:OPENAI_API_KEY = "${apiKey}"`);
    console.log(`  $env:ANTHROPIC_BASE_URL = "${serverUrl}"`);
    console.log(`  $env:ANTHROPIC_API_KEY = "${apiKey}"`);
    console.log(`\n${chalk.yellow("Bash / Zsh (Linux & macOS):")}`);
    console.log(`  export OPENAI_BASE_URL="${serverUrl}/v1"`);
    console.log(`  export OPENAI_API_KEY="${apiKey}"`);
    console.log(`  export ANTHROPIC_BASE_URL="${serverUrl}"`);
    console.log(`  export ANTHROPIC_API_KEY="${apiKey}"`);
  }

  console.log(`──────────────────────────────────────────\n`);
}
