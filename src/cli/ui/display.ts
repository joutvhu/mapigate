export const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  underline: "\x1b[4m",
  reverse: "\x1b[7m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  success: "\x1b[32m",
  error: "\x1b[31m",
  warning: "\x1b[33m",
  info: "\x1b[36m",
  brand: "\x1b[38;2;59;130;246m", // #3B82F6 Blue
  brandBg: "\x1b[48;2;59;130;246m",
};

export const BOX_CHARS = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
};

export function clearScreen(): void {
  if (process.stdout.isTTY) {
    process.stdout.write("\x1b[2J\x1b[H");
  }
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return num.toLocaleString();
}

export function maskKey(key: string | null | undefined): string {
  if (!key || typeof key !== "string") return "****";
  if (key.length <= 10) return "****";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Draw a clean bordered box around content
 */
export function showBox(title: string, content: string, width: number = 64): void {
  const innerWidth = width - 4;
  const lines = content.split("\n");

  const cleanTitle = stripAnsi(title);
  const remainingHoriz = Math.max(0, innerWidth - cleanTitle.length - 2);

  const topBorder = `${BOX_CHARS.topLeft}${BOX_CHARS.horizontal.repeat(2)} ${title} ${BOX_CHARS.horizontal.repeat(remainingHoriz)}${BOX_CHARS.topRight}`;
  console.log(topBorder);

  for (const line of lines) {
    const cleanLine = stripAnsi(line);
    const paddingLength = Math.max(0, innerWidth - cleanLine.length);
    console.log(`${BOX_CHARS.vertical} ${line}${" ".repeat(paddingLength)} ${BOX_CHARS.vertical}`);
  }

  const bottomBorder = `${BOX_CHARS.bottomLeft}${BOX_CHARS.horizontal.repeat(innerWidth + 2)}${BOX_CHARS.bottomRight}`;
  console.log(bottomBorder);
}

/**
 * Display data in a tabular format
 */
export function showTable(headers: string[], rows: (string | number)[][]): void {
  if (!headers.length || !rows.length) return;

  const colWidths = headers.map((header, i) => {
    const maxRowWidth = Math.max(
      ...rows.map((row) => stripAnsi(String(row[i] ?? "")).length),
      0
    );
    return Math.max(stripAnsi(header).length, maxRowWidth);
  });

  const headerRow = headers.map((h, i) => {
    const clean = stripAnsi(h);
    return h + " ".repeat(Math.max(0, colWidths[i] - clean.length));
  }).join(" │ ");

  console.log(`${COLORS.bold}${headerRow}${COLORS.reset}`);

  const separator = colWidths.map((w) => "─".repeat(w)).join("─┼─");
  console.log(`${COLORS.dim}${separator}${COLORS.reset}`);

  for (const row of rows) {
    const rowStr = row.map((cell, i) => {
      const cellStr = String(cell ?? "");
      const clean = stripAnsi(cellStr);
      return cellStr + " ".repeat(Math.max(0, colWidths[i] - clean.length));
    }).join(" │ ");
    console.log(rowStr);
  }
}

/**
 * Show colored status message
 */
export function showStatus(message: string, type: "success" | "error" | "warning" | "info" = "info"): void {
  const symbols = {
    success: `${COLORS.green}[OK]${COLORS.reset}`,
    error: `${COLORS.red}[ERR]${COLORS.reset}`,
    warning: `${COLORS.yellow}[!]${COLORS.reset}`,
    info: `${COLORS.cyan}[i]${COLORS.reset}`,
  };

  console.log(`  ${symbols[type]} ${message}`);
}
