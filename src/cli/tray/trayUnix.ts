import { createRequire } from "node:module";
import type { TrayMenuItem, TrayController } from "./trayWin.js";

const req = createRequire(import.meta.url);

export interface UnixTrayOptions {
  port: number;
  items: TrayMenuItem[];
  onClick: (index: number) => void;
}

/**
 * Unix Tray (macOS / Linux).
 * Fail-open architecture: returns null if GUI or binary runtime is unavailable.
 */
export function initUnixTray(_options: UnixTrayOptions): TrayController | null {
  if (process.platform === "linux" && !process.env.DISPLAY) {
    return null;
  }

  try {
    // Attempt dynamic require of systray2 if user installed it
    // If not present, gracefully return null without error
    let SysTray: any = null;
    try {
      SysTray = req("systray2").default || req("systray2");
    } catch {
      try {
        SysTray = req("systray").default || req("systray");
      } catch {
        return null;
      }
    }

    if (!SysTray) return null;

    // Minimal fallback icon
    const iconBase64 =
      "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";

    const menu = {
      icon: iconBase64,
      isTemplateIcon: false,
      title: "",
      tooltip: `Mapigate - Port ${_options.port}`,
      items: _options.items.map((it) => ({
        title: it.title,
        tooltip: it.title,
        enabled: it.enabled,
      })),
    };

    const instance = new SysTray({ menu, debug: false, copyDir: true });
    instance.onClick((action: any) => {
      _options.onClick(action.seq_id);
    });

    return {
      updateItem(index: number, title: string, enabled: boolean) {
        try {
          instance.sendAction({
            type: "update-item",
            item: { title, tooltip: title, enabled },
            seq_id: index,
          });
        } catch {
          // ignore
        }
      },
      setTooltip(_text: string) {
        // Not directly supported on unix systray2
      },
      kill() {
        try {
          instance.kill();
        } catch {
          // ignore
        }
      },
    };
  } catch {
    return null;
  }
}
