process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  gitDiff,
  terminalLogs,
  buildOutput,
  gitStatus,
  gitLog,
  grep,
  find,
  ls,
  tree,
  searchList,
  readNumbered,
  dedupLog,
  smartTruncate,
  autoDetectFilter,
  safeApply,
} from "../src/core/tokenSaver/index.js";

test("TokenSaver Filters - gitDiff compaction", () => {
  const diffInput = `diff --git a/src/index.ts b/src/index.ts
index abc..def 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import foo from "foo";
-const a = 1;
+const a = 2;
+const b = 3;
 export default a;`;

  const compressed = gitDiff(diffInput);
  assert.ok(compressed.includes("src/index.ts"));
  assert.ok(compressed.includes("+2 -1"));
  assert.ok(compressed.includes("+const a = 2;"));
});

test("TokenSaver Filters - terminalLogs ANSI stripping & dedup", () => {
  const logInput = `\x1b[32mSuccess\x1b[0m\n[====================] 100%\npolling...\npolling...\npolling...\npolling...\nDone`;
  const result = terminalLogs(logInput);
  assert.ok(!result.includes("\x1b[32m"));
  assert.ok(result.includes("[progress...]"));
  assert.ok(result.includes("[repeated lines trimmed]"));
  assert.ok(result.includes("Done"));
});

test("TokenSaver Filters - buildOutput preserves errors & warnings", () => {
  const buildLog = `npm warn deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported
Compiling foo v1.0.0
Compiling bar v1.0.0
npm ERR! code 1
npm ERR! path /project
npm ERR! Failed at the build script.
added 120 packages in 3s`;

  const compressed = buildOutput(buildLog);
  assert.ok(compressed.includes("npm ERR!"));
  assert.ok(compressed.includes("Compiled 2 packages"));
  assert.ok(compressed.includes("added 120 packages"));
});

test("TokenSaver Filters - gitStatus formats branch & file counts", () => {
  const statusInput = `On branch feature/token-saver
Changes not staged for commit:
  modified:   src/core/index.ts
  modified:   src/server/index.ts

Untracked files:
  src/new-file.ts
`;

  const result = gitStatus(statusInput);
  assert.ok(result.includes("* feature/token-saver"));
  assert.ok(result.includes("~ Modified: 2 files"));
  assert.ok(result.includes("? Untracked: 1 files"));
});

test("TokenSaver Filters - gitLog keeps headers and subjects", () => {
  const logInput = `commit abc1234def5678abc1234def5678abc1234def5
Author: Developer <dev@example.com>
Date:   Mon Jan 1 00:00:00 2025 +0000

    feat: add token saver architecture

    Detailed description of changes that can be omitted.
    Multiple lines of details.
    More unnecessary body lines in this commit log.
    Another long paragraph with extensive explanations.
    More paragraphs describing why this was changed.
    Line 1 of body explanation.
    Line 2 of body explanation.

diff --git a/file.ts b/file.ts
@@ -1 +1 @@
-old
+new
`;

  const result = gitLog(logInput);
  assert.ok(result.includes("commit abc1234def5678abc1234def5678abc1234def5"));
  assert.ok(result.includes("Author: Developer <dev@example.com>"));
  assert.ok(result.includes("Subject: feat: add token saver architecture"));
  assert.ok(result.includes("... diff body omitted"));
});

test("TokenSaver Filters - grep groups matches by file", () => {
  const grepInput = `src/main.ts:12:import { foo } from "./foo";
src/main.ts:25:foo.run();
src/utils.ts:5:export const foo = 1;`;

  const result = grep(grepInput);
  assert.ok(result.includes("3 matches in 2F:"));
  assert.ok(result.includes("[file] src/main.ts (2):"));
  assert.ok(result.includes("[file] src/utils.ts (1):"));
});

test("TokenSaver Filters - find groups by directory", () => {
  const findInput = `src/core/a.ts
src/core/b.ts
src/server/c.ts
src/server/d.ts`;

  const result = find(findInput);
  assert.ok(result.includes("4 files in 2 dirs:"));
  assert.ok(result.includes("src/core/  (2)"));
  assert.ok(result.includes("src/server/  (2)"));
});

test("TokenSaver Filters - ls formats directory listing & size summary", () => {
  const lsInput = `total 24
drwxr-xr-x   4 user  group   128 Jan 15 10:00 src
-rw-r--r--   1 user  group  2048 Jan 15 10:00 README.md
-rw-r--r--   1 user  group   512 Jan 15 10:00 package.json`;

  const result = ls(lsInput);
  assert.ok(result.includes("src/"));
  assert.ok(result.includes("README.md"));
  assert.ok(result.includes("Summary: 2 files, 1 dirs"));
});

test("TokenSaver Filters - tree removes summaries and caps lines", () => {
  const treeInput = `├── src
│   ├── index.ts
│   └── app.ts
└── package.json

2 directories, 3 files`;

  const result = tree(treeInput);
  assert.ok(result.includes("├── src"));
  assert.ok(!result.includes("2 directories, 3 files"));
});

test("TokenSaver Filters - searchList groups glob results", () => {
  const searchInput = `Result of search in 'src' (total 3 files):
- src/core/a.ts
- src/core/b.ts
- src/server/c.ts`;

  const result = searchList(searchInput);
  assert.ok(result.includes("3 files in 2 dirs:"));
  assert.ok(result.includes("src/core/ (2):"));
});

test("TokenSaver Filters - readNumbered truncates middle of long numbered dumps", () => {
  const lines: string[] = [];
  for (let i = 1; i <= 300; i++) {
    lines.push(`  ${i}|const line_${i} = ${i};`);
  }
  const dump = lines.join("\n");
  const result = readNumbered(dump);
  assert.ok(result.includes("... +120 lines truncated (file continues)"));
  assert.ok(result.includes("  1|const line_1 = 1;"));
  assert.ok(result.includes("  300|const line_300 = 300;"));
});

test("TokenSaver Filters - dedupLog collapses streaks", () => {
  const raw = `[DEBUG] ping
[DEBUG] ping
[DEBUG] ping
[DEBUG] ping
[INFO] finished`;

  const result = dedupLog(raw);
  assert.ok(result.includes("[DEBUG] ping"));
  assert.ok(result.includes("... (3 duplicate lines)"));
  assert.ok(result.includes("[INFO] finished"));
});

test("TokenSaver Filters - smartTruncate handles large unstructured dumps", () => {
  const lines: string[] = [];
  for (let i = 1; i <= 300; i++) {
    lines.push(`Unstructured random content row ${i}`);
  }
  const dump = lines.join("\n");
  const result = smartTruncate(dump);
  assert.ok(result.includes("... +120 lines truncated"));
});

test("TokenSaver Autodetection - detects various shapes accurately", () => {
  // 1. git log
  const logSample = `commit a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\nAuthor: me <me@me.com>\nDate: today\n    Subject`;
  assert.equal(autoDetectFilter(logSample)?.filterName, "git-log");

  // 2. git diff
  const diffSample = `diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-old\n+new`;
  assert.equal(autoDetectFilter(diffSample)?.filterName, "git-diff");

  // 3. git status
  const statusSample = `On branch main\nUntracked files:\n  test.ts`;
  assert.equal(autoDetectFilter(statusSample)?.filterName, "git-status");

  // 4. build output
  const buildSample = `npm ERR! missing script: test\nadded 10 packages`;
  assert.equal(autoDetectFilter(buildSample)?.filterName, "build-output");

  // 5. grep
  const grepSample = `src/file.ts:10:const x = 1;\nsrc/file.ts:20:const y = 2;`;
  assert.equal(autoDetectFilter(grepSample)?.filterName, "grep");

  // 6. find with Windows drive letter
  const findWindows = `C:\\project\\a.ts\nC:\\project\\b.ts\nC:\\project\\c.ts`;
  assert.equal(autoDetectFilter(findWindows)?.filterName, "find");

  // 7. tree
  const treeSample = `├── a\n└── b`;
  assert.equal(autoDetectFilter(treeSample)?.filterName, "tree");

  // 8. ls
  const lsSample = `total 10\n-rw-r--r-- 1 u g 100 Jan 1 00:00 a.txt\n-rw-r--r-- 1 u g 200 Jan 1 00:00 b.txt\n-rw-r--r-- 1 u g 300 Jan 1 00:00 c.txt`;
  assert.equal(autoDetectFilter(lsSample)?.filterName, "ls");

  // 9. safeApply error resilience
  const crashingFilter = ((_s: string) => {
    throw new Error("Simulated filter crash");
  }) as any;
  crashingFilter.filterName = "crasher";

  const fallback = safeApply(crashingFilter, "original raw text");
  assert.equal(fallback, "original raw text");
});
