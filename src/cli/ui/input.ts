import readline from "node:readline";
import { COLORS } from "./display.js";

export interface MenuItem {
  label: string;
  icon?: string;
  description?: string;
}

let rawPrimed = false;

function primeRawOnce(): void {
  if (rawPrimed || !process.stdin.isTTY) return;
  try {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    rawPrimed = true;
  } catch {
    // Non-fatal if setting raw mode fails
  }
}

function suspendRawFor<T>(fn: () => Promise<T>): Promise<T> {
  const wasPrimed = rawPrimed;
  if (wasPrimed && process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // ignore
    }
  }

  return fn().finally(() => {
    if (wasPrimed && process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(true);
      } catch {
        // ignore
      }
      process.stdin.resume();
    }
  });
}

/**
 * Text prompt
 */
export async function prompt(question: string): Promise<string> {
  return suspendRawFor(() => {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(question, (answer) => {
        rl.close();
        resolve((answer || "").trim());
      });
    });
  });
}

/**
 * Yes / No confirmation prompt
 */
export async function confirm(question: string, defaultYes: boolean = false): Promise<boolean> {
  const hint = defaultYes ? "(Y/n)" : "(y/N)";
  while (true) {
    const answer = await prompt(`${question} ${hint}: `);
    const lower = answer.toLowerCase();
    if (!lower) return defaultYes;
    if (lower === "y" || lower === "yes") return true;
    if (lower === "n" || lower === "no") return false;
    console.log("Please answer 'y' or 'n'");
  }
}

/**
 * Pause execution until Enter is pressed
 */
export async function pause(message: string = "Press Enter to continue..."): Promise<void> {
  return suspendRawFor(() => {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(message, () => {
        rl.close();
        resolve();
      });
    });
  });
}

/**
 * Interactive arrow-key navigation menu
 */
export async function selectMenu(
  title: string,
  items: MenuItem[],
  defaultIndex: number = 0,
  subtitle: string = "",
  headerContent: string = "",
  breadcrumb: string[] = []
): Promise<number> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(0);
      return;
    }

    let selectedIndex = Math.max(0, Math.min(defaultIndex, items.length - 1));
    let isActive = true;

    primeRawOnce();

    const renderMenu = () => {
      if (!isActive) return;
      process.stdout.write("\x1b[2J\x1b[H");

      const width = Math.min(process.stdout.columns || 50, 50);
      console.log(`\n${COLORS.brand}${"═".repeat(width)}${COLORS.reset}`);
      console.log(`  ${COLORS.bold}${COLORS.brand}${title}${COLORS.reset}`);
      if (subtitle) {
        console.log(`  ${COLORS.dim}${subtitle}${COLORS.reset}`);
      }
      console.log(`${COLORS.brand}${"═".repeat(width)}${COLORS.reset}`);

      if (breadcrumb.length > 0) {
        console.log(`  ${COLORS.dim}${breadcrumb.join(" > ")}${COLORS.reset}`);
      }

      if (headerContent) {
        console.log();
        console.log(headerContent);
      }
      console.log();

      items.forEach((item, index) => {
        const isSelected = index === selectedIndex;
        const pointer = isSelected ? ">" : " ";
        const iconPart = item.icon ? `${item.icon} ` : "";

        if (isSelected) {
          console.log(` ${COLORS.reverse}${COLORS.bold} ${pointer} ${iconPart}${item.label} ${COLORS.reset}`);
        } else {
          console.log(`   ${pointer} ${iconPart}${item.label}`);
        }
      });
      console.log();
      console.log(`  ${COLORS.dim}Use ↑/↓ arrows to navigate, Enter to select, Esc to go back${COLORS.reset}\n`);
    };

    const cleanup = () => {
      if (!isActive) return;
      isActive = false;
      process.stdin.removeListener("keypress", onKeypress);
    };

    const move = (delta: number) => {
      selectedIndex = (selectedIndex + delta + items.length) % items.length;
      renderMenu();
    };

    const onKeypress = (_str: string, key: any) => {
      if (!isActive || !key) return;
      if (key.name === "up") return move(-1);
      if (key.name === "down") return move(1);
      if (key.name === "return") {
        cleanup();
        resolve(selectedIndex);
        return;
      }
      if (key.name === "escape") {
        cleanup();
        resolve(-1);
        return;
      }
      if (key.ctrl && key.name === "c") {
        cleanup();
        process.exit(0);
      }
    };

    process.stdin.on("keypress", onKeypress);
    renderMenu();
  });
}
