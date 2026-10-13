// Handles Cursor/Codex read_file output: "  1|content\n  2|content".
// Strategy mirrors Rust filter::smart_truncate (filter.rs): keep head+tail, drop middle.
import {
  SMART_TRUNCATE_HEAD,
  SMART_TRUNCATE_TAIL,
  SMART_TRUNCATE_MIN_LINES,
} from "../constants.js";

export const READ_NUMBERED_LINE_RE = /^\s*\d+\|/;

export function readNumbered(input: string): string {
  const lines = input.split("\n");
  if (lines.length < SMART_TRUNCATE_MIN_LINES) return input;

  const head = lines.slice(0, SMART_TRUNCATE_HEAD);
  const tail = lines.slice(lines.length - SMART_TRUNCATE_TAIL);
  const cut = lines.length - head.length - tail.length;

  return [...head, `... +${cut} lines truncated (file continues)`, ...tail].join("\n");
}

readNumbered.filterName = "read-numbered";
