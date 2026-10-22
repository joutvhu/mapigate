process.env.NODE_ENV = "test";

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isNormalizedPathMatch,
  normalizeFilePath,
  readLocalFileContent,
  recoverUnchangedFileContent,
  recoverUnchangedToolResultsInMessages,
  recoverUnchangedToolResultString,
} from "../src/mitm/handlers/kiro/toolResultExtractor.js";
import { convertResponsesApiFormat } from "../src/core/adapters/responsesAdapter.js";
import { LoadBalancer } from "../src/core/router/loadBalancer.js";

describe("Kiro MITM Universal Tool Result Recovery", () => {
  describe("1. Normalized Path Suffix Matching (Basename Collision Prevention)", () => {
    it("matches identical paths regardless of backslashes or casing", () => {
      assert.equal(
        isNormalizedPathMatch("F:\\Repo\\Project\\src\\index.ts", "f:/repo/project/src/index.ts"),
        true
      );
    });

    it("matches valid relative path suffix with directory boundary", () => {
      assert.equal(
        isNormalizedPathMatch("src/index.ts", "f:/repo/project/src/index.ts"),
        true
      );
      assert.equal(
        isNormalizedPathMatch("Cargo.toml", "f:/Documents/Library/AI/mcp-sentinel/Cargo.toml"),
        true
      );
    });

    it("prevents basename collision across different folders (e.g. dir_a/index.ts vs dir_b/index.ts)", () => {
      assert.equal(
        isNormalizedPathMatch("f:/repo/dir_a/index.ts", "f:/repo/dir_b/index.ts"),
        false
      );
      assert.equal(
        isNormalizedPathMatch("dir_a/index.ts", "dir_b/index.ts"),
        false
      );
      assert.equal(
        isNormalizedPathMatch("dir_a/index.ts", "f:/repo/project/dir_b/index.ts"),
        false
      );
    });

    it("handles leading ./ properly in path normalization", () => {
      assert.equal(
        normalizeFilePath("./src/components/Button.tsx"),
        "src/components/button.tsx"
      );
      assert.equal(
        isNormalizedPathMatch("./Cargo.toml", "f:/project/Cargo.toml"),
        true
      );
    });
  });

  describe("2. recoverUnchangedToolResultsInMessages (OpenAI Format)", () => {
    it("recovers file content from a prior read_file tool result", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_read_1",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "f:\\repo\\src\\main.rs", offset: 0, limit: 50 }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_read_1",
          content: "fn main() {\n    println!(\"Hello World\");\n}",
        },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_read_2",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "f:/repo/src/main.rs" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_read_2",
          content: "'f:/repo/src/main.rs' is unchanged since you read it earlier this session — the content is already in your context above. Reusing that; not re-serializing.",
        },
      ];

      recoverUnchangedToolResultsInMessages(messages);

      assert.equal(
        messages[3].content,
        "fn main() {\n    println!(\"Hello World\");\n}"
      );
    });

    it("recovers file content from an earlier read_code tool result", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_code_1",
              type: "function",
              function: {
                name: "read_code",
                arguments: JSON.stringify({ file_path: "src/utils.ts" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_code_1",
          content: "export function add(a: number, b: number) { return a + b; }",
        },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_code_2",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "src/utils.ts" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_code_2",
          content: "'src/utils.ts' is unchanged since you read it earlier this session — the content is already in your context above.",
        },
      ];

      recoverUnchangedToolResultsInMessages(messages);

      assert.equal(
        messages[3].content,
        "export function add(a: number, b: number) { return a + b; }"
      );
    });

    it("does not mix up files with identical basenames in different directories", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_index_a",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "src/components/index.ts" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_index_a",
          content: "// Components index",
        },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_index_b",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "src/utils/index.ts" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_index_b",
          content: "// Utils index",
        },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_repeat_a",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "src/components/index.ts" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_repeat_a",
          content: "'src/components/index.ts' is unchanged since you read it earlier this session — the content is already in your context above.",
        },
      ];

      recoverUnchangedToolResultsInMessages(messages);

      // Must recover components index, NOT utils index!
      assert.equal(messages[5].content, "// Components index");
    });

    it("recovers directly from local disk when not present in history", () => {
      const pkgPath = path.resolve("package.json");
      const realPkgContent = fs.readFileSync(pkgPath, "utf-8");

      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_pkg",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: pkgPath }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_pkg",
          content: `'${pkgPath}' is unchanged since you read it earlier this session — the content is already in your context above.`,
        },
      ];

      recoverUnchangedToolResultsInMessages(messages);

      assert.equal(messages[1].content, realPkgContent);
    });

    it("appends directive notice when file is missing from both history and disk", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_nonexistent",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "non_existent_file_xyz_12345.txt" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_nonexistent",
          content: "'non_existent_file_xyz_12345.txt' is unchanged since you read it earlier this session — the content is already in your context above.",
        },
      ];

      recoverUnchangedToolResultsInMessages(messages);

      assert.ok(messages[1].content.includes("non_existent_file_xyz_12345.txt"));
      assert.ok(messages[1].content.includes("DO NOT call read_file or read_code again for this file"));
    });
  });

  describe("3. In-flight Tool Result Recovery for Antigravity (recoverUnchangedToolResultString)", () => {
    it("recovers tool response string from messages context", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_ag_1",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "README.md" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_ag_1",
          content: "# Mapigate Documentation",
        },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_ag_2",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "README.md" }),
              },
            },
          ],
        },
      ];

      const rawResp = "'README.md' is unchanged since you read it earlier this session — the content is already in your context above.";
      const recovered = recoverUnchangedToolResultString(rawResp, "call_ag_2", messages);

      assert.equal(recovered, "# Mapigate Documentation");
    });
  });

  describe("4. convertResponsesApiFormat Tool Recovery", () => {
    it("automatically recovers unchanged tool results when input is OpenAI messages", () => {
      const body = {
        messages: [
          {
            role: "assistant",
            tool_calls: [
              {
                id: "c1",
                type: "function",
                function: { name: "read_file", arguments: JSON.stringify({ path: "config.json" }) },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "c1",
            content: "{\"port\": 20127}",
          },
          {
            role: "assistant",
            tool_calls: [
              {
                id: "c2",
                type: "function",
                function: { name: "read_file", arguments: JSON.stringify({ path: "config.json" }) },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "c2",
            content: "'config.json' is unchanged since you read it earlier this session — the content is already in your context above.",
          },
        ],
      };

      const converted = convertResponsesApiFormat(body);
      assert.equal(converted.messages[3].content, "{\"port\": 20127}");
    });
  });

  describe("5. LoadBalancer Session Cache Eviction & Sweeping", () => {
    beforeEach(() => {
      LoadBalancer.reset();
    });

    it("sweeps expired sessions according to TTL", () => {
      LoadBalancer.setStickyAccount("prov_test", "sess_active", "acc_1");
      LoadBalancer.setStickyAccount("prov_test", "sess_expired", "acc_2");

      assert.equal(LoadBalancer.getSessionStickinessCount(), 2);

      // Simulate passage of 2 hours for expired session
      const twoHoursLater = Date.now() + 2 * 60 * 60 * 1000;
      const swept = LoadBalancer.sweepExpiredSessions(twoHoursLater);
      assert.equal(swept, 2);
      assert.equal(LoadBalancer.getSessionStickinessCount(), 0);
    });
  });
});
