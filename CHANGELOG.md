# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.96] - 2026-11-05

Initial public release of **Mapigate** — an ultra-lightweight, 100% local-first AI Model API Gateway and Token Optimizer tailored for AI coding assistants (Claude Code, Cursor, Cline, OpenCode, Codex, GitHub Copilot, Kiro IDE, and Antigravity).

### Features

#### Core Gateway & Protocols
- **Unified Local Gateway (Port `20127`)**: Single-port Express gateway serving streaming AI proxy endpoints and the Vite + React Web Dashboard with `< 300ms` cold start.
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
