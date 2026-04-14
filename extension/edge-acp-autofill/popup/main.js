/**
 * main.js — Entry point: event binding, connection flow, and initialization
 * CareAssurance Extension v0.5.4
 */

import {
  STORAGE_KEYS,
  DATA_TIMESTAMP_KEY,
  MESSAGE_TYPES,
  FORM_WORKFLOW_DESCRIPTORS,
  CARE_ASSURANCE_URLS,
  state,
  getCareAssuranceUrl,
  setCareAssuranceUrl,
  loadStorage,
  setStorage,
  setStorageWithTimestamp,
  autoCleanupStaleData,
  escapeHtml,
  normalizeCareAssuranceBaseUrl,
  describeWorkspaceRoute,
  isLikelyCareAssuranceUrl,
  getPayloadWorkflowLabel,
  createRequestId,
  writeToClipboard,
} from "./state.js";

import {
  apiProxy,
  findConnectedWorkspaceTab,
  sendMessageToPageCompanion,
} from "./api.js";

import {
  dom,
  cacheDomElements,
  switchTab,
  showError,
  showSuccess,
  showInfo,
  setButtonLoading,
  setFieldInvalid,
  clearFieldInvalid,
  showConfirmDialog,
  updateConnectionUI,
  renderWorkspaceContext,
  displayServiceUsers,
  selectUser,
  renderAutofillUserDropdown,
  selectAutofillUser,
  renderPayloadInspector,
  renderPayloadReview,
  renderRuntimeDiagnostics,
  renderLogs,
  updateLiveProgress,
  renderPageCompanion,
  displayFileList,
  displayRecentItems,
  displayAnalysisResults,
  updateSelectionCount,
  updateTabBadges,
  updateUploadSteps,
  refreshExtensionVersionDisplay,
  checkPayloadSize,
  showSkeleton,
  hideSkeleton,
} from "./ui.js";

// ═══════════════════════════════════════════════════════════════════════════
// WORKSPACE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

async function refreshWorkspaceContext(user = state.connectedWorkspaceUser) {
  if (user) state.connectedWorkspaceUser = user;

  try {
    const tab = await findConnectedWorkspaceTab(getCareAssuranceUrl());
    if (!tab?.id || !tab.url) {
      renderWorkspaceContext(null, state.connectedWorkspaceUser);
      return null;
    }

    const url = new URL(tab.url);
    const route = describeWorkspaceRoute(url.pathname);
    const context = {
      tabId: tab.id,
      baseUrl: `${url.protocol}//${url.host}`,
      host: url.host,
      title: tab.title || route.label,
      path: `${url.pathname}${url.search}` || "/",
      routeLabel: route.label,
      routeDetail: route.detail,
    };
    renderWorkspaceContext(context, state.connectedWorkspaceUser);
    return context;
  } catch (error) {
    console.warn("[CA Extension Popup] Failed to refresh workspace context:", error);
    renderWorkspaceContext(null, state.connectedWorkspaceUser);
    return null;
  }
}

async function openCareAssuranceRoute(pathname) {
  const context = state.connectedWorkspaceContext || (await refreshWorkspaceContext(state.connectedWorkspaceUser));
  const baseUrl = context?.baseUrl || normalizeCareAssuranceBaseUrl(getCareAssuranceUrl());
  const targetUrl =
    pathname.startsWith("http://") || pathname.startsWith("https://")
      ? pathname
      : `${baseUrl}${pathname}`;

  if (context?.tabId) {
    await chrome.tabs.update(context.tabId, { url: targetUrl, active: true });
  } else {
    await chrome.tabs.create({ url: targetUrl });
  }

  setTimeout(() => {
    refreshWorkspaceContext(state.connectedWorkspaceUser).catch(() => {});
  }, 250);
}

async function focusConnectedWorkspace() {
  const context = state.connectedWorkspaceContext || (await refreshWorkspaceContext(state.connectedWorkspaceUser));
  if (context?.tabId) {
    await chrome.tabs.update(context.tabId, { active: true });
    return;
  }
  await openCareAssuranceRoute("/dashboard");
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPANION
// ═══════════════════════════════════════════════════════════════════════════

async function refreshPageCompanion(overrides = {}) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      renderPageCompanion(null);
      return null;
    }

    const url = new URL(tab.url);
    const payload = overrides.payload ?? state.latestPayloadSnapshot?.payload ?? null;
    const verificationFields = overrides.verificationFields || [];
    const queueState = overrides.queueState || null;
    const lastError = overrides.lastError || null;

    for (const descriptor of FORM_WORKFLOW_DESCRIPTORS) {
      if (!descriptor.urlPattern.test(tab.url)) continue;

      const current = queueState && typeof queueState.currentIndex === "number" ? queueState.currentIndex + 1 : null;
      const total = queueState && typeof queueState.total === "number" ? queueState.total : null;
      const reviewLabel =
        descriptor.key === "initialAssessment"
          ? verificationFields.length > 0
            ? `${verificationFields.length} flagged field${verificationFields.length === 1 ? "" : "s"}`
            : "No flagged fields"
          : current && total
          ? `${current} of ${total} active`
          : payload?.formType === descriptor.key
          ? "Payload ready"
          : "Awaiting payload";

      const context = {
        tabId: tab.id,
        routeLabel: descriptor.label,
        payloadLabel: getPayloadWorkflowLabel(payload),
        reviewLabel,
        stateClass: lastError ? "is-warning" : payload ? "is-live" : "is-empty",
        eyebrow: "Live Mobizio workflow",
        title: descriptor.label,
        detail: lastError ? String(lastError) : descriptor.detail,
        canOverlay: ["acp", "emar", "initialAssessment"].includes(descriptor.key),
        canVerify: descriptor.key === "initialAssessment" && verificationFields.length > 0,
        overlayButtonLabel: descriptor.key === "initialAssessment" ? "Open Review Panel" : "Open In-Page Status",
      };
      renderPageCompanion(context);
      return context;
    }

    if (isLikelyCareAssuranceUrl(tab.url)) {
      const route = describeWorkspaceRoute(url.pathname);
      const context = {
        tabId: tab.id,
        routeLabel: route.label,
        payloadLabel: getPayloadWorkflowLabel(payload),
        reviewLabel: payload ? "Workspace connected" : "No payload",
        stateClass: "is-live",
        eyebrow: "CareAssurance workspace",
        title: route.label,
        detail: route.detail,
        canOverlay: false,
        canVerify: false,
      };
      renderPageCompanion(context);
      return context;
    }
  } catch (error) {
    console.warn("[CA Extension Popup] Failed to describe current page companion:", error);
  }

  renderPageCompanion({
    tabId: null,
    routeLabel: "Unsupported page",
    payloadLabel: getPayloadWorkflowLabel(null),
    reviewLabel: "Open Mobizio or CareAssurance",
    stateClass: "is-empty",
    eyebrow: "Current browser page",
    title: "Unsupported page",
    detail: "This tab is outside the CareAssurance and Mobizio workflow surfaces used by the extension.",
    canOverlay: false,
    canVerify: false,
  });
  return null;
}

async function focusPageCompanion() {
  const context = state.pageCompanionContext || (await refreshPageCompanion());
  if (!context?.tabId) {
    showError("No live workflow page is attached yet.");
    return;
  }
  await chrome.tabs.update(context.tabId, { active: true });
}

async function navigateToVerificationField(direction) {
  try {
    const context = state.pageCompanionContext || (await refreshPageCompanion());
    if (!context?.tabId) {
      showError("No verification-enabled page is attached yet.");
      return;
    }

    state.currentVerificationIndex += direction;
    if (state.currentVerificationIndex < 0) state.currentVerificationIndex = 0;

    chrome.tabs.sendMessage(
      context.tabId,
      { type: "CA_EXTENSION_SCROLL_TO_NEXT", payload: { index: state.currentVerificationIndex } },
      (response) => {
        if (chrome.runtime.lastError) {
          showError(chrome.runtime.lastError.message || "Could not reach the current page.");
          return;
        }
        if (response?.found) {
          state.currentVerificationIndex = response.index;
          showSuccess(`Field ${response.index + 1} of ${response.total}`);
        } else if (response?.total === 0) {
          showSuccess("No verification fields on this page");
        }
      }
    );
  } catch (e) {
    console.error("Navigation error:", e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REFRESH PAYLOAD STATUS
// ═══════════════════════════════════════════════════════════════════════════

async function refreshPayloadStatus() {
  const data = await loadStorage([
    STORAGE_KEYS.payload, DATA_TIMESTAMP_KEY, STORAGE_KEYS.caseInfo, STORAGE_KEYS.autoSubmit,
    STORAGE_KEYS.dryRun, STORAGE_KEYS.interactionMode, STORAGE_KEYS.logs,
    STORAGE_KEYS.verificationFields, STORAGE_KEYS.runtimeMetrics,
  ]);

  const payload = data[STORAGE_KEYS.payload];
  const payloadStoredAt = data[DATA_TIMESTAMP_KEY];
  const verificationFields = data[STORAGE_KEYS.verificationFields] || [];

  if (dom.payloadStatus) {
    let statusHTML = "";
    if (payload?.formType === "initialAssessment") {
      dom.payloadStatus.className = "status-box success";
      statusHTML = "<span>\u2713 Care Plan ready for Initial Assessment</span>";
    } else if (payload?.formType === "acp" && payload?.assessments?.length) {
      dom.payloadStatus.className = "status-box success";
      statusHTML = `<span>\u2713 ${payload.assessments.length} assessment(s) ready</span>`;
    } else if (payload?.formType === "emar") {
      dom.payloadStatus.className = "status-box success";
      statusHTML = "<span>\u2713 EMAR audit payload ready</span>";
    } else if (payload?.formType) {
      dom.payloadStatus.className = "status-box success";
      statusHTML = `<span>\u2713 ${escapeHtml(payload.formType)} payload ready</span>`;
    } else {
      dom.payloadStatus.className = "status-box";
      statusHTML = "<span>No data loaded</span>";
    }

    if (verificationFields.length > 0) {
      const missingCount = verificationFields.filter((f) => f.reason === "missing").length;
      const ambiguousCount = verificationFields.filter((f) => f.reason === "ambiguous").length;
      statusHTML += `
        <div class="verification-panel">
          <div class="verification-header"><strong>${verificationFields.length} field(s) need verification</strong></div>
          <div class="verification-detail">
            ${missingCount > 0 ? `${missingCount} missing` : ""}
            ${missingCount > 0 && ambiguousCount > 0 ? " \u2022 " : ""}
            ${ambiguousCount > 0 ? `${ambiguousCount} ambiguous` : ""}
          </div>
          <div class="verification-nav">
            <button id="nav-prev-field" class="btn btn-sm btn-secondary">\u2190 Prev</button>
            <button id="nav-next-field" class="btn btn-sm btn-primary">Next \u2192</button>
          </div>
        </div>
      `;
    }

    dom.payloadStatus.innerHTML = statusHTML;

    document.getElementById("nav-prev-field")?.addEventListener("click", () => navigateToVerificationField(-1));
    document.getElementById("nav-next-field")?.addEventListener("click", () => navigateToVerificationField(1));
  }

  renderPayloadInspector(payload, payloadStoredAt);
  renderPayloadReview(payload);
  updateTabBadges(payload, state.selectedFilesList.length);
  checkPayloadSize(payload);

  if (data[STORAGE_KEYS.caseInfo]) {
    if (dom.caseId) dom.caseId.value = data[STORAGE_KEYS.caseInfo].caseId || "";
    if (dom.serviceDataGroupId) dom.serviceDataGroupId.value = data[STORAGE_KEYS.caseInfo].serviceDataGroupId || "";
  }

  if (dom.autoSubmit) dom.autoSubmit.checked = data[STORAGE_KEYS.autoSubmit] !== false;
  if (dom.dryRun) dom.dryRun.checked = data[STORAGE_KEYS.dryRun] === true;
  if (dom.interactionMode) dom.interactionMode.value = data[STORAGE_KEYS.interactionMode] || "auto";

  if (dom.logList && data[STORAGE_KEYS.logs]) {
    renderLogs(data[STORAGE_KEYS.logs]);
  }

  renderRuntimeDiagnostics(data[STORAGE_KEYS.runtimeMetrics]);
  await refreshPageCompanion({
    payload,
    verificationFields,
    queueState: data[STORAGE_KEYS.queueState],
    lastError: data[STORAGE_KEYS.lastError],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURE STATUS
// ═══════════════════════════════════════════════════════════════════════════

async function refreshSignatureStatus() {
  const data = await loadStorage([STORAGE_KEYS.signatureData]);
  const signatureData = data.caAcpSignatureData;

  if (dom.signatureStatus) {
    if (signatureData?.dataUrl) {
      if (dom.signaturePreview) {
        dom.signaturePreview.hidden = false;
        dom.signaturePreview.innerHTML = `<img src="${signatureData.dataUrl}" alt="Signature preview" />`;
      }

      dom.signatureStatus.className = "status-box success";
      const uploadDate = signatureData.uploadedAt ? new Date(signatureData.uploadedAt).toLocaleString() : "";
      dom.signatureStatus.innerHTML = `
        <span>\u2713 ${escapeHtml(signatureData.fileName || "Signature uploaded")}</span>
        ${uploadDate ? `<small style="display: block; opacity: 0.7; font-size: 10px;">${uploadDate}</small>` : ""}
        <button id="clear-signature-btn" class="btn btn-ghost btn-sm" style="margin-top: 4px;">Clear Signature</button>
      `;

      document.getElementById("clear-signature-btn")?.addEventListener("click", async () => {
        await setStorage({ [STORAGE_KEYS.signatureData]: null, [STORAGE_KEYS.signatureBatchId]: null });
        await refreshSignatureStatus();
        showSuccess("Signature cleared");
      });
    } else {
      if (dom.signaturePreview) { dom.signaturePreview.hidden = true; dom.signaturePreview.innerHTML = ""; }
      dom.signatureStatus.className = "status-box";
      dom.signatureStatus.innerHTML = "<span>No signature uploaded</span>";
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION FLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch ancillary data (service users, recent items) after connection is
 * already confirmed.  Safe to call multiple times — never resets connection
 * state on failure, just logs a warning.
 */
async function fetchConnectedData(user) {
  try {
    const [usersRes, acpRes] = await Promise.all([
      apiProxy("/api/extension/service-users").catch(() => null),
      apiProxy("/api/extension/acp-service-users").catch(() => null),
    ]);

    const analyzedUsers = (usersRes?.ok ? usersRes.data?.users : []) || [];
    state.acpServiceUsers = (acpRes?.ok ? acpRes.data?.users : []) || [];

    const analyzedIds = new Set(analyzedUsers.map((u) => (u.name || "").toLowerCase().trim()));
    const acpOnlyUsers = state.acpServiceUsers
      .filter((u) => !analyzedIds.has((u.name || "").toLowerCase().trim()))
      .map((u) => ({ id: u.acpId || u.id, name: u.name, initials: u.initials, lastUpdated: u.updatedAt, isAcpOnly: true }));

    state.serviceUsers = [...analyzedUsers, ...acpOnlyUsers];
    displayServiceUsers();
    renderAutofillUserDropdown();
  } catch (e) {
    console.warn("[CA Extension] Failed to fetch service users:", e);
  }

  try {
    const recentRes = await apiProxy("/api/extension/recent");
    if (recentRes.ok) displayRecentItems(recentRes.data);
  } catch (e) {
    console.warn("[CA Extension] Failed to fetch recent items:", e);
  }
}

async function connectToCareAssurance() {
  setButtonLoading(dom.connectBtn, true);
  if (dom.connectStatus) dom.connectStatus.innerHTML = "<span>Connecting...</span>";

  if (dom.connectionBadge) {
    dom.connectionBadge.className = "connection-badge connecting";
    const text = dom.connectionBadge.querySelector(".connection-text");
    if (text) text.textContent = "Connecting\u2026";
  }

  const stored = await loadStorage([STORAGE_KEYS.serverUrl]);
  if (stored[STORAGE_KEYS.serverUrl]) {
    setCareAssuranceUrl(stored[STORAGE_KEYS.serverUrl]);
  }

  let lastError = null;
  let connected = false;

  for (const targetOrigin of [getCareAssuranceUrl(), ...CARE_ASSURANCE_URLS.filter((u) => u !== getCareAssuranceUrl())]) {
    setCareAssuranceUrl(targetOrigin);
    if (dom.connectStatus) dom.connectStatus.innerHTML = `<span>Trying ${escapeHtml(targetOrigin)}...</span>`;

    try {
      const statusRes = await apiProxy("/api/extension/status");

      if (statusRes.ok) {
        const payload = statusRes.data || statusRes;
        const user = payload.user || null;
        console.log("[CA Extension] connectToCareAssurance user:", JSON.stringify(user), "payload keys:", Object.keys(payload));
        await setStorage({ [STORAGE_KEYS.serverUrl]: targetOrigin });
        updateConnectionUI(true, user);
        await refreshWorkspaceContext(user);
        connected = true;

        await fetchConnectedData(user);

        break;
      } else if (statusRes.status === 401 || statusRes.error === "Not logged in") {
        await setStorage({ [STORAGE_KEYS.serverUrl]: targetOrigin });
        lastError = "Found server but not logged in. Please log in to Care Assurance in your browser first.";
        break;
      } else if (statusRes.needsTab) {
        lastError = statusRes.error;
      } else {
        lastError = `Server returned error: ${statusRes.error || "Unknown error"}`;
      }
    } catch (error) {
      lastError = `${targetOrigin}: ${error.message}`;
      console.warn(`Connection to ${targetOrigin} failed:`, error);
    }
  }

  if (!connected) {
    // Don't reset connection state if already connected from a prior quick check
    if (!state.isConnected) {
      updateConnectionUI(false);
    } else {
      console.log("[CA Extension] connectToCareAssurance failed but already connected — keeping state");
    }

    if (dom.connectionBadge) {
      dom.connectionBadge.className = "connection-badge error";
      const text = dom.connectionBadge.querySelector(".connection-text");
      if (text) text.textContent = "Error";
    }

    const needsTab = lastError?.includes("No Care Assurance tab") || lastError?.includes("No tab");
    const needsLogin = lastError?.includes("not logged in");
    const errorMsg = needsLogin || needsTab
      ? lastError
      : "Connection failed. Please open Care Assurance in a browser tab and log in first.";
    showError(errorMsg);

    if (dom.connectStatus) {
      dom.connectStatus.className = "status-box";
      dom.connectStatus.innerHTML = `
        <div style="font-size: 11px; line-height: 1.5;">
          <p style="margin-bottom: 6px; color: var(--color-error);">${escapeHtml(errorMsg)}</p>
          ${needsTab ? '<button id="open-ca-tab-btn" class="btn btn-primary btn-sm btn-block" style="margin-bottom: 8px;">Open CareAssurance in a New Tab</button>' : ""}
          <p style="margin-bottom: 4px; font-weight: 600;">Steps to connect:</p>
          <ol style="padding-left: 16px; margin: 0; font-size: 10px; color: var(--color-muted-foreground);">
            <li>Open careassurance.uk in a browser tab</li>
            <li>Log in to your account</li>
            <li>Click Connect again</li>
          </ol>
        </div>
      `;
      document.getElementById("open-ca-tab-btn")?.addEventListener("click", () => {
        chrome.tabs.create({ url: "https://careassurance.uk/dashboard" });
      });
    }
  }

  setButtonLoading(dom.connectBtn, false);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-DETECT IDS
// ═══════════════════════════════════════════════════════════════════════════

async function autoDetectIds() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      showError("Cannot access current tab URL");
      return { detected: false };
    }

    const url = new URL(tab.url);
    const caseId = url.searchParams.get("caseId");
    const serviceDataGroupId = url.searchParams.get("serviceDataGroupId");

    if (caseId && serviceDataGroupId) {
      if (dom.caseId) dom.caseId.value = caseId;
      if (dom.serviceDataGroupId) dom.serviceDataGroupId.value = serviceDataGroupId;
      await setStorage({ [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId } });
      showSuccess(`Detected: Case ID ${caseId}, Service Data Group ${serviceDataGroupId}`);
      return { detected: true, caseId, serviceDataGroupId };
    } else if (caseId || serviceDataGroupId) {
      if (caseId && dom.caseId) dom.caseId.value = caseId;
      if (serviceDataGroupId && dom.serviceDataGroupId) dom.serviceDataGroupId.value = serviceDataGroupId;
      showSuccess(`Partial detection: ${caseId ? "Case ID" : "Service Data Group"} found`);
      return { detected: true, partial: true, caseId, serviceDataGroupId };
    } else {
      showError("No case ID or service data group found in URL. Make sure you're on an Additional Risk Assessments page.");
      return { detected: false };
    }
  } catch (error) {
    console.error("Auto-detect error:", error);
    showError("Failed to detect IDs from page URL");
    return { detected: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOAD RECENT ITEM
// ═══════════════════════════════════════════════════════════════════════════

async function loadRecentItem(id, type) {
  try {
    const endpoint = type === "carePlan" ? `/api/extension/care-plan/${id}` : `/api/extension/risk-assessment/${id}`;
    const res = await apiProxy(endpoint);
    if (!res.ok) throw new Error(res.error || "Failed to load");

    await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: res.data });
    showSuccess("Data loaded!");
    switchTab("autofill");
    refreshPayloadStatus();
  } catch (error) {
    showError(error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BIND ALL DOM EVENTS
// ═══════════════════════════════════════════════════════════════════════════

function bindEvents() {
  // Tab navigation
  dom.tabConnect?.addEventListener("click", () => switchTab("connect"));
  dom.tabUpload?.addEventListener("click", () => switchTab("upload"));
  dom.tabAutofill?.addEventListener("click", () => switchTab("autofill"));

  // Connection
  dom.connectBtn?.addEventListener("click", connectToCareAssurance);

  // Workspace context
  dom.refreshWorkspaceContext?.addEventListener("click", () => {
    refreshWorkspaceContext(state.connectedWorkspaceUser).catch(() => showError("Could not refresh the CareAssurance workspace context."));
  });
  dom.openConnectedWorkspace?.addEventListener("click", () => focusConnectedWorkspace().catch(() => showError("Could not focus the connected CareAssurance page.")));
  dom.openDashboardWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/dashboard").catch(() => showError("Could not open the CareAssurance dashboard.")));
  dom.openCarePlanningWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/service-users/care-planning").catch(() => showError("Could not open Care Planning.")));
  dom.openRiskWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/service-users/risk-assessment").catch(() => showError("Could not open Risk Assessment.")));
  dom.openPlanEnhancerWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/service-users/plan-enhancer").catch(() => showError("Could not open Plan Enhancer.")));
  dom.openAdminWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/shadow-admin-portal").catch(() => showError("Could not open the Admin Portal.")));

  // Service user list delegation
  dom.serviceUserList?.addEventListener("click", (e) => {
    const item = e.target.closest(".service-user-item[data-id]");
    if (item) { selectUser(item.dataset.id); return; }
    const showMore = e.target.closest("[data-action='show-more-users']");
    if (showMore) { e.preventDefault(); state.serviceUserShowCount = (state.serviceUserShowCount || 10) + 10; displayServiceUsers(); }
  });
  dom.serviceUserList?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const item = e.target.closest(".service-user-item[data-id]");
      if (item) { e.preventDefault(); selectUser(item.dataset.id); }
    }
  });
  dom.serviceUserSort?.addEventListener("change", () => { state.serviceUserShowCount = 10; displayServiceUsers(); });
  dom.serviceUserSearch?.addEventListener("input", displayServiceUsers);

  // Load care plan / risk assessment
  dom.loadCarePlanBtn?.addEventListener("click", async () => {
    if (!state.selectedUser) return;
    setButtonLoading(dom.loadCarePlanBtn, true);
    try {
      const res = await apiProxy(`/api/extension/care-plan/${state.selectedUser.id}`);
      if (!res.ok) throw new Error(res.error || "Failed to load care plan");
      await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: res.data });
      showSuccess("Care plan loaded! Go to Autofill tab.");
      switchTab("autofill");
      refreshPayloadStatus();
    } catch (error) { showError(error.message); } finally { setButtonLoading(dom.loadCarePlanBtn, false); }
  });

  dom.loadRiskBtn?.addEventListener("click", async () => {
    if (!state.selectedUser) return;
    setButtonLoading(dom.loadRiskBtn, true);
    try {
      const res = await apiProxy(`/api/extension/risk-assessment/${state.selectedUser.riskAssessmentId}`);
      if (!res.ok) throw new Error(res.error || "Failed to load risk assessment");
      await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: res.data });
      showSuccess("Risk assessment loaded! Go to Autofill tab.");
      switchTab("autofill");
      refreshPayloadStatus();
    } catch (error) { showError(error.message); } finally { setButtonLoading(dom.loadRiskBtn, false); }
  });

  // Recent items
  dom.recentList?.addEventListener("click", (e) => {
    const item = e.target.closest(".recent-item[data-id]");
    if (item) loadRecentItem(item.dataset.id, item.dataset.type);
  });

  // Upload tab
  dom.documentFiles?.addEventListener("change", (e) => {
    state.selectedFilesList = Array.from(e.target.files || []);
    displayFileList();
    if (dom.analyzeDocuments) dom.analyzeDocuments.disabled = state.selectedFilesList.length === 0;
  });

  dom.clearUploads?.addEventListener("click", async () => {
    state.selectedFilesList = [];
    state.currentAnalysisResults = null;
    displayFileList();
    if (dom.analyzeDocuments) dom.analyzeDocuments.disabled = true;
    if (dom.uploadedDocsSummary) dom.uploadedDocsSummary.hidden = true;
    if (dom.uploadedDocsList) dom.uploadedDocsList.innerHTML = "";
    if (dom.documentFiles) dom.documentFiles.value = "";
    if (dom.uploadNotes) dom.uploadNotes.value = "";
    if (dom.analysisStatus) dom.analysisStatus.textContent = "";
    await setStorage({ [STORAGE_KEYS.uploadedDocuments]: null });
  });

  dom.analyzeDocuments?.addEventListener("click", async () => {
    if (state.selectedFilesList.length === 0) return;

    setButtonLoading(dom.analyzeDocuments, true);
    updateUploadSteps(2);
    if (dom.analysisProgress) dom.analysisProgress.hidden = false;
    if (dom.analysisStatus) dom.analysisStatus.textContent = "Analyzing...";

    try {
      const docType = document.querySelector('input[name="document-type"]:checked')?.value || "additionalDocuments";
      let content = "";
      const failedFiles = [];

      const readFileAsBase64 = (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsDataURL(file);
        });

      for (let i = 0; i < state.selectedFilesList.length; i++) {
        const file = state.selectedFilesList[i];
        if (dom.analysisStatus) dom.analysisStatus.textContent = `Parsing file ${i + 1} of ${state.selectedFilesList.length}...`;
        try {
          const base64Data = await readFileAsBase64(file);
          const parseRes = await apiProxy("/api/extension/parse-document", "POST", { filename: file.name, base64Data }, { timeoutMs: 120000 });
          if (parseRes?.ok && parseRes.text) {
            content += `\n\n=== ${file.name} (${docType}) ===\n${parseRes.text}`;
          } else {
            failedFiles.push(file.name);
          }
        } catch (err) {
          console.warn(`[CA Extension] Failed to parse ${file.name}:`, err);
          failedFiles.push(file.name);
        }
      }

      if (failedFiles.length > 0) showError(`Could not parse: ${failedFiles.join(", ")}`);
      if (dom.uploadNotes?.value) content += `\n\n=== Additional Notes ===\n${dom.uploadNotes.value}`;
      if (!content.trim()) throw new Error("No readable content found. Please check your files are valid PDF, DOCX, or text files.");

      if (dom.analysisStatus) dom.analysisStatus.textContent = "Analyzing document content...";

      const response = await apiProxy("/api/ai/analyze-risks", "POST", { documentContent: content, allowSensitive: false }, { timeoutMs: 180000 });
      if (!response?.ok) throw new Error(response?.error || "Analysis failed");

      const result = response.data || response.result;
      if (!result) throw new Error("No analysis result returned");
      state.currentAnalysisResults = result;
      displayAnalysisResults(result);
      switchTab("autofill");
    } catch (error) {
      showError(error.message);
    } finally {
      if (dom.analysisProgress) dom.analysisProgress.hidden = true;
      setButtonLoading(dom.analyzeDocuments, false);
      if (state.selectedFilesList.length === 0) dom.analyzeDocuments.disabled = true;
    }
  });

  // Selection controls
  dom.selectAllBtn?.addEventListener("click", () => { document.querySelectorAll(".assessment-checkbox").forEach((cb) => (cb.checked = true)); updateSelectionCount(); });
  dom.clearSelectionBtn?.addEventListener("click", () => { document.querySelectorAll(".assessment-checkbox").forEach((cb) => (cb.checked = false)); updateSelectionCount(); });

  dom.proceedWithSelection?.addEventListener("click", async () => {
    if (!state.currentAnalysisResults) return;
    const selected = Array.from(document.querySelectorAll(".assessment-checkbox:checked"))
      .map((cb) => state.currentAnalysisResults.recommendedAssessments[parseInt(cb.dataset.index)])
      .filter(Boolean);

    const payload = {
      formType: "acp",
      assessments: selected.map((a) => ({
        assessmentType: a.name,
        riskLevel: "To be determined",
        findings: a.evidence || a.reason || "",
        recommendations: a.reason || "",
        additionalNotes: dom.additionalNotes?.value || "",
      })),
    };

    await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: payload });
    refreshPayloadStatus();
    if (dom.selectionSection) dom.selectionSection.hidden = true;
  });

  // Autofill controls
  dom.autoDetectIds?.addEventListener("click", autoDetectIds);

  dom.startAutofill?.addEventListener("click", async () => {
    const caseId = dom.caseId?.value.trim();
    const serviceDataGroupId = dom.serviceDataGroupId?.value.trim();

    if (!caseId) {
      showError("Case ID is required. Select a service user or enter manually.");
      if (dom.progressStatus) dom.progressStatus.textContent = "Missing Case ID";
      setFieldInvalid(dom.caseId, "Case ID is required");
      dom.caseId?.focus();
      return;
    }
    if (!serviceDataGroupId) {
      showError("Service Data Group ID is required.");
      if (dom.progressStatus) dom.progressStatus.textContent = "Missing Service Data Group ID";
      setFieldInvalid(dom.serviceDataGroupId, "Service Data Group ID is required");
      dom.serviceDataGroupId?.focus();
      return;
    }

    const payloadCheck = await loadStorage([STORAGE_KEYS.payload]);
    const payload = payloadCheck[STORAGE_KEYS.payload];
    if (!payload) {
      showError("No payload loaded. Upload care data first.");
      if (dom.progressStatus) dom.progressStatus.textContent = "No payload";
      return;
    }
    if (payload.formType === "acp" && Array.isArray(payload.assessments) && payload.assessments.length === 0) {
      showError("Assessment list is empty \u2014 nothing to autofill.");
      if (dom.progressStatus) dom.progressStatus.textContent = "Empty assessments";
      return;
    }

    await setStorage({ [STORAGE_KEYS.verificationFields]: null });
    setButtonLoading(dom.startAutofill, true);

    await setStorage({
      [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
      [STORAGE_KEYS.autoSubmit]: dom.autoSubmit?.checked,
      [STORAGE_KEYS.dryRun]: dom.dryRun?.checked,
      [STORAGE_KEYS.interactionMode]: dom.interactionMode?.value,
    });

    chrome.runtime.sendMessage(
      { type: MESSAGE_TYPES.startAutofill, caseId, serviceDataGroupId },
      (response) => {
        setButtonLoading(dom.startAutofill, false);
        if (dom.progressStatus) {
          dom.progressStatus.textContent = response?.ok ? "Autofill started!" : response?.error || "Failed";
        }
        if (!response?.ok && response?.error) showError(response.error);
      }
    );
  });

  dom.stopAutofill?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.stopAutofill }, () => {
      if (dom.progressStatus) dom.progressStatus.textContent = "Stopped";
    });
  });

  dom.clearData?.addEventListener("click", () => {
    showConfirmDialog(
      "Clear All Data",
      "This will permanently remove the following. This action cannot be undone.",
      async () => {
        await setStorage({
          [STORAGE_KEYS.payload]: null,
          [DATA_TIMESTAMP_KEY]: null,
          [STORAGE_KEYS.caseInfo]: null,
          [STORAGE_KEYS.queueState]: null,
          [STORAGE_KEYS.signatureData]: null,
          [STORAGE_KEYS.signatureBatchId]: null,
          [STORAGE_KEYS.uploadedDocuments]: null,
          [STORAGE_KEYS.verificationFields]: null,
        });
        refreshPayloadStatus();
        if (dom.progressStatus) dom.progressStatus.textContent = "Cleared";
        showSuccess("All data cleared");
      },
      {
        details: [
          "Loaded payload / assessment data",
          "Case info (Case ID, Service Data Group)",
          "Queue state",
          "Signature image",
          "Uploaded documents",
          "Verification fields",
        ],
      }
    );
  });

  // Payload & diagnostics actions
  dom.copyPayload?.addEventListener("click", async () => {
    if (!state.latestPayloadSnapshot?.payload) { showError("No payload available to copy."); return; }
    try { await writeToClipboard(JSON.stringify(state.latestPayloadSnapshot.payload, null, 2)); showSuccess("Payload copied to clipboard"); }
    catch { showError("Could not copy payload. Try again."); }
  });

  dom.copyDiagnostics?.addEventListener("click", async () => {
    try {
      const data = await loadStorage([STORAGE_KEYS.runtimeMetrics, STORAGE_KEYS.lastError, STORAGE_KEYS.caseInfo, STORAGE_KEYS.queueState, STORAGE_KEYS.logs, STORAGE_KEYS.payload, DATA_TIMESTAMP_KEY]);
      const logs = Array.isArray(data[STORAGE_KEYS.logs]) ? data[STORAGE_KEYS.logs].slice(-20) : [];
      const diagnostics = {
        capturedAt: new Date().toISOString(),
        requestId: createRequestId(),
        targetOrigin: getCareAssuranceUrl(),
        connected: state.isConnected,
        payloadType: data?.[STORAGE_KEYS.payload]?.formType || null,
        payloadStoredAt: data[DATA_TIMESTAMP_KEY] || null,
        caseInfo: data[STORAGE_KEYS.caseInfo] || null,
        queueState: data[STORAGE_KEYS.queueState] || null,
        lastError: data[STORAGE_KEYS.lastError] || null,
        runtimeMetrics: data[STORAGE_KEYS.runtimeMetrics] || null,
        recentLogTail: logs,
      };
      await writeToClipboard(JSON.stringify(diagnostics, null, 2));
      if (dom.logStatus) dom.logStatus.textContent = `Diagnostics copied (${logs.length} logs)`;
      showSuccess("Diagnostics copied to clipboard");
    } catch { showError("Could not copy diagnostics. Try again."); }
  });

  dom.clearLogs?.addEventListener("click", async () => {
    await setStorage({ [STORAGE_KEYS.logs]: [], [STORAGE_KEYS.runtimeMetrics]: null });
    if (dom.logList) dom.logList.textContent = "";
    if (dom.logStatus) dom.logStatus.textContent = "No actions.";
    renderRuntimeDiagnostics(null);
  });

  // Page companion
  dom.refreshPageCompanion?.addEventListener("click", async () => {
    try { await refreshPageCompanion(); showSuccess("Page companion refreshed"); }
    catch { showError("Could not refresh the current page companion."); }
  });

  dom.focusPageCompanion?.addEventListener("click", () => {
    focusPageCompanion().catch((e) => showError(e.message || "Could not focus the workflow page."));
  });

  dom.openPageOverlay?.addEventListener("click", async () => {
    try {
      await sendMessageToPageCompanion({ type: MESSAGE_TYPES.toggleOverlay || "CA_EXTENSION_TOGGLE_OVERLAY", payload: { open: true } });
      showSuccess("In-page status opened");
    } catch (e) { showError(e.message || "Could not open the in-page status surface."); }
  });

  dom.jumpPageVerification?.addEventListener("click", () => {
    navigateToVerificationField(1).catch((e) => showError(e.message || "Could not move to the next review field."));
  });

  // Signature
  dom.signatureFile?.addEventListener("change", async () => {
    const file = dom.signatureFile.files?.[0];
    if (dom.signatureFilename) dom.signatureFilename.textContent = file ? file.name : "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { showError("Please select an image file (PNG, JPG, etc.)"); dom.signatureFile.value = ""; if (dom.signatureFilename) dom.signatureFilename.textContent = ""; return; }
    if (file.size > 5 * 1024 * 1024) { showError("Signature file is too large. Maximum size is 5MB"); dom.signatureFile.value = ""; if (dom.signatureFilename) dom.signatureFilename.textContent = ""; return; }

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const stored = await loadStorage([STORAGE_KEYS.queueState]);
      const batchId = stored?.caAcpQueueState?.batchId || null;

      await setStorage({
        [STORAGE_KEYS.signatureData]: { dataUrl, fileName: file.name, mimeType: file.type, uploadedAt: new Date().toISOString() },
        [STORAGE_KEYS.signatureBatchId]: batchId,
      });

      await refreshSignatureStatus();
      showSuccess("Signature uploaded successfully!");
      dom.signatureFile.value = "";
      if (dom.signatureFilename) dom.signatureFilename.textContent = "";
    } catch (error) {
      console.error("Signature upload error:", error);
      showError("Failed to upload signature. Please try again.");
      dom.signatureFile.value = "";
      if (dom.signatureFilename) dom.signatureFilename.textContent = "";
    }
  });

  dom.uploadSignatureBtn?.addEventListener("click", () => dom.signatureFile?.click());

  // Autofill user picker
  dom.autofillUserDropdown?.addEventListener("click", (e) => {
    const option = e.target.closest(".autofill-user-option[data-acp-id]");
    if (!option) return;
    selectAutofillUser({
      acpId: option.dataset.acpId,
      name: option.dataset.name,
      initials: option.querySelector(".user-avatar")?.textContent || "??",
    });
  });

  dom.autofillUserSearch?.addEventListener("input", () => {
    const term = dom.autofillUserSearch.value.trim();
    if (term.length === 0 && !state.selectedAutofillUser) { if (dom.autofillUserDropdown) dom.autofillUserDropdown.hidden = true; return; }
    renderAutofillUserDropdown(term);
  });

  dom.autofillUserSearch?.addEventListener("focus", () => { if (state.acpServiceUsers.length > 0) renderAutofillUserDropdown(); });

  dom.autofillUserSearch?.addEventListener("keydown", (e) => {
    if (!dom.autofillUserDropdown || dom.autofillUserDropdown.hidden) return;
    const options = [...dom.autofillUserDropdown.querySelectorAll(".autofill-user-option[data-acp-id]")];
    if (!options.length) return;
    const activeClass = "autofill-user-option-active";
    let current = dom.autofillUserDropdown.querySelector(`.${activeClass}`);
    let idx = current ? options.indexOf(current) : -1;
    if (e.key === "ArrowDown") { e.preventDefault(); if (current) current.classList.remove(activeClass); idx = idx < options.length - 1 ? idx + 1 : 0; options[idx].classList.add(activeClass); options[idx].scrollIntoView({ block: "nearest" }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (current) current.classList.remove(activeClass); idx = idx > 0 ? idx - 1 : options.length - 1; options[idx].classList.add(activeClass); options[idx].scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") { e.preventDefault(); if (current && current.dataset.acpId) current.click(); }
    else if (e.key === "Escape") { e.preventDefault(); dom.autofillUserDropdown.hidden = true; }
  });

  document.addEventListener("click", (event) => {
    if (dom.autofillUserDropdown && !dom.autofillUserDropdown.hidden) {
      const picker = dom.autofillUserSearch?.closest(".autofill-user-picker");
      if (picker && !picker.contains(event.target)) dom.autofillUserDropdown.hidden = true;
    }
  });

  // Field validation
  dom.caseId?.addEventListener("blur", () => { if (dom.caseId.value.trim()) clearFieldInvalid(dom.caseId); else setFieldInvalid(dom.caseId, "Case ID is required"); });
  dom.caseId?.addEventListener("input", () => clearFieldInvalid(dom.caseId));
  dom.serviceDataGroupId?.addEventListener("blur", () => { if (dom.serviceDataGroupId.value.trim()) clearFieldInvalid(dom.serviceDataGroupId); else setFieldInvalid(dom.serviceDataGroupId, "Service Data Group ID is required"); });
  dom.serviceDataGroupId?.addEventListener("input", () => clearFieldInvalid(dom.serviceDataGroupId));

  // Error dismiss
  dom.errorDismiss?.addEventListener("click", () => {
    if (dom.errorBanner) { dom.errorBanner.hidden = true; clearTimeout(dom.errorBanner._dismissTimer); }
  });

  // Drag & drop feedback
  const fileUploadLabel = document.querySelector(".file-upload-label");
  if (fileUploadLabel) {
    let dragCounter = 0;
    fileUploadLabel.addEventListener("dragenter", (e) => { e.preventDefault(); dragCounter++; fileUploadLabel.classList.add("drag-over"); });
    fileUploadLabel.addEventListener("dragover", (e) => { e.preventDefault(); });
    fileUploadLabel.addEventListener("dragleave", () => { dragCounter--; if (dragCounter <= 0) { dragCounter = 0; fileUploadLabel.classList.remove("drag-over"); } });
    fileUploadLabel.addEventListener("drop", () => { dragCounter = 0; fileUploadLabel.classList.remove("drag-over"); });
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); dom.startAutofill?.click(); return; }
    if (e.key === "Escape") {
      const dialog = document.querySelector(".dialog-overlay");
      if (dialog) { dialog.remove(); return; }
      if (dom.autofillUserDropdown && !dom.autofillUserDropdown.hidden) { dom.autofillUserDropdown.hidden = true; return; }
      const helpPanel = document.querySelector(".info-panel.visible");
      if (helpPanel) { helpPanel.classList.remove("visible"); return; }
    }
    if (e.target.getAttribute("role") === "tab") {
      const tabOrder = ["connect", "upload", "autofill"];
      const currentTab = e.target.dataset.tab;
      const idx = tabOrder.indexOf(currentTab);
      if (e.key === "ArrowRight" && idx < tabOrder.length - 1) { e.preventDefault(); switchTab(tabOrder[idx + 1]); document.getElementById(`tab-${tabOrder[idx + 1]}`)?.focus(); }
      if (e.key === "ArrowLeft" && idx > 0) { e.preventDefault(); switchTab(tabOrder[idx - 1]); document.getElementById(`tab-${tabOrder[idx - 1]}`)?.focus(); }
    }
  });

  // Help panel
  document.getElementById("help-btn")?.addEventListener("click", () => {
    let panel = document.getElementById("help-info-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "help-info-panel";
      panel.className = "info-panel";
      panel.innerHTML = `
        <strong>Keyboard Shortcuts</strong>
        <div style="margin-top:6px;">
          <span class="kbd">Ctrl</span>+<span class="kbd">Enter</span> Start Autofill<br>
          <span class="kbd">Esc</span> Close dialogs / dropdowns<br>
          <span class="kbd">\u2190</span> <span class="kbd">\u2192</span> Switch tabs
        </div>
        <div style="margin-top:8px;font-size:11px;opacity:0.7;">CareAssurance Extension v0.5.4</div>
      `;
      document.querySelector(".popup-content")?.prepend(panel);
    }
    panel.classList.toggle("visible");
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE CHANGE LISTENER
// ═══════════════════════════════════════════════════════════════════════════

function bindStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    try {
      if (areaName !== "local" && areaName !== "session") return;

      if (changes[STORAGE_KEYS.queueState]) {
        try {
          const newState = changes[STORAGE_KEYS.queueState].newValue;
          updateLiveProgress(newState);
          if (!newState) {
            if (dom.progressStatus) dom.progressStatus.textContent = "\u2713 Autofill complete!";
            showSuccess("Autofill batch complete! All forms have been filled.");
            refreshPayloadStatus();
            if (dom.connectionBadge) {
              dom.connectionBadge.classList.add("connected");
              const text = dom.connectionBadge.querySelector(".connection-text");
              if (text) { const orig = text.textContent; text.textContent = "\u2713 Complete"; setTimeout(() => { text.textContent = orig; }, 4000); }
            }
          } else if (typeof newState.currentIndex === "number" && typeof newState.total === "number") {
            if (dom.progressStatus) dom.progressStatus.textContent = `Filling ${newState.currentIndex + 1} of ${newState.total}...`;
          }
        } catch (e) { console.warn("[CA Extension] queueState handler error:", e); }
      }

      if (changes[STORAGE_KEYS.payload]) {
        try { refreshPayloadStatus(); } catch (e) { console.warn("[CA Extension] payload handler error:", e); }
      }

      if (changes[STORAGE_KEYS.verificationFields] || changes[STORAGE_KEYS.runtimeMetrics]) {
        try { refreshPayloadStatus(); } catch (e) { console.warn("[CA Extension] verification handler error:", e); }
      }

      if (changes[STORAGE_KEYS.logs]) {
        try { const logs = changes[STORAGE_KEYS.logs].newValue; if (Array.isArray(logs) && logs.length > 0) renderLogs(logs); }
        catch (e) { console.warn("[CA Extension] logs handler error:", e); }
      }

      if (changes[STORAGE_KEYS.lastError]) {
        try { const err = changes[STORAGE_KEYS.lastError].newValue; if (err) showError(typeof err === "string" ? err : err.message || "Unknown error"); }
        catch (e) { console.warn("[CA Extension] error handler error:", e); }
      }
    } catch (outerErr) {
      console.error("[CA Extension] storage.onChanged crash:", outerErr);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

(async function init() {
  cacheDomElements();
  bindEvents();
  bindStorageListener();

  // GDPR: Auto-clean stale data
  await autoCleanupStaleData();

  await refreshPayloadStatus();
  await refreshSignatureStatus();
  refreshExtensionVersionDisplay();

  // Load saved server URL
  const stored = await loadStorage([STORAGE_KEYS.serverUrl]);
  if (stored[STORAGE_KEYS.serverUrl]) {
    setCareAssuranceUrl(stored[STORAGE_KEYS.serverUrl]);
  }
  await refreshWorkspaceContext();

  // Restore last active tab and autofill user
  const { [STORAGE_KEYS.lastTab]: savedTab, [STORAGE_KEYS.lastAutofillUser]: savedUser } = await new Promise((r) =>
    chrome.storage.local.get([STORAGE_KEYS.lastTab, STORAGE_KEYS.lastAutofillUser], r)
  );
  if (savedTab) switchTab(savedTab, { persist: false });
  if (savedUser?.acpId) selectAutofillUser(savedUser);

  // Auto-detect case IDs from active tab URL
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const url = new URL(tab.url);
      if (url.pathname.includes("new_case_form") || url.pathname.includes("edit_case_form")) {
        const caseId = url.searchParams.get("caseId");
        const serviceDataGroupId = url.searchParams.get("serviceDataGroupId");
        if (caseId && serviceDataGroupId) {
          const hasExisting = dom.caseId?.value || dom.serviceDataGroupId?.value;
          if (!hasExisting) {
            if (dom.caseId) dom.caseId.value = caseId;
            if (dom.serviceDataGroupId) dom.serviceDataGroupId.value = serviceDataGroupId;
            await setStorage({ [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId } });
          }
        }
      }
    }
  } catch { /* ignore */ }

  // Quick connection check
  if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Checking connection...</span>';

  try {
    const res = await apiProxy("/api/extension/status");
    console.log("[CA Extension] Quick check raw response keys:", Object.keys(res || {}), "data keys:", Object.keys(res?.data || {}), "data:", JSON.stringify(res?.data)?.substring(0, 300));
    // The proxy wraps server JSON as { ok, data: <serverJson> }
    // The server returns { connected, user: { id, username, role }, ... }
    // So user is at res.data.user — but if data is absent, fall back to res itself
    const payload = res.data || res;
    const user = payload.user || null;
    if (res.ok) {
      console.log("[CA Extension] Quick check user:", JSON.stringify(user));
      updateConnectionUI(true, user);
      await refreshWorkspaceContext(user);
      fetchConnectedData(user); // Fetch service users + recent items (no reconnect)
    } else if (res.needsTab) {
      updateConnectionUI(false);
      if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Open Care Assurance in a tab, then click Connect</span>';
    } else {
      updateConnectionUI(false);
      if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Click "Connect" to find server</span>';
    }
  } catch {
    updateConnectionUI(false);
    if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Click "Connect" to find server</span>';
  }

  // Auto-switch to autofill if payload exists
  const payloadState = await loadStorage([STORAGE_KEYS.payload]);
  if (payloadState[STORAGE_KEYS.payload]) switchTab("autofill");

  // Periodic refresh
  setInterval(() => {
    refreshPayloadStatus();
    refreshWorkspaceContext(state.connectedWorkspaceUser);
  }, 3000);

  // GDPR periodic cleanup
  setInterval(autoCleanupStaleData, 30 * 60 * 1000);
})();
