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

export const ROUTEN_BASE_URL = "http://127.0.0.1:20127";
export const ROUTEN_V1_URL = "http://127.0.0.1:20127/v1";

export const CLI_TOOLS: Record<string, CliToolDefinition> = {
  claude: {
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
      { step: 2, title: "Set Base URL", desc: "Point ANTHROPIC_BASE_URL to Routen Port 20127", value: "http://127.0.0.1:20127", copyable: true },
      { step: 3, title: "Launch CLI", desc: "Run claude in your terminal" },
    ],
  },
  openclaw: {
    id: "openclaw",
    name: "Open Claw",
    image: "/providers/openclaw.png",
    color: "#FF6B35",
    description: "Open Claw AI Assistant",
    configType: "custom",
    binary: "openclaw",
    configPath: "~/.openclaw/config.json",
    baseUrlPath: "/v1",
    envVars: {
      baseUrl: "OPENCLAW_BASE_URL",
      apiKey: "OPENCLAW_API_KEY",
    },
    powershellTemplate: `$env:OPENCLAW_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENCLAW_API_KEY = "routen-local"\nopenclaw`,
    bashTemplate: `export OPENCLAW_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENCLAW_API_KEY="routen-local"\nopenclaw`,
    configFileTemplate: `{\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "routen-local"\n}`,
  },
  codex: {
    id: "codex",
    name: "OpenAI Codex CLI / App",
    image: "/providers/codex.png",
    color: "#10A37F",
    description: "OpenAI Codex CLI",
    configType: "env",
    binary: "codex",
    configPath: "~/.codex/config.toml",
    baseUrlPath: "/v1",
    envVars: {
      baseUrl: "OPENAI_BASE_URL",
      apiKey: "OPENAI_API_KEY",
    },
    powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "routen-local"\ncodex`,
    bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="routen-local"\ncodex`,
    configFileTemplate: `model_provider = "routen"\n\n[model_providers.routen]\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "routen-local"`,
  },
  copilot: {
    id: "copilot",
    name: "GitHub Copilot",
    image: "/providers/copilot.png",
    color: "#1F6FEB",
    description: "GitHub Copilot in VS Code / CLI",
    configType: "guide",
    binary: "copilot",
    docsUrl: "https://marketplace.visualstudio.com/items?itemName=GitHub.copilot",
    guideSteps: [
      {
        step: 1,
        title: "VS Code Copilot",
        desc: "Use Routen MITM Proxy to transparently intercept api.githubcopilot.com, or use the Copilot configuration extension.",
      },
      {
        step: 2,
        title: "Set Server URL",
        desc: "Point endpoint to Routen server URL:",
        value: "http://127.0.0.1:20127",
        copyable: true,
      },
      {
        step: 3,
        title: "Select Model",
        desc: "In Copilot Chat, pick any model routed through Routen.",
      },
    ],
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    image: "/providers/opencode.png",
    color: "#E87040",
    description: "OpenCode AI Terminal Assistant",
    configType: "custom",
    binary: "opencode",
    configPath: "~/.config/opencode/opencode.json",
    baseUrlPath: "/v1",
    envVars: {
      baseUrl: "OPENCODE_BASE_URL",
      apiKey: "OPENCODE_API_KEY",
    },
    powershellTemplate: `$env:OPENCODE_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENCODE_API_KEY = "routen-local"\nopencode`,
    bashTemplate: `export OPENCODE_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENCODE_API_KEY="routen-local"\nopencode`,
    configFileTemplate: `{\n  "provider": {\n    "routen": {\n      "options": {\n        "baseURL": "http://127.0.0.1:20127/v1",\n        "apiKey": "routen-local"\n      }\n    }\n  }\n}`,
  },
  cowork: {
    id: "cowork",
    name: "Claude Cowork",
    image: "/providers/claude.png",
    color: "#D97757",
    description: "Claude Desktop Cowork (third-party inference)",
    configType: "custom",
    configPath: "~/.claude/cowork.json",
    baseUrlPath: "",
    powershellTemplate: `$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:20127"`,
    bashTemplate: `export ANTHROPIC_BASE_URL="http://127.0.0.1:20127"`,
  },
  hermes: {
    id: "hermes",
    name: "Hermes Agent",
    image: "/providers/hermes.png",
    color: "#8B5CF6",
    description: "Nous Research self-improving AI agent",
    configType: "custom",
    binary: "hermes",
    configPath: "~/.hermes/config.yaml",
    baseUrlPath: "/v1",
    roles: [
      { id: "delegation", label: "Delegation (subagents)" },
      { id: "vision", label: "Vision" },
      { id: "compression", label: "Compression" },
      { id: "title_generation", label: "Title Generation" },
      { id: "approval", label: "Approval" },
      { id: "skills_hub", label: "Skills Hub" },
      { id: "mcp", label: "MCP" },
      { id: "review", label: "Review (/review subagent)" },
      { id: "memory_query_rewrite", label: "Memory Query Rewrite" },
      { id: "background_review", label: "Background Review" },
      { id: "curator", label: "Curator" },
      { id: "monitor", label: "Monitor" },
      { id: "tts_audio_tags", label: "TTS Audio Tags" },
      { id: "triage_specifier", label: "Triage Specifier" },
      { id: "kanban_decomposer", label: "Kanban Decomposer" },
      { id: "profile_describer", label: "Profile Describer" },
      { id: "goal_judge", label: "Goal Judge" },
    ],
    powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "routen-local"\nhermes`,
    bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="routen-local"\nhermes`,
    configFileTemplate: `model_provider: openai\nbase_url: http://127.0.0.1:20127/v1\napi_key: routen-local`,
  },
  droid: {
    id: "droid",
    name: "Factory Droid",
    image: "/providers/droid.png",
    color: "#00D4FF",
    description: "Factory Droid AI Assistant",
    configType: "custom",
    binary: "droid",
    configPath: "~/.factory/config.json",
    baseUrlPath: "/v1",
    powershellTemplate: `$env:FACTORY_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:FACTORY_API_KEY = "routen-local"\ndroid`,
    bashTemplate: `export FACTORY_BASE_URL="http://127.0.0.1:20127/v1"\nexport FACTORY_API_KEY="routen-local"\ndroid`,
    configFileTemplate: `{\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "routen-local"\n}`,
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    image: "/providers/cursor.png",
    color: "#000000",
    description: "Cursor AI Code Editor",
    configType: "guide",
    binary: "cursor",
    docsUrl: "https://cursor.com",
    guideSteps: [
      { step: 1, title: "Open Settings", desc: "In Cursor, go to Settings → Models" },
      { step: 2, title: "Enable OpenAI API", desc: "Toggle 'OpenAI API key' on" },
      { step: 3, title: "Override Base URL", desc: "Enter Routen OpenAI-compatible endpoint:", value: "http://127.0.0.1:20127/v1", copyable: true },
      { step: 4, title: "Set API Key", desc: "Enter any non-empty string, e.g. 'routen-local'", value: "routen-local", copyable: true },
      { step: 5, title: "Add Custom Model", desc: "Click 'Add Custom Model' and enter your preferred model ID" },
    ],
  },
  cline: {
    id: "cline",
    name: "Cline",
    image: "/providers/cline.png",
    color: "#5B9BD5",
    description: "Cline AI Coding Assistant",
    configType: "file",
    configPath: "~/.cline/config.json",
    baseUrlPath: "/v1",
    guideSteps: [
      { step: 1, title: "Open Cline Settings", desc: "Click the gear icon in the Cline panel" },
      { step: 2, title: "Select Provider", desc: "Choose 'OpenAI Compatible'" },
      { step: 3, title: "Base URL", value: "http://127.0.0.1:20127/v1", copyable: true },
      { step: 4, title: "API Key", value: "routen-local", copyable: true },
    ],
    configFileTemplate: `{\n  "apiProvider": "openai-compatible",\n  "openAiBaseUrl": "http://127.0.0.1:20127/v1",\n  "openAiApiKey": "routen-local"\n}`,
  },
  kilo: {
    id: "kilo",
    name: "Kiro Code",
    image: "/providers/kilocode.png",
    color: "#FF6B6B",
    description: "Kiro Code / Kilo Code AI Assistant",
    configType: "custom",
    binary: "kilo",
    configPath: "~/.kilo/config.json",
    baseUrlPath: "/v1",
    powershellTemplate: `$env:KILO_BASE_URL = "http://127.0.0.1:20127/v1"\nkilo`,
    bashTemplate: `export KILO_BASE_URL="http://127.0.0.1:20127/v1"\nkilo`,
    configFileTemplate: `{\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "routen-local"\n}`,
  },
  roo: {
    id: "roo",
    name: "Roo Code",
    image: "/providers/roo.png",
    color: "#FF6B6B",
    description: "Roo AI Assistant",
    configType: "file",
    configPath: "~/.roo/config.json",
    baseUrlPath: "/v1",
    guideSteps: [
      { step: 1, title: "Open Roo Settings", desc: "Open the Roo Settings panel in VS Code" },
      { step: 2, title: "Select Provider", desc: "Choose API Provider → OpenAI Compatible" },
      { step: 3, title: "Base URL", value: "http://127.0.0.1:20127/v1", copyable: true },
      { step: 4, title: "API Key", value: "routen-local", copyable: true },
    ],
    configFileTemplate: `{\n  "apiProvider": "openai-compatible",\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "routen-local"\n}`,
  },
  continue: {
    id: "continue",
    name: "Continue",
    image: "/providers/continue.png",
    color: "#7C3AED",
    description: "Continue AI Assistant",
    configType: "file",
    configPath: "~/.continue/config.json",
    baseUrlPath: "/v1",
    guideSteps: [
      { step: 1, title: "Open Continue Config", desc: "Open ~/.continue/config.json or config.yaml" },
      { step: 2, title: "Add Model", desc: "Insert the OpenAI provider configuration pointing to Routen" },
    ],
    codeBlock: {
      language: "json",
      code: `{\n  "models": [\n    {\n      "title": "Routen Model",\n      "provider": "openai",\n      "model": "claude-sonnet-4-6",\n      "apiBase": "http://127.0.0.1:20127/v1",\n      "apiKey": "routen-local"\n    }\n  ]\n}`,
    },
    configFileTemplate: `{\n  "models": [\n    {\n      "title": "Routen Model",\n      "provider": "openai",\n      "model": "claude-sonnet-4-6",\n      "apiBase": "http://127.0.0.1:20127/v1",\n      "apiKey": "routen-local"\n    }\n  ]\n}`,
  },
  amp: {
    id: "amp",
    name: "Amp CLI",
    image: "/providers/amp.png",
    color: "#F97316",
    description: "Sourcegraph Amp coding assistant CLI",
    configType: "env",
    binary: "amp",
    baseUrlPath: "/v1",
    envVars: {
      baseUrl: "OPENAI_BASE_URL",
      apiKey: "OPENAI_API_KEY",
    },
    powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "routen-local"\namp`,
    bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="routen-local"\namp`,
    guideSteps: [
      { step: 1, title: "Install Amp", desc: "Install Amp CLI via official instructions" },
      { step: 2, title: "Configure Env", desc: "Set OPENAI_BASE_URL and OPENAI_API_KEY", value: "http://127.0.0.1:20127/v1", copyable: true },
      { step: 3, title: "Run", desc: "amp --model claude-sonnet-4-6" },
    ],
  },
  qwen: {
    id: "qwen",
    name: "Qwen Code",
    image: "/providers/qwen.png",
    color: "#10B981",
    description: "Alibaba Qwen Code CLI",
    configType: "file",
    binary: "qwen",
    configPath: "~/.qwen/settings.json",
    baseUrlPath: "/v1",
    guideSteps: [
      { step: 1, title: "Install Qwen Code", desc: "npm install -g @qwen-code/qwen-code" },
      { step: 2, title: "Save Config", desc: "Copy the JSON below into ~/.qwen/settings.json" },
    ],
    codeBlock: {
      language: "json",
      code: `{\n  "security": {\n    "auth": {\n      "selectedType": "openai",\n      "apiKey": "routen-local",\n      "baseUrl": "http://127.0.0.1:20127/v1"\n    }\n  },\n  "model": {\n    "name": "claude-sonnet-4-6"\n  }\n}`,
    },
    configFileTemplate: `{\n  "security": {\n    "auth": {\n      "selectedType": "openai",\n      "apiKey": "routen-local",\n      "baseUrl": "http://127.0.0.1:20127/v1"\n    }\n  },\n  "model": {\n    "name": "claude-sonnet-4-6"\n  }\n}`,
  },
  "deepseek-tui": {
    id: "deepseek-tui",
    name: "DeepSeek TUI",
    image: "/providers/deepseek-tui.png",
    color: "#4D6BFE",
    description: "DeepSeek Terminal Coding Agent (Rust TUI)",
    configType: "file",
    binary: "deepseek",
    configPath: "~/.deepseek/config.toml",
    baseUrlPath: "/v1",
    powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "routen-local"\ndeepseek`,
    bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="routen-local"\ndeepseek`,
    configFileTemplate: `[provider]\nname = "openai"\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "routen-local"\nmodel = "claude-sonnet-4-6"`,
  },
  jcode: {
    id: "jcode",
    name: "Jcode",
    image: "/providers/jcode.png",
    color: "#FF6B35",
    description: "High-performance Rust-based coding agent harness",
    configType: "custom",
    binary: "jcode",
    configPath: "~/.jcode/config.toml",
    baseUrlPath: "/v1",
    powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "routen-local"\njcode`,
    bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="routen-local"\njcode`,
    configFileTemplate: `[model_provider.openai]\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "routen-local"`,
  },
  "grok-build": {
    id: "grok-build",
    name: "Grok Build",
    image: "/providers/grok-cli.png",
    color: "#1DA1F2",
    description: "xAI Grok Build TUI coding agent",
    configType: "custom",
    binary: "grok",
    configPath: "~/.grok/config.toml",
    baseUrlPath: "/v1",
    powershellTemplate: `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "routen-local"\ngrok`,
    bashTemplate: `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="routen-local"\ngrok`,
    configFileTemplate: `[model.routen]\ntype = "openai"\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "routen-local"`,
  },
  devin: {
    id: "devin",
    name: "Devin CLI",
    image: "/providers/devin-cli.png",
    color: "#6366F1",
    description: "Cognition Devin CLI",
    configType: "guide",
    binary: "devin",
    installUrl: "https://cli.devin.ai",
    guideSteps: [
      { step: 1, title: "Install Devin CLI", desc: "Install via official installer at cli.devin.ai" },
      { step: 2, title: "Authenticate", desc: "Run devin auth login in terminal" },
      { step: 3, title: "Ready", desc: "Devin CLI runs locally and connects with Routen" },
    ],
  },
  opendesign: {
    id: "opendesign",
    name: "OpenDesign",
    image: "/providers/opendesign.png",
    color: "#7C3AED",
    description: "Agent-native design skills pack",
    configType: "guide",
    guideSteps: [
      { step: 1, title: "Install Plugin", desc: "Install into Claude Code, Cursor, or Codex CLI" },
      { step: 2, title: "Automatic Routing", desc: "Inherits host agent model configuration pointing to Routen" },
      { step: 3, title: "Run", desc: "Invoke with /opendesign <prompt>" },
    ],
  },
  pi: {
    id: "pi",
    name: "Pi (pi-coding-agent)",
    image: "/providers/pi.svg",
    color: "#6366F1",
    description: "Pi coding agent — minimal, extensible agent harness",
    configType: "custom",
    binary: "pi",
    configPath: "~/.pi/agent/models.json",
    baseUrlPath: "/v1",
    configFileTemplate: `{\n  "providers": {\n    "routen": {\n      "type": "openai",\n      "baseUrl": "http://127.0.0.1:20127/v1",\n      "apiKey": "routen-local"\n    }\n  }\n}`,
  },
  omp: {
    id: "omp",
    name: "Oh My Pi",
    image: "/providers/omp.png",
    color: "#EC4899",
    description: "Oh My Pi terminal AI agent with auto-discovery support",
    configType: "custom",
    binary: "omp",
    configPath: "~/.omp/agent/models.yml",
    baseUrlPath: "/v1",
    configFileTemplate: `providers:\n  routen:\n    type: openai\n    base_url: http://127.0.0.1:20127/v1\n    api_key: routen-local`,
  },
  crush: {
    id: "crush",
    name: "Crush",
    image: "/providers/crush.png",
    color: "#FB923C",
    description: "Charm Crush terminal AI coding agent",
    configType: "custom",
    binary: "crush",
    configPath: "~/.config/crush/crush.json",
    baseUrlPath: "/v1",
    configFileTemplate: `{\n  "providers": {\n    "routen": {\n      "type": "openai",\n      "base_url": "http://127.0.0.1:20127/v1",\n      "api_key": "routen-local"\n    }\n  }\n}`,
  },
  forge: {
    id: "forge",
    name: "ForgeCode",
    image: "/providers/forge.png",
    color: "#EAB308",
    description: "Antinomy HQ ForgeCode agent harness",
    configType: "custom",
    binary: "forge",
    configPath: "~/.forge/config.toml",
    baseUrlPath: "/v1",
    configFileTemplate: `[openai]\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "routen-local"`,
  },
  smelt: {
    id: "smelt",
    name: "Smelt",
    image: "/providers/smelt.svg",
    color: "#EF4444",
    description: "Smelt terminal AI coding assistant",
    configType: "custom",
    binary: "smelt",
    configPath: "~/.smelt/config.json",
    baseUrlPath: "/v1",
    configFileTemplate: `{\n  "provider": "openai",\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "routen-local"\n}`,
  },
  codewhale: {
    id: "codewhale",
    name: "CodeWhale",
    image: "/providers/codewhale.svg",
    color: "#4F46E5",
    description: "CodeWhale terminal coding agent",
    configType: "custom",
    binary: "codewhale",
    configPath: "~/.codewhale/config.toml",
    baseUrlPath: "/v1",
    configFileTemplate: `[openai]\nbase_url = "http://127.0.0.1:20127/v1"\napi_key = "routen-local"`,
  },
};

export const CLI_TOOLS_ARRAY = Object.values(CLI_TOOLS);
