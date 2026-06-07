/**
 * commandPalette.js — ⌘K / Ctrl+K action launcher (v0.9.0)
 *
 * A searchable overlay that lets operators jump to any action (switch tabs,
 * start/stop autofill, load data, copy payload, manage signatures, toggle
 * settings…) from the keyboard. Commands are supplied by main.js as a flat
 * registry; this module owns ranking, rendering, keyboard nav and recents.
 *
 * Pure helpers (fuzzyScore, rankCommands, optionDomId) are exported for unit
 * testing with no DOM dependency.
 */

/**
 * Subsequence fuzzy score. Returns null when `query` is not a subsequence of
 * `text`; otherwise a number where higher = better. Rewards word-start and
 * contiguous matches and slightly prefers shorter targets.
 */
export function fuzzyScore(query, text) {
  if (!query) return 0;
  const q = String(query).toLowerCase();
  const t = String(text || "").toLowerCase();
  if (!t) return null;

  let score = 0;
  let ti = 0;
  let streak = 0;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    for (let k = ti; k < t.length; k++) {
      if (t[k] === ch) { found = k; break; }
    }
    if (found === -1) return null;

    if (found === 0 || /[\s\-_/.]/.test(t[found - 1])) score += 8; // word-start bonus
    if (found === ti) { streak += 1; score += 4 + streak; }        // contiguous bonus
    else { streak = 0; score += 1; }
    score -= Math.min(3, found - ti) * 0.2;                         // gap penalty
    ti = found + 1;
  }

  score += Math.max(0, 12 - t.length * 0.05); // brevity preference
  return score;
}

/**
 * Rank a command registry against a query.
 * @param {Array} commands [{ id, title, subtitle, group, keywords[], enabled, run }]
 * @param {string} query
 * @param {string[]} recentIds most-recent-first
 * @returns {Array} ranked commands (matches only when query is non-empty)
 */
export function rankCommands(commands, query, recentIds = []) {
  const list = Array.isArray(commands) ? commands.filter((c) => c && c.id) : [];
  const recentRank = new Map(recentIds.map((id, i) => [id, recentIds.length - i]));
  const q = String(query || "").trim();

  if (!q) {
    return list
      .filter((c) => c.enabled !== false)
      .slice()
      .sort((a, b) => (recentRank.get(b.id) || 0) - (recentRank.get(a.id) || 0));
  }

  const scored = [];
  for (const cmd of list) {
    const haystacks = [cmd.title, cmd.subtitle, cmd.group, ...(cmd.keywords || [])].filter(Boolean);
    let best = null;
    for (const h of haystacks) {
      const s = fuzzyScore(q, h);
      if (s !== null) best = best === null ? s : Math.max(best, s);
    }
    if (best !== null) {
      const recencyBoost = (recentRank.get(cmd.id) || 0) * 0.5;
      const disabledPenalty = cmd.enabled === false ? 1000 : 0;
      scored.push({ cmd, score: best + recencyBoost - disabledPenalty });
    }
  }

  scored.sort((a, b) => b.score - a.score || String(a.cmd.title).localeCompare(String(b.cmd.title)));
  return scored.map((s) => s.cmd);
}

const LIST_DOM_ID = "command-palette-list";

/** Stable DOM id for the option row at `index`, for aria-activedescendant. */
export function optionDomId(index) {
  return `command-palette-option-${index}`;
}

/**
 * Build a command-palette controller bound to the DOM.
 * @returns {{ open, close, toggle, isOpen, destroy }}
 */
export function createCommandPalette(options = {}) {
  const doc = options.document || (typeof document !== "undefined" ? document : null);
  const getCommands = typeof options.getCommands === "function" ? options.getCommands : () => [];
  const loadRecent = typeof options.loadRecent === "function" ? options.loadRecent : async () => [];
  const saveRecent = typeof options.saveRecent === "function" ? options.saveRecent : async () => {};

  if (!doc) {
    return { open() {}, close() {}, toggle() {}, isOpen: () => false, destroy() {} };
  }

  let root = null;
  let input = null;
  let listEl = null;
  let emptyEl = null;
  let countEl = null;
  let items = [];
  let rowEls = [];
  let activeIndex = 0;
  let isOpen = false;
  let recentIds = [];

  function build() {
    root = doc.createElement("div");
    root.className = "command-palette";
    root.id = "command-palette";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Command palette");

    const backdrop = doc.createElement("div");
    backdrop.className = "command-palette-backdrop";
    backdrop.addEventListener("click", hide);
    root.appendChild(backdrop);

    const panel = doc.createElement("div");
    panel.className = "command-palette-panel";

    const header = doc.createElement("div");
    header.className = "command-palette-header";

    input = doc.createElement("input");
    input.type = "text";
    input.className = "command-palette-input";
    input.placeholder = "Type a command or search…  (Esc to close)";
    input.setAttribute("aria-label", "Search commands");
    // Combobox semantics so screen readers announce the active option during
    // arrow-key navigation (paired with aria-activedescendant in highlight()).
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", LIST_DOM_ID);
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-haspopup", "listbox");
    input.autocomplete = "off";
    input.spellcheck = false;
    header.appendChild(input);

    countEl = doc.createElement("span");
    countEl.className = "command-palette-count";
    header.appendChild(countEl);

    panel.appendChild(header);

    listEl = doc.createElement("div");
    listEl.className = "command-palette-list";
    listEl.id = LIST_DOM_ID;
    listEl.setAttribute("role", "listbox");
    panel.appendChild(listEl);

    emptyEl = doc.createElement("div");
    emptyEl.className = "command-palette-empty";
    emptyEl.textContent = "No matching commands";
    emptyEl.hidden = true;
    panel.appendChild(emptyEl);

    const footer = doc.createElement("div");
    footer.className = "command-palette-footer";
    for (const [keys, label] of [["↑ ↓", "Navigate"], ["↵", "Run"], ["Esc", "Close"]]) {
      const hint = doc.createElement("span");
      hint.className = "command-palette-hint";
      const kbd = doc.createElement("kbd");
      kbd.textContent = keys;
      hint.appendChild(kbd);
      hint.appendChild(doc.createTextNode(` ${label}`));
      footer.appendChild(hint);
    }
    panel.appendChild(footer);

    root.appendChild(panel);
    doc.body.appendChild(root);

    input.addEventListener("input", () => refresh(input.value));
    root.addEventListener("keydown", onKeydown);
  }

  function ensureBuilt() {
    if (!root) build();
  }

  function onKeydown(event) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Enter":
        event.preventDefault();
        void runActive();
        break;
      case "Escape":
        event.preventDefault();
        hide();
        break;
      case "Tab":
        // Trap focus inside the input.
        event.preventDefault();
        input.focus();
        break;
      default:
        break;
    }
  }

  function move(delta) {
    if (!items.length) return;
    activeIndex = (activeIndex + delta + items.length) % items.length;
    highlight();
  }

  function highlight() {
    let activeId = "";
    rowEls.forEach((row, i) => {
      if (!row) return;
      const on = i === activeIndex;
      row.classList.toggle("is-active", on);
      row.setAttribute("aria-selected", String(on));
      if (on) {
        activeId = row.id || "";
        if (typeof row.scrollIntoView === "function") {
          row.scrollIntoView({ block: "nearest" });
        }
      }
    });
    if (input) {
      if (activeId) input.setAttribute("aria-activedescendant", activeId);
      else input.removeAttribute("aria-activedescendant");
    }
  }

  function refresh(query) {
    const commands = getCommands() || [];
    items = rankCommands(commands, query, recentIds);
    activeIndex = 0;
    renderList();
  }

  function renderList() {
    if (!listEl) return;
    listEl.replaceChildren();
    rowEls = [];

    if (countEl) countEl.textContent = items.length ? `${items.length}` : "";
    if (emptyEl) emptyEl.hidden = items.length > 0;
    if (input) input.setAttribute("aria-expanded", items.length ? "true" : "false");

    let lastGroup = null;
    items.forEach((cmd, index) => {
      if (cmd.group && cmd.group !== lastGroup) {
        lastGroup = cmd.group;
        const groupEl = doc.createElement("div");
        groupEl.className = "command-palette-group";
        groupEl.textContent = cmd.group;
        groupEl.setAttribute("role", "presentation");
        listEl.appendChild(groupEl);
      }

      const row = doc.createElement("button");
      row.type = "button";
      row.className = "command-palette-item";
      row.id = optionDomId(index);
      if (cmd.enabled === false) row.classList.add("is-disabled");
      row.setAttribute("role", "option");
      row.dataset.index = String(index);
      rowEls[index] = row;

      const main = doc.createElement("span");
      main.className = "command-palette-item-main";
      const title = doc.createElement("span");
      title.className = "command-palette-item-title";
      title.textContent = cmd.title || cmd.id;
      main.appendChild(title);
      if (cmd.subtitle) {
        const sub = doc.createElement("span");
        sub.className = "command-palette-item-sub";
        sub.textContent = cmd.subtitle;
        main.appendChild(sub);
      }
      row.appendChild(main);

      if (cmd.hint) {
        const hint = doc.createElement("kbd");
        hint.className = "command-palette-item-hint";
        hint.textContent = cmd.hint;
        row.appendChild(hint);
      }

      row.addEventListener("click", () => {
        activeIndex = index;
        void runActive();
      });
      row.addEventListener("mousemove", () => {
        if (activeIndex !== index) {
          activeIndex = index;
          highlight();
        }
      });

      listEl.appendChild(row);
    });

    highlight();
  }

  async function runActive() {
    const cmd = items[activeIndex];
    if (!cmd || cmd.enabled === false || typeof cmd.run !== "function") return;
    hide();
    try {
      await cmd.run();
    } catch (error) {
      console.warn("[CA Extension] command failed:", cmd.id, error);
    }
    recentIds = [cmd.id, ...recentIds.filter((id) => id !== cmd.id)].slice(0, 8);
    try { await saveRecent(recentIds); } catch { /* noop */ }
  }

  async function show() {
    ensureBuilt();
    try { recentIds = (await loadRecent()) || []; } catch { recentIds = []; }
    root.hidden = false;
    isOpen = true;
    input.value = "";
    refresh("");
    // Focus after the element is visible so the caret lands correctly.
    setTimeout(() => input && input.focus(), 0);
  }

  function hide() {
    if (root) root.hidden = true;
    if (input) {
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
    isOpen = false;
  }

  function toggle() {
    if (isOpen) hide();
    else void show();
  }

  function destroy() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = input = listEl = emptyEl = countEl = null;
    rowEls = [];
    isOpen = false;
  }

  return { open: show, close: hide, toggle, isOpen: () => isOpen, destroy };
}
