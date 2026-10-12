# AGENTS.md — Mapigate

> **Operational guidance, strategic roadmap, and development invariants for AI Coding Agents (Claude Code, Cursor, Kiro, Codex, Copilot) working in the `mapigate` repository.**

---

## 1. Mission & Overview

**Mapigate** (AI Model API Gateway) is an **ultra-lightweight, 100% local-first AI Router & Token Optimizer** built specifically and exclusively for **AI coding assistants**: Claude Code, Cursor, Cline, OpenCode, Codex, and GitHub Copilot.

### Why Mapigate Exists:
* **Lean Stack:** Lightweight **Vite + React (SPA)** frontend served by a pure **Node.js Express** gateway on a single unified port (`20127`). Starts up in `< 300ms`, builds in `1–3 seconds`.
* **Zero Non-Coding Bloat:** Exclusively for coding models and developer tools. Stripped of image/video/audio generators, multi-language dictionaries (i18n), dynamic theme engines, and external cloud sync.
* **Flawless Cross-Platform DX:** Native Windows PowerShell and Linux support using pure Node.js scripts (`cross-env`, `concurrently`). No `.sh` scripts.

---

## 2. Core Strategic Pillars

### 🛡️ Pillar 1: 100% Local-First & Zero Data Leakage
* **No Telemetry / No Remote Phone-Home:** Completely disconnected from any external telemetry, heartbeat pings, or cloud license servers. Operates 100% offline and standalone.
* **Hardware-Tied Encryption Vault:** API keys and credentials are never stored in plain text. Encrypted using **AES-256-GCM** with a dynamic key derived from the host's hardware Machine ID (`node-machine-id`).

### ⚡ Pillar 2: High Performance & Developer Experience (DX)
* **Single Unified Port (20127):** Serves both real-time streaming AI proxy endpoints and the static Web Dashboard on a single port.
* **Non-Blocking Storage:** SQLite running in WAL mode (`node:sqlite` or pure JS fallback), eliminating native compilation lockups during package installations.

### ✂️ Pillar 3: Coding-Centric Token Optimization (RTK Token Saver)
* **In-Place Tool Result Compression:** Coding agents produce massive context payloads through repetitive tool invocations (`git diff`, `grep`, `file search`, `terminal logs`). RTK inspects and compresses these outputs in-place, achieving **20% – 40% context window savings**.
* **Fail-Open Invariant:** If compression fails or payload structure is unfamiliar, RTK immediately passes the original request untouched. It must **never** break user requests.
* **Error Trace Preservation:** Tool results containing `is_error` or exception traces are strictly exempt from compression so coding agents retain full debugging visibility.

### 🔄 Pillar 4: Smart Routing & High Availability
* **Dual-Protocol Translation:** Full bidirectional translation between Anthropic Messages (`/v1/messages`) and OpenAI Chat Completions (`/v1/chat/completions`), preserving reasoning/thinking blocks and tool call streams.
* **Automatic Fallback:** Seamlessly re-routes requests to backup models/providers when the primary model encounters rate limits (HTTP 429) or quota exhaustion.
* **Multi-Account Load Balancing:** Rotates multiple accounts round-robin per provider to maximize quota utilization.

### 🎯 Pillar 5: Support for Open & Closed Coding Tools
* **Direct Gateway:** Direct connection for tools supporting configurable Base URLs (Claude Code via `ANTHROPIC_BASE_URL`, Cursor via OpenAI Base URL Override, Cline).
* **Decoupled MITM Interceptor:** Local HTTPS proxy (Port 8443/443 with self-signed Root CA) to intercept hardcoded endpoints for tools like GitHub Copilot or legacy Cursor binaries.

---

## 3. Directory Map & Responsibilities

```
mapigate/
├── bin/
│   └── mapigate.js              # CLI executable entry point (with mpg & mapigate aliases)
├── src/
│   ├── cli/                     # Daemon lifecycle management & developer tools setup
│   │   ├── commands/            # CLI subcommands (start, stop, status, models, providers)
│   │   ├── tools/               # Decoupled tool auto-config registry (Claude Code, Cursor, Cline)
│   │   └── tui/                 # Interactive terminal UI
│   ├── core/                    # Gateway Engine (framework-agnostic)
│   │   ├── adapters/            # Protocol converters (OpenAI ⇄ Anthropic ⇄ Gemini)
│   │   ├── auth/                # Third-party credentials & OAuth refreshers
│   │   ├── capabilities/        # Context window & thinking token capability definitions
│   │   ├── router/              # Routing engine, fallback rules, load balancing
│   │   ├── rtk/                 # RTK Token Saver (compressors for diff, grep, logs)
│   │   └── scheduler/           # Periodic quota resets and provider health-checks
│   ├── providers/               # 100% Self-Contained Provider Modules
│   │   ├── <provider-name>/     # assets/, metadata.ts, provider.ts, quota.ts, index.ts
│   │   ├── combo/               # Composite Provider for multi-model & multimodal routing
│   │   ├── base/                # BaseProvider, OpenAiCompatibleProvider, AnthropicCompatibleProvider
│   │   ├── metadataRegistry.ts  # Unified Isomorphic Metadata Catalog (Single Source of Truth)
│   │   └── registry.ts          # Central Provider Runtime Registry (Pluggable)
│   ├── mitm/                    # Decoupled HTTPS Interceptor (CA Manager, Host Interceptor)
│   ├── server/                  # HTTP & SSE Gateway
│   │   ├── middlewares/         # Auth, logging, rate limiter, error handlers
│   │   ├── proxy/               # Upstream streaming handler & decomposed SSE pipes
│   │   ├── routes/              # REST APIs for Web Dashboard (/api/models, /api/providers)
│   │   └── index.ts             # Gateway entry (Port 20127, serves static SPA & /assets/providers)
│   ├── storage/                 # Data persistence & security
│   │   ├── crypto/              # Hardware-salted AES-256-GCM encryption vault
│   │   ├── database.ts          # SQLite connection manager with WAL mode
│   │   ├── migrations/          # SQLite schema versioning
│   │   └── repositories/        # Data access layer for providers, models, usage logs
│   ├── web/                     # Web Dashboard SPA (React 19 + Vite + Tailwind CSS)
│   │   ├── src/                 # Components, Pages, Zustand stores, Hooks
│   │   └── vite.config.ts       # Vite config (copies provider assets to dist/web/assets/providers)
│   └── shared/                  # Common TypeScript interfaces, enums, constants
├── dist/                        # Compiled production artifacts (server & static web)
├── ARCHITECTURE.md              # Detailed technical design specifications
└── package.json                 # Dependencies and npm scripts
```

---

## 4. Request Lifecycle

```
Client (Claude Code / Cursor / Cline)
  │
  ▼
[Port 20127: Gateway Server]
  │
  ├─► Authenticate request & identify route (/v1/messages or /v1/chat/completions)
  │
  ├─► [Core Router]:
  │     1. Detect client type & requested target model
  │     2. Select healthy provider/account (check quota & round-robin priority)
  │
  ├─► [RTK Compressor] (Fail-Open):
  │     - Inspect tool calls and tool results (git diff, terminal output)
  │     - Compress verbose output in-place while preserving error traces
  │
  ├─► [Provider Dispatcher (`src/providers/`)]:
  │     - Retrieve provider from ProviderRegistry
  │     - Convert client payload structure ➔ Upstream Provider expected format
  │     - Preserve tool definitions, tool invocations, and reasoning blocks
  │
  ├─► [Upstream Execution]:
  │     - Send request to AI Provider (Anthropic, OpenAI, DeepSeek, Google, etc.)
  │     - On HTTP 429 / Quota Error: Trigger automatic fallback to next available model/account
  │
  ├─► [Response Translation & Streaming]:
  │     - Receive upstream SSE chunks
  │     - Translate chunk format ➔ Client expected SSE format
  │     - Pipe stream directly to client with minimal latency
  │
  └─► [Usage & Analytics Storage]:
        - Record input/output token counts and RTK savings in SQLite (WAL mode)
```

---

## 5. Development Invariants for Agents

1. **Self-Contained Provider Invariant:**
   * All provider logic, metadata, models, and assets MUST reside in `src/providers/<name>/`.
   * Never add provider logic directly into proxy middleware, router core, or public directories.
2. **Strict TypeScript:**
   * All new files in `src/` must be TypeScript. Avoid `any` without justification; declare or reuse shared types from `src/shared/` or `src/providers/types.ts`.
3. **Cross-Platform Compatibility:**
   * Always use `node:path` methods (`path.join`, `path.resolve`). Never hardcode `/` or `\\` path separators.
   * All scripts and build helpers must use Node.js (`.ts` or `.mjs`). **Never introduce `.sh` shell scripts.**
4. **API Key Security Invariant:**
   * Any API key or OAuth secret stored in SQLite **must** pass through `cryptoVault.encrypt()`.
   * Never log raw API keys to `console.log` or store unencrypted credentials.
5. **RTK Fail-Open Architecture:**
   * All RTK compression logic under `src/core/rtk/` must be wrapped in defensive `try...catch` blocks. On any unexpected error or parser mismatch, return the unmodified request body.
6. **Anti-Bloat Discipline:**
   * Do not install heavy dependencies, reintroduce Next.js SSR, add i18n systems, or support media generation.
   * Always evaluate new features against the core mission: *"Does this directly accelerate or stabilize AI coding workflows?"*
