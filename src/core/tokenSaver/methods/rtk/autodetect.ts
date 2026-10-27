import {
  DETECT_WINDOW,
  READ_NUMBERED_MIN_HIT_RATIO,
  SMART_TRUNCATE_MIN_LINES,
  type FilterFunction,
} from "./constants.js";
import { gitDiff } from "./filters/gitDiff.js";
import { gitStatus } from "./filters/gitStatus.js";
import { gitLog } from "./filters/gitLog.js";
import { buildOutput } from "./filters/buildOutput.js";
import { terminalLogs } from "./filters/terminalLogs.js";
import { grep } from "./filters/grep.js";
import { find } from "./filters/find.js";
import { dedupLog } from "./filters/dedupLog.js";
import { ls } from "./filters/ls.js";
import { tree } from "./filters/tree.js";
import { smartTruncate } from "./filters/smartTruncate.js";
import { readNumbered, READ_NUMBERED_LINE_RE } from "./filters/readNumbered.js";
import { searchList, SEARCH_LIST_HEADER_RE } from "./filters/searchList.js";

const RE_GIT_DIFF = /^diff --git /m;
const RE_GIT_DIFF_HUNK = /^@@ /m;
const RE_GIT_STATUS = /^On branch |^nothing to commit|^Changes (not |to be )|^Untracked files:/m;
const RE_GIT_LOG = /^[*|/\\ ]*commit [0-9a-f]{7,40}$/m;
const RE_PORCELAIN = /^[ MADRCU?!][ MADRCU?!] \S/m;
const RE_BUILD_OUTPUT =
  /^(npm (warn|error|ERR!)|yarn (warn|error)|\s*Compiling\s+\S+|\s*Downloading\s+\S+|added \d+ package|\[ERROR\]|BUILD (SUCCESS|FAILED)|\s*Finished\s+|Successfully (installed|built)|ERROR:)/im;
const RE_ANSI_OR_SPINNER = /\x1b\[[0-9;]*[a-zA-Z]|\[=+\]\s*\d+%|\[(?:progress|\.\.\.)\]/m;
const RE_TREE_GLYPH = /[├└]──|│  /;
const RE_LS_ROW = /^[-dlbcps][rwx-]{9}/m;
const RE_LS_TOTAL = /^total \d+$/m;

function isBase64Data(text: string): boolean {
  if (text.startsWith("data:image/") || text.startsWith("data:application/")) return true;
  const sample = text.slice(0, 500).trim();
  const lines = sample.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length >= 3 && lines.every((l) => /^[A-Za-z0-9+/=]{40,}$/.test(l.trim()))) {
    return true;
  }
  return false;
}

function looksLikeSourceCode(head: string): boolean {
  const codePatterns = [
    /^\s*(import\s+|export\s+|const\s+|let\s+|function\s+|class\s+|def\s+|public\s+|private\s+)/m,
    /[;{}][\r\n]/,
    /^\s*(package\s+|namespace\s+|using\s+|from\s+\S+\s+import)/m,
  ];
  return codePatterns.some((p) => p.test(head));
}

export function autoDetectFilter(text: string): FilterFunction | null {
  const head = text.length > DETECT_WINDOW ? text.slice(0, DETECT_WINDOW) : text;

  // Protect MIME base64 image strings from binary stream corruption (RTK-05)
  if (isBase64Data(head)) return null;

  // Terminal log stripping for ANSI sequences and spinner noise (RTK-07)
  if (RE_ANSI_OR_SPINNER.test(head)) return terminalLogs;

  if (RE_GIT_LOG.test(head)) return gitLog;
  if (RE_GIT_DIFF.test(head) || RE_GIT_DIFF_HUNK.test(head)) return gitDiff;
  if (RE_GIT_STATUS.test(head)) return gitStatus;

  // Build output BEFORE porcelain check
  if (RE_BUILD_OUTPUT.test(head)) return buildOutput;

  if (isMostlyPorcelain(head)) return gitStatus;

  const lines = head.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  // Rust grep rule: first 5 non-empty lines, ANY matches "file:number:content"
  const first5 = nonEmpty.slice(0, 5);
  if (first5.some(isGrepLine)) return grep;

  // Rust find rule: ALL non-empty lines path-like (no ':'), >=3 lines
  if (nonEmpty.length >= 3 && nonEmpty.every(isPathLike)) return find;

  // Tree: contains box-drawing glyphs
  if (RE_TREE_GLYPH.test(head)) return tree;

  // ls -la: has "total N" header or >=3 rows starting with perms string
  if (RE_LS_TOTAL.test(head) || countMatches(head, RE_LS_ROW) >= 3) return ls;

  // Cursor Glob search list header
  if (SEARCH_LIST_HEADER_RE.test(head)) return searchList;

  // Line-numbered file dump ("  N|content")
  if (lines.length >= SMART_TRUNCATE_MIN_LINES && isLineNumbered(lines)) {
    return readNumbered;
  }

  // Fallback: dedupLog for generic multi-line noise with duplicates
  if (nonEmpty.length >= 5) return dedupLog;

  // Last resort: big blob with no structure — smart truncate ONLY if not source code (RTK-03, #4559)
  if (text.split("\n").length >= SMART_TRUNCATE_MIN_LINES && !looksLikeSourceCode(head)) {
    return smartTruncate;
  }

  return null;
}

function isGrepLine(line: string): boolean {
  const first = line.indexOf(":");
  if (first === -1) return false;
  const second = line.indexOf(":", first + 1);
  if (second === -1) return false;
  const lineno = line.slice(first + 1, second);
  return /^\d+$/.test(lineno);
}

function isPathLike(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;
  // A drive-letter prefix marks a Windows absolute path
  if (/^[A-Za-z]:[\\/]/.test(t)) return true;
  if (t.includes(":")) return false;
  return t.startsWith(".") || t.startsWith("/") || t.includes("/");
}

function isMostlyPorcelain(head: string): boolean {
  const lines = head.split("\n").filter((l) => l.trim());
  if (lines.length < 3) return false;
  const hits = lines.filter((l) => RE_PORCELAIN.test(l)).length;
  return hits / lines.length >= 0.6;
}

function isLineNumbered(lines: string[]): boolean {
  let hits = 0;
  let nonEmpty = 0;
  const sample = lines.slice(0, 100);
  for (const l of sample) {
    if (l.length === 0) continue;
    nonEmpty++;
    if (READ_NUMBERED_LINE_RE.test(l)) hits++;
  }
  if (nonEmpty < 5) return false;
  return hits / nonEmpty >= READ_NUMBERED_MIN_HIT_RATIO;
}

function countMatches(text: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (text.match(g) || []).length;
}

export function safeApply(fn: FilterFunction, text: string): string {
  try {
    const out = fn(text);
    if (typeof out !== "string") return text;
    return out;
  } catch {
    return text;
  }
}
