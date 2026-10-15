import test from "node:test";
import assert from "node:assert/strict";
import React from "react";

import {
  Checkbox,
  CHECKBOX_SIZE_CONFIG,
  CHECKBOX_VARIANT_CONFIG,
  type CheckboxSize,
  type CheckboxVariant,
  type CheckboxProps,
} from "../src/web/src/components/ui/index.js";

test("Checkbox UI component is properly exported", () => {
  assert.ok(Checkbox, "Checkbox component must be defined and exported");
  assert.equal(typeof Checkbox, "object", "Checkbox is a forwardRef component");
  assert.equal(Checkbox.displayName, "Checkbox");
});

test("CHECKBOX_SIZE_CONFIG contains expected sizes and classes", () => {
  const sizes: CheckboxSize[] = ["sm", "md", "lg"];

  for (const size of sizes) {
    const cfg = CHECKBOX_SIZE_CONFIG[size];
    assert.ok(cfg, `Size config for '${size}' must exist`);
    assert.ok(cfg.box.includes("rounded"), `Size '${size}' box must have rounded styling`);
    assert.ok(cfg.icon.length > 0, `Size '${size}' icon class must be defined`);
    assert.ok(cfg.label.startsWith("text-"), `Size '${size}' label class must specify text size`);
    assert.ok(cfg.description.startsWith("text-"), `Size '${size}' description class must specify text size`);
    assert.ok(cfg.gap.startsWith("gap-"), `Size '${size}' gap class must be defined`);
  }

  // Size hierarchy check
  assert.ok(CHECKBOX_SIZE_CONFIG.sm.box.includes("size-4"));
  assert.ok(CHECKBOX_SIZE_CONFIG.md.box.includes("size-5"));
  assert.ok(CHECKBOX_SIZE_CONFIG.lg.box.includes("size-6"));
});

test("CHECKBOX_VARIANT_CONFIG contains expected variants and styling", () => {
  const variants: CheckboxVariant[] = ["primary", "emerald", "cyan"];

  for (const variant of variants) {
    const cfg = CHECKBOX_VARIANT_CONFIG[variant];
    assert.ok(cfg, `Variant config for '${variant}' must exist`);
    assert.ok(cfg.active.includes("text-white"), `Variant '${variant}' active style must have white text`);
    assert.ok(cfg.focusRing.includes("peer-focus-visible:ring-"), `Variant '${variant}' must have focus-visible ring`);
    assert.ok(cfg.hoverBorder.length > 0, `Variant '${variant}' hoverBorder must be defined`);
  }

  assert.ok(CHECKBOX_VARIANT_CONFIG.primary.active.includes("bg-blue-600"));
  assert.ok(CHECKBOX_VARIANT_CONFIG.emerald.active.includes("bg-emerald-600"));
  assert.ok(CHECKBOX_VARIANT_CONFIG.cyan.active.includes("bg-cyan-600"));
});

test("Checkbox element creation with various props", () => {
  const elDefault = React.createElement(Checkbox, {
    label: "Test Label",
  });
  assert.equal(elDefault.type, Checkbox);
  assert.equal(elDefault.props.label, "Test Label");

  const elControlled = React.createElement(Checkbox, {
    checked: true,
    indeterminate: false,
    size: "sm",
    variant: "emerald",
    disabled: true,
  });
  assert.equal(elControlled.props.checked, true);
  assert.equal(elControlled.props.size, "sm");
  assert.equal(elControlled.props.variant, "emerald");
  assert.equal(elControlled.props.disabled, true);

  const elIndeterminate = React.createElement(Checkbox, {
    indeterminate: true,
    size: "lg",
    variant: "cyan",
  });
  assert.equal(elIndeterminate.props.indeterminate, true);
  assert.equal(elIndeterminate.props.size, "lg");
  assert.equal(elIndeterminate.props.variant, "cyan");
});
