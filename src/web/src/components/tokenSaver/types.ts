export interface TokenSaverSettings {
  rtkEnabled: boolean;
  cavemanEnabled: boolean;
  cavemanLevel: "lite" | "full" | "ultra" | string;
  ponytailEnabled: boolean;
  ponytailLevel: "lite" | "full" | "ultra" | string;
  customPromptEnabled?: boolean;
  customPrompt?: string;
}

export const DEFAULT_TOKEN_SAVER_SETTINGS: TokenSaverSettings = {
  rtkEnabled: true,
  cavemanEnabled: false,
  cavemanLevel: "lite",
  ponytailEnabled: false,
  ponytailLevel: "lite",
  customPromptEnabled: false,
  customPrompt: "",
};

export interface RtkFilterMeta {
  id: string;
  name: string;
  badge: string;
  description: string;
  icon: string;
}

export const RTK_FILTERS: RtkFilterMeta[] = [
  {
    id: "gitDiff",
    name: "Git Diff",
    badge: "git-diff",
    description: "Removes redundant unchanged context lines, commit hashes, and clamps oversized hunks",
    icon: "difference",
  },
  {
    id: "gitStatus",
    name: "Git Status",
    badge: "git-status",
    description: "Collapses long untracked lists and repetitive branch status lines",
    icon: "fact_check",
  },
  {
    id: "gitLog",
    name: "Git Commit Log",
    badge: "git-log",
    description: "Truncates commit history to key recent commits",
    icon: "history",
  },
  {
    id: "buildOutput",
    name: "Build & Test Output",
    badge: "build-output",
    description: "Compacts repetitive test passes, stack traces, and compiler warnings",
    icon: "construction",
  },
  {
    id: "grep",
    name: "Grep / Ripgrep",
    badge: "grep",
    description: "Limits matching lines per file and collapses file header repetitions",
    icon: "search",
  },
  {
    id: "find",
    name: "File Find",
    badge: "find",
    description: "Caps repetitive file lists per directory to prevent context blowout",
    icon: "folder_open",
  },
  {
    id: "ls",
    name: "Directory Listing",
    badge: "ls",
    description: "Summarizes file permission tables into clean compact lists",
    icon: "format_list_bulleted",
  },
  {
    id: "tree",
    name: "Directory Tree",
    badge: "tree",
    description: "Prunes deep tree hierarchies beyond relevant project context",
    icon: "account_tree",
  },
  {
    id: "searchList",
    name: "Search File List",
    badge: "search-list",
    description: "Reduces repetitive file search summaries",
    icon: "manage_search",
  },
  {
    id: "readNumbered",
    name: "Numbered Code Window",
    badge: "read-numbered",
    description: "Clamps oversized line-numbered code excerpts",
    icon: "format_list_numbered",
  },
  {
    id: "dedupLog",
    name: "Log Deduplication",
    badge: "dedup-log",
    description: "Collapses consecutive repeated log lines into count summaries",
    icon: "content_copy",
  },
  {
    id: "terminalLogs",
    name: "Terminal & ANSI Logs",
    badge: "terminal-logs",
    description: "Strips ANSI color escape codes, progress spinners, and carriage returns",
    icon: "terminal",
  },
  {
    id: "smartTruncate",
    name: "Smart Tail Truncate",
    badge: "smart-truncate",
    description: "Preserves tool header and error tail while trimming massive middle logs",
    icon: "content_cut",
  },
];

export interface CavemanLevelOption {
  id: "lite" | "full" | "ultra";
  name: string;
  tagline: string;
  description: string;
  savingsEstimate: string;
  preview: {
    normal: string;
    compressed: string;
  };
}

export const CAVEMAN_LEVELS_CONFIG: CavemanLevelOption[] = [
  {
    id: "lite",
    name: "Lite",
    tagline: "Drop Filler & Pleasantries",
    description: "Maintains full grammar and sentences. Strips greetings, conversational pleasantries, and hedging.",
    savingsEstimate: "~15-25% output tokens",
    preview: {
      normal: "Sure! I'd be happy to help with that. Basically, to resolve the bug you just need to add an optional check on line 42.",
      compressed: "To resolve the bug, add an optional check on line 42.",
    },
  },
  {
    id: "full",
    name: "Full",
    tagline: "Telegraphic Precision",
    description: "Telegraphic phrasing. Drops non-essential articles and conversational transitions. Code and errors are exact.",
    savingsEstimate: "~35-50% output tokens",
    preview: {
      normal: "In order to resolve the authentication error, we should inspect the request header and verify that the bearer token is valid.",
      compressed: "Inspect request header. Verify bearer token valid.",
    },
  },
  {
    id: "ultra",
    name: "Ultra",
    tagline: "Monosyllabic Fragments",
    description: "Extreme output compression. Direct fragments and short bullets. Minimal explanation, immediate code.",
    savingsEstimate: "~55-70% output tokens",
    preview: {
      normal: "The database query failed because the connection timed out after 30 seconds. You should increase the connection pool size in configuration.",
      compressed: "DB query fail. Conn timeout 30s. Fix: increase pool size in config.",
    },
  },
];

export interface PonytailLevelOption {
  id: "lite" | "full" | "ultra";
  name: string;
  tagline: string;
  description: string;
  yagniRule: string;
}

export const PONYTAIL_LEVELS_CONFIG: PonytailLevelOption[] = [
  {
    id: "lite",
    name: "Lite",
    tagline: "Lazy Senior Dev Persona",
    description: "Biases model toward standard library, existing deps, and minimal diffs. Skips boilerplate and premature design patterns.",
    yagniRule: "Code first. At most 3 lines of summary: what was skipped, when to add it.",
  },
  {
    id: "full",
    name: "Full",
    tagline: "Strict YAGNI Ladder",
    description: "Strictly enforces 6-step ladder: Does it need to exist → Stdlib → Native platform → Existing dep → One line → Minimal code.",
    yagniRule: "No unrequested abstractions. Boring over clever. Shortest diff wins.",
  },
  {
    id: "ultra",
    name: "Ultra",
    tagline: "Radical Minimalism",
    description: "Extreme simplicity bias. Single-file or inline solution wherever possible. Rejects all ceremonial scaffolding.",
    yagniRule: "Never simplify away validation, security, or error handling. Eliminate everything else.",
  },
];

export const PONYTAIL_YAGNI_STEPS = [
  { step: "1", title: "Does this need to exist?", desc: "YAGNI — delete before creating" },
  { step: "2", title: "Stdlib does it?", desc: "Use built-in language APIs" },
  { step: "3", title: "Native platform covers it?", desc: "CSS over JS, DB constraint over app code" },
  { step: "4", title: "Installed dep solves it?", desc: "Never add a new package for a few lines" },
  { step: "5", title: "Can it be one line?", desc: "One clean line beats 20 lines of abstraction" },
  { step: "6", title: "Only then: minimal code", desc: "Shortest working diff wins" },
];

export interface SandboxPreset {
  id: string;
  label: string;
  text: string;
}

export const SANDBOX_PRESETS: SandboxPreset[] = [
  {
    id: "diff",
    label: "Git Diff",
    text: `diff --git a/src/index.ts b/src/index.ts\nindex 83b9c1..94c1a2 100644\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,10 +1,10 @@\n const a = 1;\n const b = 2;\n const c = 3;\n const d = 4;\n const e = 5;\n const f = 6;\n+const newFeature = true;\n const g = 7;\n const h = 8;\n const i = 9;\n const j = 10;\n`,
  },
  {
    id: "terminal",
    label: "Terminal Logs",
    text: `\u001b[32m✔\u001b[0m Compiled in 420ms\n[1/4] Resolving packages...\r[2/4] Fetching packages...\r[3/4] Linking dependencies...\n\u001b[33mWARN\u001b[0m deprecated punycode@2.3.0: please use whatwg-url\n\u001b[33mWARN\u001b[0m deprecated punycode@2.3.0: please use whatwg-url\nDone in 2.34s.\n`,
  },
  {
    id: "build",
    label: "Build Output",
    text: `> npm run build\n\ninfo  - Loaded env from .env\ninfo  - Collecting page data...\ninfo  - Generating static pages (0/10)\ninfo  - Generating static pages (5/10)\ninfo  - Generating static pages (10/10)\n✓ Compiled successfully in 1.4s\n`,
  },
  {
    id: "grep",
    label: "Grep Search",
    text: `src/auth.ts:12:export function verifyToken(token: string) {\nsrc/auth.ts:13:  const parsed = parseJwt(token);\nsrc/auth.ts:14:  return parsed.valid;\nsrc/api.ts:45:export function handleAuth(req: Request) {\nsrc/api.ts:46:  return verifyToken(req.headers.auth);\n`,
  },
];
