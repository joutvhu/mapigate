import type { CliToolDefinition } from "../../types.js";

export const definition: CliToolDefinition = {
  id: "claude",
  name: "Claude Code",
  image: "/providers/claude.png",
  color: "#D97757",
  description: "Anthropic Claude Code CLI",
  configType: "env",
  binary: "claude",
  settingsFile: "~/.claude/settings.json",
  baseUrlPath: "",
  envVars: {
    baseUrl: "ANTHROPIC_BASE_URL",
    model: "ANTHROPIC_MODEL",
    opusModel: "ANTHROPIC_DEFAULT_OPUS_MODEL",
    sonnetModel: "ANTHROPIC_DEFAULT_SONNET_MODEL",
    fableModel: "ANTHROPIC_DEFAULT_FABLE_MODEL",
    haikuModel: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  },
  modelAliases: ["default", "sonnet", "opus", "fable", "haiku", "opusplan"],
  defaultModels: [
    { id: "sonnet", name: "Claude Sonnet", alias: "sonnet", envKey: "ANTHROPIC_DEFAULT_SONNET_MODEL", defaultValue: "claude-sonnet-4-6" },
    { id: "opus", name: "Claude Opus", alias: "opus", envKey: "ANTHROPIC_DEFAULT_OPUS_MODEL", defaultValue: "claude-opus-4-6-thinking" },
    { id: "haiku", name: "Claude Haiku", alias: "haiku", envKey: "ANTHROPIC_DEFAULT_HAIKU_MODEL", defaultValue: "claude-haiku-4-5" },
  ],
  powershellTemplate: `$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:20127"\n$env:ANTHROPIC_MODEL = "claude-sonnet-4-6"\nclaude`,
  bashTemplate: `export ANTHROPIC_BASE_URL="http://127.0.0.1:20127"\nexport ANTHROPIC_MODEL="claude-sonnet-4-6"\nclaude`,
  configFileTemplate: `{\n  "env": {\n    "ANTHROPIC_BASE_URL": "http://127.0.0.1:20127",\n    "ANTHROPIC_MODEL": "claude-sonnet-4-6"\n  }\n}`,
  guideSteps: [
    { step: 1, title: "Install Claude Code", desc: "npm install -g @anthropic-ai/claude-code" },
    { step: 2, title: "Set Base URL", desc: "Point ANTHROPIC_BASE_URL to Mapigate Port 20127", value: "http://127.0.0.1:20127", copyable: true },
    { step: 3, title: "Launch CLI", desc: "Run claude in your terminal" },
  ],
};
