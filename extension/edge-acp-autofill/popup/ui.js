/**
 * ui.js — DOM references, rendering, toasts, tabs, and visual updates
 * CareAssurance Extension v0.6.24
 */

import {
  STORAGE_KEYS,
  DATA_TIMESTAMP_KEY,
  FORM_WORKFLOW_DESCRIPTORS,
  state,
  escapeHtml,
  escapeAttr,
  formatRuntimeTime,
  formatRuntimeDuration,
  formatPayloadTimestamp,
  getPayloadWorkflowLabel,
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
    "tab-content-connect", "tab-content-upload", "tab-content-autofill",
    // Header
    "header-subtitle", "connection-badge", "connection-uptime", "overlay-pin-btn",
    // Connect
    "connect-status", "connect-btn", "refresh-workspace-context",
    "workspace-context-status", "workspace-route-label", "workspace-route-path",
    "workspace-tab-title", "open-connected-workspace", "open-dashboard-workspace",
    "open-care-planning-workspace", "open-risk-workspace", "open-plan-enhancer-workspace",
    "open-admin-workspace",
    // Main launchpad
    "main-view-state", "main-view-primary-action", "main-view-secondary-action",
    "main-open-care-planning", "main-open-risk", "main-open-plan-enhancer", "main-open-messages",
    // Service users
    "search-section", "service-user-search", "service-user-list", "service-user-sort",
    "service-user-count", "selected-user-section", "selected-user-info",
    "load-care-plan-btn", "load-risk-btn",
    // Recent
    "recent-section", "recent-list",
    // Upload
    "upload-social-work-input", "upload-social-work-files",
    "upload-initial-assessment-input", "upload-initial-assessment-files",
    "upload-care-plan-input", "upload-care-plan-files",
    "upload-moving-handling-input", "upload-moving-handling-files",
    "upload-additional-documents-input", "upload-additional-documents-files",
    "auto-collect-info", "auto-collect-info-state", "auto-collect-info-title", "auto-collect-info-detail", "copy-auto-collect-info",
    "upload-sync-status", "sync-upload-btn", "reset-upload-btn", "upload-notes", "analyze-documents",
    "analysis-status", "analysis-progress", "clear-uploads",
    "uploaded-docs-summary", "uploaded-docs-list",
    // Autofill settings
    "autofill-user-search", "autofill-user-dropdown", "autofill-selected-user",
    "case-id", "service-data-group-id", "auto-detect-ids",
    "interaction-mode", "auto-submit", "dry-run",
    // Autofill controls
    "payload-status", "progress-status", "start-autofill", "stop-autofill", "clear-data",
    // Selection
    "selection-section", "assessment-list", "selection-count",
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
    // Live progress
    "autofill-live-progress", "live-progress-fill", "live-progress-label",
    "live-progress-field", "live-progress-queue",
    // Payload review
    "payload-review-panel", "payload-review-list", "confirm-payload-review",
    // Command center
    "ops-refresh", "ops-copy-snapshot", "ops-copy-incident", "ops-clear-incident",
    "ops-health", "ops-reliability", "ops-queue", "ops-mode", "ops-timeline", "ops-recommendations", "ops-flags",
  ];

  for (const id of ids) {
    const camel = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    dom[camel] = document.getElementById(id);
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

export function updateTabBadges(payload, fileCount) {
  setTabBadge(dom.tabAutofill, payload ? true : null, payload ? "success" : null);
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
};

const getMainViewRouteLabel = (route) => MAIN_VIEW_ROUTE_LABELS[route] || "Workflow";

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

  if (stateEl) {
    if (!state.isConnected) {
      stateEl.className = "main-view-state is-disconnected";
      stateEl.innerHTML = `
        <span class="main-view-state-eyebrow">Startup status</span>
        <strong class="main-view-state-title">Not connected yet</strong>
        <span class="main-view-state-detail">Sync your CareAssurance session to unlock service-user search, payload loading, and one-click workflow focus.</span>
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

  if (dom.recentSection) dom.recentSection.hidden = !connected;

  const isAdmin = connected && (user?.role?.toLowerCase() === "admin" || state.connectedWorkspaceUser?.role?.toLowerCase() === "admin");
  state.isAdmin = isAdmin;
  document.body.classList.toggle("is-admin", isAdmin);
  console.log("[CA Extension] updateConnectionUI — connected:", connected, "user:", JSON.stringify(user), "role:", user?.role || state.connectedWorkspaceUser?.role, "isAdmin:", isAdmin);

  // search-section uses .admin-only CSS — also gate via hidden for non-admin connected users
  if (dom.searchSection) dom.searchSection.hidden = !connected || !isAdmin;
  // Admin portal button — also gate via hidden
  if (dom.openAdminWorkspace) dom.openAdminWorkspace.hidden = !isAdmin;

  renderMainViewLaunchpad(state.connectedWorkspaceContext);
  updateHeaderUserChip(null);
  updateFooterLiveDot(connected);
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
  if (dom.searchSection) dom.searchSection.hidden = !state.isConnected || !isAdmin;

  renderMainViewLaunchpad(context);
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
    `;
  }

  if (dom.loadCarePlanBtn) dom.loadCarePlanBtn.disabled = !state.selectedUser.hasCarePlan;
  if (dom.loadRiskBtn) dom.loadRiskBtn.disabled = !state.selectedUser.hasRiskAssessment;
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
    return;
  }

  if (dom.caseId) dom.caseId.value = user.acpId || "";

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
  if (overlayBtn) overlayBtn.disabled = !context?.canOverlay;
  if (verifyBtn) verifyBtn.disabled = !context?.canVerify;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPLAY FILE LIST / RECENT / ANALYSIS
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

export function displayRecentItems(data) {
  if (!dom.recentList) return;
  const items = [...(data.carePlans || []), ...(data.riskAssessments || [])]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5);

  if (items.length === 0) {
    dom.recentList.innerHTML = '<div class="empty-state">No recent items</div>';
    return;
  }

  dom.recentList.innerHTML = items
    .map(
      (item) => `
    <div class="recent-item" data-id="${item.id}" data-type="${item.type}">
      <span class="recent-icon">${item.type === "carePlan" ? "\ud83d\udcdd" : "\ud83d\udee1\ufe0f"}</span>
      <span class="recent-name">${escapeHtml(item.name)}</span>
      <span class="recent-type">${item.type === "carePlan" ? "Care Plan" : "Risk"}</span>
    </div>
  `
    )
    .join("");
}

export function displayAnalysisResults(results) {
  if (!dom.assessmentList) return;
  if (dom.selectionSection) dom.selectionSection.hidden = false;

  const assessments = results.recommendedAssessments || [];
  dom.assessmentList.innerHTML = assessments
    .map(
      (a, i) => `
    <div class="assessment-item">
      <input type="checkbox" class="assessment-checkbox" data-index="${i}" checked />
      <div class="assessment-info">
        <div class="assessment-name">${escapeHtml(a.name)}</div>
        <div class="assessment-reason">${escapeHtml(a.reason || "")}</div>
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
