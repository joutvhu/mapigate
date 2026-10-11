import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TrayMenuItem {
  title: string;
  enabled: boolean;
}

export interface WinTrayOptions {
  iconPath: string;
  tooltip: string;
  items: TrayMenuItem[];
  onClick: (index: number) => void;
}

export interface TrayController {
  updateItem: (index: number, title: string, enabled: boolean) => void;
  setTooltip: (text: string) => void;
  kill: () => void;
}

let psProcess: ChildProcess | null = null;
let clickHandler: ((index: number) => void) | null = null;

function sendCommand(cmd: Record<string, any>): void {
  if (psProcess && psProcess.stdin && psProcess.stdin.writable) {
    try {
      psProcess.stdin.write(`${JSON.stringify(cmd)}\n`, "utf8");
    } catch {
      // ignore
    }
  }
}

export function resolveScriptPath(): string {
  const candidates = [
    path.join(__dirname, "tray.ps1"),
    path.resolve(__dirname, "../../../src/cli/tray/tray.ps1"),
    path.resolve(process.cwd(), "src/cli/tray/tray.ps1"),
    path.resolve(process.cwd(), "dist/cli/tray/tray.ps1"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(__dirname, "tray.ps1");
}

export function resolveIconPath(): string {
  const candidates = [
    path.join(__dirname, "icon.ico"),
    path.resolve(__dirname, "../../../src/cli/tray/icon.ico"),
    path.resolve(process.cwd(), "src/cli/tray/icon.ico"),
    path.resolve(process.cwd(), "dist/cli/tray/icon.ico"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(__dirname, "icon.ico");
}

export function initWinTray(options: WinTrayOptions): TrayController | null {
  const { iconPath, tooltip, items, onClick } = options;
  clickHandler = onClick;

  const scriptPath = resolveScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return null;
  }

  const effectiveIconPath = fs.existsSync(iconPath) ? iconPath : resolveIconPath();

  try {
    psProcess = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden",
        "-InputFormat", "Text",
        "-OutputFormat", "Text",
        "-File", scriptPath,
        "-IconPath", effectiveIconPath,
        "-Tooltip", tooltip,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );
  } catch {
    return null;
  }

  if (!psProcess || !psProcess.stdout) {
    return null;
  }

  const rl = readline.createInterface({ input: psProcess.stdout });
  rl.on("line", (line) => {
    try {
      const evt = JSON.parse(line);
      if (evt.type === "click" && clickHandler) {
        clickHandler(evt.index);
      }
    } catch {
      // ignore
    }
  });

  psProcess.on("error", () => {});
  if (psProcess.stderr) {
    psProcess.stderr.on("data", () => {});
  }

  // Send initial menu items
  items.forEach((item, index) => {
    sendCommand({ action: "add-item", index, title: item.title, enabled: item.enabled });
  });

  return {
    updateItem(index: number, title: string, enabled: boolean) {
      sendCommand({ action: "update-item", index, title, enabled });
    },
    setTooltip(text: string) {
      sendCommand({ action: "set-tooltip", text });
    },
    kill() {
      try {
        sendCommand({ action: "kill" });
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (psProcess && !psProcess.killed) {
          try {
            psProcess.kill();
          } catch {
            // ignore
          }
        }
        psProcess = null;
      }, 300);
    },
  };
}
