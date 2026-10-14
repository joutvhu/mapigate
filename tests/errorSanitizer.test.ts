import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeErrorMessage,
  sanitizeErrorResponse,
} from "../src/shared/utils/errorSanitizer.js";

describe("Error Sanitizer (CWE-209 Mitigation)", () => {
  describe("Stack Trace Truncation", () => {
    it("truncates stack trace frames after the first \\n    at", () => {
      const msg =
        "TypeError: Cannot read properties of undefined (reading 'foo')\n    at Object.<anonymous> (F:\\project\\app.ts:12:34)\n    at Module._compile (node:internal/modules/cjs/loader:1469:14)";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "TypeError: Cannot read properties of undefined (reading 'foo')");
      assert.ok(!sanitized.includes("at Object.<anonymous>"));
      assert.ok(!sanitized.includes("node:internal"));
    });

    it("handles CRLF \\r\\n    at stack traces", () => {
      const msg =
        "Error: Connection reset\r\n    at TCP.onStreamRead (node:internal/stream_base_commons:217:20)";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Error: Connection reset");
    });

    it("preserves messages without stack traces", () => {
      const msg = "Invalid API key provided";
      assert.equal(sanitizeErrorMessage(msg), "Invalid API key provided");
    });
  });

  describe("Windows Path Redaction", () => {
    it("redacts Windows backslash paths with [path redacted]", () => {
      const msg = "Failed to load module F:\\path\\to\\file.ts";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Failed to load module [path redacted]");
    });

    it("redacts Windows forward-slash paths with [path redacted]", () => {
      const msg = "Failed to load module F:/path/to/file.ts";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Failed to load module [path redacted]");
    });

    it("preserves trailing punctuation on Windows paths", () => {
      const msg = "Error occurred in C:\\Users\\Developer\\app.js.";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Error occurred in [path redacted].");
    });

    it("redacts paths with line and column numbers", () => {
      const msg = "SyntaxError at D:\\workspace\\project\\src\\index.ts:42:15";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "SyntaxError at [path redacted]");
    });

    it("redacts quoted Windows paths", () => {
      const msg = "Cannot find file 'E:\\data\\models\\config.json'";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Cannot find file '[path redacted]'");
    });
  });

  describe("POSIX Path Redaction", () => {
    it("redacts common POSIX root paths", () => {
      const msg = "Permission denied: /home/user/workspace/secret.key";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Permission denied: [path redacted]");
    });

    it("redacts /Users macOS paths", () => {
      const msg = "Fatal crash at /Users/developer/project/server.ts:10:5";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Fatal crash at [path redacted]");
    });

    it("redacts /var /tmp and /etc paths", () => {
      const msg1 = "Log write error: /var/log/mapigate.log";
      const msg2 = "Temp file missing: /tmp/scratch.json";
      assert.equal(sanitizeErrorMessage(msg1), "Log write error: [path redacted]");
      assert.equal(sanitizeErrorMessage(msg2), "Temp file missing: [path redacted]");
    });

    it("redacts file:// URIs", () => {
      const msg = "Module error: file:///app/src/main.js";
      assert.equal(sanitizeErrorMessage(msg), "Module error: [path redacted]");
    });

    it("preserves HTTP/HTTPS URLs", () => {
      const msg = "Request to https://api.openai.com/v1/chat/completions failed with status 500";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(
        sanitized,
        "Request to https://api.openai.com/v1/chat/completions failed with status 500"
      );
    });

    it("preserves API routes without filesystem paths", () => {
      const msg = "Unknown route /v1/chat/completions";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Unknown route /v1/chat/completions");
    });
  });

  describe("Credentials Masking", () => {
    it("masks OpenAI API keys (sk-***)", () => {
      const msg = "Authentication failed for sk-abcdef1234567890abcdef";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Authentication failed for sk-***");
      assert.ok(!sanitized.includes("abcdef1234567890"));
    });

    it("masks OpenAI project keys (sk-proj-***)", () => {
      const msg = "Invalid token: sk-proj-12345678901234567890abcdefghij";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Invalid token: sk-***");
    });

    it("redacts Bearer tokens", () => {
      const msg = "Upstream returned 401 with header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
      const sanitized = sanitizeErrorMessage(msg);
      assert.ok(sanitized.includes("Bearer [redacted]"));
      assert.ok(!sanitized.includes("eyJhbGciOiJIUzI1Ni"));
    });

    it("redacts standalone JWT tokens", () => {
      const msg = "Session token eyJhbGciOiJIUzI1Ni.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozG6pQ2N0 expired";
      const sanitized = sanitizeErrorMessage(msg);
      assert.equal(sanitized, "Session token [jwt redacted] expired");
    });
  });

  describe("Deep Error Object Sanitization (sanitizeErrorResponse)", () => {
    it("sanitizes an Error instance", () => {
      const err = new Error(
        "ENOENT: no such file at F:\\repo\\src\\main.ts\n    at Object.<anonymous> (F:\\repo\\src\\main.ts:1:1)"
      );
      const sanitized = sanitizeErrorResponse(err);
      assert.equal(sanitized.name, "Error");
      assert.equal(sanitized.message, "ENOENT: no such file at [path redacted]");
      assert.equal(sanitized.stack, "Error: ENOENT: no such file at [path redacted]");
    });

    it("deeply sanitizes nested error objects", () => {
      const payload = {
        status: 500,
        error: {
          message: "Failure accessing F:/config/secrets.env",
          details: [
            {
              code: "AUTH_FAIL",
              key: "sk-1234567890abcdef12345678",
              location: "/home/developer/app.ts:44",
            },
          ],
        },
        retryable: false,
      };

      const sanitized = sanitizeErrorResponse(payload);
      assert.equal(sanitized.status, 500);
      assert.equal(sanitized.retryable, false);
      assert.equal(sanitized.error.message, "Failure accessing [path redacted]");
      assert.equal(sanitized.error.details[0].code, "AUTH_FAIL");
      assert.equal(sanitized.error.details[0].key, "sk-***");
      assert.equal(sanitized.error.details[0].location, "[path redacted]");
    });

    it("handles primitives, null, and undefined safely", () => {
      assert.equal(sanitizeErrorResponse(null), null);
      assert.equal(sanitizeErrorResponse(undefined), undefined);
      assert.equal(sanitizeErrorResponse(42), 42);
      assert.equal(sanitizeErrorResponse(true), true);
      assert.equal(sanitizeErrorResponse("Error in F:\\file.ts"), "Error in [path redacted]");
    });
  });
});
