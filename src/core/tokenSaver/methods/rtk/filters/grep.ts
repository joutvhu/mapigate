// Port of grep_wrapper (rtk/src/cmds/system/pipe_cmd.rs:50-86)
// Input format: "file:lineno:content" — splitn(3, ':') in Rust
import { GREP_MIN_HIT_RATIO, GREP_PER_FILE_MAX } from "../constants.js";

const RE_TIMESTAMP_PREFIX = /^\d{4}-\d{2}-\d{2}[T ]\d{2}$/;

export function parseGrepLine(line: string): [string, string, string] | null {
  const startIdx = /^[A-Za-z]:[\\/]/.test(line) ? 2 : 0;
  const first = line.indexOf(":", startIdx);
  if (first === -1) return null;
  const second = line.indexOf(":", first + 1);
  if (second === -1) return null;
  const file = line.slice(0, first);
  const lineNumStr = line.slice(first + 1, second);
  const content = line.slice(second + 1);

  // Path field check: reject empty, whitespace (e.g. "2026-11-10 12:30:45"),
  // pure digits (e.g. "12:30:45"), or ISO date-hour prefixes (e.g. "2026-11-10T12:30:45")
  if (
    file.length === 0 ||
    /\s/.test(file) ||
    /^\d+$/.test(file) ||
    RE_TIMESTAMP_PREFIX.test(file)
  ) {
    return null;
  }

  if (!/^\d+$/.test(lineNumStr)) return null;
  return [file, lineNumStr, content];
}

export function grep(input: string): string {
  const byFile = new Map<string, [string, string][]>();
  let total = 0;
  let nonEmptyCount = 0;

  for (const line of input.split("\n")) {
    if (line.trim().length === 0) continue;
    nonEmptyCount++;
    const parsed = parseGrepLine(line);
    if (!parsed) continue;
    const [file, lineNumStr, content] = parsed;
    total++;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push([lineNumStr, content]);
  }

  if (total === 0 || (nonEmptyCount > 0 && total / nonEmptyCount < GREP_MIN_HIT_RATIO)) {
    return input;
  }

  const files = Array.from(byFile.keys()).sort();
  let out = `${total} matches in ${files.length}F:\n\n`;

  for (const file of files) {
    const matches = byFile.get(file)!;
    out += `[file] ${file} (${matches.length}):\n`;
    const show = matches.slice(0, GREP_PER_FILE_MAX);
    for (const [lineNum, content] of show) {
      out += `  ${lineNum.padStart(4)}: ${content.trim()}\n`;
    }
    if (matches.length > GREP_PER_FILE_MAX) {
      out += `  +${matches.length - GREP_PER_FILE_MAX}\n`;
    }
    out += "\n";
  }

  return out;
}

grep.filterName = "grep";
