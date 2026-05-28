/**
 * ui.js — DOM references, rendering, toasts, tabs, and visual updates
 * CareAssurance Extension v0.6.40
 */

import {
  STORAGE_KEYS,
  DATA_TIMESTAMP_KEY,
  FORM_WORKFLOW_DESCRIPTORS,
  debugLog,
  state,
  escapeHtml,
  escapeAttr,
  formatRuntimeTime,
  formatRuntimeDuration,
  formatPayloadTimestamp,
  getPayloadWorkflowLabel,
  compareExtensionVersions,
  buildWorkflowSafetyState,
  describeWorkspaceRoute,
  normalizeCareAssuranceBaseUrl,
  isLikelyCareAssuranceUrl,
  getCareAssuranceUrl,
  loadStorage,
  setStorage,
  writeToClipboard,
  buildCommandCenterState,
  buildRuntimeDiagnosticsState,
} from "./state.js";

// ═══════════════════════════════════════════════════════════════════════════
// DOM ELEMENT CACHE
// ═══════════════════════════════════════════════════════════════════════════

export const dom = {};

export function cacheDomElements() {
  const ids = [
    // Tabs
    "tab-connect", "tab-upload", "tab-autofill",
    "tab-connect-status", "tab-upload-status", "tab-autofill-status",
    "tab-content-connect", "tab-content-upload", "tab-content-autofill",
    // Header
    "header-subtitle", "connection-badge", "connection-uptime", "overlay-pin-btn",
    // Shared context
    "case-context-strip", "case-context-grid", "case-context-state", "case-context-highlights",
    // Connect
    "connect-status", "connect-btn", "refresh-workspace-context",
    "extension-health-state", "extension-health-meta", "extension-health-sync", "extension-health-guide", "extension-health-primary", "extension-health-secondary", "extension-health-tertiary",
    "workspace-context-status", "workspace-route-label", "workspace-route-path",
    "workspace-tab-title", "open-connected-workspace", "open-dashboard-workspace",
    "open-care-planning-workspace", "open-risk-workspace", "open-plan-enhancer-workspace",
    "open-admin-workspace",
    // Main launchpad
    "main-view-state", "main-view-primary-action", "main-view-secondary-action",
    "main-open-care-planning", "main-open-risk", "main-open-plan-enhancer", "main-open-messages", "main-open-extension-manager",
    // Service users
    "search-section", "service-user-search", "service-user-list", "service-user-sort",
    "service-user-count", "selected-user-section", "selected-user-info",
    "load-care-plan-btn", "load-risk-btn",
    // Upload
    "upload-social-work-input", "upload-social-work-files",
    "upload-initial-assessment-input", "upload-initial-assessment-files",
    "upload-care-plan-input", "upload-care-plan-files",
    "upload-moving-handling-input", "upload-moving-handling-files",
    "upload-additional-documents-input", "upload-additional-documents-files",
    "upload-handoff-state", "upload-handoff-meta", "upload-handoff-recommendation", "upload-handoff-primary", "upload-handoff-secondary",
    "auto-collect-info", "auto-collect-info-state", "auto-collect-info-title", "auto-collect-info-detail", "auto-collect-info-recommendation", "auto-collect-primary-action", "auto-collect-secondary-action", "copy-auto-collect-info",
    "upload-sync-status", "upload-sync-summary", "sync-upload-btn", "reset-upload-btn", "upload-notes", "analyze-documents",
    "analysis-status", "analysis-progress", "clear-uploads",
    "uploaded-docs-summary", "uploaded-docs-list",
    // Autofill settings
    "autofill-user-search", "autofill-user-dropdown", "autofill-selected-user",
    "case-id", "service-data-group-id", "auto-detect-ids",
    "display-name-override",
    "interaction-mode", "auto-submit", "dry-run",
    // Autofill controls
    "payload-status", "progress-status", "start-autofill", "stop-autofill", "clear-data",
    "autofill-session-state", "autofill-session-meta", "autofill-session-recommendation", "autofill-session-primary",
    "autofill-session-focus", "autofill-session-diagnostics",
    // Selection
    "selection-section", "assessment-list", "selection-count", "analysis-overview",
    "select-all-btn", "clear-selection-btn", "proceed-with-selection", "additional-notes",
    // Payload inspector
    "payload-inspector-section", "payload-summary", "payload-json", "copy-payload",
    // Page companion
    "page-companion-state", "page-companion-route", "page-companion-payload",
    "page-companion-review", "refresh-page-companion", "focus-page-companion",
    "open-page-overlay", "jump-page-verification",
    // Signature & logs
    "signature-file", "signature-filename", "signature-status", "signature-preview",
    "upload-signature-btn",
    "log-status", "log-list", "runtime-diagnostics", "clear-logs", "copy-diagnostics",
    // Footer
    "footer-extension-version", "footer-status", "footer-status-dot",
    // Error
    "error-banner", "error-message", "error-dismiss",
    // EMAR skipped rows banner (consumes caAcpEmarSkippedRows storage bucket)
    "emar-skipped-banner", "emar-skipped-title", "emar-skipped-count",
    "emar-skipped-list", "emar-skipped-toggle",
    "emar-skipped-copy", "emar-skipped-clear",
    // Live progress
    "autofill-live-progress", "live-progress-fill", "live-progress-label",
    "live-progress-field", "live-progress-queue",
    // Payload review
    "payload-review-panel", "payload-review-list", "confirm-payload-review",
    // Command center
    "ops-refresh", "ops-copy-snapshot", "ops-copy-incident", "ops-clear-incident",
    "ops-health", "ops-reliability", "ops-queue", "ops-mode", "ops-timeline", "ops-recommendations", "ops-flags",
    "command-center-section", "command-center-summary", "ops-quickbar", "ops-quick-health", "ops-quick-queue", "ops-quick-mode", "ops-quick-note",
  ];

  for (const id of ids) {
    const camel = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    dom[camel] = document.getElementById(id);
  }

  const missing = ids.filter((id) => {
    const camel = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return !dom[camel];
  });
  if (missing.length) {
    try {
      debugLog?.("[CA Extension] Missing popup DOM IDs", { count: missing.length, ids: missing });
    } catch {
      console.warn("[CA Extension] Missing popup DOM IDs:", missing);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

export function switchTab(tabName, { persist = true } = {}) {
  const tabs = [dom.tabConnect, dom.tabUpload, dom.tabAutofill];
  const panels = [dom.tabContentConnect, dom.tabContentUpload, dom.tabContentAutofill];
  tabs.forEach(btn => { btn?.classList.remove("active"); btn?.setAttribute("aria-selected", "false"); });
  panels.forEach(content => { content?.classList.remove("active"); content?.setAttribute("hidden", ""); });

  if (tabName === "connect") { dom.tabConnect?.classList.add("active"); dom.tabConnect?.setAttribute("aria-selected", "true"); dom.tabContentConnect?.classList.add("active"); dom.tabContentConnect?.removeAttribute("hidden"); }
  if (tabName === "upload") { dom.tabUpload?.classList.add("active"); dom.tabUpload?.setAttribute("aria-selected", "true"); dom.tabContentUpload?.classList.add("active"); dom.tabContentUpload?.removeAttribute("hidden"); }
  if (tabName === "autofill") { dom.tabAutofill?.classList.add("active"); dom.tabAutofill?.setAttribute("aria-selected", "true"); dom.tabContentAutofill?.classList.add("active"); dom.tabContentAutofill?.removeAttribute("hidden"); }

  if (persist) {
    chrome.storage.local.set({ [STORAGE_KEYS.lastTab]: tabName }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

let _toastTimer = null;

function _showToast(message, type = "success") {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  clearTimeout(_toastTimer);

  const icons = {
    success: '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>',
    error: '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>',
    info: '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>',
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${icons[type] || icons.info}<span>${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);

  _toastTimer = setTimeout(() => {
    toast.classList.add("toast-exit");
    setTimeout(() => toast.remove(), 320);
  }, 3500);
}

export function showError(message) {
  if (dom.errorBanner) {
    const messageEl = dom.errorMessage;
    if (messageEl) messageEl.textContent = message;
    else dom.errorBanner.textContent = message;
    dom.errorBanner.hidden = false;
    clearTimeout(dom.errorBanner._dismissTimer);
    dom.errorBanner._dismissTimer = setTimeout(() => { dom.errorBanner.hidden = true; }, 8000);
  }
  _showToast(message, "error");
}

export function showSuccess(message) {
  _showToast(message, "success");
  if (dom.progressStatus) dom.progressStatus.textContent = message;
}

export function showInfo(message) {
  _showToast(message, "info");
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAR SKIPPED ROWS BANNER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render the EMAR skipped-rows banner from a list of {table, rowIndex, reason, code, ts}
 * entries persisted in chrome.storage under STORAGE_KEYS.emarSkippedRows.
 *
 * Hidden when the list is empty. Caller is responsible for clearing the storage
 * bucket via the "Clear" handler in main.js.
 */
export function renderEmarSkippedBanner(rows) {
  const banner = dom.emarSkippedBanner;
  if (!banner) return;

  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    banner.hidden = true;
    if (dom.emarSkippedList) {
      dom.emarSkippedList.hidden = true;
      dom.emarSkippedList.innerHTML = "";
    }
    if (dom.emarSkippedToggle) {
      dom.emarSkippedToggle.setAttribute("aria-expanded", "false");
      dom.emarSkippedToggle.textContent = "Details ▾";
    }
    return;
  }

  banner.hidden = false;

  // Title + count
  if (dom.emarSkippedTitle) {
    dom.emarSkippedTitle.textContent = list.length === 1
      ? "1 EMAR row was skipped"
      : `${list.length} EMAR rows were skipped`;
  }
  if (dom.emarSkippedCount) {
    dom.emarSkippedCount.textContent = String(list.length);
  }

  // Detail list (rendered but kept hidden until toggle is opened)
  if (dom.emarSkippedList) {
    const rowsHtml = list
      .slice()
      .reverse() // newest first
      .map((row) => {
        const table = escapeHtml(row?.table || "unknown");
        const rowIndex = Number(row?.rowIndex);
        const rowLabel = Number.isFinite(rowIndex) && rowIndex >= 0 ? `row ${rowIndex + 1}` : "row ?";
        const reason = escapeHtml(row?.reason || "row missing");
        const code = row?.code ? `<span class="emar-skipped-code">${escapeHtml(String(row.code))}</span>` : "";
        const when = formatRuntimeTime(row?.ts);
        return `<li class="emar-skipped-row">
          <span class="emar-skipped-row-loc"><code>${table}</code> · ${rowLabel}</span>
          ${code}
          <span class="emar-skipped-row-reason">${reason}</span>
          <span class="emar-skipped-row-when">${escapeHtml(when)}</span>
        </li>`;
      })
      .join("");
    dom.emarSkippedList.innerHTML = rowsHtml;
  }
}

/**
 * Convert skipped-row entries to a CSV string suitable for the clipboard or
 * an audit attachment. Header row always present, even when list is empty.
 */
export function buildEmarSkippedRowsCsv(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const escapeCsv = (value) => {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ["table,rowIndex,code,reason,timestamp"];
  for (const row of list) {
    const ts = row?.ts ? new Date(row.ts).toISOString() : "";
    lines.push(
      [
        escapeCsv(row?.table || "unknown"),
        escapeCsv(Number.isFinite(Number(row?.rowIndex)) ? Number(row.rowIndex) + 1 : ""),
        escapeCsv(row?.code ?? ""),
        escapeCsv(row?.reason || "row missing"),
        escapeCsv(ts),
      ].join(",")
    );
  }
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING & VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function setButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.classList.add("is-loading");
    btn.disabled = true;
    if (!btn.querySelector(".spinner")) {
      btn.insertAdjacentHTML("beforeend", '<span class="spinner"></span>');
    }
  } else {
    btn.classList.remove("is-loading");
    btn.disabled = false;
    btn.querySelector(".spinner")?.remove();
  }
}

export function setFieldInvalid(input, message) {
  if (!input) return;
  input.setAttribute("aria-invalid", "true");
  let errorEl = input.parentElement?.querySelector(".field-error");
  if (!errorEl) {
    errorEl = document.createElement("span");
    errorEl.className = "field-error";
    errorEl.setAttribute("role", "alert");
    input.parentElement?.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

export function clearFieldInvalid(input) {
  if (!input) return;
  input.removeAttribute("aria-invalid");
  input.parentElement?.querySelector(".field-error")?.remove();
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRMATION DIALOG
// ═══════════════════════════════════════════════════════════════════════════

export function showConfirmDialog(title, message, onConfirm, { details = [] } = {}) {
  document.querySelector(".dialog-overlay")?.remove();

  const dialogId = `dialog-title-${Date.now()}`;
  const detailsHtml = details.length
    ? `<ul class="dialog-detail-list">${details.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
    : "";

  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", dialogId);
  overlay.innerHTML = `
    <div class="dialog">
      <div class="dialog-header">
        <span class="dialog-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        </span>
        <span class="dialog-title" id="${dialogId}">${escapeHtml(title)}</span>
      </div>
      <div class="dialog-body">${escapeHtml(message)}${detailsHtml}</div>
      <div class="dialog-actions">
        <button class="btn btn-secondary dialog-cancel">Cancel</button>
        <button class="btn btn-danger dialog-confirm">Confirm</button>
      </div>
    </div>
  `;

  const cancelBtn = overlay.querySelector(".dialog-cancel");
  const confirmBtn = overlay.querySelector(".dialog-confirm");
  const closeDialog = () => overlay.remove();

  cancelBtn.addEventListener("click", closeDialog);
  confirmBtn.addEventListener("click", () => { closeDialog(); onConfirm(); });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDialog(); });

  const focusable = [cancelBtn, confirmBtn];
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeDialog(); return; }
    if (e.key === "Tab") {
      const idx = focusable.indexOf(document.activeElement);
      if (e.shiftKey) {
        e.preventDefault();
        focusable[idx <= 0 ? focusable.length - 1 : idx - 1].focus();
      } else {
        e.preventDefault();
        focusable[idx >= focusable.length - 1 ? 0 : idx + 1].focus();
      }
    }
  });

  document.body.appendChild(overlay);
  confirmBtn.focus();
}

/**
 * Preview-before-fill dialog. Shows the operator exactly what the engine is
 * about to type before they commit to the run.
 *
 * `summary` is the structure returned by `buildAutofillPreviewSummary()`.
 * Resolves with `{ confirmed: boolean, skipNextTime: boolean }`.
 */
export function showAutofillPreviewDialog(summary) {
  return new Promise((resolve) => {
    document.querySelector(".dialog-overlay")?.remove();

    const dialogId = `dialog-preview-title-${Date.now()}`;
    const skipId = `dialog-preview-skip-${Date.now()}`;

    const sectionsHtml = (summary?.sections || [])
      .map((section) => {
        const itemsHtml = (section.items || [])
          .slice(0, 12) // visual cap per section; count badge shows the true total
          .map(
            (item) => `
              <li class="autofill-preview-item">
                <span class="autofill-preview-item-title">${escapeHtml(item?.title || "(untitled)")}</span>
                ${item?.detail ? `<span class="autofill-preview-item-detail">${escapeHtml(item.detail)}</span>` : ""}
              </li>`
          )
          .join("");
        const hiddenCount = Math.max(0, (section.items?.length || 0) - 12);
        const moreLine = hiddenCount > 0
          ? `<li class="autofill-preview-more">…and ${hiddenCount} more</li>`
          : "";
        return `
          <section class="autofill-preview-section">
            <header class="autofill-preview-section-head">
              <span class="autofill-preview-section-label">${escapeHtml(section.label || "Items")}</span>
              <span class="autofill-preview-section-count">${section.count ?? 0}</span>
            </header>
            <ul class="autofill-preview-list">${itemsHtml}${moreLine}</ul>
          </section>`;
      })
      .join("");

    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", dialogId);
    overlay.innerHTML = `
      <div class="dialog autofill-preview-dialog">
        <div class="dialog-header">
          <span class="dialog-icon autofill-preview-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path d="M10 4a6 6 0 100 12 6 6 0 000-12zm-1 9V7l5 3-5 3z"/></svg>
          </span>
          <span class="dialog-title" id="${dialogId}">Ready to autofill</span>
        </div>
        <div class="dialog-body autofill-preview-body">
          <div class="autofill-preview-meta">
            <div><strong>${escapeHtml(summary?.workflowLabel || "Autofill")}</strong></div>
            <div class="autofill-preview-su">${escapeHtml(summary?.serviceUserDisplayName || "")}</div>
            <div class="autofill-preview-total">${summary?.totalItems ?? 0} item${(summary?.totalItems ?? 0) === 1 ? "" : "s"} queued</div>
          </div>
          <div class="autofill-preview-scroll">
            ${sectionsHtml || '<div class="autofill-preview-empty">No structured items detected — payload will be sent as-is.</div>'}
          </div>
          <label class="autofill-preview-skip">
            <input type="checkbox" id="${skipId}" />
            <span>Skip this preview for the rest of this popup session</span>
          </label>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary dialog-cancel">Cancel</button>
          <button class="btn btn-primary dialog-confirm">Start autofill</button>
        </div>
      </div>
    `;

    const cancelBtn = overlay.querySelector(".dialog-cancel");
    const confirmBtn = overlay.querySelector(".dialog-confirm");
    const skipCheckbox = overlay.querySelector(`#${skipId}`);

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    cancelBtn.addEventListener("click", () => close({ confirmed: false, skipNextTime: false }));
    confirmBtn.addEventListener("click", () => close({ confirmed: true, skipNextTime: Boolean(skipCheckbox?.checked) }));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close({ confirmed: false, skipNextTime: false });
    });

    const focusable = [cancelBtn, confirmBtn, skipCheckbox].filter(Boolean);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close({ confirmed: false, skipNextTime: false });
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        close({ confirmed: true, skipNextTime: Boolean(skipCheckbox?.checked) });
        return;
      }
      if (e.key === "Tab" && focusable.length > 0) {
        const idx = focusable.indexOf(document.activeElement);
        e.preventDefault();
        if (e.shiftKey) focusable[idx <= 0 ? focusable.length - 1 : idx - 1].focus();
        else focusable[idx >= focusable.length - 1 ? 0 : idx + 1].focus();
      }
    });

    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}

function buildHelpGuideText({ version = "", isConnected = false, isAdmin = false } = {}) {
  const versionLabel = String(version || "").trim();
  const formattedVersion = versionLabel
    ? versionLabel.startsWith("v")
      ? versionLabel
      : `v${versionLabel}`
    : "Current build";

  return [
    `CareAssurance Extension ${formattedVersion}`,
    "",
    "Recommended workflow",
    "1. Workspace: Sync CareAssurance and confirm the current page plus Extension Status before starting a new run.",
    "2. Intake: Select the target service user or Case ID, then upload files or use Auto-Collect in the matching Intake section.",
    "3. Review: Analyze staged files or send them to CareAssurance Upload once the target and recommended next step still look correct.",
    "4. Autofill: Review any flagged fields, then start Autofill only after the attached page and target IDs still match the payload.",
    "",
    "Auto-download recovery",
    "- Use Retry Failed Downloads after a partial run so already-staged files are not re-downloaded unnecessarily.",
    "- Use Open Source when you need to verify the current Mobizio document list or confirm a missing file.",
    "- Keep the target case aligned before sending staged files or starting Autofill.",
    "",
    "Keyboard shortcuts",
    "- Ctrl/Cmd+Enter: Start Autofill",
    "- Esc: Close dialogs or dropdowns",
    "- Left/Right while focused on tabs: Switch sections",
    "",
    isConnected
      ? "Current state: CareAssurance session connected. Start from Workspace or Intake depending on whether you are checking the page or staging documents."
      : "Current state: CareAssurance session not connected. Start with Sync CareAssurance Session in Workspace.",
    isAdmin
      ? "Admin note: Extension Status can download, rebuild, or bump the published package when rollout changes are needed."
      : "Operator note: Ask an admin to use Extension Status or Extension Manager if the installed build is behind or the package needs rebuilding.",
  ].join("\n");
}

export function showHelpGuideDialog({ version = "", isConnected = false, isAdmin = false } = {}) {
  document.querySelector(".dialog-overlay")?.remove();

  const dialogId = `dialog-title-${Date.now()}`;
  const versionLabel = String(version || "").trim();
  const formattedVersion = versionLabel
    ? versionLabel.startsWith("v")
      ? versionLabel
      : `v${versionLabel}`
    : "Current build";
  const startupTone = isConnected ? "success" : "warning";
  const startupTitle = isConnected ? "Session ready" : "Start with session sync";
  const startupDetail = isConnected
    ? "Use Workspace to confirm the live page, then Intake or Autofill to continue the same case without losing context."
    : "Sync CareAssurance from Workspace first so the popup can inspect the live page, version status, and next available actions.";
  const rolloutDetail = isAdmin
    ? "Admins can use Extension Status to download, rebuild, or bump the published package without leaving the popup."
    : "If the installed build looks behind or stale, ask an admin to refresh the package through Extension Status or Extension Manager.";

  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", dialogId);
  overlay.innerHTML = `
    <div class="dialog help-guide-dialog">
      <div class="dialog-header help-guide-header">
        <span class="dialog-icon help-guide-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-7-3a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 3a1 1 0 0 0 0 2v2a1 1 0 1 0 2 0v-2a1 1 0 0 0-1-1H9Z" clip-rule="evenodd"/></svg>
        </span>
        <div class="help-guide-heading">
          <span class="dialog-title" id="${dialogId}">Operator Guide</span>
          <span class="help-guide-subtitle">Quick workflow, auto-download recovery, and keyboard shortcuts for the current popup.</span>
        </div>
      </div>
      <div class="dialog-body help-guide-body">
        <div class="help-guide-banner is-${startupTone}">
          <span class="help-guide-banner-label">Recommended start</span>
          <strong>${escapeHtml(startupTitle)}</strong>
          <span>${escapeHtml(startupDetail)}</span>
        </div>

        <div class="help-guide-grid">
          <section class="help-guide-section">
            <span class="help-guide-section-label">Recommended flow</span>
            <ol class="help-guide-list">
              <li>Start in Workspace to confirm the page, case context, and extension status.</li>
              <li>In Intake, select the target case, then upload files or use Auto-Collect in the correct section.</li>
              <li>Use the recommended-next-step cards before analyzing, sending staged files, or opening Autofill.</li>
              <li>In Autofill, review flagged fields before starting a live run.</li>
            </ol>
          </section>

          <section class="help-guide-section">
            <span class="help-guide-section-label">Auto-download recovery</span>
            <ul class="help-guide-list">
              <li>Retry Failed Downloads after a partial run so successful files stay staged.</li>
              <li>Open Source when you need to verify the visible Mobizio document list.</li>
              <li>Keep the Case ID and selected service user aligned before sending or starting Autofill.</li>
            </ul>
          </section>
        </div>

        <section class="help-guide-section">
          <span class="help-guide-section-label">Keyboard shortcuts</span>
          <div class="help-guide-shortcuts">
            <div class="help-guide-shortcut">
              <strong><span class="kbd">Ctrl</span> + <span class="kbd">Enter</span></strong>
              <span>Start Autofill</span>
            </div>
            <div class="help-guide-shortcut">
              <strong><span class="kbd">Esc</span></strong>
              <span>Close dialogs or dropdowns</span>
            </div>
            <div class="help-guide-shortcut">
              <strong><span class="kbd">←</span> <span class="kbd">→</span></strong>
              <span>Switch tabs while focused on the tab row</span>
            </div>
          </div>
        </section>

        <div class="help-guide-note">
          <strong>${escapeHtml(formattedVersion)}</strong>
          <span>${escapeHtml(rolloutDetail)}</span>
        </div>
      </div>
      <div class="dialog-actions">
        <button class="btn btn-secondary help-guide-copy">Copy Guide</button>
        <button class="btn btn-primary help-guide-close">Close</button>
      </div>
    </div>
  `;

  const copyBtn = overlay.querySelector(".help-guide-copy");
  const closeBtn = overlay.querySelector(".help-guide-close");
  const closeDialog = () => overlay.remove();

  closeBtn.addEventListener("click", closeDialog);
  copyBtn.addEventListener("click", async () => {
    try {
      await writeToClipboard(buildHelpGuideText({ version, isConnected, isAdmin }));
      showSuccess("Operator guide copied");
    } catch {
      showError("Could not copy the operator guide. Try again.");
    }
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeDialog();
  });

  const focusable = [copyBtn, closeBtn];
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key === "Tab") {
      const index = focusable.indexOf(document.activeElement);
      if (event.shiftKey) {
        event.preventDefault();
        focusable[index <= 0 ? focusable.length - 1 : index - 1].focus();
      } else {
        event.preventDefault();
        focusable[index >= focusable.length - 1 ? 0 : index + 1].focus();
      }
    }
  });

  document.body.appendChild(overlay);
  closeBtn.focus();
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB BADGES
// ═══════════════════════════════════════════════════════════════════════════

export function setTabBadge(tabBtn, count, variant) {
  if (!tabBtn) return;
  tabBtn.querySelector(".tab-badge")?.remove();
  if (!count && count !== 0) return;

  const badge = document.createElement("span");
  if (count === true) {
    badge.className = `tab-badge tab-badge-dot${variant ? ` tab-badge-${variant}` : ""}`;
  } else if (count > 0) {
    badge.className = `tab-badge${variant ? ` tab-badge-${variant}` : ""}`;
    badge.textContent = count > 99 ? "99+" : String(count);
  }
  tabBtn.style.position = "relative";
  tabBtn.appendChild(badge);
}

function setTabStatus(tabBtn, statusEl, text, tone = "muted") {
  if (!tabBtn || !statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
  tabBtn.dataset.statusTone = tone;
}

export function updateTabBadges(payload, fileCount) {
  const workflowSafety = buildWorkflowSafetyState({
    extensionStatus: state.extensionStatus,
    pageContext: state.pageCompanionContext,
    selectedAutofillUser: state.selectedAutofillUser,
    payload,
    caseId: String(dom.caseId?.value || "").trim(),
    serviceDataGroupId: String(dom.serviceDataGroupId?.value || "").trim(),
    requireCaseId: Boolean(payload),
    requireServiceDataGroup: Boolean(payload),
  });
  const workspaceContext = state.connectedWorkspaceContext;
  const hasAnalysisSelection = Boolean(state.currentAnalysisResults?.recommendedAssessments?.length) && !dom.selectionSection?.hidden;

  let workspaceStatus = "Offline";
  let workspaceTone = "muted";
  if (state.isConnected && workflowSafety.action === "open-status") {
    workspaceStatus = "Review status";
    workspaceTone = "warning";
  } else if (state.isConnected && workspaceContext?.routeLabel) {
    workspaceStatus = workspaceContext.routeLabel;
    workspaceTone = "success";
  } else if (state.isConnected) {
    workspaceStatus = "Connected";
    workspaceTone = "success";
  }

  let intakeStatus = "Stage docs";
  let intakeTone = "muted";
  if (fileCount > 0) {
    intakeStatus = `${fileCount} staged`;
    intakeTone = "warning";
  } else if (hasAnalysisSelection) {
    intakeStatus = "Review analysis";
    intakeTone = "success";
  }

  let autofillStatus = "Waiting";
  let autofillTone = "muted";
  if (workflowSafety.code === "page-refresh-required") {
    autofillStatus = "Reload page";
    autofillTone = "warning";
  } else if (workflowSafety.severity === "blocking") {
    autofillStatus = workflowSafety.actionLabel || "Needs target";
    autofillTone = "warning";
  } else if (workflowSafety.severity === "warning") {
    autofillStatus = workflowSafety.actionLabel || "Review ready";
    autofillTone = "warning";
  } else if (payload) {
    autofillStatus = "Ready to run";
    autofillTone = "success";
  } else if (state.pageCompanionContext?.routeLabel) {
    autofillStatus = "Page attached";
    autofillTone = "success";
  }

  setTabStatus(dom.tabConnect, dom.tabConnectStatus, workspaceStatus, workspaceTone);
  setTabStatus(dom.tabUpload, dom.tabUploadStatus, intakeStatus, intakeTone);
  setTabStatus(dom.tabAutofill, dom.tabAutofillStatus, autofillStatus, autofillTone);

  setTabBadge(dom.tabConnect, workflowSafety.action === "open-status" ? true : null, workflowSafety.action === "open-status" ? "warning" : null);
  setTabBadge(
    dom.tabAutofill,
    workflowSafety.severity === "blocking" ? true : payload ? true : null,
    workflowSafety.severity === "blocking" ? "warning" : payload ? "success" : null,
  );
  setTabBadge(dom.tabUpload, fileCount > 0 ? fileCount : null, "warning");
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP INDICATOR
// ═══════════════════════════════════════════════════════════════════════════

export function updateUploadSteps(current) {
  const steps = ["step-select", "step-upload", "step-analyze"];
  const connectors = ["step-connector-1", "step-connector-2"];
  steps.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("active", "completed");
    if (i < current) el.classList.add("completed");
    else if (i === current) el.classList.add("active");
  });
  connectors.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("completed", i < current);
  });
}

export function updateServiceUserCount(count) {
  const badge = dom.serviceUserCount;
  if (!badge) return;
  if (count > 0) { badge.textContent = count; badge.hidden = false; }
  else { badge.hidden = true; }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION UI
// ═══════════════════════════════════════════════════════════════════════════

const MAIN_VIEW_ROUTE_LABELS = {
  "/dashboard": "Dashboard",
  "/service-users/care-planning": "Care Planning",
  "/service-users/risk-assessment": "Risk Assessment",
  "/service-users/plan-enhancer": "Plan Enhancer",
  "/messages": "Messages",
  "/admin/extension-manager": "Extension Manager",
};

const getMainViewRouteLabel = (route) => MAIN_VIEW_ROUTE_LABELS[route] || "Workflow";

const getPopupWorkflowSafety = (overrides = {}) =>
  buildWorkflowSafetyState({
    extensionStatus: state.extensionStatus,
    pageContext: overrides.includePageContext === false ? null : state.pageCompanionContext,
    selectedAutofillUser: state.selectedAutofillUser,
    payload: Object.prototype.hasOwnProperty.call(overrides, "payload")
      ? overrides.payload
      : state.latestPayloadSnapshot?.payload || null,
    caseId: Object.prototype.hasOwnProperty.call(overrides, "caseId")
      ? overrides.caseId
      : String(dom.caseId?.value || "").trim(),
    serviceDataGroupId: Object.prototype.hasOwnProperty.call(overrides, "serviceDataGroupId")
      ? overrides.serviceDataGroupId
      : String(dom.serviceDataGroupId?.value || "").trim(),
    requireCaseId: Boolean(overrides.requireCaseId),
    requireServiceDataGroup: Boolean(overrides.requireServiceDataGroup),
  });

const getWorkflowSafetyActionConfig = (safety, className = "btn btn-primary btn-sm") => {
  if (!safety || safety.severity === "ready" || !safety.action) return null;
  return {
    label: safety.actionLabel || "Review Status",
    action: safety.action,
    className,
  };
};

function renderWorkflowRecommendation(element, { text = "", tone = "info" } = {}) {
  if (!element) return;
  element.className = `workflow-recommendation is-${tone}`;
  element.innerHTML = `
    <span class="workflow-recommendation-label">Recommended next step</span>
    <span class="workflow-recommendation-text">${escapeHtml(text || "Review the current status before continuing.")}</span>
  `;
}

const resolveMainViewSecondaryRoute = (context) => {
  const path = String(context?.path || "").toLowerCase();
  if (path.startsWith("/service-users/care-planning")) return "/service-users/risk-assessment";
  if (path.startsWith("/service-users/risk-assessment")) return "/service-users/plan-enhancer";
  if (path.startsWith("/service-users/plan-enhancer")) return "/service-users/care-planning";
  if (path.startsWith("/messages")) return "/dashboard";
  if (path.startsWith("/dashboard")) return "/service-users/care-planning";
  return "/service-users/plan-enhancer";
};

const setMainViewActionButton = (button, config = {}) => {
  if (!button) return;
  const {
    label = "Open",
    action = "open-route",
    route = "",
    disabled = false,
  } = config;

  button.textContent = label;
  button.dataset.action = action;
  if (route) button.dataset.route = route;
  else delete button.dataset.route;
  button.disabled = Boolean(disabled);
};

function renderMainViewLaunchpad(context = state.connectedWorkspaceContext) {
  const stateEl = dom.mainViewState;
  const currentPath = String(context?.path || "").toLowerCase();
  const payload = state.latestPayloadSnapshot?.payload || null;
  const workflowSafety = getPopupWorkflowSafety({
    payload,
    requireCaseId: Boolean(payload),
    requireServiceDataGroup: Boolean(payload),
  });

  if (stateEl) {
    if (!state.isConnected) {
      stateEl.className = "main-view-state is-disconnected";
      stateEl.innerHTML = `
        <span class="main-view-state-eyebrow">Startup status</span>
        <strong class="main-view-state-title">Not connected yet</strong>
        <span class="main-view-state-detail">Sync your CareAssurance session to unlock service-user search, payload loading, and one-click workflow focus.</span>
      `;
    } else if (workflowSafety.severity !== "ready") {
      stateEl.className = "main-view-state is-warning";
      stateEl.innerHTML = `
        <span class="main-view-state-eyebrow">Startup status</span>
        <strong class="main-view-state-title">${escapeHtml(workflowSafety.title)}</strong>
        <span class="main-view-state-detail">${escapeHtml(workflowSafety.detail)}</span>
      `;
    } else if (!context) {
      stateEl.className = "main-view-state is-waiting";
      stateEl.innerHTML = `
        <span class="main-view-state-eyebrow">Startup status</span>
        <strong class="main-view-state-title">Connected, waiting for a workspace tab</strong>
        <span class="main-view-state-detail">Open CareAssurance in your browser. This launchpad will immediately adapt to your current page context.</span>
      `;
    } else {
      const secondaryRoute = resolveMainViewSecondaryRoute(context);
      stateEl.className = "main-view-state is-live";
      stateEl.innerHTML = `
        <span class="main-view-state-eyebrow">Startup status</span>
        <strong class="main-view-state-title">Live on ${escapeHtml(context.routeLabel || "CareAssurance")}</strong>
        <span class="main-view-state-detail">Focus your current tab or jump straight to ${escapeHtml(getMainViewRouteLabel(secondaryRoute))} as your next workflow step.</span>
      `;
    }
  }

  if (!state.isConnected) {
    setMainViewActionButton(dom.mainViewPrimaryAction, {
      label: "Sync Session",
      action: "connect",
    });
    setMainViewActionButton(dom.mainViewSecondaryAction, {
      label: "Open Dashboard",
      action: "open-route",
      route: "/dashboard",
    });
  } else if (!context) {
    setMainViewActionButton(dom.mainViewPrimaryAction, {
      label: "Open Dashboard",
      action: "open-route",
      route: "/dashboard",
    });
    setMainViewActionButton(dom.mainViewSecondaryAction, {
      label: "Refresh Context",
      action: "refresh-context",
    });
  } else if (workflowSafety.severity !== "ready") {
    const primaryAction = getWorkflowSafetyActionConfig(workflowSafety) || {
      label: "Refresh Context",
      action: "refresh-context",
      className: "btn btn-primary btn-sm",
    };
    setMainViewActionButton(dom.mainViewPrimaryAction, primaryAction);
    setMainViewActionButton(dom.mainViewSecondaryAction, {
      label: context?.tabId ? "Focus Current Page" : "Open Dashboard",
      action: context?.tabId ? "focus-current" : "open-route",
      route: context?.tabId ? "" : "/dashboard",
    });
  } else {
    const secondaryRoute = resolveMainViewSecondaryRoute(context);
    setMainViewActionButton(dom.mainViewPrimaryAction, {
      label: "Focus Current Page",
      action: "focus-current",
    });
    setMainViewActionButton(dom.mainViewSecondaryAction, {
      label: `Open ${getMainViewRouteLabel(secondaryRoute)}`,
      action: "open-route",
      route: secondaryRoute,
    });
  }

  [
    dom.mainOpenCarePlanning,
    dom.mainOpenRisk,
    dom.mainOpenPlanEnhancer,
    dom.mainOpenMessages,
    dom.mainOpenExtensionManager,
  ].forEach((button) => {
    if (!button) return;
    const route = String(button.dataset.route || "").toLowerCase();
    button.classList.toggle("is-active", Boolean(route && currentPath.startsWith(route)));
  });
}

export function updateConnectionUI(connected, user = null) {
  state.isConnected = connected;
  if (user) state.connectedWorkspaceUser = user;

  if (dom.connectionBadge) {
    dom.connectionBadge.className = `connection-badge ${connected ? "connected" : "disconnected"}`;
    const text = dom.connectionBadge.querySelector(".connection-text");
    const connectedUsername = user?.username || state.connectedWorkspaceUser?.username || "user";
    if (text) text.textContent = connected ? "Connected" : "Offline";
    dom.connectionBadge.title = connected
      ? `Connected as ${connectedUsername}`
      : "Click to see connection details";

    const uptimeEl = dom.connectionUptime;
    if (connected) {
      if (!state.connectionEstablishedAt) state.connectionEstablishedAt = Date.now();
      if (!state.connectionUptimeTimer && uptimeEl) {
        state.connectionUptimeTimer = setInterval(() => {
          const secs = Math.floor((Date.now() - state.connectionEstablishedAt) / 1000);
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          uptimeEl.textContent = m > 0 ? `${m}m ${s}s` : `${s}s`;
        }, 1000);
      }
    } else {
      state.connectionEstablishedAt = null;
      if (state.connectionUptimeTimer) { clearInterval(state.connectionUptimeTimer); state.connectionUptimeTimer = null; }
      if (uptimeEl) uptimeEl.textContent = "";
    }
  }

  if (dom.connectStatus) {
    if (connected) {
      dom.connectStatus.className = "status-box success";
      dom.connectStatus.innerHTML = `<span>\u2713 Connected as ${escapeHtml(user?.username || "user")}</span>`;
    } else {
      dom.connectStatus.className = "status-box";
      dom.connectStatus.innerHTML = `<span>Not connected</span>`;
    }
  }

  if (dom.connectBtn) {
    dom.connectBtn.textContent = connected ? "Refresh Workspace" : "Sync CareAssurance Session";
  }

  const isAdmin = connected && (user?.role?.toLowerCase() === "admin" || state.connectedWorkspaceUser?.role?.toLowerCase() === "admin");
  state.isAdmin = isAdmin;
  document.body.classList.toggle("is-admin", isAdmin);
  debugLog(
    "[CA Extension] updateConnectionUI — connected:",
    connected,
    "user:",
    JSON.stringify(user),
    "role:",
    user?.role || state.connectedWorkspaceUser?.role,
    "isAdmin:",
    isAdmin
  );

  // search-section uses .admin-only CSS — also gate via hidden for non-admin connected users
  if (dom.searchSection) dom.searchSection.hidden = !connected || !isAdmin;
  // Admin portal button — also gate via hidden
  if (dom.openAdminWorkspace) dom.openAdminWorkspace.hidden = !isAdmin;
  if (dom.mainOpenExtensionManager) dom.mainOpenExtensionManager.hidden = !isAdmin;

  renderMainViewLaunchpad(state.connectedWorkspaceContext);
  renderExtensionHealth();
  updateHeaderUserChip(null);
  updateFooterLiveDot(connected);
}
function formatExtensionStatusTimestamp(value, fallback = "Not available") {
  const raw = String(value || "").trim();
  return raw ? formatPayloadTimestamp(raw) : fallback;
}

function buildExtensionHealthSyncSummary({
  connected,
  detected,
  refreshRequired,
  installedVersion,
  serverVersion,
  versionComparison,
}) {
  if (!connected) {
    return {
      value: "Waiting for connection",
      detail: "Connect the popup to compare the browser-installed extension with the published package.",
      tone: "idle",
    };
  }

  if (refreshRequired) {
    return {
      value: "Refresh required",
      detail: "This page is still attached to an older extension context. Refresh CareAssurance tabs after updating the extension.",
      tone: "warning",
    };
  }

  if (!detected) {
    return {
      value: "Not detected on page",
      detail: "The website has not detected an installed CareAssurance extension on this page yet.",
      tone: "warning",
    };
  }

  if (versionComparison < 0) {
    return {
      value: "Published build ahead",
      detail: `The page currently sees ${installedVersion}. Refresh after loading ${serverVersion}.`,
      tone: "warning",
    };
  }

  if (versionComparison > 0) {
    return {
      value: "Environment mismatch",
      detail: `The page currently sees ${installedVersion} while the server reports ${serverVersion}. Confirm the correct CareAssurance environment before troubleshooting.`,
      tone: "warning",
    };
  }

  return {
    value: "Website sync ready",
    detail: "The browser-installed extension matches the package currently published from CareAssurance.",
    tone: "ready",
  };
}

function buildExtensionHealthGuide({
  isAdmin,
  packageAvailable,
  packageStale,
  canAdminDownloadPackage,
  canAdminDownloadCrx,
  canAdminRebuildPackage,
  canAdminRebuildCrx,
  refreshRequired,
}) {
  const stepOne = isAdmin
    ? canAdminRebuildPackage
      ? "Use Rebuild & Download ZIP when the published package is missing or stale."
      : canAdminDownloadPackage
        ? "Use Download Latest ZIP when the published package is current."
        : packageAvailable && packageStale
          ? "Open Extension Manager to rebuild the published package before rollout."
          : "Refresh status or open Extension Manager to confirm package readiness."
    : packageAvailable
      ? "Ask an admin to provide the latest ZIP or CRX from Extension Manager."
      : "Ask an admin to rebuild the extension package in Extension Manager first.";

  const stepTwo = canAdminDownloadCrx || canAdminRebuildCrx
    ? "Use the CRX for direct install when browser policy allows it, or extract the ZIP and use Extensions → Load unpacked."
    : "Extract the ZIP and use Extensions → Load unpacked in Edge for the standard install path.";

  const stepThree = refreshRequired
    ? "Refresh open CareAssurance tabs now so the content scripts and website bridge reattach to the current extension."
    : "Refresh open CareAssurance tabs after any extension update so the content scripts and website bridge stay in sync.";

  return [
    { title: "Update the published build", detail: stepOne },
    { title: "Install the package in Edge", detail: stepTwo },
    { title: "Refresh CareAssurance tabs", detail: stepThree },
  ];
}

export function renderExtensionHealth(snapshot = state.extensionStatus) {
  if (!dom.extensionHealthState || !dom.extensionHealthMeta) return;

  let installedVersion = "Unknown";
  try {
    const manifest = chrome.runtime?.getManifest?.();
    installedVersion = manifest?.version ? `v${manifest.version}` : installedVersion;
  } catch {
    // ignore manifest read failures
  }

  const rawInstalledVersion = installedVersion.replace(/^v/i, "");
  const rawServerVersion = String(snapshot?.version || "").trim();
  const serverVersion = rawServerVersion ? `v${rawServerVersion}` : "Unavailable";
  const packageStatus = snapshot?.package || null;
  const crxStatus = snapshot?.crx || null;
  const runtimeConfig = snapshot?.runtimeConfig || null;
  const installedDetected = Boolean(snapshot?.detected);
  const refreshRequired = Boolean(snapshot?.refreshRequired);
  const statusError = String(snapshot?.statusError || "").trim();
  const packageAvailable = Boolean(packageStatus?.available);
  const packageStale = Boolean(packageStatus?.stale);
  const crxAvailable = Boolean(crxStatus?.available);
  const hasComparableVersions = Boolean(rawInstalledVersion && rawInstalledVersion !== "Unknown" && rawServerVersion);
  const versionComparison = hasComparableVersions ? compareExtensionVersions(rawInstalledVersion, rawServerVersion) : 0;
  const canAdminDownloadPackage = Boolean(
    state.isAdmin &&
    state.isConnected &&
    packageAvailable &&
    !packageStale &&
    versionComparison <= 0
  );
  const canAdminDownloadCrx = Boolean(canAdminDownloadPackage && crxAvailable);
  const canAdminRebuildCrx = Boolean(
    state.isAdmin &&
    state.isConnected &&
    !crxAvailable
  );
  const canAdminRebuildPackage = Boolean(
    state.isAdmin &&
    state.isConnected &&
    (packageStale || !packageAvailable)
  );
  const zipInstallHint = "Extract the ZIP and use Load unpacked in Edge Extensions.";
  const crxInstallHint = "Use the CRX for direct install when browser policy allows it.";
  const rolloutInstallHint = `${zipInstallHint} ${crxInstallHint}`;

  let stateClass = "is-idle";
  let title = "Connect to inspect extension status";
  let detail = "Sync your CareAssurance session to compare the installed extension against the server version and runtime config.";

  if (!state.isConnected) {
    stateClass = "is-idle";
  } else if (statusError) {
    stateClass = "is-warning";
    title = "Status check failed";
    detail = statusError;
  } else if (!snapshot) {
    stateClass = "is-live";
    title = "Checking extension state";
    detail = "Refreshing installed version, package freshness, and runtime config metadata.";
  } else if (versionComparison < 0) {
    stateClass = "is-warning";
    title = "Update available";
    detail = state.isAdmin
      ? packageAvailable && !packageStale
        ? canAdminDownloadCrx
          ? `Installed ${installedVersion} is behind server ${serverVersion}. Download the latest ZIP or CRX now, or open Extension Manager if you need a rebuild. ${rolloutInstallHint}`
          : canAdminRebuildCrx
            ? `Installed ${installedVersion} is behind server ${serverVersion}. Download the latest ZIP now, or rebuild and download the CRX if you need the browser-installable package. ${rolloutInstallHint}`
          : `Installed ${installedVersion} is behind server ${serverVersion}. Download the latest ZIP now or open Extension Manager if you need a rebuild.`
        : `Installed ${installedVersion} is behind server ${serverVersion}. Rebuild and download the newest ZIP now, or open Extension Manager for the full rollout workflow. ${zipInstallHint}`
      : `Installed ${installedVersion} is behind server ${serverVersion}. Ask an admin to rebuild or download the latest ZIP or CRX in Extension Manager.`;
  } else if (packageAvailable && packageStale) {
    stateClass = "is-warning";
    title = "Package rebuild recommended";
    detail = state.isAdmin
      ? "The downloadable extension package is older than the latest source changes. Rebuild and download a fresh ZIP before reinstalling in the browser."
      : "The downloadable extension package is older than the latest source changes. Ask an admin to rebuild it before reinstalling.";
  } else if (!packageAvailable) {
    stateClass = "is-warning";
    title = "Package unavailable";
    detail = state.isAdmin
      ? "No packaged extension ZIP is currently available on the server. Rebuild and download one now, or open Extension Manager for the full rollout workflow."
      : "No packaged extension ZIP is currently available on the server. Ask an admin to rebuild one in Extension Manager.";
  } else if (versionComparison > 0) {
    stateClass = "is-warning";
    title = "Version mismatch";
    detail = `Installed ${installedVersion} is newer than server ${serverVersion}. Confirm the correct environment or package source before troubleshooting.`;
  } else {
    stateClass = "is-ready";
    title = "Extension current";
    detail = runtimeConfig?.updatedAt
      ? canAdminDownloadPackage
        ? canAdminDownloadCrx
          ? `Installed ${installedVersion} matches the server version. Download the latest ZIP or CRX now or review rollout settings; runtime config was updated ${formatExtensionStatusTimestamp(runtimeConfig.updatedAt)}. ${rolloutInstallHint}`
          : canAdminRebuildCrx
            ? `Installed ${installedVersion} matches the server version. Download the latest ZIP now or rebuild and download the CRX; runtime config was updated ${formatExtensionStatusTimestamp(runtimeConfig.updatedAt)}. ${rolloutInstallHint}`
          : `Installed ${installedVersion} matches the server version. Download the latest ZIP now or review rollout settings; runtime config was updated ${formatExtensionStatusTimestamp(runtimeConfig.updatedAt)}. ${zipInstallHint}`
        : `Installed ${installedVersion} matches the server version and runtime config was updated ${formatExtensionStatusTimestamp(runtimeConfig.updatedAt)}.`
      : canAdminDownloadPackage
        ? canAdminDownloadCrx
          ? `Installed ${installedVersion} matches the server version and the default runtime config is active. Download the latest ZIP or CRX when you need to roll it out again. ${rolloutInstallHint}`
          : canAdminRebuildCrx
            ? `Installed ${installedVersion} matches the server version and the default runtime config is active. Download the latest ZIP now or rebuild and download the CRX when you need it. ${rolloutInstallHint}`
          : `Installed ${installedVersion} matches the server version and the default runtime config is active. Download the latest ZIP when you need to roll it out again. ${zipInstallHint}`
        : `Installed ${installedVersion} matches the server version and the default runtime config is active.`;
  }

  dom.extensionHealthState.className = `extension-health-state ${stateClass}`;
  dom.extensionHealthState.innerHTML = `
    <span class="extension-health-eyebrow">Extension readiness</span>
    <strong class="extension-health-title">${escapeHtml(title)}</strong>
    <span class="extension-health-detail">${escapeHtml(detail)}</span>
  `;

  const packageValue = !state.isConnected
    ? "Connect to check"
    : !packageAvailable
      ? "Unavailable"
      : packageStale
        ? `Needs rebuild • ${formatExtensionStatusTimestamp(packageStatus?.packagedAt, "Unknown build")}`
        : `Current • ${formatExtensionStatusTimestamp(packageStatus?.packagedAt, "Unknown build")}`;

  const runtimeValue = !state.isConnected
    ? "Connect to check"
    : runtimeConfig?.updatedAt
      ? `${formatExtensionStatusTimestamp(runtimeConfig.updatedAt)}${runtimeConfig?.updatedBy ? ` • ${runtimeConfig.updatedBy}` : ""}`
      : runtimeConfig?.source === "default"
        ? "Default config"
        : "Not available";

  const crxValue = !state.isConnected
    ? "Connect to check"
    : crxAvailable
      ? "Available"
      : state.isAdmin
        ? "Build on demand"
      : "Unavailable";

  const syncSummary = buildExtensionHealthSyncSummary({
    connected: state.isConnected,
    detected: installedDetected,
    refreshRequired,
    installedVersion,
    serverVersion,
    versionComparison,
  });

  const metaItems = [
    { label: "Installed", value: installedVersion },
    { label: "Server", value: state.isConnected ? serverVersion : "Connect to check" },
    { label: "Package", value: packageValue },
    { label: "CRX", value: crxValue },
    { label: "Runtime", value: runtimeValue },
    { label: "Website", value: syncSummary.value },
  ];

  dom.extensionHealthMeta.innerHTML = metaItems
    .map(
      (item) => `
        <div class="extension-health-meta-item">
          <span class="extension-health-meta-label">${escapeHtml(item.label)}</span>
          <strong class="extension-health-meta-value">${escapeHtml(item.value)}</strong>
        </div>
      `
    )
    .join("");

  if (dom.extensionHealthSync) {
    dom.extensionHealthSync.className = `extension-health-sync ${syncSummary.tone}`;
    dom.extensionHealthSync.innerHTML = `
      <span class="extension-health-sync-label">Website sync</span>
      <strong class="extension-health-sync-value">${escapeHtml(syncSummary.value)}</strong>
      <span class="extension-health-sync-detail">${escapeHtml(syncSummary.detail)}</span>
    `;
  }

  if (dom.extensionHealthGuide) {
    const guide = buildExtensionHealthGuide({
      isAdmin: state.isAdmin,
      packageAvailable,
      packageStale,
      canAdminDownloadPackage,
      canAdminDownloadCrx,
      canAdminRebuildPackage,
      canAdminRebuildCrx,
      refreshRequired,
    });
    dom.extensionHealthGuide.innerHTML = guide
      .map(
        (item, index) => `
          <div class="extension-health-guide-item">
            <span class="extension-health-guide-step">${index + 1}</span>
            <div class="extension-health-guide-copy">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </div>
          </div>
        `
      )
      .join("");
  }

  let primaryAction = {
    label: state.isConnected ? "Refresh Extension Status" : "Sync Session",
    action: state.isConnected ? "refresh" : "connect",
    className: state.isConnected ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm",
  };

  let secondaryAction = state.isAdmin
    ? {
        label: "Open Extension Manager",
        action: "open-manager",
        className: "btn btn-secondary btn-sm",
      }
    : null;
  let tertiaryAction = null;

  if (state.isAdmin && state.isConnected && (versionComparison < 0 || packageStale || !packageAvailable)) {
    primaryAction = {
      label: canAdminRebuildPackage ? "Rebuild & Download ZIP" : canAdminDownloadPackage ? "Download Latest ZIP" : "Open Extension Manager",
      action: canAdminRebuildPackage ? "rebuild-download-package" : canAdminDownloadPackage ? "download-package" : "open-manager",
      className: "btn btn-primary btn-sm",
    };
    secondaryAction = canAdminDownloadCrx
      ? {
          label: "Download CRX",
          action: "download-package-crx",
          className: "btn btn-secondary btn-sm",
        }
      : canAdminRebuildCrx
      ? {
          label: "Rebuild & Download CRX",
          action: "rebuild-download-package-crx",
          className: "btn btn-secondary btn-sm",
        }
      : canAdminDownloadPackage || canAdminRebuildPackage
      ? {
          label: "Open Extension Manager",
          action: "open-manager",
          className: "btn btn-secondary btn-sm",
        }
      : {
          label: "Refresh Extension Status",
          action: "refresh",
          className: "btn btn-secondary btn-sm",
        };
  } else if (canAdminDownloadPackage) {
    primaryAction = {
      label: "Download Latest ZIP",
      action: "download-package",
      className: "btn btn-primary btn-sm",
    };
    secondaryAction = {
      label: canAdminDownloadCrx
        ? "Download CRX"
        : canAdminRebuildCrx
          ? "Rebuild & Download CRX"
          : "Refresh Extension Status",
      action: canAdminDownloadCrx
        ? "download-package-crx"
        : canAdminRebuildCrx
          ? "rebuild-download-package-crx"
          : "refresh",
      className: "btn btn-secondary btn-sm",
    };
  }

  if (state.isAdmin && state.isConnected && snapshot && !statusError) {
    tertiaryAction = {
      label: "Bump Version & Download ZIP",
      action: "bump-download-package",
      className: "btn btn-secondary btn-sm",
    };
  }

  if (dom.extensionHealthPrimary) {
    dom.extensionHealthPrimary.textContent = primaryAction.label;
    dom.extensionHealthPrimary.dataset.action = primaryAction.action;
    dom.extensionHealthPrimary.className = primaryAction.className;
  }

  if (dom.extensionHealthSecondary) {
    if (secondaryAction) {
      dom.extensionHealthSecondary.hidden = false;
      dom.extensionHealthSecondary.textContent = secondaryAction.label;
      dom.extensionHealthSecondary.dataset.action = secondaryAction.action;
      dom.extensionHealthSecondary.className = secondaryAction.className;
    } else {
      dom.extensionHealthSecondary.hidden = true;
      dom.extensionHealthSecondary.dataset.action = "";
    }
  }

  if (dom.extensionHealthTertiary) {
    if (tertiaryAction) {
      dom.extensionHealthTertiary.hidden = false;
      dom.extensionHealthTertiary.textContent = tertiaryAction.label;
      dom.extensionHealthTertiary.dataset.action = tertiaryAction.action;
      dom.extensionHealthTertiary.className = tertiaryAction.className;
    } else {
      dom.extensionHealthTertiary.hidden = true;
      dom.extensionHealthTertiary.dataset.action = "";
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKSPACE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

export function renderWorkspaceContext(context, user = state.connectedWorkspaceUser) {
  state.connectedWorkspaceContext = context || null;
  state.connectedWorkspaceUser = user || state.connectedWorkspaceUser || null;

  if (dom.headerSubtitle) {
    dom.headerSubtitle.textContent = context
      ? `${context.routeLabel} workspace for ACP Autofill`
      : "Connected workspace for ACP Autofill";
  }

  if (dom.workspaceContextStatus) {
    if (!context) {
      dom.workspaceContextStatus.className = "workspace-status-card workspace-status-empty";
      dom.workspaceContextStatus.innerHTML = `
        <span class="workspace-status-eyebrow">Current page</span>
        <strong class="workspace-status-title">No CareAssurance tab detected</strong>
        <span class="workspace-status-detail">Open CareAssurance in the browser and this panel will reflect the live route, title, and best next actions.</span>
      `;
    } else {
      const chipMarkup = [
        `<span class="workspace-chip">${escapeHtml(context.host)}</span>`,
        state.connectedWorkspaceUser?.username ? `<span class="workspace-chip">${escapeHtml(state.connectedWorkspaceUser.username)}</span>` : "",
        state.connectedWorkspaceUser?.role ? `<span class="workspace-chip">${escapeHtml(state.connectedWorkspaceUser.role)}</span>` : "",
      ].filter(Boolean).join("");

      dom.workspaceContextStatus.className = "workspace-status-card";
      dom.workspaceContextStatus.innerHTML = `
        <span class="workspace-status-eyebrow">Current page</span>
        <strong class="workspace-status-title">${escapeHtml(context.routeLabel)}</strong>
        <span class="workspace-status-detail">${escapeHtml(context.routeDetail)}</span>
        <div class="workspace-chip-row">${chipMarkup}</div>
      `;
    }
  }

  if (dom.workspaceRouteLabel) dom.workspaceRouteLabel.textContent = context?.routeLabel || "Waiting for tab";
  if (dom.workspaceRoutePath) dom.workspaceRoutePath.textContent = context?.path || "/";
  if (dom.workspaceTabTitle) dom.workspaceTabTitle.textContent = context?.title || "Not available";
  if (dom.openConnectedWorkspace) dom.openConnectedWorkspace.disabled = !context?.tabId;

  // Re-apply admin state every render cycle (called every 3s by interval)
  const isAdmin = state.isConnected && (state.connectedWorkspaceUser?.role?.toLowerCase() === "admin");
  state.isAdmin = isAdmin;
  document.body.classList.toggle("is-admin", isAdmin);
  if (dom.openAdminWorkspace) dom.openAdminWorkspace.hidden = !isAdmin;
  if (dom.mainOpenExtensionManager) dom.mainOpenExtensionManager.hidden = !isAdmin;
  if (dom.searchSection) dom.searchSection.hidden = !state.isConnected || !isAdmin;

  renderMainViewLaunchpad(context);
  renderCaseContextStrip();
}

export function renderCaseContextStrip(caseInfo = null) {
  if (!dom.caseContextGrid || !dom.caseContextState) return;

  const resolvedCaseId = String(
    caseInfo?.caseId || dom.caseId?.value || state.selectedAutofillUser?.acpId || ""
  ).trim();
  const resolvedServiceGroup = String(
    caseInfo?.serviceDataGroupId || dom.serviceDataGroupId?.value || ""
  ).trim();
  const displayNameOverride = String(dom.displayNameOverride?.value || "").trim();
  const resolvedServiceUser = String(
    displayNameOverride || state.selectedAutofillUser?.name || state.selectedUser?.name || state.latestPayloadSnapshot?.payload?.serviceUserDisplayName || ""
  ).trim();
  const resolvedOperator = String(state.connectedWorkspaceUser?.username || "").trim();
  const payload = state.latestPayloadSnapshot?.payload || null;
  const workflowSafety = getPopupWorkflowSafety({
    payload,
    caseId: resolvedCaseId,
    serviceDataGroupId: resolvedServiceGroup,
    requireCaseId: Boolean(payload),
    requireServiceDataGroup: Boolean(payload),
  });

  const populatedCount = [resolvedServiceUser, resolvedCaseId, resolvedServiceGroup, resolvedOperator].filter(Boolean).length;

  let stateText = "Waiting for a case";
  let stateTone = "muted";
  if (populatedCount > 0 && workflowSafety.severity !== "ready") {
    stateText = workflowSafety.title;
    stateTone = "warning";
  } else if (resolvedServiceUser && resolvedCaseId && resolvedOperator) {
    stateText = "Target aligned and ready";
    stateTone = "success";
  } else if (populatedCount > 0) {
    stateText = `${populatedCount} context field${populatedCount === 1 ? "" : "s"} ready`;
    stateTone = "normal";
  }

  dom.caseContextState.textContent = stateText;
  dom.caseContextState.dataset.tone = stateTone;

  const buildItem = (label, value, emptyLabel, copyLabel) => {
    const hasValue = Boolean(value);
    return `
      <div class="case-context-item${hasValue ? "" : " is-empty"}">
        <span class="case-context-label">${escapeHtml(label)}</span>
        <strong class="case-context-value">${escapeHtml(hasValue ? value : emptyLabel)}</strong>
        ${hasValue ? `<button type="button" class="case-context-copy" data-copy-value="${escapeAttr(value)}" aria-label="Copy ${escapeAttr(copyLabel)}">Copy</button>` : ""}
      </div>
    `;
  };

  dom.caseContextGrid.innerHTML = [
    buildItem("Service user", resolvedServiceUser, "No service user selected", "service user"),
    buildItem("Case ID", resolvedCaseId, "Not set", "case ID"),
    buildItem("Service Group", resolvedServiceGroup, "Not set", "service group"),
    buildItem("Operator", resolvedOperator, state.isConnected ? "Connected" : "Not connected", "operator")
  ].join("");

  dom.caseContextStrip?.classList.toggle("has-context", populatedCount > 0);
  dom.caseContextStrip?.classList.toggle("is-warning", populatedCount > 0 && workflowSafety.severity !== "ready");
  dom.caseContextStrip?.classList.toggle("is-ready", workflowSafety.severity === "ready" && populatedCount >= 2);

  if (dom.caseContextHighlights) {
    const highlights = [];
    if (workflowSafety.severity !== "ready") {
      highlights.push({ label: workflowSafety.actionLabel || workflowSafety.title, tone: "warning" });
    } else if (resolvedServiceUser && resolvedCaseId) {
      highlights.push({ label: "Target ready", tone: "success" });
    } else {
      highlights.push({ label: "Target incomplete", tone: populatedCount > 0 ? "warning" : "muted" });
    }

    highlights.push(
      payload
        ? { label: `${getPayloadWorkflowLabel(payload)} staged`, tone: "success" }
        : { label: "No payload staged", tone: "muted" }
    );

    highlights.push(
      resolvedServiceGroup
        ? { label: `Group ${resolvedServiceGroup}`, tone: "normal" }
        : payload
        ? { label: "Detect group ID", tone: "warning" }
        : { label: "Group pending", tone: "muted" }
    );

    if (state.connectedWorkspaceContext?.routeLabel) {
      highlights.push({ label: state.connectedWorkspaceContext.routeLabel, tone: "normal" });
    } else if (state.isConnected) {
      highlights.push({ label: "Workspace connected", tone: "normal" });
    }

    dom.caseContextHighlights.innerHTML = highlights
      .slice(0, 4)
      .map(
        (item) => `<span class="case-context-highlight ${escapeAttr(item.tone || "normal")}">${escapeHtml(item.label || "")}</span>`
      )
      .join("");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE USERS
// ═══════════════════════════════════════════════════════════════════════════

export function displayServiceUsers() {
  if (!dom.serviceUserList) return;

  const searchTerm = dom.serviceUserSearch?.value.toLowerCase() || "";
  const sortKey = dom.serviceUserSort?.value || "name";
  let filtered = state.serviceUsers.filter((u) => u.name?.toLowerCase().includes(searchTerm));

  if (sortKey === "carePlan") {
    filtered.sort((a, b) => (b.hasCarePlan ? 1 : 0) - (a.hasCarePlan ? 1 : 0) || (a.name || "").localeCompare(b.name || ""));
  } else if (sortKey === "risk") {
    filtered.sort((a, b) => (b.hasRiskAssessment ? 1 : 0) - (a.hasRiskAssessment ? 1 : 0) || (a.name || "").localeCompare(b.name || ""));
  } else {
    filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  updateServiceUserCount(state.serviceUsers.length);

  if (filtered.length === 0) {
    dom.serviceUserList.innerHTML = searchTerm
      ? '<div class="empty-state">No matching service users</div>'
      : '<div class="empty-state">No service users available</div>';
    return;
  }

  const count = filtered.length;
  const PAGE_SIZE = 10;
  const shown = filtered.slice(0, state.serviceUserShowCount || PAGE_SIZE);

  dom.serviceUserList.innerHTML =
    shown
      .map(
        (user) => `
    <div class="service-user-item" data-id="${user.id}" tabindex="0" role="button" aria-label="Select ${escapeHtml(user.name || "Unknown")}">
      <div class="user-avatar">${escapeHtml(user.initials || "??")}</div>
      <div class="user-info">
        <div class="user-name">${escapeHtml(user.name || "Unknown")}</div>
        <div class="user-badges">
          ${user.hasCarePlan ? '<span class="badge badge-success">Care Plan</span>' : ""}
          ${user.hasRiskAssessment ? '<span class="badge badge-info">Risk Assessment</span>' : ""}
        </div>
      </div>
    </div>
  `
      )
      .join("") +
    (count > shown.length
      ? `<a href="#" class="show-more-link" data-action="show-more-users">Show ${Math.min(PAGE_SIZE, count - shown.length)} more (${shown.length}/${count})</a>`
      : "");
}

export function selectUser(userId) {
  state.selectedUser = state.serviceUsers.find((u) => u.id === userId);
  if (!state.selectedUser) return;

  const riskGuidance = state.selectedUser.hasRiskAssessment
    ? "Open the live Risk Assessment page to review the latest assessment and use Send to extension for ACP-ready data."
    : "Use the live Risk Assessment page to generate a fresh assessment, then send the ACP-ready payload straight to the extension.";

  if (dom.selectedUserSection) dom.selectedUserSection.hidden = false;
  if (dom.selectedUserInfo) {
    dom.selectedUserInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
        <div class="user-avatar" style="width:44px;height:44px;font-size:14px;">${escapeHtml(state.selectedUser.initials || "??")}</div>
        <div>
          <div class="selected-user-name">${escapeHtml(state.selectedUser.name || "Unknown")}</div>
          <div class="selected-user-badges">
            ${state.selectedUser.hasCarePlan ? '<span class="badge badge-success">Care Plan</span>' : '<span class="badge badge-muted">No Care Plan</span>'}
            ${state.selectedUser.hasRiskAssessment ? '<span class="badge badge-info">Risk Assessment</span>' : '<span class="badge badge-muted">No Risk Assessment</span>'}
          </div>
        </div>
      </div>
      ${state.selectedUser.summary ? `<div class="summary-box">${escapeHtml(state.selectedUser.summary)}</div>` : ""}
      <div class="summary-box selected-user-guidance"><strong>Risk assessments:</strong> ${escapeHtml(riskGuidance)}</div>
    `;
  }

  if (dom.loadCarePlanBtn) dom.loadCarePlanBtn.disabled = !state.selectedUser.hasCarePlan;
  if (dom.loadRiskBtn) dom.loadRiskBtn.disabled = false;
  renderCaseContextStrip();
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTOFILL USER PICKER
// ═══════════════════════════════════════════════════════════════════════════

export function renderAutofillUserDropdown(filter) {
  if (!dom.autofillUserDropdown) return;

  const term = (filter || dom.autofillUserSearch?.value || "").trim().toLowerCase();
  const filtered = state.acpServiceUsers.filter((u) => u.name?.toLowerCase().includes(term));

  if (filtered.length === 0) {
    dom.autofillUserDropdown.innerHTML =
      '<div class="autofill-user-option" style="pointer-events:none;opacity:0.5;"><span class="autofill-user-option-name">No service users found</span></div>';
    dom.autofillUserDropdown.hidden = false;
    return;
  }

  dom.autofillUserDropdown.innerHTML = filtered
    .slice(0, 15)
    .map(
      (u) => `
    <div class="autofill-user-option" data-acp-id="${escapeAttr(u.acpId)}" data-name="${escapeAttr(u.name)}" tabindex="0" role="option">
      <div class="user-avatar">${escapeHtml(u.initials || "??")}</div>
      <span class="autofill-user-option-name">${escapeHtml(u.name || "Unknown")}</span>
      <span class="autofill-user-option-id">ID ${escapeHtml(String(u.acpId))}</span>
    </div>
  `
    )
    .join("");

  dom.autofillUserDropdown.hidden = false;
}

export function selectAutofillUser(user) {
  state.selectedAutofillUser = user || null;
  chrome.storage.local.set({ [STORAGE_KEYS.lastAutofillUser]: user || null }).catch(() => {});

  if (dom.autofillUserDropdown) dom.autofillUserDropdown.hidden = true;
  if (dom.autofillUserSearch) dom.autofillUserSearch.value = "";

  if (!user) {
    if (dom.autofillSelectedUser) dom.autofillSelectedUser.hidden = true;
    if (dom.caseId) dom.caseId.value = "";
    renderCaseContextStrip();
    return;
  }

  if (dom.caseId) dom.caseId.value = user.acpId || "";

  // Pre-fill display name override with user's name (if field is empty)
  if (dom.displayNameOverride && !dom.displayNameOverride.value.trim()) {
    dom.displayNameOverride.value = user.name || "";
  }

  clearFieldInvalid(dom.caseId);
  clearFieldInvalid(dom.serviceDataGroupId);
  dom.caseId?.focus();

  const groupDisplay = String(dom.serviceDataGroupId?.value || "").trim() || "Set group ID";

  if (dom.autofillSelectedUser) {
    dom.autofillSelectedUser.hidden = false;
    dom.autofillSelectedUser.innerHTML = `
      <div class="user-avatar">${escapeHtml(user.initials || "??")}</div>
      <div class="autofill-selected-user-info">
        <div class="autofill-selected-user-name">${escapeHtml(user.name || "Unknown")}</div>
        <div class="autofill-selected-user-meta">Case ID ${escapeHtml(String(user.acpId))} &middot; Group ${escapeHtml(groupDisplay)}</div>
      </div>
      <button type="button" class="autofill-selected-user-clear" title="Clear selection">&times;</button>
    `;

    dom.autofillSelectedUser.querySelector(".autofill-selected-user-clear")?.addEventListener("click", () => {
      selectAutofillUser(null);
    });
  }

  showSuccess(`${user.name} selected — Case ID ${user.acpId}`);
  renderCaseContextStrip();
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYLOAD RENDERING
// ═══════════════════════════════════════════════════════════════════════════

let lastInspectorRenderKey = "";
let lastReviewRenderKey = "";

const buildPayloadSummaryItems = (payload, storedAt) => {
  if (!payload || typeof payload !== "object") return [];

  const items = [
    { label: "Form", value: payload.formType || "Unknown" },
    { label: "Stored", value: formatPayloadTimestamp(storedAt) },
  ];

  if (payload.formType === "acp") {
    items.push({ label: "Assessments", value: String(payload.assessments?.length || 0) });
  } else if (payload.formType === "initialAssessment") {
    items.push({ label: "Sections", value: String(Object.keys(payload.initialAssessmentData || {}).length) });
  } else if (payload.formType === "emar") {
    items.push({ label: "Payload", value: "EMAR audit" });
  }

  if (payload.serviceUserDisplayName) items.push({ label: "Service User", value: payload.serviceUserDisplayName });
  if (payload.serviceUserInitials) items.push({ label: "Initials", value: payload.serviceUserInitials });
  if (payload.assessor) items.push({ label: "Assessor", value: payload.assessor });

  const firstAssessmentName = Array.isArray(payload.assessments)
    ? payload.assessments.map((a) => a?.name || a?.assessmentType || a?.riskTitle).find(Boolean)
    : null;
  if (firstAssessmentName) items.push({ label: "First Item", value: firstAssessmentName });

  return items.slice(0, 6);
};

export function renderPayloadInspector(payload, storedAt) {
  state.latestPayloadSnapshot = payload && typeof payload === "object" ? { payload, storedAt } : null;

  const inspectorRenderKey = state.latestPayloadSnapshot
    ? `${storedAt || "none"}:${payload?.formType || "unknown"}`
    : "none";

  if (inspectorRenderKey === lastInspectorRenderKey) {
    return;
  }
  lastInspectorRenderKey = inspectorRenderKey;

  if (dom.payloadInspectorSection) {
    dom.payloadInspectorSection.hidden = !state.latestPayloadSnapshot;
  }

  if (!dom.payloadSummary || !dom.payloadJson) return;

  if (!state.latestPayloadSnapshot) {
    dom.payloadSummary.innerHTML = "";
    dom.payloadJson.textContent = "No payload stored.";
    dom.payloadJson.classList.add("empty");
    return;
  }

  const summaryItems = buildPayloadSummaryItems(payload, storedAt);
  dom.payloadSummary.innerHTML = summaryItems
    .map(
      ({ label, value }) => `
      <div class="payload-summary-item">
        <span class="payload-summary-label">${escapeHtml(label)}</span>
        <span class="payload-summary-value">${escapeHtml(value)}</span>
      </div>
    `
    )
    .join("");

  dom.payloadJson.textContent = JSON.stringify(payload, null, 2);
  dom.payloadJson.classList.remove("empty");
}

export function renderPayloadReview(payload, storedAt) {
  const panel = dom.payloadReviewPanel;
  const list = dom.payloadReviewList;
  const confirmBtn = dom.confirmPayloadReview;
  if (!panel || !list) return;

  const reviewRenderKey = payload
    ? `${storedAt || "none"}:${payload.formType || "unknown"}:${Array.isArray(payload.assessments) ? payload.assessments.length : 0}:${Array.isArray(payload.sections) ? payload.sections.length : 0}`
    : "none";

  if (reviewRenderKey === lastReviewRenderKey) {
    return;
  }
  lastReviewRenderKey = reviewRenderKey;

  if (!payload) { panel.hidden = true; return; }

  const items = [];
  if (payload.formType === "acp" && Array.isArray(payload.assessments)) {
    payload.assessments.forEach((a, i) => {
      const fieldCount = Object.keys(a.fields || {}).length;
      items.push({ title: a.title || `Assessment ${i + 1}`, badge: `${fieldCount} fields`, detail: Object.entries(a.fields || {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(", ") });
    });
  } else if (payload.formType === "initialAssessment") {
    const sections = payload.sections || [];
    sections.forEach((s) => {
      const fieldCount = Object.keys(s.fields || {}).length;
      items.push({ title: s.title || "Section", badge: `${fieldCount} fields`, detail: Object.entries(s.fields || {}).slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(", ") });
    });
  } else if (payload.formType === "emar") {
    items.push({ title: "EMAR Audit", badge: payload.medications?.length ? `${payload.medications.length} meds` : "Ready", detail: payload.serviceUser || "Service user data loaded" });
  }

  if (items.length === 0 && payload.formType) {
    items.push({ title: payload.formType, badge: "Ready", detail: "Payload loaded and ready for autofill" });
  }

  if (items.length === 0) { panel.hidden = true; return; }

  list.innerHTML = items
    .map(
      (item) => `
    <div class="payload-review-item">
      <div class="payload-review-item-header">
        <span class="payload-review-item-title">${escapeHtml(item.title)}</span>
        <span class="payload-review-item-badge">${escapeHtml(item.badge)}</span>
      </div>
      <div class="payload-review-item-detail">${escapeHtml(item.detail || "\u2014")}</div>
    </div>
  `
    )
    .join("");
  panel.hidden = false;

  if (confirmBtn) {
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.replaceWith(newBtn);
    dom.confirmPayloadReview = newBtn;
    newBtn.addEventListener("click", () => { dom.startAutofill?.click(); });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTOFILL SESSION SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

export function renderAutofillSessionSummary(snapshot = {}) {
  if (!dom.autofillSessionState || !dom.autofillSessionMeta) return;

  const payload = snapshot.payload || state.latestPayloadSnapshot?.payload || null;
  const queueState = snapshot.queueState || null;
  const verificationFields = Array.isArray(snapshot.verificationFields) ? snapshot.verificationFields : [];
  const lastError = snapshot.lastError || null;
  const pageContext = snapshot.pageContext || state.pageCompanionContext || null;
  const total = typeof queueState?.total === "number" ? queueState.total : null;
  const currentIndex = typeof queueState?.currentIndex === "number" ? queueState.currentIndex : null;
  const queueStep = total ? Math.min((currentIndex ?? 0) + 1, total) : null;
  const payloadLabel = getPayloadWorkflowLabel(payload) || "No payload";
  const workflowSafety = getPopupWorkflowSafety({
    payload,
    requireCaseId: Boolean(payload),
    requireServiceDataGroup: Boolean(payload),
  });

  let stateClass = "is-idle";
  let title = "No autofill session loaded";
  let detail = "Analyze documents or load a payload to prepare the next run.";
  let primaryAction = { label: "Refresh Status", action: "refresh", className: "btn btn-primary btn-sm" };
  let recommendationTone = "info";
  let recommendationText = "Analyze documents or load content first so Autofill has a staged payload to run.";

  if (workflowSafety.code === "page-refresh-required") {
    stateClass = "is-warning";
    title = workflowSafety.title;
    detail = workflowSafety.detail;
    primaryAction = getWorkflowSafetyActionConfig(workflowSafety) || { label: "Reload Page", action: "reload-page", className: "btn btn-primary btn-sm" };
    recommendationTone = "warning";
    recommendationText = "Reload the attached page next so the current extension build can reattach before another run starts.";
  } else if (lastError) {
    stateClass = "is-warning";
    title = "Needs attention";
    detail = String(lastError);
    primaryAction = pageContext?.canOverlay
      ? { label: pageContext.overlayButtonLabel || "Open In-Page Status", action: "overlay", className: "btn btn-primary btn-sm" }
      : { label: "Open Command Center", action: "diagnostics", className: "btn btn-primary btn-sm" };
    recommendationTone = "warning";
    recommendationText = pageContext?.canOverlay
      ? "Open the in-page status panel next and resolve the current incident before resuming Autofill."
      : "Open Command Center next and review the active incident before retrying the workflow.";
  } else if (total && currentIndex !== null && currentIndex < total) {
    stateClass = "is-live";
    title = "Queue in progress";
    detail = `${pageContext?.routeLabel || "Workflow page"} is working through item ${queueStep} of ${total}.`;
    primaryAction = { label: "Stop Autofill", action: "stop", className: "btn btn-danger btn-sm" };
    recommendationTone = "info";
    recommendationText = "Let the queue continue unless the page stalls or the active item clearly needs manual intervention.";
  } else if (total && currentIndex !== null && currentIndex >= total) {
    stateClass = "is-ready";
    title = "Queue complete";
    detail = `The latest batch reached ${total} of ${total}. Refresh the live page or load the next payload.`;
    primaryAction = { label: "Refresh Status", action: "refresh", className: "btn btn-primary btn-sm" };
    recommendationTone = "success";
    recommendationText = "Refresh status next, then load the next payload or switch to the next service-user workflow.";
  } else if (workflowSafety.severity !== "ready") {
    stateClass = "is-warning";
    title = workflowSafety.title;
    detail = workflowSafety.detail;
    primaryAction = getWorkflowSafetyActionConfig(workflowSafety) || { label: "Refresh Status", action: "refresh", className: "btn btn-primary btn-sm" };
    recommendationTone = "warning";
    recommendationText = workflowSafety.action === "open-status"
      ? "Review Extension Status next so the installed build, published package, and current page stay aligned."
      : workflowSafety.action === "detect-ids"
        ? "Detect the live IDs next so the staged payload can target the correct Mobizio record."
        : "Resolve the target or page warning next before starting a new Autofill run.";
  } else if (verificationFields.length > 0 && pageContext?.canVerify) {
    stateClass = "is-warning";
    title = "Review required";
    detail = `${verificationFields.length} field${verificationFields.length === 1 ? "" : "s"} still need manual confirmation.`;
    primaryAction = { label: "Next Review Field", action: "verify", className: "btn btn-primary btn-sm" };
    recommendationTone = "warning";
    recommendationText = "Use Next Review Field now and clear the flagged answers before final submission.";
  } else if (payload?.formType) {
    stateClass = "is-ready";
    title = "Ready to start";
    detail = `${payloadLabel} is staged${pageContext?.routeLabel ? ` for ${pageContext.routeLabel}` : ""}.`;
    primaryAction = { label: "Start Autofill", action: "start", className: "btn btn-primary btn-sm" };
    recommendationTone = "success";
    recommendationText = "Start Autofill when the attached page and target IDs still match the staged payload.";
  } else if (pageContext?.tabId) {
    stateClass = "is-context";
    title = "Workflow page attached";
    detail = `${pageContext.routeLabel || "Workflow page"} is ready. Load or analyze content to prepare autofill data.`;
    primaryAction = { label: "Refresh Status", action: "refresh", className: "btn btn-secondary btn-sm" };
    recommendationTone = "info";
    recommendationText = "Load or analyze source content next so this page has a payload ready for Autofill.";
  }

  dom.autofillSessionState.className = `autofill-session-state ${stateClass}`;
  dom.autofillSessionState.innerHTML = `
    <span class="autofill-session-eyebrow">Next step</span>
    <strong class="autofill-session-title">${escapeHtml(title)}</strong>
    <span class="autofill-session-detail">${escapeHtml(detail)}</span>
  `;

  const metaItems = [
    { label: "Workflow", value: pageContext?.routeLabel || "No page attached" },
    { label: "Payload", value: payloadLabel },
    { label: "Queue", value: total ? `${queueStep} of ${total}` : "Not running" },
    {
      label: "Review",
      value: pageContext?.requiresPageRefresh
        ? pageContext.reviewLabel || "Refresh required"
        : verificationFields.length > 0
        ? `${verificationFields.length} flagged`
        : pageContext?.reviewLabel || "No checks",
    },
  ];

  dom.autofillSessionMeta.innerHTML = metaItems
    .map(
      (item) => `
        <div class="autofill-session-meta-item">
          <span class="autofill-session-meta-label">${escapeHtml(item.label)}</span>
          <strong class="autofill-session-meta-value">${escapeHtml(item.value)}</strong>
        </div>
      `
    )
    .join("");

  renderWorkflowRecommendation(dom.autofillSessionRecommendation, {
    text: recommendationText,
    tone: recommendationTone,
  });

  if (dom.autofillSessionPrimary) {
    dom.autofillSessionPrimary.className = primaryAction.className;
    dom.autofillSessionPrimary.textContent = primaryAction.label;
    dom.autofillSessionPrimary.dataset.action = primaryAction.action;
  }

  if (dom.autofillSessionFocus) {
    dom.autofillSessionFocus.disabled = !pageContext?.tabId;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTICS, LOGS, AND PROGRESS
// ═══════════════════════════════════════════════════════════════════════════

export function renderCommandCenter(snapshot = {}) {
  if (!dom.opsHealth) return;

  const model = snapshot && snapshot.healthTitle && Array.isArray(snapshot.timeline)
    ? snapshot
    : buildCommandCenterState(snapshot);

  dom.opsHealth.className = `ops-health ${model.healthClass}`;
  dom.opsHealth.innerHTML = `
    <span class="ops-health-eyebrow">System health</span>
    <strong class="ops-health-title">${escapeHtml(model.healthTitle)}</strong>
    <span class="ops-health-detail">${escapeHtml(model.healthDetail)}</span>
  `;

  if (dom.opsReliability) dom.opsReliability.textContent = model.reliabilityLabel;
  if (dom.opsQueue) dom.opsQueue.textContent = model.queueLabel;
  if (dom.opsMode) dom.opsMode.textContent = model.modeLabel;
  if (dom.commandCenterSummary) dom.commandCenterSummary.textContent = model.healthTitle;
  if (dom.opsQuickHealth) {
    dom.opsQuickHealth.textContent = model.healthTitle;
    dom.opsQuickHealth.parentElement?.setAttribute("data-tone", String(model.healthClass || "is-idle").replace(/^is-/, ""));
  }
  if (dom.opsQuickQueue) dom.opsQuickQueue.textContent = model.queueLabel;
  if (dom.opsQuickMode) dom.opsQuickMode.textContent = model.modeLabel;
  if (dom.opsQuickNote) dom.opsQuickNote.textContent = model.recommendations[0] || model.healthDetail;

  if (dom.opsFlags) {
    const flags = Array.isArray(model.flags) ? model.flags : [];
    dom.opsFlags.innerHTML = flags.length
      ? flags
          .slice(0, 6)
          .map((flag) => `<span class="ops-flag ${flag.tone || "normal"}">${escapeHtml(flag.label || "")}</span>`)
          .join("")
      : '<span class="ops-flag muted">No active flags</span>';
  }

  if (dom.opsTimeline) {
    dom.opsTimeline.innerHTML = model.timeline
      .slice(0, 5)
      .map((item) => `<div class="ops-timeline-item ${item.tone}">${escapeHtml(item.text)}</div>`)
      .join("");
  }

  if (dom.opsRecommendations) {
    dom.opsRecommendations.innerHTML = model.recommendations
      .slice(0, 4)
      .map((text) => `<div class="ops-recommendation">${escapeHtml(text)}</div>`)
      .join("");
  }
}

export function renderRuntimeDiagnostics(snapshot = null) {
  if (!dom.runtimeDiagnostics) return;

  const model = snapshot && snapshot.rows && snapshot.cards
    ? snapshot
    : buildRuntimeDiagnosticsState(snapshot && typeof snapshot === "object" && snapshot.metrics
      ? snapshot
      : { metrics: snapshot });

  if (!model) {
    dom.runtimeDiagnostics.classList.add("empty");
    dom.runtimeDiagnostics.textContent = "";
    return;
  }

  dom.runtimeDiagnostics.className = `runtime-diagnostics severity-${model.severity}`;
  dom.runtimeDiagnostics.classList.remove("empty");

  const cards = model.cards
    .map(
      (card) => `
        <div class="runtime-card ${escapeAttr(card.tone || "normal")}">
          <span class="runtime-card-label">${escapeHtml(card.label || "")}</span>
          <span class="runtime-card-value">${escapeHtml(card.value || "-")}</span>
        </div>
      `
    )
    .join("");

  const rows = model.rows
    .map((row) => {
      const classes = ["runtime-value"];
      if (row.error) classes.push("error");
      else if (row.muted) classes.push("muted");
      return `
        <div class="runtime-row">
          <span class="runtime-key">${escapeHtml(row.key || "")}</span>
          <span class="${classes.join(" ")}">${escapeHtml(row.value || "-")}</span>
        </div>
      `;
    })
    .join("");

  const alerts = Array.isArray(model.alerts) && model.alerts.length
    ? `<div class="runtime-alerts">${model.alerts
        .map((alert) => `<div class="runtime-alert ${escapeAttr(alert.tone || "normal")}">${escapeHtml(alert.text || "")}</div>`)
        .join("")}</div>`
    : "";

  dom.runtimeDiagnostics.innerHTML = [
    `<div class="runtime-head">`,
    `<div class="runtime-diagnostics-title">Runtime diagnostics</div>`,
    `<span class="runtime-severity ${escapeAttr(model.severity || "idle")}">${escapeHtml(model.summary || "")}</span>`,
    `</div>`,
    `<div class="runtime-card-grid">${cards}</div>`,
    rows,
    alerts,
  ].join("");
}

export function renderLogs(logs) {
  if (!dom.logList) return;
  if (!Array.isArray(logs) || logs.length === 0) {
    dom.logList.innerHTML = '<div class="empty-state" style="font-size:11px;">No log entries</div>';
    return;
  }
  const levelPattern = /\b(error|fail|warn|success|ok|info|start|stop|done|complete|retry)\b/i;
  dom.logList.innerHTML = logs
    .slice(-50)
    .map((line) => {
      const match = String(line).match(levelPattern);
      let level = "info";
      if (match) {
        const word = match[1].toLowerCase();
        if (word === "error" || word === "fail") level = "error";
        else if (word === "warn" || word === "retry") level = "warn";
        else if (word === "success" || word === "ok" || word === "done" || word === "complete") level = "success";
      }
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return `<div class="log-entry"><span class="log-timestamp">${now}</span><span class="log-level ${level}">${level}</span><span class="log-message">${escapeHtml(line)}</span></div>`;
    })
    .join("");
  dom.logList.scrollTop = dom.logList.scrollHeight;
}

export function updateLiveProgress(queueState) {
  const panel = dom.autofillLiveProgress;
  const fill = dom.liveProgressFill;
  const label = dom.liveProgressLabel;
  const field = dom.liveProgressField;
  const queue = dom.liveProgressQueue;
  if (!panel) return;

  if (!queueState || typeof queueState.total !== "number") {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const { currentIndex = 0, total, currentField, fieldStates } = queueState;
  const pct = total > 0 ? Math.round((currentIndex / total) * 100) : 0;

  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `${currentIndex} / ${total} (${pct}%)`;
  if (field) field.textContent = currentField ? `Filling: ${currentField}` : "Preparing\u2026";

  if (queue && Array.isArray(fieldStates)) {
    queue.innerHTML = fieldStates
      .map((s, i) => {
        let cls = "live-progress-pip";
        if (s === "done") cls += " done";
        else if (s === "active") cls += " active";
        else if (s === "error") cls += " error";
        return `<div class="${cls}" title="Field ${i + 1}: ${s}"></div>`;
      })
      .join("");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPANION
// ═══════════════════════════════════════════════════════════════════════════

export function renderPageCompanion(context) {
  state.pageCompanionContext = context || null;

  const stateEl = dom.pageCompanionState;
  const routeEl = dom.pageCompanionRoute;
  const payloadEl = dom.pageCompanionPayload;
  const reviewEl = dom.pageCompanionReview;
  const refreshBtn = dom.refreshPageCompanion;
  const overlayBtn = dom.openPageOverlay;
  const verifyBtn = dom.jumpPageVerification;

  if (stateEl) {
    stateEl.className = `page-companion-state ${context?.stateClass || "is-empty"}`;
    stateEl.innerHTML = `
      <span class="page-companion-eyebrow">${escapeHtml(context?.eyebrow || "Current browser page")}</span>
      <strong class="page-companion-title">${escapeHtml(context?.title || "Open a workflow page to attach the companion")}</strong>
      <span class="page-companion-detail">${escapeHtml(context?.detail || "The extension will detect ACP, EMAR, Initial Assessment, or CareAssurance workspace tabs and surface the right controls here.")}</span>
    `;
  }

  if (routeEl) routeEl.textContent = context?.routeLabel || "Waiting";
  if (payloadEl) payloadEl.textContent = context?.payloadLabel || "No payload";
  if (reviewEl) reviewEl.textContent = context?.reviewLabel || "No checks";
  if (refreshBtn) refreshBtn.textContent = context?.requiresPageRefresh ? "Reload Page" : "Refresh Page";
  if (overlayBtn) overlayBtn.textContent = context?.overlayButtonLabel || "Open In-Page Status";
  if (overlayBtn) overlayBtn.disabled = !context?.canOverlay;
  if (verifyBtn) verifyBtn.disabled = !context?.canVerify;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPLAY FILE LIST / ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export function displayFileList() {
  if (!dom.fileList) return;
  if (state.selectedFilesList.length === 0) {
    dom.fileList.innerHTML = "";
    updateUploadSteps(0);
    updateTabBadges(state.latestPayloadSnapshot?.payload, 0);
    return;
  }

  updateUploadSteps(1);
  updateTabBadges(state.latestPayloadSnapshot?.payload, state.selectedFilesList.length);

  dom.fileList.innerHTML = state.selectedFilesList
    .map(
      (file, i) => `
    <div class="file-item">
      <span>${escapeHtml(file.name)}</span>
      <button class="file-remove" data-index="${i}">\u2715</button>
    </div>
  `
    )
    .join("");

  document.querySelectorAll(".file-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      state.selectedFilesList.splice(parseInt(e.target.dataset.index), 1);
      displayFileList();
      if (dom.analyzeDocuments) dom.analyzeDocuments.disabled = state.selectedFilesList.length === 0;
    });
  });
}

export function displayAnalysisResults(results) {
  if (!dom.assessmentList) return;
  if (dom.selectionSection) dom.selectionSection.hidden = false;

  const assessments = results.recommendedAssessments || [];
  const receipt = results?._uiReceipt || null;

  if (dom.analysisOverview) {
    if (!receipt) {
      dom.analysisOverview.hidden = true;
      dom.analysisOverview.innerHTML = "";
    } else {
      const detailItems = [
        { label: "Files staged", value: String(receipt.fileCount || 0) },
        { label: "Parsed", value: String(receipt.parsedCount || 0) },
        { label: "Recommendations", value: String(assessments.length) },
        { label: "Notes", value: receipt.hasNotes ? "Included" : "None" },
      ];

      const failedMarkup = Array.isArray(receipt.failedFiles) && receipt.failedFiles.length > 0
        ? `<div class="analysis-overview-note warning">Skipped files: ${escapeHtml(receipt.failedFiles.join(", "))}</div>`
        : "";
      const sectionMarkup = Array.isArray(receipt.sections) && receipt.sections.length > 0
        ? `<div class="analysis-overview-note">Sections: ${escapeHtml(receipt.sections.join(", "))}</div>`
        : "";

      dom.analysisOverview.hidden = false;
      dom.analysisOverview.innerHTML = `
        <div class="analysis-overview-head">
          <span class="analysis-overview-eyebrow">Latest analysis</span>
          <strong class="analysis-overview-title">Ready for assessment selection</strong>
        </div>
        <div class="analysis-overview-grid">
          ${detailItems
            .map(
              (item) => `
                <div class="analysis-overview-item">
                  <span class="analysis-overview-label">${escapeHtml(item.label)}</span>
                  <strong class="analysis-overview-value">${escapeHtml(item.value)}</strong>
                </div>
              `
            )
            .join("")}
        </div>
        ${sectionMarkup}
        ${failedMarkup}
      `;
    }
  }

  dom.assessmentList.innerHTML = assessments
    .map(
      (a, i) => `
    <div class="assessment-item">
      <div class="assessment-item-header">
        <input type="checkbox" class="assessment-checkbox" data-index="${i}" checked />
        <div class="assessment-content">
          <div class="assessment-name">${escapeHtml(a.name)}</div>
          <div class="assessment-reason">${escapeHtml(a.reason || "")}</div>
          ${a.evidence ? `<div class="assessment-evidence">${escapeHtml(a.evidence)}</div>` : ""}
        </div>
      </div>
    </div>
  `
    )
    .join("");

  updateSelectionCount();
  document.querySelectorAll(".assessment-checkbox").forEach((cb) => {
    cb.addEventListener("change", updateSelectionCount);
  });
}

export function updateSelectionCount() {
  const count = document.querySelectorAll(".assessment-checkbox:checked").length;
  if (dom.selectionCount) dom.selectionCount.textContent = `${count} selected`;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEADER / FOOTER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function updateHeaderUserChip(user) {
  let chip = document.getElementById("header-user-chip");
  if (!user) { chip?.remove(); return; }
  if (!chip) {
    chip = document.createElement("div");
    chip.id = "header-user-chip";
    chip.className = "header-user-chip";
    const headerActions = document.querySelector(".header-actions");
    if (headerActions) headerActions.prepend(chip);
    else return;
  }
  const initials = (user.username || "U").slice(0, 2).toUpperCase();
  const roleBadge = user.role === "admin" ? `<span class="header-role-badge admin">Admin</span>` : "";
  chip.innerHTML = `<span class="mini-avatar">${escapeHtml(initials)}</span><span>${escapeHtml(user.username || "User")}</span>${roleBadge}`;
}

export function updateFooterLiveDot(connected) {
  const dot = document.querySelector(".footer-status .status-dot");
  if (dot) dot.classList.toggle("live", connected);
}

export function refreshExtensionVersionDisplay() {
  if (!dom.footerExtensionVersion) return;
  try {
    const manifest = chrome.runtime?.getManifest?.();
    dom.footerExtensionVersion.textContent = manifest?.version ? `v${manifest.version}` : dom.footerExtensionVersion.textContent;
  } catch { /* ignore */ }
}

export function checkPayloadSize(payload) {
  const warningEl = document.getElementById("payload-size-warning");
  if (!payload) { warningEl?.remove(); return; }
  const size = new Blob([JSON.stringify(payload)]).size;
  const sizeMB = (size / (1024 * 1024)).toFixed(2);
  if (size > 1024 * 1024) {
    if (!warningEl) {
      const el = document.createElement("div");
      el.id = "payload-size-warning";
      el.className = "payload-size-warning";
      el.textContent = `\u26a0 Large payload: ${sizeMB} MB \u2014 autofill may be slower`;
      dom.payloadStatus?.parentElement?.appendChild(el);
    }
  } else {
    warningEl?.remove();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SKELETON LOADERS
// ═══════════════════════════════════════════════════════════════════════════

export function showSkeleton(container, count = 3) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () =>
    `<div class="skeleton-card skeleton" aria-hidden="true"></div>`
  ).join("");
}

export function hideSkeleton(container) {
  if (!container) return;
  container.querySelectorAll(".skeleton").forEach((el) => el.remove());
}
