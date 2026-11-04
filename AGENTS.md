# AGENTS.md — Mapigate

> **Operational guidance, strategic roadmap, and development invariants for AI Coding Agents (Claude Code, Cursor, Kiro, Codex, Copilot) working in the `mapigate` repository.**

---

## 1. Mission & Overview

**Mapigate** (AI Model API Gateway) is an **ultra-lightweight, 100% local-first AI Router & Token Optimizer** built specifically and exclusively for **AI coding assistants**: Claude Code, Cursor, Cline, OpenCode, Codex, and GitHub Copilot.

### Why Mapigate Exists:
* **Lean Stack:** Lightweight **Vite + React (SPA)** frontend served by a pure **Node.js Express** gateway on a single unified port (`20128`). Starts up in `< 300ms`, builds in `1–3 seconds`.
* **Zero Non-Coding Bloat:** Exclusively for coding models and developer tools. Stripped of image/video/audio generators, multi-language dictionaries (i18n), dynamic theme engines, and external cloud sync.
* **Flawless Cross-Platform DX:** Native Windows PowerShell and Linux support using pure Node.js scripts (`cross-env`, `concurrently`). No `.sh` scripts.

---

## 2. Core Strategic Pillars

### 🛡️ Pillar 1: 100% Local-First & Zero Data Leakage
* **No Telemetry / No Remote Phone-Home:** Completely disconnected from any external telemetry, heartbeat pings, or cloud license servers. Operates 100% offline and standalone.
* **Hardware-Tied Encryption Vault:** API keys and credentials are never stored in plain text. Encrypted using **AES-256-GCM** with a dynamic key derived from the host's hardware Machine ID (`node-machine-id`).

### ⚡ Pillar 2: High Performance & Developer Experience (DX)
* **Single Unified Port (20128):** Serves both real-time streaming AI proxy endpoints and the static Web Dashboard on a single port.
* **Non-Blocking Storage:** SQLite running in WAL mode (native `node:sqlite` in Node.js >= 22.5 or `better-sqlite3`), eliminating native compilation lockups during package installations.

### ✂️ Pillar 3: Coding-Centric Token Optimization (Token Saver Engine)
* **Modular Token Optimization:** Coordinates multiple token saving methods (RTK in-place tool result compression, Caveman style compression, Ponytail minimalist coding, and Custom Prompts) to optimize context window usage.
* **In-Place Tool Result Compression (RTK):** Coding agents produce massive context payloads through repetitive tool invocations (`git diff`, `grep`, `file search`, `terminal logs`). The RTK method inspects and compresses these outputs in-place, achieving **20% – 40% context window savings**.
* **Fail-Open Invariant:** If compression fails or payload structure is unfamiliar, the Token Saver immediately passes the original request untouched. It must **never** break user requests.
* **Error Trace Preservation:** Tool results containing `is_error` or exception traces are strictly exempt from compression so coding agents retain full debugging visibility.

### 🔄 Pillar 4: Smart Routing & High Availability
* **Multi-Protocol Translation:** Full bidirectional translation between Anthropic Messages (`/v1/messages`), OpenAI Chat Completions (`/v1/chat/completions`), and OpenAI Responses API (`/v1/responses`), preserving reasoning/thinking blocks and tool call streams.
* **Automatic Fallback:** Seamlessly re-routes requests to backup models/providers when the primary model encounters rate limits (HTTP 429) or quota exhaustion.
* **Multi-Account Load Balancing:** Rotates multiple accounts round-robin per provider to maximize quota utilization.

### 🎯 Pillar 5: Support for Open & Closed Coding Tools
* **Direct Gateway:** Direct connection for tools supporting configurable Base URLs (Claude Code via `ANTHROPIC_BASE_URL`, Cursor via OpenAI Base URL Override, Cline).
* **Decoupled MITM Interceptor:** Local HTTPS proxy (Port 443 with self-signed Root CA, configurable via `MAPIGATE_MITM_PORT`) to intercept hardcoded endpoints for closed tools (GitHub Copilot, Kiro IDE, Google Antigravity).

---

## 3. Directory Map & Responsibilities

```
mapigate/
├── bin/
│   └── mapigate.js              # CLI executable entry point (with mpg & mapigate aliases)
├── scripts/
│   └── generate-registries.mjs  # Pure pre-build scanner generating all module registries
├── src/
│   ├── cli/                     # Daemon lifecycle management & developer tools setup
│   │   ├── commands/            # CLI subcommands (start, stop, status, models, providers, connect)
│   │   ├── tools/               # Modularized CLI Tools
│   │   │   ├── definitions/     # Self-contained modules per tool (claude, cursor, cline, codex, etc.)
│   │   │   │   └── <tool>/      # definition.ts, configurator.ts (if auto-apply supported), index.ts
│   │   │   ├── generated/       # AUTO-GENERATED toolsRegistry.ts & handlersRegistry.ts
│   │   │   └── registry.ts      # ToolConfigRegistry lookup & validator
│   │   └── tui/                 # Interactive terminal UI
│   ├── core/                    # Gateway Engine (framework-agnostic)
│   │   ├── adapters/            # Protocol converters (OpenAI ⇄ Anthropic ⇄ Responses ⇄ Gemini)
│   │   ├── capabilities/        # Context window & thinking token resolution engine
│   │   ├── router/              # Routing engine, fallback rules, load balancing
│   │   ├── tokenSaver/          # Token Saver Engine (methods: rtk, caveman, ponytail, customPrompt)
│   │   │   └── methods/rtk/     # In-place diff, grep, search, logs compressors
│   │   └── scheduler/           # Periodic quota resets and provider health-checks
│   ├── providers/               # Hierarchical 100% Self-Contained Provider Modules
│   │   ├── core/                # Shared base classes, interfaces, runtime ProviderRegistry
│   │   ├── runtime/             # Built-in providers (claude, openai, deepseek, bedrock, github, etc.)
│   │   │   └── <provider>/      # assets/, metadata.ts, provider.ts, (optional) routes.ts, index.ts
│   │   ├── composite/           # Composite routing providers (combo)
│   │   ├── catalog/             # Lightweight standard providers (360ai, agnes, etc.) & community
│   │   ├── generated/           # AUTO-GENERATED metadata, provider, and routes registries
│   │   └── index.ts             # Unified barrel export
│   ├── mitm/                    # Decoupled HTTPS Interceptor
│   │   ├── handlers/            # Modularized tool handlers (kiro, copilot, antigravity)
│   │   │   └── <tool>/          # config.ts (hosts, patterns, UI config), handler.ts, interceptor.ts
│   │   ├── toolsHelper.ts       # Runtime MITM helpers (getToolForHost, isChatRequest, extractModel)
│   │   ├── cert/                # Root CA & dynamic TLS certificate generator
│   │   └── server.ts            # MITM interceptor server
│   ├── server/                  # HTTP & SSE Gateway
│   │   ├── middlewares/         # Auth, logging, rate limiter, error handlers
│   │   ├── proxy/               # Upstream streaming handler & decomposed SSE pipes
│   │   ├── routes/              # REST APIs for Web Dashboard (/api/models, /api/providers)
│   │   └── index.ts             # Gateway entry (Port 20128, serves static SPA & /assets/providers)
│   ├── storage/                 # Data persistence & security
│   │   ├── crypto/              # Hardware-salted AES-256-GCM encryption vault
│   │   ├── database.ts          # SQLite connection manager with WAL mode
│   │   ├── migrations/          # SQLite schema versioning
│   │   └── repositories/        # Data access layer for providers, models, usage logs
│   ├── web/                     # Web Dashboard SPA (React 19 + Vite + Tailwind CSS)
│   │   ├── src/                 # Components (including ToolIcon.tsx), Pages, Zustand stores
│   │   └── vite.config.ts       # Vite config (copies provider assets to dist/web/assets/providers)
│   └── shared/                  # Common TypeScript interfaces, enums, constants
├── dist/                        # Compiled production artifacts (server & static web)
├── ARCHITECTURE.md              # Detailed technical design specifications
└── package.json                 # Dependencies, npm scripts (codegen hooked to predev/prebuild/pretest)
```

---

## 4. Request Lifecycle

```
Client (Claude Code / Cursor / Cline / Kiro / Copilot)
  │
  ▼
[Port 20128: Gateway Server]
  │
  ├─► Authenticate request & identify route (/v1/messages, /v1/chat/completions, or /v1/responses)
  │
  ├─► [Core Router]:
  │     1. Detect client type & requested target model
  │     2. Select healthy provider/account (check quota & round-robin priority)
  │
  ├─► [Token Saver Coordinator] (Fail-Open):
  │     - Inspect tool calls, tool results, and prompt instructions
  │     - Apply active methods: RTK (tool outputs), Caveman, Ponytail, Custom Prompt
  │     - Compress verbose output in-place while strictly preserving error traces
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
        - Record input/output token counts and token savings in SQLite (WAL mode)
```

---

## 5. Development Invariants for Agents

1. **Self-Contained Module Invariant:**
   * All provider logic, metadata, models, and assets MUST reside in `src/providers/runtime/<name>/` or `src/providers/catalog/<name>/`.
   * If a provider defines custom API endpoints, OAuth PKCE flows, device code handling, or IDE token auto-import, implement them exclusively in `routes.ts` exporting `export function registerRoutes(router: Router): void`.
   * All CLI tool definitions and configurators MUST reside in `src/cli/tools/definitions/<tool>/`.
   * All MITM tool configs and handlers MUST reside in `src/mitm/handlers/<tool>/`.
   * Server route files under `src/server/routes/` MUST remain Generic Thin Routers (< 150–200 lines) that mount auto-generated provider routes via `registerAllProviderRoutes(router)`. Never add provider, CLI, or MITM logic directly into proxy middleware, router core, or public directories.
2. **Pure Scanner Invariant:**
   * `scripts/generate-registries.mjs` is strictly a pure scanner and import generator. It scans `metadata.ts`, `provider.ts`, and `routes.ts` across provider folders into generated registries (`metadataRegistry.generated.ts`, `providersRegistry.ts`, `routesRegistry.generated.ts`). Never add business rules or inline helpers to it.
   * Never manually edit generated registry files. Run `npm run codegen` to regenerate.
3. **UI Icon Consistency Invariant:**
   * Always render icons through `src/web/src/components/ui/ToolIcon.tsx`.
   * Dark or monochrome icons must provide `iconBg` in their metadata/definition to maintain strong contrast against dark mode surfaces.
4. **Strict TypeScript:**
   * All new files in `src/` must be TypeScript. Avoid `any` without justification; declare or reuse shared types from `src/shared/` or `src/providers/core/types.ts`.
5. **Cross-Platform Compatibility:**
   * Always use `node:path` methods (`path.join`, `path.resolve`). Never hardcode `/` or `\\` path separators.
   * All scripts and build helpers must use Node.js (`.ts` or `.mjs`). **Never introduce `.sh` shell scripts.**
6. **API Key Security Invariant:**
   * Any API key or OAuth secret stored in SQLite **must** pass through `cryptoVault.encrypt()`.
   * Never log raw API keys to `console.log` or store unencrypted credentials.
7. **Token Saver Fail-Open Architecture:**
   * All Token Saver methods and compression logic under `src/core/tokenSaver/` must be wrapped in defensive `try...catch` blocks. On any unexpected error or parser mismatch, return the unmodified request body.
8. **Anti-Bloat Discipline:**
   * Do not install heavy dependencies, reintroduce Next.js SSR, add i18n systems, or support media generation.
   * Always evaluate new features against the core mission: *"Does this directly accelerate or stabilize AI coding workflows?"*
9. **Format-Aware Protocol Invariant:**
   * Handlers, streamers, and proxy pipelines must never assume the client format is only OpenAI or Anthropic. Mapigate actively supports three first-class client formats: `"openai"`, `"anthropic"`, and `"responses"` (`OpenAI Responses API`, used by tools like Kiro).
   * All streaming pipelines (`sseStreamer.ts`, `bedrockStreamer.ts`, runtime provider streaming loops) and non-streaming response formatters (`pipeline.ts`, `responseHandlers.ts`) must check `context.clientFormat` and emit the correct chunk/event format and termination signals (`[DONE]`, `message_stop`, or `response.completed`).
