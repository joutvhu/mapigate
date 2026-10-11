import type { TrayMenuItem, TrayController } from "./trayWin.js";

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
    // Attempt dynamic import / require of systray2 if user installed it
    // If not present, gracefully return null without error
    const req = typeof require !== "undefined" ? require : null;
    if (!req) return null;

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
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAALEwAACxMBAJqcGAAAAHpJREFUOE9jYBgFgwEwMjIy/Gdg+P8fyP4PxP8ZGBgEcBnGyMjIsICBgSEAhyH/gfgBUNN8XJoZsdkCVL8Ah+b/QPwbqvkBMvk/AwMDAzYX/GdgYAhAN+A/SICRWAMYGfFEJSMjzriEiwDR/xmIa2RkZCSqnZERb3QCAAo3KxzxbKe1AAAAAElFTkSuQmCC";

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
