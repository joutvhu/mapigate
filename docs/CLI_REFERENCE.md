# CLI Reference Manual — Mapigate

> The Mapigate CLI (`mapigate` or alias `mpg`) provides complete control over the gateway server, background daemons, real-time logs, system tray, autostart on boot, and automated configuration for 26+ coding assistants.

---

## 1. Quick Syntax & Aliases

Both `mapigate` and `mpg` are registered as executable binaries:

```bash
mpg <command> [options]
# or
mapigate <command> [options]
```

Running `mpg` without arguments in an interactive terminal starts the **Interactive Terminal Launcher**, providing quick access to the Web UI, Terminal UI (TUI), server status, and background system tray controls.

---

## 2. Command Index

| Command | Description |
| :--- | :--- |
| [`mpg`](#interactive-launcher) | Interactive launcher (Web UI, TUI, Tray mode) |
| [`mpg start`](#mpg-start) | Starts the gateway server (foreground or daemon) |
| [`mpg stop`](#mpg-stop) | Stops the running daemon process |
| [`mpg restart`](#mpg-restart) | Restarts the gateway daemon |
| [`mpg status`](#mpg-status) | Displays health, PID, URL, and RTK token savings |
| [`mpg logs`](#mpg-logs) | Streams or views gateway console and proxy logs |
| [`mpg connect`](#mpg-connect) | Auto-configures local coding tools for Mapigate |
| [`mpg show`](#mpg-show) | Inspects configuration files and models of local tools |
| [`mpg doctor`](#mpg-doctor) | Validates Node.js, port availability, SQLite WAL, machine ID |
| [`mpg providers`](#mpg-providers) | Lists configured AI providers and accounts |
| [`mpg models`](#mpg-models) | Lists active model routing rules and fallback combos |
| [`mpg startup`](#mpg-startup) | Configures Mapigate to auto-launch on system boot |

---

## 3. Detailed Command Reference

### `mpg` (Interactive Launcher)
When executed without arguments in an interactive TTY session:

```bash
mpg
```
Displays an interactive menu:
1. **Web UI (Open in Browser)**: Opens `http://127.0.0.1:20127` in your default browser.
2. **Terminal UI (Interactive CLI)**: Launches the in-terminal TUI dashboard.
3. **Status & RTK Metrics**: Displays live gateway statistics and token savings.
4. **Hide to Tray (Background)**: Runs Mapigate quietly in the Windows notification tray.
5. **Exit (Stop Gateway)**: Safely shuts down the server.

**Flags:**
- `-p, --port <number>`: Port to run on (default: `20127`).
- `-H, --host <host>`: Host to bind to (default: `127.0.0.1`).
- `-t, --tray`: Directly launch in system tray mode.
- `-n, --no-browser`: Suppress automatic browser launch.

---

### `mpg start`
Starts the Mapigate gateway server.

```bash
# Start in foreground (shows real-time proxy traffic):
mpg start

# Start as a detached background daemon:
mpg start -d

# Specify custom port and host:
mpg start -d -p 20127 -H 127.0.0.1

# Start daemon and immediately show server logs:
mpg start -d -l
```

**Options:**
- `-d, --daemon`: Run as a background daemon process.
- `-p, --port <number>`: Port to listen on (default: `20127`).
- `-H, --host <host>`: Host to bind on (default: `127.0.0.1`).
- `-n, --no-browser`: Do not open the web dashboard automatically.
- `-l, --log`: Stream logs immediately after starting daemon.

---

### `mpg stop`
Stops the running Mapigate daemon and cleans up the PID lockfile.

```bash
mpg stop
mpg stop -p 20127
```

**Options:**
- `-p, --port <number>`: Port of the running daemon to stop (default: `20127`).

---

### `mpg restart`
Gracefully stops the current daemon and restarts a fresh instance.

```bash
mpg restart
mpg restart -p 20127
```

---

### `mpg status`
Checks gateway health, process PID, active URLs, request volume, and token savings.

```bash
mpg status
```

**Example Output:**
```text
Mapigate v0.3.69 Status:
──────────────────────────────────────────
  State:        RUNNING
  PID:          14892
  Endpoint:     http://127.0.0.1:20127
  API v1:       http://127.0.0.1:20127/v1
  Requests:     1,248
  Tokens Saved: 342,890 tokens (~$1.0287 saved by RTK)
──────────────────────────────────────────
```

---

### `mpg logs`
Inspects recent gateway console output or follows live request logs.

```bash
# View last 50 log lines:
mpg logs

# Follow logs in real-time (like tail -f):
mpg logs -f

# Filter by minimum log level:
mpg logs -f -l info
mpg logs -f -l error

# Display last 150 lines:
mpg logs -n 150
```

**Options:**
- `-f, --follow`: Continuously stream new log entries.
- `-n, --lines <number>`: Number of recent lines to display (default: `50`).
- `-l, --level <level>`: Minimum log level (`trace`, `debug`, `info`, `warn`, `error`).
- `-p, --port <number>`: Gateway port (default: `20127`).

---

### `mpg connect`
Automatically configures configuration files and environment settings for installed AI coding assistants.

```bash
# Configure ALL installed coding assistants at once:
mpg connect all

# Configure a specific tool:
mpg connect claude
mpg connect opencode
mpg connect cline
mpg connect codex

# Set custom default model and API key:
mpg connect claude --model claude-sonnet-4-6 --api-key my-key

# Configure Claude Code with specific Sonnet / Opus / Haiku overrides:
mpg connect claude --sonnet claude-sonnet-4-6 --opus claude-opus-4-6-thinking

# Reset tool configurations back to their defaults:
mpg connect all --reset
mpg connect claude --reset

# Print copyable environment variables for PowerShell and Bash:
mpg connect --print-env
```

**Options:**
- `--tools <list>`: Comma-separated list of tools (or `all`).
- `--api-key <key>`: Local gateway API key (default: `mapigate-local`).
- `--model <model>`: Default model ID to set in tool configs.
- `--sonnet <model>`: Override Claude Sonnet model alias.
- `--opus <model>`: Override Claude Opus model alias.
- `--haiku <model>`: Override Claude Haiku model alias.
- `--reset`: Restore tools to default configurations.
- `--print-env`: Print shell export statements for OpenAI and Anthropic variables.

---

### `mpg show`
Inspects local configuration files, active base URLs, and configured models for your coding tools.

```bash
# Inspect all detected tools:
mpg show

# Inspect specific tools:
mpg show claude opencode cline

# Output machine-readable JSON:
mpg show --json
```

---

### `mpg doctor`
Performs deep system diagnostics to ensure optimal runtime performance.

```bash
mpg doctor
```

**Checks Performed:**
1. **Node.js Runtime:** Verifies version `>= 18.0.0`.
2. **Server Port (20127):** Verifies availability or health response from `/health`.
3. **Storage & SQLite WAL:** Checks data directory (`~/.mapigate`), database file integrity, and WAL mode.
4. **Hardware Encryption Vault:** Verifies `node-machine-id` extraction for AES-256-GCM key derivation.
5. **Tool Connection Health:** Counts how many local coding assistants are currently linked to Mapigate.

---

### `mpg providers`
Lists all active providers and authenticated accounts configured in the gateway.

```bash
mpg providers
```

---

### `mpg models`
Displays all configured model aliases, default routing rules, and active combo fallback chains.

```bash
mpg models
```

---

### `mpg startup` (Alias: `autostart`)
Manages automated launch on computer startup (Windows Registry Startup / Linux systemd or XDG autostart).

```bash
# Check autostart status:
mpg startup

# Enable Mapigate to launch automatically on boot:
mpg startup enable

# Disable automatic boot launch:
mpg startup disable
```
