/**
 * shortcuts.js — Keyboard shortcut registry (v0.9.2)
 *
 * Single source of truth for the popup's keyboard shortcuts. Previously the
 * shortcut list was hand-duplicated across three surfaces (the operator-guide
 * dialog HTML, its copy-to-clipboard text, and the footer hint strip) and each
 * copy had drifted out of sync with the real keydown handlers in main.js — the
 * guide advertised only Ctrl+Enter / Esc / ←→ while the footer advertised only
 * Alt+A/X/R/C, and neither mentioned the command palette (Ctrl/⌘+K) or the
 * Alt+1…6 tab jumps that main.js actually implements.
 *
 * Every shortcut surface now derives from KEYBOARD_SHORTCUTS below. The pure
 * helpers (no DOM / chrome dependency) are exported so they can be unit-tested
 * directly under Node, matching the other popup productivity modules.
 */

/**
 * @typedef {Object} ShortcutDescriptor
 * @property {string} id           Stable identifier.
 * @property {string[][]} combos   One or more key combinations; each combo is an
 *                                  ordered list of key tokens (e.g. ["Alt","A"]).
 *                                  Multiple combos mean "any of these".
 * @property {string} label        Full description (operator guide).
 * @property {string} [short]      Compact description (footer strip).
 * @property {string[]} surfaces   Where the shortcut is advertised:
 *                                  "guide" and/or "footer".
 */

/** @type {ReadonlyArray<ShortcutDescriptor>} */
export const KEYBOARD_SHORTCUTS = Object.freeze([
  {
    id: "command-palette",
    combos: [["Ctrl/⌘", "K"]],
    label: "Open the command palette",
    short: "Palette",
    surfaces: ["guide", "footer"],
  },
  {
    id: "switch-tabs-number",
    combos: [["Alt", "1…6"]],
    label: "Jump straight to a tab (Home → Logs)",
    surfaces: ["guide"],
  },
  {
    id: "start-autofill",
    combos: [["Alt", "A"], ["Ctrl/⌘", "Enter"]],
    label: "Start Autofill",
    short: "Start",
    surfaces: ["guide", "footer"],
  },
  {
    id: "stop-autofill",
    combos: [["Alt", "X"]],
    label: "Stop Autofill",
    short: "Stop",
    surfaces: ["guide", "footer"],
  },
  {
    id: "refresh",
    combos: [["Alt", "R"]],
    label: "Refresh / reconnect the session",
    short: "Refresh",
    surfaces: ["guide", "footer"],
  },
  {
    id: "copy-payload",
    combos: [["Alt", "C"]],
    label: "Copy the current payload",
    short: "Copy payload",
    surfaces: ["guide", "footer"],
  },
  {
    id: "switch-tabs-arrows",
    combos: [["←"], ["→"]],
    label: "Switch tabs while focused on the tab row",
    surfaces: ["guide"],
  },
  {
    id: "close",
    combos: [["Esc"]],
    label: "Close dialogs or dropdowns",
    surfaces: ["guide"],
  },
]);

/**
 * Return the shortcuts advertised on a given surface (pure).
 * @param {"guide"|"footer"} [surface] Omit to return the full registry.
 * @returns {ShortcutDescriptor[]}
 */
export function getKeyboardShortcuts(surface) {
  if (!surface) return KEYBOARD_SHORTCUTS.slice();
  return KEYBOARD_SHORTCUTS.filter((s) => s.surfaces.includes(surface));
}

/** Join a single combo's key tokens into plain text, e.g. ["Alt","A"] → "Alt+A". */
export function comboToText(combo) {
  return (Array.isArray(combo) ? combo : []).join("+");
}

/**
 * Render all of a shortcut's combos as plain text, e.g.
 * [["Alt","A"],["Ctrl/⌘","Enter"]] → "Alt+A / Ctrl/⌘+Enter" (pure).
 */
export function shortcutCombosToText(shortcut) {
  const combos = (shortcut && Array.isArray(shortcut.combos)) ? shortcut.combos : [];
  return combos.map(comboToText).join(" / ");
}

/**
 * Build the plain-text "Keyboard shortcuts" lines used by the copy-to-clipboard
 * operator guide, e.g. "- Alt+A / Ctrl/⌘+Enter: Start Autofill" (pure).
 * @returns {string[]}
 */
export function buildShortcutTextLines() {
  return getKeyboardShortcuts("guide").map(
    (s) => `- ${shortcutCombosToText(s)}: ${s.label}`,
  );
}

/** Render one combo as <kbd> elements, e.g. <kbd>Alt</kbd>+<kbd>A</kbd>. */
function comboToKbdHtml(combo) {
  return (Array.isArray(combo) ? combo : [])
    .map((key) => `<kbd>${key}</kbd>`)
    .join("+");
}

/** Render one combo as styled spans, e.g. <span class="kbd">Alt</span> + <span class="kbd">A</span>. */
function comboToSpanHtml(combo) {
  return (Array.isArray(combo) ? combo : [])
    .map((key) => `<span class="kbd">${key}</span>`)
    .join(" + ");
}

/** Plain text of a shortcut's primary (first) combo, e.g. "Alt+A". */
export function primaryComboText(shortcut) {
  const combos = (shortcut && Array.isArray(shortcut.combos)) ? shortcut.combos : [];
  return combos.length ? comboToText(combos[0]) : "";
}

// Maps command-palette command ids (defined in main.js) to the shortcut that
// triggers them, so the palette can show a single compact hint that always
// matches the real keydown handlers. Tab-navigation commands are handled
// separately because each tab owns a distinct number key.
const COMMAND_TO_SHORTCUT_ID = Object.freeze({
  "start-autofill": "start-autofill",
  "stop-autofill": "stop-autofill",
  "copy-payload": "copy-payload",
  "refresh-connection": "refresh",
});

// Ordered command ids for the Alt+1…6 tab jumps, matching ALT_TAB_KEYS in
// main.js (1=Home … 6=Logs).
export const TAB_COMMAND_ORDER = Object.freeze([
  "go-home",
  "go-intake",
  "go-run",
  "go-review",
  "go-ops",
  "go-logs",
]);

/** Modifier used by the Alt+1…6 tab jumps, derived from the registry. */
function tabModifier() {
  const tabShortcut = KEYBOARD_SHORTCUTS.find((s) => s.id === "switch-tabs-number");
  const combo = tabShortcut && tabShortcut.combos[0];
  return (combo && combo[0]) || "Alt";
}

/**
 * True when a key event target is a text-entry context where global shortcuts
 * should NOT fire (input/textarea/select/contentEditable). Accepts any object
 * with `tagName` / `type` / `isContentEditable`, so it is pure and unit-testable
 * under Node without a DOM.
 * @param {{ tagName?: string, type?: string, isContentEditable?: boolean }} target
 * @returns {boolean}
 */
export function isTypingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  const tag = String(target.tagName || "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = String(target.type || "text").toLowerCase();
    // Button-like inputs are safe targets for shortcuts; text-like ones are not.
    const nonTextInputs = new Set([
      "button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image",
    ]);
    return !nonTextInputs.has(type);
  }
  return false;
}

/**
 * Compact keyboard hint for a command-palette command id, or null when the
 * command has no shortcut (pure). Always derived from the registry so it cannot
 * drift from the operator guide or the real handlers.
 * @param {string} commandId
 * @returns {string|null}
 */
export function getCommandHint(commandId) {
  const shortcutId = COMMAND_TO_SHORTCUT_ID[commandId];
  if (shortcutId) {
    const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.id === shortcutId);
    return shortcut ? primaryComboText(shortcut) : null;
  }
  const tabIndex = TAB_COMMAND_ORDER.indexOf(commandId);
  if (tabIndex >= 0) return `${tabModifier()}+${tabIndex + 1}`;
  return null;
}

/**
 * Build the footer hint strip HTML (compact). Mirrors the previous
 * `<span class="kbd-hint"><kbd>…</kbd> Label</span>` markup (pure).
 * @returns {string}
 */
export function buildShortcutHintsHtml() {
  return getKeyboardShortcuts("footer")
    .map((s) => {
      const keys = s.combos.map(comboToKbdHtml).join(" / ");
      const label = s.short || s.label;
      return `<span class="kbd-hint">${keys} ${label}</span>`;
    })
    .join("");
}

/**
 * Build the operator-guide "Keyboard shortcuts" rows HTML. Mirrors the previous
 * `.help-guide-shortcut` markup so existing CSS still applies (pure).
 * @returns {string}
 */
export function buildShortcutGuideHtml() {
  return getKeyboardShortcuts("guide")
    .map((s) => {
      const keys = s.combos.map(comboToSpanHtml).join(" / ");
      return (
        `<div class="help-guide-shortcut">` +
        `<strong>${keys}</strong>` +
        `<span>${s.label}</span>` +
        `</div>`
      );
    })
    .join("");
}
