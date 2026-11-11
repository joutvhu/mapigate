# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.133] - 2026-11-11

### Fixes

#### Providers (Kiro Runtime)
- **Runtime Endpoints & Candidate URLs**: Updated default target endpoint to `runtime.${region}.kiro.dev` and validation URL to `management.us-east-1.kiro.dev` with regional management URL candidate fallback.
- **Profile ARN & Base URL Resolution**: Added automatic fallback to default profile ARN based on authentication method when not explicitly configured, and supported provider `baseUrl` override across executor and provider runtime.
- **User-Agent Header Alignment**: Synchronized User-Agent and `x-amz-user-agent` headers across executor, provider metadata, and quota calls to match KiroIDE 1.4.154.

#### Models & UI Sorting
- **Alphabetical Model, Provider & Combo Ordering**: Alphabetically sorted combos, providers, and models across `/api/models/available` API endpoint, Model Select Modal, Model Scanner Modal, Combos Tab, and Provider Detail Page.

## [0.5.130] - 2026-11-11

### Features

#### MITM Interceptor
- **Kiro Permission Classifier Model Support**: Added support for internal virtual model `permission-classifier` (used by Kiro's "Approve for Me" auto-permission feature) across Kiro MITM handler config, model dictionary, and routing tests.

#### Model Scanner
- **Gemini CLI Discovery & Catalog Fallback**: Added static catalog fallback in model scanner and mapped discovered model metadata directly in Gemini CLI runtime.

### Fixes

#### Adapters & Protocols
- **Developer Role & Structured System Content**: Supported `developer` role alongside `system` messages in Anthropic adapter and Antigravity executor via `extractPlainTextContent` utility, preventing developer messages from leaking into conversation contents.

## [0.5.127] - 2026-11-09

### Features

#### Anthropic & Capabilities
- **Dynamic Max Tokens Adjustment**: Dynamically resolved model context and max output token ceiling based on model capabilities, clamping Anthropic parameters to safe boundaries.

#### MITM Interceptor
- **Proxy Process Management & Port Utilities**: Added MITM proxy manager and port conflict resolution utilities for robust daemon startup and recovery.

### Fixes

#### Proxy & Streaming
- **Streaming Timeout Ceiling**: Extended upstream timeout ceiling to 30 minutes for streaming requests to prevent mid-stream aborts on long-context model generations.

#### Tool Call Rescue
- **Xiaomi MiMo Dialect Enhancements**: Improved streaming and responses tool call rescue, handling edge-case function syntax in Xiaomi MiMo output streams.

## [0.5.123] - 2026-11-08

### Features

#### MITM Interceptor
- **Configurable Remote Router Target**: Added persistent configuration for custom router target base URL and API key forwarding.
- **Dynamic Target Resolution**: Updated MITM proxy request handlers to resolve target dynamically with auth header support.
- **Remote Model Fetching & Connectivity Probes**: Added API endpoints to retrieve, update, test connectivity, and fetch remote models from external routers.
- **MITM Dashboard Controls**: Added UI settings in MITM tab to configure, test, and view router target remote status and authentication state.

### Fixes

#### OAuth Modal
- **State Stabilization & Race Condition Prevention**: Tracked callbacks, region, and effective port in refs to prevent stale closures.
- **Flow ID Tracking**: Added generation counter (`flowIdRef`) to discard obsolete responses from async flows and polling intervals.
- **Device Code Cleanup**: Cleaned up device code state upon modal close to prevent stale UI during re-initialization.

## [0.5.120] - 2026-11-07

### Features

#### Cursor & Cursor API
- **ConnectRPC & Model Probing**: Ported ConnectRPC protobuf definitions, checksum calculation, model probing, and executor from 9router.
- **Decomposed Executor**: Decomposed executor into `cursorStreamer`, resolved tool turns in `buildAgentRunFrame`, and finalized Anthropic-compatible streams.
- **Official Cloud Agents API**: Migrated `cursor-api` provider to official Cloud Agents API with execution delegation.

#### Tool Call Rescue & Streaming Adapters
- **Streaming Tool Call Rescuer**: Added streaming tool call rescuer with multi-format parsing (JSON, Markdown, Xiaomi MiMo dialect).
- **Inline Tool Rescue Gating**: Gated inline tool rescue behind provider metadata (`rescueInlineTools`).
- **Rescuer Stability**: Validated tool names, retained failed buffers, and ensured proper flushing on finish reasons.
- **Xiaomi MiMo Dialect**: Added function parsing for Xiaomi MiMo and set required Xiaomi Claude headers.

#### Usage & Analytics
- **Daily Stats Aggregation**: Added periodic daily stats aggregation with SQLite rollup tables for fast metrics.
- **Log Retention Settings**: Added configurable usage log retention settings with automatic pruning.

#### Model Scanner & Discovery
- **Auto-Persistence**: Auto-persist discovered models directly to provider configuration.
- **Models URL Support**: Added `modelsUrl` support for dynamic model discovery.
- **Capability Parsing**: Improved model capability parsing and URL resolution.

#### Providers & Smart Routing
- **Account Capability Routing**: Added account-level model capability routing and tag-based filtering.
- **Custom Protocol Formats & Base URLs**: Supported configurable protocol formats per provider and custom base URL overrides.
- **Codex Enhancements**: Added proxy origin verification, enhanced error handling, and updated model definitions.
- **Kiro & Antigravity**: Supported custom headers and updated User-Agent strings for Kiro; updated Antigravity Gemini 4 Argon quota limits.

#### Server & Web UI
- **Self-Upgrade**: Added `/api/server/upgrade` endpoint and Web Dashboard modal for seamless in-app upgrades.

### Fixes
- **Usage Stats**: Excluded zero-token and failed requests from daily stats aggregation.
- **Catalog Sync**: Preserved custom and dynamically scanned models across catalog synchronizations.
- **Adapter Stream Flush**: Ensured tool call rescuer flushes remaining tokens on finish reason and tool name validation.
- **Antigravity**: Removed invalid Gemini 4 Argon session quota bucket.

## [0.5.98] - 2026-11-05

Initial public release of **Mapigate** — an ultra-lightweight, 100% local-first AI Model API Gateway and Token Optimizer tailored for AI coding assistants (Claude Code, Cursor, Cline, OpenCode, Codex, GitHub Copilot, Kiro IDE, and Antigravity).

### Features

#### Core Gateway & Protocols
- **Unified Local Gateway (Port `20128`)**: Single-port Express gateway serving streaming AI proxy endpoints and the Vite + React Web Dashboard with `< 300ms` cold start.
- **Tri-Protocol Support**: First-class bidirectional conversion and streaming translation across:
  - OpenAI Chat Completions (`/v1/chat/completions`)
  - Anthropic Messages & Token Counting (`/v1/messages`, `/v1/messages/count_tokens`)
  - OpenAI Responses API (`/v1/responses`, `/responses`)
  - OpenAI Model Catalog (`/v1/models`, `/models`)
- **Format-Aware Streaming & Translation**: Preserves tool calls, structured outputs, tool definitions, and thinking/reasoning blocks (`thought` / `reasoning_content`) across protocol boundaries.
- **Fail-Open Token Saver Engine**: Modular context optimizer delivering 20%–40% token savings across sessions:
  - **RTK Method**: In-place compression for verbose tool outputs (`git diff`, terminal logs, search results) with strict error trace preservation.
  - **Prompt Methods**: Caveman style, Ponytail minimalist coding philosophy, and Custom Prompts.

#### Providers & Smart Routing
- **151+ Integrated Providers**:
  - **32 Runtime Providers**: Claude, OpenAI, Gemini, GitHub Copilot, Codex, Kiro, Cursor, AWS Bedrock, Azure OpenAI, MiniMax, Qwen, DeepSeek, Mistral, Moonshot, Z.ai, Grok, and more with OAuth PKCE / device flows and custom authentications.
  - **118 Catalog Providers**: Standard OpenAI/Anthropic-compatible providers (OpenRouter, Groq, Cerebras, Together, Baseten, FriendliAI, etc.) plus local runtimes (Ollama, LM Studio, Jan).
  - **Community Catalog**: Pluggable provider extensions loaded dynamically.
- **Smart Routing & Combo Engine**:
  - Multiple load balancing and failover strategies: `fallback`, `round-robin`, `fill-first`, `fusion` (multi-model synthesis), `lkgp` (last-known-good-provider), and `p2c` (power of two choices).
  - Multi-account rotation per provider with quota tracking and automatic fallback on HTTP 429 / quota exhaustion.
  - Model aliases, global model mappings, and per-tool model overrides.

#### Developer Tools & Closed-Tool Support
- **One-Click Integration for 26 Coding Assistants**: Dedicated CLI configurators and setup guides via `mpg connect` for Claude Code, Cursor, Cline, Codex, OpenCode, Roo Code, Continue, Qwen Code, Crush, Factory Droid, and more.
- **Decoupled MITM HTTPS Interceptor**: Local TLS interceptor with dynamic Root CA generation to intercept and route hardcoded requests from closed tools (GitHub Copilot, Kiro IDE, Google Antigravity).

#### Security & Architecture
- **100% Local-First & Zero Telemetry**: Completely offline-capable with zero external tracking or phone-home requests.
- **Hardware-Tied Encryption Vault**: Credentials and OAuth tokens encrypted with AES-256-GCM using keys derived from host Machine ID.
- **Non-Blocking WAL Storage**: SQLite with WAL journaling (`node:sqlite` or `better-sqlite3`).
- **Network Hardening**: DNS rebinding protection, origin validation, and configurable LAN host binding (`0.0.0.0`).

#### CLI & Management
- **CLI Suite (`mapigate` / `mpg`)**: Daemon management (`start`, `stop`, `restart`, `status`), CLI tools connector (`connect`), interactive TUI, model query, and self-updater (`upgrade`).
- **Web Dashboard**: Modern SPA with real-time analytics, provider management, combo builder, MITM control, and token savings metrics.
