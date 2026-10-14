import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  dnsLines,
  hasHostEntry,
  atomicWriteHostsWin,
} from "../src/mitm/dns/dnsConfig.js";

describe("Dual-Stack IPv4 & IPv6 DNS Redirection", () => {
  describe("dnsLines", () => {
    it("generates both IPv4 and IPv6 localhost records", () => {
      const lines = dnsLines("cloudcode-pa.googleapis.com");
      assert.deepEqual(lines, [
        "127.0.0.1 cloudcode-pa.googleapis.com",
        "::1 cloudcode-pa.googleapis.com",
      ]);
    });
  });

  describe("hasHostEntry", () => {
    it("returns true when both 127.0.0.1 and ::1 are present", () => {
      const content = `
127.0.0.1 localhost
::1 localhost
127.0.0.1 api.individual.githubcopilot.com
::1 api.individual.githubcopilot.com
`;
      assert.equal(hasHostEntry(content, "api.individual.githubcopilot.com"), true);
    });

    it("returns false when only IPv4 entry is present", () => {
      const content = `
127.0.0.1 localhost
127.0.0.1 api.individual.githubcopilot.com
`;
      assert.equal(hasHostEntry(content, "api.individual.githubcopilot.com"), false);
    });

    it("returns false when only IPv6 entry is present", () => {
      const content = `
::1 localhost
::1 api.individual.githubcopilot.com
`;
      assert.equal(hasHostEntry(content, "api.individual.githubcopilot.com"), false);
    });

    it("returns false when entry is commented out", () => {
      const content = `
# 127.0.0.1 api.individual.githubcopilot.com
# ::1 api.individual.githubcopilot.com
`;
      assert.equal(hasHostEntry(content, "api.individual.githubcopilot.com"), false);
    });

    it("returns false when host is absent", () => {
      const content = `
127.0.0.1 localhost
::1 localhost
`;
      assert.equal(hasHostEntry(content, "api.individual.githubcopilot.com"), false);
    });
  });

  describe("atomicWriteHostsWin", () => {
    it("atomically writes and updates a target file", () => {
      const tmpDir = path.join(os.tmpdir(), `mapigate-atomic-test-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      const targetFile = path.join(tmpDir, "test-hosts");

      try {
        const originalContent = "127.0.0.1 localhost\r\n";
        fs.writeFileSync(targetFile, originalContent, "utf8");

        const newContent = "127.0.0.1 localhost\r\n127.0.0.1 test.com\r\n::1 test.com\r\n";
        atomicWriteHostsWin(targetFile, originalContent, newContent);

        const updated = fs.readFileSync(targetFile, "utf8");
        assert.equal(updated, newContent);

        // Verify temp files cleaned up
        assert.equal(fs.existsSync(`${targetFile}.mapigate.new`), false);
        assert.equal(fs.existsSync(`${targetFile}.mapigate.bak`), false);
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // cleanup
        }
      }
    });
  });
});
