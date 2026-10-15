# Mapigate 🚀

> **AI Model API Gateway & Token Optimizer for coding tools.**  
> Connect all your AI coding assistants (Claude Code, Cursor, Cline, OpenCode, Codex, GitHub Copilot) to multiple AI providers, save 20–40% tokens via RTK, and auto-fallback when rate-limited.

---

## ✨ Key Features

- **⚡ Fast & Lightweight:** Starts in `< 300ms`, zero heavy dependencies, native Windows & Linux support.
- **🛡️ 100% Local-First & Secure:** No external server phone-home, no telemetry. All API keys are encrypted locally using **AES-256-GCM** with your hardware Machine ID.
- **✂️ RTK Token Saver:** Automatically detects and compresses tool results (`git diff`, `grep`, terminal logs, search results) to save 20–40% context tokens without breaking agent logic.
- **🔄 Auto-Fallback & Multi-Account:** Automatically routes requests to backup models when primary models hit rate limits (429) or quota errors. Round-robin rotation across multiple accounts.
- **🎯 Multi-Protocol Translation:** Full bidirectional translation between Anthropic Messages (`/v1/messages`), OpenAI Chat Completions (`/v1/chat/completions`), and OpenAI Responses API (`/v1/responses`), including reasoning/thinking content and tool use streaming.
- **🖥️ Clean Dark Dashboard:** Modern, developer-focused React + Vite SPA dashboard for managing providers, keys, model routing, and monitoring real-time token savings.

---

## 🚀 Quick Start

### 1. Install & Build

```bash
npm install
npm run build
```

### 2. Start the Gateway

```bash
# Foreground mode (shows real-time console logs):
npm start

# Or using the Mapigate CLI (mapigate or mpg alias):
node bin/mapigate.js start

# Background daemon mode:
node bin/mapigate.js start -d
```

Open your browser at: **`http://127.0.0.1:20127`** to access the dashboard.

---

## 🔌 Connecting Your Coding Tools

### Claude Code

**Windows PowerShell:**
```powershell
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:20127"
claude
```

**Bash / macOS / Linux:**
```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:20127"
claude
```

### Cursor IDE
1. Open **Cursor Settings** → **Models** → **OpenAI API Key**.
2. Set **Override Base URL**: `http://127.0.0.1:20127/v1`
3. Set **API Key**: any string (e.g. `mapigate-local`).

### Cline (VS Code Extension)
1. Open **Cline Settings** → **API Provider**: `OpenAI Compatible`.
2. Set **Base URL**: `http://127.0.0.1:20127/v1`
3. Set **API Key**: any string (e.g. `mapigate-local`).

---

## 🛠️ Developer Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs both Server (`tsx watch`) and Vite frontend concurrently with instant HMR |
| `npm run build` | Compiles server TypeScript to `dist/server` and builds Vite SPA to `dist/web` |
| `npm run typecheck` | Validates TypeScript types across the codebase |
| `npm test` | Runs test suite using node test runner |
| `node bin/mapigate.js status` | Checks gateway status and token savings statistics |
| `node bin/mapigate.js stop` | Stops the background daemon and cleans up PID |

---

## 📂 Architecture Overview

```
mapigate/
├── src/
│   ├── core/           # Routing rules, RTK token compressor, OpenAI ⇄ Claude adapters
│   ├── storage/        # SQLite (WAL mode via node:sqlite), AES-256-GCM crypto vault
│   ├── server/         # Express SSE proxy & REST management APIs
│   ├── cli/            # Background daemon manager & terminal commands
│   ├── mitm/           # Optional HTTPS interception & Root CA management
│   ├── web/            # Vite + React SPA dark dashboard
│   └── shared/         # Common TypeScript types and constants
├── dist/               # Compiled standalone server & web assets
└── bin/mapigate.js     # CLI executable entry (with mpg & mapigate aliases)
```
