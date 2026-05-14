/**
 * Care Assurance ACP Autofill - shared "Realistic Typing" helpers.
 *
 * Loaded as the first content script on Mobizio pages so each per-page
 * content script (content-acp.js, content-initial-assessment.js,
 * content-emar.js) can reuse the same humanized typing pipeline without
 * duplicating ~100 lines apiece. Helpers are exposed on
 * `window.__CA_RealisticTyping` because each content script lives in the
 * same isolated world per page.
 */
(() => {
  if (window.__CA_RealisticTyping) return;

  const TIMING = {
    base: { min: 35, max: 95 },
    space: { min: 70, max: 170 },
    punctuation: { min: 110, max: 240 },
    newline: { min: 180, max: 360 },
    thinkingChance: 0.07,
    thinking: { min: 220, max: 520 },
    initialFocusDelay: 60,
    /**
     * Hard upper bound on how long realistic typing can take per field.
     * Beyond this, per-character delays are scaled down proportionally so
     * filling a 400-char control measure cannot stall a 20-field workflow
     * for several minutes.
     */
    perFieldBudgetMs: 6000,
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

  const isContentEditableTarget = (field) =>
    !!field &&
    field.isContentEditable === true &&
    field.tagName !== "INPUT" &&
    field.tagName !== "TEXTAREA";

  const setNativeFieldValue = (field, value) => {
    if (!field) return;
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field) || {}, "value");
    if (descriptor?.set) {
      descriptor.set.call(field, value);
      return;
    }
    field.value = value;
  };

  const dispatchInputEvent = (field, data = null) => {
    if (typeof InputEvent === "function") {
      field.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data,
          inputType: data == null ? "insertReplacementText" : "insertText",
        }),
      );
      return;
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const dispatchCommitEvents = (field) => {
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new Event("blur", { bubbles: true }));
  };

  const dispatchKeyboardEvent = (field, type, char) => {
    if (typeof KeyboardEvent !== "function") return;
    try {
      const isEnter = char === "\n" || char === "\r";
      const key = isEnter ? "Enter" : char;
      let code = "";
      if (isEnter) code = "Enter";
      else if (char === " ") code = "Space";
      else if (/^[a-zA-Z]$/.test(char)) code = `Key${char.toUpperCase()}`;
      else if (/^[0-9]$/.test(char)) code = `Digit${char}`;
      field.dispatchEvent(
        new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          key,
          code,
        }),
      );
    } catch (_) {
      // Older runtimes may reject KeyboardEvent options; safe to ignore.
    }
  };

  const dispatchBeforeInputEvent = (field, char) => {
    if (typeof InputEvent !== "function") return;
    try {
      field.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          data: char,
          inputType: "insertText",
        }),
      );
    } catch (_) {
      // beforeinput unsupported — fall through.
    }
  };

  const baseDelayFor = (char) => {
    const range =
      char === "\n" || char === "\r"
        ? TIMING.newline
        : /\s/.test(char)
        ? TIMING.space
        : /[.,;:!?()[\]{}\-/\\'"]/.test(char)
        ? TIMING.punctuation
        : TIMING.base;
    return range.min + Math.random() * (range.max - range.min);
  };

  /**
   * Returns a multiplier that compresses long inputs into the per-field
   * budget. For inputs that would naturally fit the budget, returns 1.
   */
  const computeBudgetScale = (text) => {
    if (!text) return 1;
    const avg = (TIMING.base.min + TIMING.base.max) / 2;
    const naiveDuration = text.length * avg;
    if (naiveDuration <= TIMING.perFieldBudgetMs) return 1;
    return Math.max(0.18, TIMING.perFieldBudgetMs / naiveDuration);
  };

  const appendCharToField = (field, char) => {
    if (isContentEditableTarget(field)) {
      field.textContent = `${field.textContent || ""}${char}`;
      return;
    }
    const current = typeof field.value === "string" ? field.value : "";
    setNativeFieldValue(field, `${current}${char}`);
  };

  const clearField = (field) => {
    if (isContentEditableTarget(field)) {
      field.textContent = "";
      return;
    }
    setNativeFieldValue(field, "");
  };

  const focusField = (field) => {
    try {
      field.focus({ preventScroll: false });
    } catch (_) {
      try {
        field.focus();
      } catch (_) {
        /* ignored — disabled or detached field */
      }
    }
  };

  const isFieldFillable = (field) => {
    if (!field) return false;
    if (field.disabled) return false;
    if (field.readOnly) return false;
    if (field.getAttribute && field.getAttribute("aria-disabled") === "true") return false;
    return true;
  };

  /**
   * Types `value` into `field`, dispatching realistic keyboard + input
   * events at human-like cadence. Returns true on success, false if the
   * field cannot accept input.
   */
  const typeLikeHuman = async (field, value) => {
    if (!field) return false;
    if (!isFieldFillable(field)) return false;
    focusField(field);
    await wait(TIMING.initialFocusDelay);
    clearField(field);
    dispatchInputEvent(field, null);
    const text = String(value);
    const scale = computeBudgetScale(text);
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      dispatchKeyboardEvent(field, "keydown", char);
      dispatchBeforeInputEvent(field, char);
      appendCharToField(field, char);
      dispatchInputEvent(field, char);
      dispatchKeyboardEvent(field, "keyup", char);
      let delay = baseDelayFor(char) * scale;
      if (
        scale === 1 &&
        i > 4 &&
        i < text.length - 1 &&
        Math.random() < TIMING.thinkingChance
      ) {
        delay +=
          TIMING.thinking.min + Math.random() * (TIMING.thinking.max - TIMING.thinking.min);
      }
      await wait(delay);
    }
    dispatchCommitEvents(field);
    return true;
  };

  window.__CA_RealisticTyping = Object.freeze({
    setNativeFieldValue,
    dispatchInputEvent,
    dispatchCommitEvents,
    typeLikeHuman,
    isContentEditableTarget,
    isFieldFillable,
    TIMING,
  });
})();
