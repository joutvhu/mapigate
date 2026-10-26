import test from "node:test";
import assert from "node:assert/strict";
import { createBackdropCloseHandler } from "../src/web/src/hooks/useBackdropClose.js";

test("useBackdropClose: closes when both mousedown and mouseup occur directly on backdrop", () => {
  let closed = false;
  const handler = createBackdropCloseHandler({
    onClose: () => {
      closed = true;
    },
  });

  const backdropElement = { id: "backdrop" };

  // 1. mousedown on backdrop
  handler.handleMouseDown({
    target: backdropElement,
    currentTarget: backdropElement,
    button: 0,
  });

  assert.equal(closed, false, "Should not close on mousedown alone");

  // 2. mouseup on backdrop
  handler.handleMouseUp({
    target: backdropElement,
    currentTarget: backdropElement,
    button: 0,
  });

  assert.equal(closed, true, "Should close when mousedown + mouseup both occur on backdrop");
});

test("useBackdropClose: DOES NOT close when mousedown starts inside modal and mouseup is on backdrop", () => {
  let closed = false;
  const handler = createBackdropCloseHandler({
    onClose: () => {
      closed = true;
    },
  });

  const backdropElement = { id: "backdrop" };
  const innerTextElement = { id: "modal-text" };

  // 1. User starts selecting text inside modal content (mousedown inside)
  handler.handleMouseDown({
    target: innerTextElement,
    currentTarget: backdropElement,
    button: 0,
  });

  // 2. User drags cursor outside modal content onto backdrop and releases (mouseup on backdrop)
  handler.handleMouseUp({
    target: backdropElement,
    currentTarget: backdropElement,
    button: 0,
  });

  assert.equal(closed, false, "Must NOT close when drag-selection started inside modal content");

  // 3. Browser fires subsequent click on backdrop
  handler.handleClick({
    target: backdropElement,
    currentTarget: backdropElement,
    detail: 1, // mouse click
  });

  assert.equal(closed, false, "Must NOT close on subsequent click event either");
});

test("useBackdropClose: DOES NOT close when mousedown is on backdrop and mouseup is inside modal", () => {
  let closed = false;
  const handler = createBackdropCloseHandler({
    onClose: () => {
      closed = true;
    },
  });

  const backdropElement = { id: "backdrop" };
  const innerElement = { id: "modal-content" };

  // 1. mousedown on backdrop
  handler.handleMouseDown({
    target: backdropElement,
    currentTarget: backdropElement,
    button: 0,
  });

  // 2. mouseup released inside modal content
  handler.handleMouseUp({
    target: innerElement,
    currentTarget: backdropElement,
    button: 0,
  });

  assert.equal(closed, false, "Must NOT close when mouseup released inside modal");
});

test("useBackdropClose: DOES NOT close on right-click (button !== 0)", () => {
  let closed = false;
  const handler = createBackdropCloseHandler({
    onClose: () => {
      closed = true;
    },
  });

  const backdropElement = { id: "backdrop" };

  // Right-click mousedown
  handler.handleMouseDown({
    target: backdropElement,
    currentTarget: backdropElement,
    button: 2,
  });

  // Right-click mouseup
  handler.handleMouseUp({
    target: backdropElement,
    currentTarget: backdropElement,
    button: 2,
  });

  assert.equal(closed, false, "Must NOT close on right click");
});

test("useBackdropClose: closes on keyboard activation (detail === 0 on backdrop)", () => {
  let closed = false;
  const handler = createBackdropCloseHandler({
    onClose: () => {
      closed = true;
    },
  });

  const backdropElement = { id: "backdrop" };

  handler.handleClick({
    target: backdropElement,
    currentTarget: backdropElement,
    detail: 0, // Enter/Space
  });

  assert.equal(closed, true, "Should close when backdrop is activated via keyboard (detail === 0)");
});

test("useBackdropClose: touch events require touchstart + touchend directly on backdrop", () => {
  let closed = false;
  const handler = createBackdropCloseHandler({
    onClose: () => {
      closed = true;
    },
  });

  const backdropElement = { id: "backdrop" };
  const innerElement = { id: "inner" };

  // Dragging from inside to backdrop via touch
  handler.handleTouchStart({
    target: innerElement,
    currentTarget: backdropElement,
  });

  handler.handleTouchEnd({
    target: backdropElement,
    currentTarget: backdropElement,
  });

  assert.equal(closed, false, "Must NOT close when touch started inside modal");

  // Genuine tap on backdrop
  handler.handleTouchStart({
    target: backdropElement,
    currentTarget: backdropElement,
  });

  handler.handleTouchEnd({
    target: backdropElement,
    currentTarget: backdropElement,
  });

  assert.equal(closed, true, "Should close when touchstart + touchend both occur on backdrop");
});

test("useBackdropClose: disabled option prevents closing", () => {
  let closed = false;
  const handler = createBackdropCloseHandler({
    onClose: () => {
      closed = true;
    },
    disabled: true,
  });

  const backdropElement = { id: "backdrop" };

  handler.handleMouseDown({
    target: backdropElement,
    currentTarget: backdropElement,
    button: 0,
  });

  handler.handleMouseUp({
    target: backdropElement,
    currentTarget: backdropElement,
    button: 0,
  });

  assert.equal(closed, false, "Must NOT close when disabled is true");
});
