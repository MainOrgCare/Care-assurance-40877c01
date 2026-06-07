import test from "node:test";
import assert from "node:assert/strict";

// Pure helpers from the popup's keyboard-shortcut registry (single source of
// truth). The registry replaced three hand-duplicated, drifted copies of the
// shortcut list across the operator guide, its copy text, and the footer strip.
import {
  KEYBOARD_SHORTCUTS,
  getKeyboardShortcuts,
  comboToText,
  shortcutCombosToText,
  buildShortcutTextLines,
  buildShortcutHintsHtml,
  buildShortcutGuideHtml,
  primaryComboText,
  getCommandHint,
  isTypingTarget,
  TAB_COMMAND_ORDER,
} from "../../extension/edge-acp-autofill/popup/shortcuts.js";

test("registry is well-formed: ids unique, combos present, surfaces valid", () => {
  const ids = new Set();
  for (const s of KEYBOARD_SHORTCUTS) {
    assert.equal(typeof s.id, "string");
    assert.ok(s.id.length > 0, "id must be non-empty");
    assert.ok(!ids.has(s.id), `duplicate id: ${s.id}`);
    ids.add(s.id);
    assert.ok(Array.isArray(s.combos) && s.combos.length > 0, `${s.id} needs combos`);
    for (const combo of s.combos) {
      assert.ok(Array.isArray(combo) && combo.length > 0, `${s.id} combo must have keys`);
    }
    assert.ok(typeof s.label === "string" && s.label.length > 0);
    assert.ok(Array.isArray(s.surfaces) && s.surfaces.length > 0);
    for (const surface of s.surfaces) {
      assert.ok(["guide", "footer"].includes(surface), `${s.id} bad surface ${surface}`);
    }
  }
});

test("getKeyboardShortcuts filters by surface and defaults to all", () => {
  assert.equal(getKeyboardShortcuts().length, KEYBOARD_SHORTCUTS.length);

  const guide = getKeyboardShortcuts("guide");
  const footer = getKeyboardShortcuts("footer");
  assert.ok(guide.every((s) => s.surfaces.includes("guide")));
  assert.ok(footer.every((s) => s.surfaces.includes("footer")));

  // The command palette and the Alt+1…6 tab jumps were missing from the old
  // surfaces; ensure they are now advertised.
  assert.ok(guide.some((s) => s.id === "command-palette"));
  assert.ok(guide.some((s) => s.id === "switch-tabs-number"));
  assert.ok(footer.some((s) => s.id === "command-palette"));
});

test("returned arrays are copies, not the frozen registry", () => {
  const all = getKeyboardShortcuts();
  all.push({ id: "x" });
  assert.equal(getKeyboardShortcuts().length, KEYBOARD_SHORTCUTS.length);
});

test("comboToText and shortcutCombosToText format keys correctly", () => {
  assert.equal(comboToText(["Alt", "A"]), "Alt+A");
  assert.equal(comboToText([]), "");
  assert.equal(comboToText(null), "");

  const startAutofill = KEYBOARD_SHORTCUTS.find((s) => s.id === "start-autofill");
  assert.equal(shortcutCombosToText(startAutofill), "Alt+A / Ctrl/⌘+Enter");
  assert.equal(shortcutCombosToText({}), "");
});

test("buildShortcutTextLines mirrors the guide surface and labels", () => {
  const lines = buildShortcutTextLines();
  assert.equal(lines.length, getKeyboardShortcuts("guide").length);
  assert.ok(lines.includes("- Alt+A / Ctrl/⌘+Enter: Start Autofill"));
  assert.ok(lines.includes("- Ctrl/⌘+K: Open the command palette"));
  assert.ok(lines.every((l) => l.startsWith("- ")));
});

test("buildShortcutHintsHtml renders compact footer hints with <kbd>", () => {
  const html = buildShortcutHintsHtml();
  assert.ok(html.includes(`<span class="kbd-hint">`));
  assert.ok(html.includes(`<kbd>Ctrl/⌘</kbd>+<kbd>K</kbd> Palette`));
  assert.ok(html.includes(`<kbd>Alt</kbd>+<kbd>A</kbd> / <kbd>Ctrl/⌘</kbd>+<kbd>Enter</kbd> Start`));
  // one hint span per footer shortcut
  const count = (html.match(/kbd-hint/g) || []).length;
  assert.equal(count, getKeyboardShortcuts("footer").length);
});

test("buildShortcutGuideHtml renders guide rows with styled spans", () => {
  const html = buildShortcutGuideHtml();
  assert.ok(html.includes(`class="help-guide-shortcut"`));
  assert.ok(html.includes(`<span class="kbd">Alt</span> + <span class="kbd">A</span>`));
  assert.ok(html.includes("Open the command palette"));
  const count = (html.match(/help-guide-shortcut/g) || []).length;
  assert.equal(count, getKeyboardShortcuts("guide").length);
});

test("primaryComboText returns only the first combo", () => {
  const startAutofill = KEYBOARD_SHORTCUTS.find((s) => s.id === "start-autofill");
  assert.equal(primaryComboText(startAutofill), "Alt+A");
  assert.equal(primaryComboText({}), "");
  assert.equal(primaryComboText(null), "");
});

test("getCommandHint derives palette hints from the registry", () => {
  // Action commands map to their shortcut's primary combo.
  assert.equal(getCommandHint("start-autofill"), "Alt+A");
  assert.equal(getCommandHint("stop-autofill"), "Alt+X");
  assert.equal(getCommandHint("copy-payload"), "Alt+C");
  assert.equal(getCommandHint("refresh-connection"), "Alt+R");

  // Tab-navigation commands map to Alt+1…6 in order.
  assert.equal(getCommandHint("go-home"), "Alt+1");
  assert.equal(getCommandHint("go-logs"), "Alt+6");
  TAB_COMMAND_ORDER.forEach((id, i) => {
    assert.equal(getCommandHint(id), `Alt+${i + 1}`);
  });

  // Commands without a shortcut return null.
  assert.equal(getCommandHint("toggle-theme"), null);
  assert.equal(getCommandHint("unknown-command"), null);
});

test("isTypingTarget detects text-entry contexts", () => {
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget(undefined), false);
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true); // defaults to text
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "text" }), true);
  assert.equal(isTypingTarget({ tagName: "input", type: "EMAIL" }), true);
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "checkbox" }), false);
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "button" }), false);
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "range" }), false);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget({ tagName: "DIV" }), false);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
});
