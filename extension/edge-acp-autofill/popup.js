// ═══════════════════════════════════════════════════════════════════════════
// CARE ASSURANCE ACP AUTOFILL - POPUP SCRIPT v0.3.0
// Streamlined with direct Care Assurance integration
// ═══════════════════════════════════════════════════════════════════════════

const CARE_ASSURANCE_URL = "https://careassurance.uk";

const FALLBACK_STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  autoSubmit: "caAcpAutoSubmit",
  dryRun: "caAcpDryRun",
  logs: "caAcpLogs",
  interactionMode: "caAcpInteractionMode",
  signatureData: "caAcpSignatureData",
  signatureBatchId: "caAcpSignatureBatchId",
  lastError: "caAcpLastError",
  uploadedDocuments: "caAcpUploadedDocuments",
  connectionState: "caAcpConnectionState",
  serviceUsers: "caAcpServiceUsers",
  selectedUserId: "caAcpSelectedUserId",
};

const FALLBACK_MESSAGE_TYPES = {
  startAutofill: "CA_EXTENSION_START_AUTOFILL",
  stopAutofill: "CA_EXTENSION_STOP_AUTOFILL",
  clearError: "CA_EXTENSION_CLEAR_ERROR",
  analyzeRisks: "CA_EXTENSION_ANALYZE_RISKS",
  storePayload: "CA_EXTENSION_STORE_PAYLOAD",
};

const { STORAGE_KEYS, MESSAGE_TYPES } = window.CA_EXTENSION_CONSTANTS || {
  STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
  MESSAGE_TYPES: FALLBACK_MESSAGE_TYPES,
};

const loadStorage = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const setStorage = (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve));

// ═══════════════════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════

// Tabs
const tabConnectBtn = document.getElementById("tab-connect");
const tabUploadBtn = document.getElementById("tab-upload");
const tabAutofillBtn = document.getElementById("tab-autofill");
const tabContentConnect = document.getElementById("tab-content-connect");
const tabContentUpload = document.getElementById("tab-content-upload");
const tabContentAutofill = document.getElementById("tab-content-autofill");

// Connect tab
const connectionBadge = document.getElementById("connection-badge");
const connectStatus = document.getElementById("connect-status");
const connectBtn = document.getElementById("connect-btn");
const recentSection = document.getElementById("recent-section");
const recentList = document.getElementById("recent-list");
const searchSection = document.getElementById("search-section");
const serviceUserSearch = document.getElementById("service-user-search");
const serviceUserList = document.getElementById("service-user-list");
const selectedUserSection = document.getElementById("selected-user-section");
const selectedUserInfo = document.getElementById("selected-user-info");
const loadCarePlanBtn = document.getElementById("load-care-plan-btn");
const loadRiskBtn = document.getElementById("load-risk-btn");

// Upload tab
const documentFilesInput = document.getElementById("document-files");
const fileListContainer = document.getElementById("file-list");
const analyzeButton = document.getElementById("analyze-documents");
const analysisStatus = document.getElementById("analysis-status");
const analysisProgress = document.getElementById("analysis-progress");
const analysisProgressFill = document.getElementById("analysis-progress-fill");
const progressDetails = document.getElementById("progress-details");
const uploadNotesInput = document.getElementById("upload-notes");
const uploadedDocsSection = document.getElementById("uploaded-docs-summary");
const uploadedDocsList = document.getElementById("uploaded-docs-list");
const clearUploadsBtn = document.getElementById("clear-uploads");

// Autofill tab
const payloadStatus = document.getElementById("payload-status");
const selectionSection = document.getElementById("selection-section");
const assessmentList = document.getElementById("assessment-list");
const selectionCount = document.getElementById("selection-count");
const selectAllBtn = document.getElementById("select-all-btn");
const clearSelectionBtn = document.getElementById("clear-selection-btn");
const additionalNotes = document.getElementById("additional-notes");
const proceedWithSelection = document.getElementById("proceed-with-selection");
const caseIdInput = document.getElementById("case-id");
const serviceDataGroupInput = document.getElementById("service-data-group-id");
const autoSubmitToggle = document.getElementById("auto-submit");
const dryRunToggle = document.getElementById("dry-run");
const interactionModeSelect = document.getElementById("interaction-mode");
const progressStatus = document.getElementById("progress-status");
const startButton = document.getElementById("start-autofill");
const stopButton = document.getElementById("stop-autofill");
const clearButton = document.getElementById("clear-data");

// Other
const errorBanner = document.getElementById("error-banner");
const signatureInput = document.getElementById("signature-file");
const uploadSignatureButton = document.getElementById("upload-signature");
const signatureStatus = document.getElementById("signature-status");
const logStatus = document.getElementById("log-status");
const logList = document.getElementById("log-list");
const clearLogsButton = document.getElementById("clear-logs");

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let isConnected = false;
let serviceUsers = [];
let selectedUser = null;
let selectedFilesList = [];
let uploadedDocuments = [];
let currentAnalysisResults = null;

// ═══════════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

function switchTab(tabName) {
  [tabConnectBtn, tabUploadBtn, tabAutofillBtn].forEach(btn => btn?.classList.remove("active"));
  [tabContentConnect, tabContentUpload, tabContentAutofill].forEach(content => content?.classList.remove("active"));
  
  if (tabName === "connect") { tabConnectBtn?.classList.add("active"); tabContentConnect?.classList.add("active"); }
  if (tabName === "upload") { tabUploadBtn?.classList.add("active"); tabContentUpload?.classList.add("active"); }
  if (tabName === "autofill") { tabAutofillBtn?.classList.add("active"); tabContentAutofill?.classList.add("active"); }
}

tabConnectBtn?.addEventListener("click", () => switchTab("connect"));
tabUploadBtn?.addEventListener("click", () => switchTab("upload"));
tabAutofillBtn?.addEventListener("click", () => switchTab("autofill"));

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function updateConnectionUI(connected, user = null) {
  isConnected = connected;
  
  if (connectionBadge) {
    connectionBadge.className = `connection-badge ${connected ? "connected" : "disconnected"}`;
    const text = connectionBadge.querySelector(".connection-text");
    if (text) text.textContent = connected ? (user?.username || "Connected") : "Offline";
  }
  
  if (connectStatus) {
    connectStatus.innerHTML = connected
      ? `<span style="color: var(--color-success);">✓ Connected as ${user?.username || "user"}</span>`
      : `<span>Not connected</span>`;
  }
  
  if (connectBtn) {
    connectBtn.textContent = connected ? "Refresh" : "Connect to Care Assurance";
  }
  
  if (recentSection) recentSection.hidden = !connected;
  if (searchSection) searchSection.hidden = !connected;
}

async function connectToCareAssurance() {
  if (connectBtn) connectBtn.disabled = true;
  if (connectStatus) connectStatus.innerHTML = "<span>Connecting...</span>";
  
  try {
    // Check connection status
    const statusRes = await fetch(`${CARE_ASSURANCE_URL}/api/extension/status`, { credentials: "include" });
    if (!statusRes.ok) throw new Error("Not logged in");
    
    const status = await statusRes.json();
    updateConnectionUI(true, status.user);
    
    // Fetch service users
    const usersRes = await fetch(`${CARE_ASSURANCE_URL}/api/extension/service-users`, { credentials: "include" });
    if (usersRes.ok) {
      const data = await usersRes.json();
      serviceUsers = data.users || [];
      await setStorage({ [STORAGE_KEYS.serviceUsers]: serviceUsers });
      displayServiceUsers();
    }
    
    // Fetch recent items
    const recentRes = await fetch(`${CARE_ASSURANCE_URL}/api/extension/recent`, { credentials: "include" });
    if (recentRes.ok) {
      const data = await recentRes.json();
      displayRecentItems(data);
    }
    
  } catch (error) {
    console.error("Connection error:", error);
    updateConnectionUI(false);
    showError("Connection failed. Make sure you're logged in to Care Assurance.");
  } finally {
    if (connectBtn) connectBtn.disabled = false;
  }
}

connectBtn?.addEventListener("click", connectToCareAssurance);

function displayServiceUsers() {
  if (!serviceUserList) return;
  
  const searchTerm = serviceUserSearch?.value.toLowerCase() || "";
  const filtered = serviceUsers.filter(u => u.name?.toLowerCase().includes(searchTerm));
  
  if (filtered.length === 0) {
    serviceUserList.innerHTML = '<div class="empty-state">No service users found</div>';
    return;
  }
  
  serviceUserList.innerHTML = filtered.slice(0, 10).map(user => `
    <div class="service-user-item" data-id="${user.id}">
      <div class="user-avatar">${user.initials || "??"}</div>
      <div class="user-info">
        <div class="user-name">${user.name || "Unknown"}</div>
        <div class="user-badges">
          ${user.hasCarePlan ? '<span class="badge badge-success">Care Plan</span>' : ""}
          ${user.hasRiskAssessment ? '<span class="badge badge-info">Risk Assessment</span>' : ""}
        </div>
      </div>
    </div>
  `).join("");
  
  document.querySelectorAll(".service-user-item").forEach(item => {
    item.addEventListener("click", () => selectUser(parseInt(item.dataset.id)));
  });
}

serviceUserSearch?.addEventListener("input", displayServiceUsers);

function selectUser(userId) {
  selectedUser = serviceUsers.find(u => u.id === userId);
  if (!selectedUser) return;
  
  if (selectedUserSection) selectedUserSection.hidden = false;
  if (selectedUserInfo) {
    selectedUserInfo.innerHTML = `
      <div class="selected-user-name">${selectedUser.name || "Unknown"}</div>
      <div class="selected-user-badges">
        ${selectedUser.hasCarePlan ? '<span class="badge badge-success">Has Care Plan</span>' : '<span class="badge badge-muted">No Care Plan</span>'}
        ${selectedUser.hasRiskAssessment ? '<span class="badge badge-info">Has Risk Assessment</span>' : '<span class="badge badge-muted">No Risk Assessment</span>'}
      </div>
    `;
  }
  
  if (loadCarePlanBtn) loadCarePlanBtn.disabled = !selectedUser.hasCarePlan;
  if (loadRiskBtn) loadRiskBtn.disabled = !selectedUser.hasRiskAssessment;
  
  setStorage({ [STORAGE_KEYS.selectedUserId]: userId });
}

loadCarePlanBtn?.addEventListener("click", async () => {
  if (!selectedUser) return;
  
  loadCarePlanBtn.disabled = true;
  loadCarePlanBtn.textContent = "Loading...";
  
  try {
    const res = await fetch(`${CARE_ASSURANCE_URL}/api/extension/care-plan/${selectedUser.id}`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load care plan");
    
    const payload = await res.json();
    await setStorage({ [STORAGE_KEYS.payload]: payload });
    
    showSuccess("Care plan loaded! Go to Autofill tab.");
    switchTab("autofill");
    refreshPayloadStatus();
    
  } catch (error) {
    showError(error.message);
  } finally {
    loadCarePlanBtn.disabled = false;
    loadCarePlanBtn.textContent = "Load Care Plan";
  }
});

loadRiskBtn?.addEventListener("click", async () => {
  if (!selectedUser) return;
  
  loadRiskBtn.disabled = true;
  loadRiskBtn.textContent = "Loading...";
  
  try {
    const res = await fetch(`${CARE_ASSURANCE_URL}/api/extension/risk-assessment/${selectedUser.riskAssessmentId}`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load risk assessment");
    
    const payload = await res.json();
    await setStorage({ [STORAGE_KEYS.payload]: payload });
    
    showSuccess("Risk assessment loaded! Go to Autofill tab.");
    switchTab("autofill");
    refreshPayloadStatus();
    
  } catch (error) {
    showError(error.message);
  } finally {
    loadRiskBtn.disabled = false;
    loadRiskBtn.textContent = "Load Risk Assessment";
  }
});

function displayRecentItems(data) {
  if (!recentList) return;
  
  const items = [...(data.carePlans || []), ...(data.riskAssessments || [])]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5);
  
  if (items.length === 0) {
    recentList.innerHTML = '<div class="empty-state">No recent items</div>';
    return;
  }
  
  recentList.innerHTML = items.map(item => `
    <div class="recent-item" data-id="${item.id}" data-type="${item.type}">
      <span class="recent-icon">${item.type === "carePlan" ? "📝" : "🛡️"}</span>
      <span class="recent-name">${item.name}</span>
      <span class="recent-type">${item.type === "carePlan" ? "Care Plan" : "Risk"}</span>
    </div>
  `).join("");
  
  document.querySelectorAll(".recent-item").forEach(item => {
    item.addEventListener("click", () => loadRecentItem(item.dataset.id, item.dataset.type));
  });
}

async function loadRecentItem(id, type) {
  try {
    const endpoint = type === "carePlan" 
      ? `${CARE_ASSURANCE_URL}/api/extension/care-plan/${id}`
      : `${CARE_ASSURANCE_URL}/api/extension/risk-assessment/${id}`;
    
    const res = await fetch(endpoint, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load");
    
    const payload = await res.json();
    await setStorage({ [STORAGE_KEYS.payload]: payload });
    
    showSuccess("Data loaded!");
    switchTab("autofill");
    refreshPayloadStatus();
    
  } catch (error) {
    showError(error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD TAB (Keep existing logic but simplified)
// ═══════════════════════════════════════════════════════════════════════════

documentFilesInput?.addEventListener("change", (e) => {
  selectedFilesList = Array.from(e.target.files || []);
  displayFileList();
  if (analyzeButton) analyzeButton.disabled = selectedFilesList.length === 0;
});

function displayFileList() {
  if (!fileListContainer) return;
  if (selectedFilesList.length === 0) { fileListContainer.innerHTML = ""; return; }
  
  fileListContainer.innerHTML = selectedFilesList.map((file, i) => `
    <div class="file-item">
      <span>${file.name}</span>
      <button class="file-remove" data-index="${i}">✕</button>
    </div>
  `).join("");
  
  document.querySelectorAll(".file-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      selectedFilesList.splice(parseInt(e.target.dataset.index), 1);
      displayFileList();
      if (analyzeButton) analyzeButton.disabled = selectedFilesList.length === 0;
    });
  });
}

analyzeButton?.addEventListener("click", async () => {
  if (selectedFilesList.length === 0) return;
  
  analyzeButton.disabled = true;
  if (analysisProgress) analysisProgress.hidden = false;
  if (analysisStatus) analysisStatus.textContent = "Analyzing...";
  
  try {
    // Read files and analyze via background script
    const docType = document.querySelector('input[name="document-type"]:checked')?.value || "otherDocuments";
    let content = "";
    
    for (const file of selectedFilesList) {
      if (file.type.startsWith("text/") || file.name.endsWith(".txt")) {
        content += `\n\n=== ${file.name} ===\n` + await file.text();
      }
    }
    
    if (uploadNotesInput?.value) {
      content += `\n\n=== Additional Notes ===\n${uploadNotesInput.value}`;
    }
    
    // Send to background for analysis
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.analyzeRisks || "CA_EXTENSION_ANALYZE_RISKS",
      documentContent: content,
      authToken: "direct" // Background will handle auth
    }, (response) => {
      if (response?.ok) {
        currentAnalysisResults = response.result;
        displayAnalysisResults(response.result);
        switchTab("autofill");
      } else {
        showError(response?.error || "Analysis failed");
      }
      if (analysisProgress) analysisProgress.hidden = true;
      analyzeButton.disabled = false;
    });
    
  } catch (error) {
    showError(error.message);
    if (analysisProgress) analysisProgress.hidden = true;
    analyzeButton.disabled = false;
  }
});

function displayAnalysisResults(results) {
  if (!assessmentList) return;
  
  if (selectionSection) selectionSection.hidden = false;
  
  const assessments = results.recommendedAssessments || [];
  assessmentList.innerHTML = assessments.map((a, i) => `
    <div class="assessment-item">
      <input type="checkbox" class="assessment-checkbox" data-index="${i}" checked />
      <div class="assessment-info">
        <div class="assessment-name">${a.name}</div>
        <div class="assessment-reason">${a.reason || ""}</div>
      </div>
    </div>
  `).join("");
  
  updateSelectionCount();
  document.querySelectorAll(".assessment-checkbox").forEach(cb => {
    cb.addEventListener("change", updateSelectionCount);
  });
}

function updateSelectionCount() {
  const count = document.querySelectorAll(".assessment-checkbox:checked").length;
  if (selectionCount) selectionCount.textContent = `${count} selected`;
}

selectAllBtn?.addEventListener("click", () => {
  document.querySelectorAll(".assessment-checkbox").forEach(cb => cb.checked = true);
  updateSelectionCount();
});

clearSelectionBtn?.addEventListener("click", () => {
  document.querySelectorAll(".assessment-checkbox").forEach(cb => cb.checked = false);
  updateSelectionCount();
});

proceedWithSelection?.addEventListener("click", async () => {
  if (!currentAnalysisResults) return;
  
  const selected = Array.from(document.querySelectorAll(".assessment-checkbox:checked"))
    .map(cb => currentAnalysisResults.recommendedAssessments[parseInt(cb.dataset.index)])
    .filter(Boolean);
  
  const payload = {
    formType: "acp",
    assessments: selected.map(a => ({
      assessmentType: a.name,
      riskLevel: "To be determined",
      findings: a.evidence || a.reason || "",
      recommendations: a.reason || "",
      additionalNotes: additionalNotes?.value || ""
    }))
  };
  
  await setStorage({ [STORAGE_KEYS.payload]: payload });
  refreshPayloadStatus();
  if (selectionSection) selectionSection.hidden = true;
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTOFILL TAB
// ═══════════════════════════════════════════════════════════════════════════

// Verification navigation state
let currentVerificationIndex = -1;

async function refreshPayloadStatus() {
  const data = await loadStorage([
    STORAGE_KEYS.payload, STORAGE_KEYS.caseInfo, STORAGE_KEYS.autoSubmit,
    STORAGE_KEYS.dryRun, STORAGE_KEYS.interactionMode, STORAGE_KEYS.logs,
    STORAGE_KEYS.verificationFields
  ]);
  
  const payload = data.caAcpPayload;
  const verificationFields = data.caAcpVerificationFields || [];
  
  if (payloadStatus) {
    let statusHTML = '';
    if (payload?.formType === "initialAssessment") {
      statusHTML = '<span style="color: var(--color-success);">✓ Care Plan ready for Initial Assessment</span>';
    } else if (payload?.formType === "acp" && payload?.assessments?.length) {
      statusHTML = `<span style="color: var(--color-success);">✓ ${payload.assessments.length} assessment(s) ready</span>`;
    } else {
      statusHTML = '<span>No data loaded</span>';
    }
    
    // Add verification status if there are fields to verify
    if (verificationFields.length > 0) {
      const missingCount = verificationFields.filter(f => f.reason === 'missing').length;
      const ambiguousCount = verificationFields.filter(f => f.reason === 'ambiguous').length;
      statusHTML += `
        <div style="margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 4px; border: 1px solid #ffc107;">
          <div style="font-size: 11px; color: #856404; margin-bottom: 6px;">
            <strong>⚠️ ${verificationFields.length} field(s) need verification</strong>
          </div>
          <div style="font-size: 10px; color: #856404; margin-bottom: 8px;">
            ${missingCount > 0 ? `${missingCount} missing info` : ''}
            ${missingCount > 0 && ambiguousCount > 0 ? ' • ' : ''}
            ${ambiguousCount > 0 ? `${ambiguousCount} ambiguous` : ''}
          </div>
          <div style="display: flex; gap: 4px;">
            <button id="nav-prev-field" class="btn btn-small" style="flex: 1; font-size: 10px; padding: 4px 8px;">← Prev</button>
            <button id="nav-next-field" class="btn btn-small btn-primary" style="flex: 1; font-size: 10px; padding: 4px 8px;">Next →</button>
          </div>
        </div>
      `;
    }
    
    payloadStatus.innerHTML = statusHTML;
    
    // Add event listeners for verification navigation
    const prevBtn = document.getElementById('nav-prev-field');
    const nextBtn = document.getElementById('nav-next-field');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => navigateToVerificationField(-1));
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => navigateToVerificationField(1));
    }
  }
  
  if (data.caAcpCaseInfo) {
    if (caseIdInput) caseIdInput.value = data.caAcpCaseInfo.caseId || "";
    if (serviceDataGroupInput) serviceDataGroupInput.value = data.caAcpCaseInfo.serviceDataGroupId || "";
  }
  
  if (autoSubmitToggle) autoSubmitToggle.checked = data.caAcpAutoSubmit !== false;
  if (dryRunToggle) dryRunToggle.checked = data.caAcpDryRun === true;
  if (interactionModeSelect) interactionModeSelect.value = data.caAcpInteractionMode || "auto";
  
  if (logList && data.caAcpLogs) {
    logList.textContent = data.caAcpLogs.join("\n");
  }
}

/**
 * Navigate to verification field on the page
 */
async function navigateToVerificationField(direction) {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    
    // Update index based on direction
    currentVerificationIndex += direction;
    if (currentVerificationIndex < 0) currentVerificationIndex = 0;
    
    // Send message to content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'CA_EXTENSION_SCROLL_TO_NEXT',
      payload: { index: currentVerificationIndex }
    }, (response) => {
      if (response?.found) {
        currentVerificationIndex = response.index;
        showSuccess(`Field ${response.index + 1} of ${response.total}`);
      } else if (response?.total === 0) {
        showSuccess("No verification fields on this page");
      }
    });
  } catch (e) {
    console.error("Navigation error:", e);
  }
}

startButton?.addEventListener("click", async () => {
  const caseId = caseIdInput?.value.trim();
  const serviceDataGroupId = serviceDataGroupInput?.value.trim();
  
  if (!caseId || !serviceDataGroupId) {
    if (progressStatus) progressStatus.textContent = "Enter Case ID and Service Data Group ID";
    return;
  }
  
  await setStorage({
    [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
    [STORAGE_KEYS.autoSubmit]: autoSubmitToggle?.checked,
    [STORAGE_KEYS.dryRun]: dryRunToggle?.checked,
    [STORAGE_KEYS.interactionMode]: interactionModeSelect?.value
  });
  
  chrome.runtime.sendMessage(
    { type: MESSAGE_TYPES.startAutofill, caseId, serviceDataGroupId },
    (response) => {
      if (progressStatus) {
        progressStatus.textContent = response?.ok ? "Autofill started!" : (response?.error || "Failed");
      }
    }
  );
});

stopButton?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.stopAutofill }, () => {
    if (progressStatus) progressStatus.textContent = "Stopped";
  });
});

clearButton?.addEventListener("click", async () => {
  await setStorage({
    [STORAGE_KEYS.payload]: null,
    [STORAGE_KEYS.caseInfo]: null,
    [STORAGE_KEYS.queueState]: null
  });
  refreshPayloadStatus();
  if (progressStatus) progressStatus.textContent = "Cleared";
});

clearLogsButton?.addEventListener("click", async () => {
  await setStorage({ [STORAGE_KEYS.logs]: [] });
  if (logList) logList.textContent = "";
  if (logStatus) logStatus.textContent = "No actions.";
});

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function showError(message) {
  if (errorBanner) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
    setTimeout(() => { errorBanner.hidden = true; }, 5000);
  }
}

function showSuccess(message) {
  if (progressStatus) progressStatus.textContent = message;
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

(async function init() {
  await refreshPayloadStatus();
  
  // Check if already connected
  try {
    const res = await fetch(`${CARE_ASSURANCE_URL}/api/extension/status`, { credentials: "include" });
    if (res.ok) {
      const status = await res.json();
      updateConnectionUI(true, status.user);
      connectToCareAssurance(); // Full refresh
    }
  } catch (e) {
    updateConnectionUI(false);
  }
  
  // Check if we have a payload
  const { caAcpPayload } = await loadStorage([STORAGE_KEYS.payload]);
  if (caAcpPayload) {
    switchTab("autofill");
  }
  
  setInterval(refreshPayloadStatus, 3000);
})();
