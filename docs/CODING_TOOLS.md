# Coding Assistants Integration Guide — Mapigate

> Mapigate supports **26+ AI coding tools and IDE extensions**. You can configure them automatically using `mpg connect <tool>` or manually via environment variables and settings files.

---

## Supported Tools Overview

| Tool ID | Name | Type | One-Click Auto-Apply | Protocol Used |
| :--- | :--- | :--- | :---: | :--- |
| `claude` | Claude Code (CLI) | CLI Agent | ✅ Yes | Anthropic (`/v1/messages`) |
| `cursor` | Cursor IDE | Editor | 📖 Guide | OpenAI (`/v1/chat/completions`) |
| `cline` | Cline (VS Code Extension) | Extension | ✅ Yes | OpenAI / Anthropic |
| `opencode` | OpenCode | CLI Agent | ✅ Yes | OpenAI Compatible |
| `codex` | Codex CLI | CLI Agent | ✅ Yes | OpenAI / Responses |
| `copilot` | GitHub Copilot | Extension/CLI | 🛡️ MITM / Guide | OpenAI (`/v1/chat/completions`) |
| `kiro` | Kiro IDE (MITM only, not a `mpg connect` target) | Editor | 🛡️ MITM | Kiro / CodeWhisperer event stream |
| `roo` | Roo Code (VS Code) | Extension | ✅ Yes | OpenAI Compatible |
| `continue` | Continue.dev | Extension | ✅ Yes | OpenAI Compatible |
| `devin` | Cognition Devin | CLI Agent | ✅ Yes | OpenAI Compatible |
| `amp` | Amp AI | CLI Agent | ✅ Yes | OpenAI Compatible |
| `codewhale` | CodeWhale | CLI Agent | ✅ Yes | OpenAI Compatible |
| `cowork` | Cowork AI | CLI Agent | ✅ Yes | OpenAI Compatible |
| `crush` | Crush CLI | CLI Agent | ✅ Yes | OpenAI Compatible |
| `deepseek-tui`| DeepSeek TUI | CLI Agent | ✅ Yes | OpenAI Compatible |
| `droid` | Droid Coding Agent | CLI Agent | ✅ Yes | OpenAI Compatible |
| `forge` | Forge CLI | CLI Agent | ✅ Yes | OpenAI Compatible |
| `grok-build` | Grok Build CLI | CLI Agent | ✅ Yes | OpenAI Compatible |
| `hermes` | Hermes Agent | CLI Agent | ✅ Yes | OpenAI Compatible |
| `jcode` | JCode | CLI Agent | ✅ Yes | OpenAI Compatible |
| `kilo` | Kilo Code | CLI Agent | ✅ Yes | OpenAI Compatible |
| `omp` | OMP Coding Agent | CLI Agent | ✅ Yes | OpenAI Compatible |
| `openclaw` | OpenClaw | CLI Agent | ✅ Yes | OpenAI Compatible |
| `opendesign`| OpenDesign CLI | CLI Agent | ✅ Yes | OpenAI Compatible |
| `pi` | Pi Coding Agent | CLI Agent | ✅ Yes | OpenAI Compatible |
| `qwen` | Qwen Code CLI | CLI Agent | ✅ Yes | OpenAI Compatible |
| `smelt` | Smelt CLI | CLI Agent | ✅ Yes | OpenAI Compatible |

---

## 1. Claude Code (`claude`)

### Method A: One-Click Auto Config
```bash
mpg connect claude
# Or with specific model overrides:
mpg connect claude --sonnet claude-sonnet-4-6 --opus claude-opus-4-6-thinking
```

### Method B: Environment Variables
**Windows PowerShell:**
```powershell
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:20127"
$env:ANTHROPIC_API_KEY = "mapigate-local"
claude
```

**Bash / Zsh (Linux / macOS):**
```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:20127"
export ANTHROPIC_API_KEY="mapigate-local"
claude
```

**Permanent PowerShell Profile (`$PROFILE`):**
```powershell
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', 'http://127.0.0.1:20127', 'User')
```

---

## 2. Cursor IDE

Cursor can connect either via OpenAI Base URL Override or via the Mapigate MITM HTTPS Proxy.

### Option 1: Base URL Override (Recommended)
1. Open Cursor and navigate to **Settings** → **Models**.
2. Scroll to **OpenAI API Key**.
3. Toggle ON **Override OpenAI Base URL**.
4. Set Base URL:
   ```text
   http://127.0.0.1:20127/v1
   ```
5. Set API Key: `mapigate-local` (or any string).
6. Under **Model Names**, add the model alias configured in Mapigate (e.g. `claude-sonnet-4-6` or `cursor-fast`).

### Option 2: Use Cursor as an upstream provider
Mapigate has no MITM handler for Cursor. If you have a Cursor subscription, you can instead add it as a provider (`cursor` / `cursor-api` runtime providers) on the **Providers** tab and route other tools to Cursor models.

---

## 3. Cline (VS Code Extension)

### Method A: One-Click Auto Config
```bash
mpg connect cline
```

### Method B: Manual Configuration
1. Open VS Code and open the **Cline** sidebar.
2. Click the **Settings (gear)** icon.
3. Select **API Provider**: `OpenAI Compatible`.
4. Configure:
   - **Base URL**: `http://127.0.0.1:20127/v1`
   - **API Key**: `mapigate-local`
   - **Model ID**: `claude-sonnet-4-6` (or any alias/combo configured in Mapigate).

---

## 4. OpenCode CLI (`opencode`)

### Method A: One-Click Auto Config
```bash
mpg connect opencode
```
This updates `~/.config/opencode/config.json` automatically.

### Method B: Manual Configuration
In `~/.config/opencode/config.json`:
```json
{
  "api": {
    "provider": "openai",
    "baseURL": "http://127.0.0.1:20127/v1",
    "apiKey": "mapigate-local",
    "model": "claude-sonnet-4-6"
  }
}
```

---

## 5. Codex CLI (`codex`)

### Method A: One-Click Auto Config
```bash
mpg connect codex
```

### Method B: Manual Configuration
In `~/.codex/config.json`:
```json
{
  "endpoint": "http://127.0.0.1:20127/v1",
  "apiKey": "mapigate-local",
  "model": "gpt-4o"
}
```

---

## 6. GitHub Copilot (VS Code / JetBrains / CLI)

GitHub Copilot hardcodes its endpoints to `api.githubcopilot.com`. Mapigate intercepts Copilot traffic via the decoupled MITM HTTPS Interceptor:

1. In Mapigate Web Dashboard, navigate to **MITM** tab.
2. Click **Install Root Certificate Authority (CA)**.
3. Click **Enable Copilot Interception**.
4. Mapigate redirects `api.githubcopilot.com` (and the individual/business/enterprise hosts) to `127.0.0.1:443`, translating Copilot's chat completions into upstream providers while compressing diffs and terminal results with RTK.
5. In **Model Mappings**, map `gpt-4o` or `claude-3.5-sonnet` to any upstream provider configured in Mapigate.

---

## 7. Kiro IDE

Kiro IDE communicates with AWS Bedrock or internal streaming endpoints:

1. In Mapigate Dashboard, go to **MITM** tab.
2. Enable **Kiro Interception**.
3. Mapigate routes Kiro's binary event-stream frames to the **Antigravity / Google Cloud Code** provider, utilizing stable `toNumericSessionId` hashing to achieve **~98% KV cache hit rate**.
4. Trajectory steps and thought signatures are automatically preserved in the local SQLite vault.

---

## 8. Roo Code (Roo Cline)

```bash
mpg connect roo
```
Or in Roo Code settings:
- **API Provider**: `OpenAI Compatible`
- **Base URL**: `http://127.0.0.1:20127/v1`
- **API Key**: `mapigate-local`

---

## 9. Continue.dev

In `~/.continue/config.json`:
```json
{
  "models": [
    {
      "title": "Mapigate Sonnet",
      "provider": "openai",
      "model": "claude-sonnet-4-6",
      "apiBase": "http://127.0.0.1:20127/v1",
      "apiKey": "mapigate-local"
    }
  ]
}
```

---

## 10. Bulk Setup: Connect All Tools at Once

To configure every installed coding assistant on your machine in a single command:

```bash
mpg connect all
```

To verify the connection status of all tools:
```bash
mpg show
```
To run end-to-end system validation:
```bash
mpg doctor
```

---

## 11. Tools & Mappings: Global & Per-Tool Model Mappings

In the Mapigate Web Dashboard, the **Tools & Mappings** tab provides unified control over tool discovery, configuration, and intelligent model alias mapping:

### 11.1. Dual View Modes
- **Tool Catalog View:** Displays interactive cards for all 26 supported assistants. Each card shows live connection status (`Connected`, `Setup Guide`, `Not configured`, `Not installed`), configuration file locations, quick PowerShell/Bash environment copy buttons, and a **Sync Aliases to Global Mappings** button.
- **Global Model Mappings View:** A centralized table for managing how model identifiers requested by coding tools translate to upstream targets or combos.

### 11.2. Global Model Mapping (`/api/cli-tools/global-mappings`)
Many coding assistants have hardcoded model names (e.g. `claude-3-5-sonnet-20241022`, `gpt-4o`, `o1`). The Model Mapping subsystem intercepts these identifiers and routes them to your designated target model or multi-model combo:
- **Source Model:** The model string requested by the client tool.
- **Target Model:** The actual provider model or combo to invoke (e.g. `deepseek-chat`, `claude-sonnet-4-6`, or `combo:coding-combo`).
- **Normalized `combo:` Prefix:** You can specify `combo:coding-combo` or simply `coding-combo`. Mapigate automatically normalizes the prefix across APIs and UI badges.

### 11.3. Per-Tool Model Mapping Overrides (`/api/cli-tools/:tool/mappings`)
When different coding tools require distinct model behaviors for the same model name:
- Define per-tool overrides in the tool detail modal.
- Mapigate checks tool-specific mappings first before falling back to global mappings.

### 11.4. Syncing Tool Aliases
- **Sync Aliases** (`POST /api/cli-tools/global-mappings/import/:tool`) copies a tool's default model aliases into the global mapping table in one click.
- **Reset** (`POST /api/cli-tools/global-mappings/reset`) restores the default global mappings.

> The router is also mounted at `/api/tools` and `/api/model-mappings`, so the same routes resolve under any of the three prefixes.

