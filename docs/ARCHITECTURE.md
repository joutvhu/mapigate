# System Architecture & Technical Specifications — Mapigate

> **Positioning:** Ultra-lightweight, 100% local-first AI Model API Gateway and Token Optimizer engineered exclusively for **AI Coding Assistants** (Claude Code, Cursor, Cline, OpenCode, Codex, GitHub Copilot, Kiro IDE, and Continue).  
> **Core Tenet:** Zero telemetry, single unified port (`20127`), fail-open token compression, hardware-salted AES-256-GCM encryption vault, and pluggable zero-manual-import registry architecture.

---

## 1. High-Level Architecture

Mapigate unifies the fragmented ecosystem of AI coding assistants and upstream model providers into a high-performance local routing plane.

```mermaid
graph TD
    subgraph UI["1. User & Tool Interfaces"]
        CLI["Interactive CLI / TUI<br/>(mapigate / mpg)"]
        TRAY["Windows System Tray<br/>(Background Notification Area)"]
        DASH["Web Dashboard SPA<br/>(React 19 + Vite + Tailwind)"]
        TOOLS["Coding Assistants<br/>(Claude Code, Cursor, Cline, OpenCode, Copilot, Kiro)"]
    end

    subgraph INGEST["2. Ingestion & Transport Layer"]
        GATEWAY["Direct Gateway (Port 20127)<br/>• /v1/chat/completions (OpenAI)<br/>• /v1/messages (Anthropic)<br/>• /v1/responses (OpenAI Responses)<br/>• /v1/models & Static Web Assets"]
        MITM["Decoupled MITM Proxy (Port 443, bound to 127.0.0.1)<br/>• Dynamic Root CA & SNI TLS<br/>• Intercepts Copilot, Kiro IDE & Antigravity"]
    end

    subgraph ENGINE["3. Core Engine"]
        ROUTER["Smart Router & Failover Engine<br/>Model resolution & Quota health"]
        COMBO["Combo Engine (5 Strategies)<br/>Fallback | Round-Robin | Fusion | LKGP | P2C"]
        RTK["RTK Token Saver (Fail-Open)<br/>In-place compression for git diff, grep, logs"]
        ADAPTERS["Format-Aware Protocol Translators<br/>OpenAI ⇄ Anthropic ⇄ Responses ⇄ Gemini"]
        LOADBAL["Multi-Account Load Balancer<br/>Round-robin key rotation & cooldown"]
        SCHED["Background Scheduler<br/>OAuth refresh & periodic quota resets"]
    end

    subgraph STORAGE["4. Storage & Security Layer"]
        SQLITE[("SQLite Database (WAL Mode)<br/>Non-blocking event & quota persistence")]
        VAULT["Hardware Crypto Vault<br/>AES-256-GCM keyed via node-machine-id"]
        KV["KV Store (TTL Cache)<br/>Thought signatures & session states"]
    end

    subgraph UPSTREAM["5. Upstream Providers (194+)"]
        PROV_RUN["Runtime Providers<br/>Claude, OpenAI, Bedrock, DeepSeek, Gemini, Antigravity"]
        PROV_CAT["Catalog Providers (161)<br/>Groq, Cerebras, Mistral, Together, OpenRouter..."]
    end

    TOOLS -->|HTTP / SSE| GATEWAY
    TOOLS -->|Intercepted HTTPS| MITM
    CLI -->|IPC / Process Control| GATEWAY
    TRAY -->|PowerShell Tray Control| GATEWAY
    DASH -->|REST / SSE Logs| GATEWAY

    GATEWAY --> ROUTER
    MITM --> ROUTER

    ROUTER --> COMBO
    COMBO --> RTK
    RTK --> ADAPTERS
    ADAPTERS --> LOADBAL
    LOADBAL --> PROV_RUN & PROV_CAT

    LOADBAL <--> SCHED
    ROUTER <--> SQLITE
    LOADBAL <--> VAULT
    ADAPTERS <--> KV
    PROV_RUN & PROV_CAT -->|Upstream AI API| INTERNET((AI Cloud APIs))
```

---

## 2. Request Lifecycle & Pipeline

Every incoming request passes through an optimized, non-blocking pipeline:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Coding Tool (Claude Code / Cursor / Cline)
    participant Gateway as Express Gateway (:20127)
    participant Router as Smart Router & Combo
    participant RTK as RTK Token Saver
    participant Adapter as Protocol Converter
    participant Provider as Upstream Provider (Anthropic/OpenAI)
    participant Storage as SQLite (WAL) & Vault

    Client->>Gateway: POST /v1/messages or /v1/chat/completions
    Gateway->>Router: Detect client format & resolve model alias
    Router->>Storage: Verify account status & active cooldowns
    Router->>Router: Select healthy account / apply Combo strategy
    Router->>RTK: Inspect payload for tool results (diff, grep, logs)
    alt Tool Result Contains Errors (is_error / stack trace)
        RTK-->>Router: Bypass compression (preserve 100% error trace)
    else Normal Tool Results
        RTK->>RTK: In-place compression (strip redundant hunks & progress bars)
        RTK-->>Router: Lean context payload (20%–40% token savings)
    end
    Router->>Adapter: Translate client format ➔ upstream provider format
    Adapter->>Provider: Send request (SSE Stream)
    alt Upstream Returns HTTP 429 / Quota Exhaustion
        Provider-->>Router: HTTP 429 Too Many Requests
        Router->>Storage: Mark account cooldown
        Router->>Provider: Auto-fallback to next model in Combo chain
    end
    Provider-->>Adapter: Upstream SSE chunks
    Adapter-->>Gateway: Translate chunks ➔ client expected format (OpenAI / Anthropic)
    Gateway-->>Client: Real-time SSE stream with thinking & tool calls
    Gateway->>Storage: Asynchronously log token counts & RTK savings
```

---

## 3. Hardware-Salted Security Architecture

Mapigate ensures credentials and API keys are never stored in plain text:

```mermaid
flowchart TD
    MID["Host Machine Hardware ID<br/>(node-machine-id)"] --> KDF["PBKDF2 Key Derivation Function<br/>(SHA-512 + Static Salt)"]
    KDF --> KEY["Dynamic 256-bit Machine Key"]

    PLAIN["Plaintext API Key / OAuth Secret"] --> ENC["AES-256-GCM Encryption"]
    KEY --> ENC
    RAND["Cryptographically Secure IV<br/>(crypto.randomBytes 12)"] --> ENC

    ENC --> CIPHER["Serialized Ciphertext<br/>enc:v1:iv:tag:ciphertext"]
    CIPHER --> DB[("SQLite Database<br/>~/.mapigate/mapigate.sqlite")]

    DB --> READ["Read Ciphertext"]
    READ --> DEC["AES-256-GCM Decryption"]
    KEY --> DEC
    DEC --> RESTORED["In-Memory Decrypted Secret<br/>(Never written to disk)"]
```

---

## 4. Combo Routing Engine Strategies

Mapigate supports 5 distinct model coordination strategies in `src/providers/composite/combo/`:

```mermaid
graph TD
    REQ["Incoming User Request"] --> STRAT{Combo Strategy}

    subgraph "1. Fallback (Cascading Failover)"
        STRAT -->|fallback| FB1["Primary Model<br/>(e.g. Claude 3.7 Sonnet)"]
        FB1 -.->|HTTP 429 / 5xx| FB2["Secondary Model<br/>(e.g. DeepSeek-R1)"]
        FB2 -.->|Error| FB3["Tertiary Model<br/>(e.g. GPT-4o)"]
    end

    subgraph "2. Round-Robin (Account Rotation)"
        STRAT -->|round-robin| RR["Sequential Account Dispatcher"]
        RR --> ACC1["Account Key #1"]
        RR --> ACC2["Account Key #2"]
        RR --> ACC3["Account Key #3"]
    end

    subgraph "3. Fusion (Multi-Model Synthesis)"
        STRAT -->|fusion| PAR["Parallel Dispatch"]
        PAR --> M1["Model A (Claude)"]
        PAR --> M2["Model B (GPT-4o)"]
        PAR --> M3["Model C (DeepSeek)"]
        M1 & M2 & M3 --> JUDGE["Judge Model<br/>(Gemini 2.5 Pro)"]
        JUDGE --> OUT["Synthesized Optimal Answer"]
    end

    subgraph "4. LKGP (Last Known Good Provider)"
        STRAT -->|lkgp| CACHE["Pin to Last Successful Provider<br/>(Maximizes Prompt KV Cache Hits)"]
    end

    subgraph "5. P2C (Power of Two Choices)"
        STRAT -->|p2c| SAMPLE["Sample 2 Random Providers"]
        SAMPLE --> LAT["Select Lower Active Latency"]
    end
```

---

## 5. Directory Structure & Responsibilities

```
mapigate/
├── bin/
│   └── mapigate.js              # Executable CLI entry point (mapigate & mpg aliases)
├── scripts/
│   ├── generate-registries.mjs  # Pure pre-build scanner generating all module registries
│   ├── generate-icons.mjs       # Generates optimized provider icon assets
│   └── publish-local.mjs        # Local npm pack and install test helper
├── src/
│   ├── cli/                     # CLI commands, daemon manager, TUI, Windows tray
│   │   ├── commands/            # start, stop, restart, status, logs, connect, show, doctor...
│   │   ├── daemon/              # Background process lifecycle, PID file, autostart
│   │   ├── tools/               # Modularized CLI tool definitions (26 tools)
│   │   ├── tray/                # Windows PowerShell notification tray integration
│   │   └── tui/                 # Terminal interactive launcher
│   ├── core/                    # Pure framework-agnostic Gateway Engine
│   │   ├── adapters/            # Protocol converters (OpenAI ⇄ Anthropic ⇄ Responses ⇄ Gemini)
│   │   ├── capabilities/        # Context window & thinking token resolution engine
│   │   ├── router/              # Routing rules, fallback chains, combo presets, load balancing
│   │   ├── tokenSaver/          # Token Saver architecture (RTK, Caveman, Ponytail, CustomPrompt)
│   │   └── scheduler/           # Periodic quota resets and OAuth token refreshers
│   ├── providers/               # Hierarchical Provider Modules (194+ providers)
│   │   ├── runtime/             # Custom providers (claude, openai, bedrock, copilot, antigravity...)
│   │   ├── composite/           # Multi-model composite providers (combo engine)
│   │   └── catalog/             # Lightweight standard providers (161 API-key providers)
│   ├── mitm/                    # Decoupled HTTPS Interceptor (port 443, MAPIGATE_MITM_PORT)
│   ├── server/                  # HTTP & SSE Express Gateway (Port 20127)
│   ├── storage/                 # SQLite (WAL mode) & AES-256-GCM hardware crypto vault
│   ├── web/                     # Web Dashboard SPA (React 19 + Vite + Tailwind CSS)
│   └── shared/                  # Common TypeScript interfaces, enums, constants
├── docs/                        # Complete technical documentation suite
└── tests/                       # Automated test suite (102 test files)
```

---

## Management API

The dashboard and CLI talk to the gateway through a REST API under `/api/*`. When a Master Password is set, every `/api/*` route except `/api/auth` requires a session token. Routes below come from `src/server/routes/`.

| Prefix | Purpose | Key routes |
| :--- | :--- | :--- |
| `/api/auth` | Master Password | `GET /status`, `POST /setup`, `POST /login`, `POST /logout`, `PUT /change-password`, `DELETE /remove-password` |
| `/api/providers` | Providers & accounts | `GET /`, `POST /`, `GET /:id`, `DELETE /:id`, `GET /registry`, `POST /:id/accounts`, `POST /:id/accounts/bulk`, `PUT /:id/accounts/reorder`, `PUT /:id/strategy`, `POST /:id/test`, `POST /test-bulk`, `POST /:id/scan-models`, `GET /community-catalog`, `POST /community-catalog/import` |
| `/api/oauth` | OAuth flows (generic + provider `routes.ts`) | `GET /:provider/authorize`, `GET /:provider/device-code`, `POST /:provider/poll`, `POST /:provider/exchange` |
| `/api/models` | Model list & alias rules | `GET /`, `GET /available`, `POST /rules`, `DELETE /rules/:id` |
| `/api/combos` | Combo engine | `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `POST /:id/toggle`, `DELETE /:id`, `GET /presets`, `POST /presets` |
| `/api/cli-tools` (also `/api/tools`, `/api/model-mappings`) | Tool status, apply/reset, model mappings | `GET /status`, `POST /:tool/apply`, `POST /:tool/reset`, `GET\|POST /global-mappings`, `POST /global-mappings/import/:tool`, `GET\|POST /:tool/mappings` |
| `/api/mitm` | MITM proxy | `GET /status`, `POST /toggle-server`, `POST /toggle-dns`, `GET /cert`, `POST /install-cert`, `POST /uninstall-cert`, `GET /port-status`, `GET\|POST /hosts/:tool`, `GET\|POST /mappings/:ide` |
| `/api/quota` | Per-account quota | `GET /`, `GET /:accountId`, `POST /batch-refresh`, `PUT /accounts/:accountId` |
| `/api/usage` | Usage analytics | `GET /stats`, `GET /chart`, `GET /providers`, `GET /request-details`, `GET /request-details/:id`, `GET /stream` (SSE) |
| `/api/stats` | Summary stats | `GET /`, `GET /logs` |
| `/api/console-logs` | Server log viewer | `GET /`, `DELETE /`, `GET /stream` (SSE), `GET\|PUT /level` |
| `/api/settings` | Settings | `GET\|PUT /`, `GET\|PUT /endpoint`, `GET\|POST /endpoint/keys`, `GET\|PUT /token-saver`, `GET\|PUT /capacity-adapter`, `GET\|PUT /logging`, `GET\|POST /autostart`, `GET /system-info` |
| `/api/server` | Lifecycle | `POST /shutdown`, `POST /restart` |
