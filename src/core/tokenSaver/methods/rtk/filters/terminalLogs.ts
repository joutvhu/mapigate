/**
 * Filter for terminal build logs, test runners, and package managers
 * Strips repeated progress bars, ANSI terminal color artifacts, and duplicate blank lines
 */
export function terminalLogs(text: string): string {
  if (!text) return text;

  // Strip ANSI escape codes
  let cleaned = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");

  // Compress progress bars (e.g., [========>   ] 75%)
  cleaned = cleaned.replace(/\[[=#\-\s]{10,}\]\s*\d+%/g, "[progress...]");

  // Deduplicate consecutive identical lines (e.g. repetitive poll or spinner lines)
  const lines = cleaned.split("\n");
  const deduped: string[] = [];
  let lastLine = "";
  let repeatCount = 0;

  for (const line of lines) {
    if (line === lastLine && line.trim().length > 0) {
      repeatCount++;
      if (repeatCount <= 2) {
        deduped.push(line);
      } else if (repeatCount === 3) {
        deduped.push(" ... [repeated lines trimmed] ...");
      }
    } else {
      repeatCount = 0;
      lastLine = line;
      deduped.push(line);
    }
  }

  return deduped.join("\n");
}

terminalLogs.filterName = "terminal-logs";

export const compressTerminalLogs = terminalLogs;
