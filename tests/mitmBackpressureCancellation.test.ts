import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { waitForDrainOrClose, pipeSSE } from "../src/mitm/handlers/base.js";

class MockResponse extends EventEmitter {
  public writableEnded = false;
  public destroyed = false;
  public writableNeedDrain = false;
  public writtenChunks: string[] = [];
  public writeReturns = true;

  writeHead(_status: number, _headers?: any) {
    return this;
  }

  write(chunk: any) {
    this.writtenChunks.push(String(chunk));
    return this.writeReturns;
  }

  end() {
    this.writableEnded = true;
    return this;
  }
}

describe("Stream Backpressure & Downstream Disconnect Cancellation", () => {
  describe("waitForDrainOrClose", () => {
    it("resolves immediately when res is already destroyed", async () => {
      const mockRes = new MockResponse();
      mockRes.destroyed = true;

      let resolved = false;
      await waitForDrainOrClose(mockRes as any);
      resolved = true;
      assert.equal(resolved, true);
    });

    it("resolves when drain event is emitted", async () => {
      const mockRes = new MockResponse();

      let resolved = false;
      const waitPromise = waitForDrainOrClose(mockRes as any).then(() => {
        resolved = true;
      });

      assert.equal(resolved, false);
      mockRes.emit("drain");
      await waitPromise;
      assert.equal(resolved, true);
    });

    it("resolves when close event is emitted", async () => {
      const mockRes = new MockResponse();

      let resolved = false;
      const waitPromise = waitForDrainOrClose(mockRes as any).then(() => {
        resolved = true;
      });

      assert.equal(resolved, false);
      mockRes.emit("close");
      await waitPromise;
      assert.equal(resolved, true);
    });
  });

  describe("pipeSSE downstream disconnect cancellation", () => {
    it("cancels upstream stream reader when client disconnects (close event)", async () => {
      let cancelCalled = false;
      const chunks = ["data: chunk1\n\n", "data: chunk2\n\n", "data: chunk3\n\n"];
      let readIdx = 0;

      const mockStream = new ReadableStream({
        async pull(controller) {
          if (readIdx < chunks.length) {
            // Simulate network latency between chunks
            await new Promise((r) => setTimeout(r, 20));
            controller.enqueue(new TextEncoder().encode(chunks[readIdx++]));
          } else {
            controller.close();
          }
        },
        cancel() {
          cancelCalled = true;
        },
      });

      const mockRouterResponse = new Response(mockStream, {
        headers: { "Content-Type": "text/event-stream" },
      });

      const mockRes = new MockResponse();

      const pipePromise = pipeSSE(mockRouterResponse, mockRes as any);

      // Simulate client aborting after first chunk starts
      await new Promise((r) => setTimeout(r, 10));
      mockRes.emit("close");

      await pipePromise;
      assert.equal(cancelCalled, true, "Upstream reader.cancel() should be triggered on client close");
    });
  });

  describe("pipeSSE backpressure handling", () => {
    it("pauses reading and awaits drain when res.write returns false", async () => {
      let drainAwaited = false;
      const mockRes = new MockResponse();
      mockRes.writeReturns = false; // Trigger backpressure on first write

      const chunks = ["data: block1\n\n", "data: block2\n\n"];
      let readCount = 0;

      const mockStream = new ReadableStream({
        async pull(controller) {
          if (readCount < chunks.length) {
            controller.enqueue(new TextEncoder().encode(chunks[readCount++]));
          } else {
            controller.close();
          }
        },
      });

      const mockRouterResponse = new Response(mockStream, {
        headers: { "Content-Type": "text/event-stream" },
      });

      const pipePromise = pipeSSE(mockRouterResponse, mockRes as any);

      // Give event loop ticks to process first chunk and hit backpressure
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(mockRes.writtenChunks.length, 1, "Should pause after first write returned false");

      // Now emit drain
      drainAwaited = true;
      mockRes.writeReturns = true;
      mockRes.emit("drain");

      await pipePromise;
      assert.equal(drainAwaited, true);
      assert.equal(mockRes.writtenChunks.length, 2, "Should resume writing after drain");
    });
  });
});
