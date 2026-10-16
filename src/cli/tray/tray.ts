import { exec } from "node:child_process";
import { initWinTray, resolveIconPath, type TrayController } from "./trayWin.js";
import { initUnixTray } from "./trayUnix.js";

export interface TrayOptions {
  port: number;
  onQuit?: () => void;
  onRestart?: () => void;
  onOpenDashboard?: () => void;
}

let activeTray: TrayController | null = null;

export const MENU_INDEX = {
  HEADER: 0,
  DASHBOARD: 1,
  STATUS: 2,
  RESTART: 3,
  QUIT: 4,
} as const;

export function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, { windowsHide: true }, () => {});
}

export function isTraySupported(): boolean {
  const platform = process.platform;
  if (!["win32", "darwin", "linux"].includes(platform)) {
    return false;
  }
  if (platform === "linux" && !process.env.DISPLAY) {
    return false;
  }
  return true;
}

export function buildTrayItems(port: number) {
  return [
    { title: `Mapigate (Port ${port})`, enabled: false },
    { title: "Open Web Dashboard", enabled: true },
    { title: "Status", enabled: true },
    { title: "Restart Gateway", enabled: true },
    { title: "Quit / Shutdown", enabled: true },
  ];
}

function handleMenuClick(index: number, options: TrayOptions): void {
  const { port, onQuit, onRestart, onOpenDashboard } = options;
  if (index === MENU_INDEX.DASHBOARD) {
    if (onOpenDashboard) {
      onOpenDashboard();
    } else {
      openBrowser(`http://localhost:${port}`);
    }
  } else if (index === MENU_INDEX.STATUS) {
    openBrowser(`http://localhost:${port}`);
  } else if (index === MENU_INDEX.RESTART) {
    if (onRestart) {
      onRestart();
    }
  } else if (index === MENU_INDEX.QUIT) {
    if (onQuit) {
      onQuit();
    }
    killTray();
    setTimeout(() => {
      process.exit(0);
    }, 400);
  }
}

export function initTray(options: TrayOptions): TrayController | null {
  if (!isTraySupported()) {
    return null;
  }

  try {
    const items = buildTrayItems(options.port);

    if (process.platform === "win32") {
      const iconPath = resolveIconPath();
      activeTray = initWinTray({
        iconPath,
        tooltip: `Mapigate - Port ${options.port}`,
        items,
        onClick: (index) => handleMenuClick(index, options),
      });
    } else {
      activeTray = initUnixTray({
        port: options.port,
        items,
        onClick: (index) => handleMenuClick(index, options),
      });
    }

    return activeTray;
  } catch {
    // Fail-open: tray failure must never crash server
    activeTray = null;
    return null;
  }
}

export async function killTray(): Promise<void> {
  if (!activeTray) return;
  try {
    activeTray.kill();
  } catch {
    // ignore
  } finally {
    activeTray = null;
  }
}

export function getTrayInstance(): TrayController | null {
  return activeTray;
}
