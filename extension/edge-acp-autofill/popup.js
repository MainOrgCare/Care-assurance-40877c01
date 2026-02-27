// ═══════════════════════════════════════════════════════════════════════════
// CARE ASSURANCE ACP AUTOFILL - POPUP SCRIPT v0.3.4
// Streamlined with direct Care Assurance integration via content script proxy
// ═══════════════════════════════════════════════════════════════════════════

console.log('[CA Extension Popup] Initializing...');

// Try multiple possible URLs in order of preference
const CARE_ASSURANCE_URLS = [
  "careassurance.uk",
  "www.careassurance.uk",
  "care-assurance.onrender.com",
  "care-assurance-api.onrender.com",
  "care-assurance-web.onrender.com",
  "localhost:5000",
  "localhost:3000"
];

// Will be set after successful connection
let CARE_ASSURANCE_URL = CARE_ASSURANCE_URLS[0];

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isRetryableProxyFailure = (response) => {
  if (!response || response.ok) return false;
  if (response.needsTab) return false;
  const status = Number(response.status);
  if (Number.isFinite(status) && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }
  const errorText = String(response.error || "").toLowerCase();
  return (
    errorText.includes("timed out") ||
    errorText.includes("timeout") ||
    errorText.includes("network") ||
    errorText.includes("failed to fetch") ||
    errorText.includes("no response from background")
  );
};

// API proxy function - routes requests through content script for authentication
async function apiProxy(endpoint, method = 'GET', body = null, options = {}) {
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 45000;
  const maxRetries = Number.isInteger(options.maxRetries) ? Math.max(0, options.maxRetries) : 2;
  const retryDelayMs = typeof options.retryDelayMs === "number" ? Math.max(100, options.retryDelayMs) : 700;
  const requestId = options.requestId || createRequestId();
  console.log(`[CA Extension Popup] apiProxy: ${method} ${endpoint} via ${CARE_ASSURANCE_URL}`);
  let lastResponse = { ok: false, error: "Unknown proxy error" };

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      const backoff = retryDelayMs * (2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      const delay = Math.min(5000, backoff + jitter);
      await wait(delay);
      console.warn(`[CA Extension Popup] Retrying ${method} ${endpoint} (attempt ${attempt + 1}/${maxRetries + 1})`);
    }

    const response = await new Promise((resolve) => {
      let settled = false;
      const timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: `Request timed out after ${Math.round(timeoutMs / 1000)}s` });
      }, timeoutMs);

      chrome.runtime.sendMessage({
        type: 'CA_API_PROXY_REQUEST',
        endpoint,
        method,
        body,
        requestId,
        targetOrigin: CARE_ASSURANCE_URL
      }, (innerResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (chrome.runtime.lastError) {
          console.error('[CA Extension Popup] apiProxy error:', chrome.runtime.lastError.message);
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        console.log(`[CA Extension Popup] apiProxy response:`, innerResponse);
        resolve(innerResponse || { ok: false, error: 'No response from background' });
      });
    });

    lastResponse = response;
    if (!isRetryableProxyFailure(response) || attempt >= maxRetries) {
      return response;
    }
  }

  return lastResponse;
}

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
  verificationFields: "caAcpVerificationFields",
  runtimeMetrics: "caAcpRuntimeMetrics",
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

// GDPR: Auto-cleanup stale PII data after 2 hours
const DATA_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const DATA_TIMESTAMP_KEY = "caAcpDataTimestamp";

async function autoCleanupStaleData() {
  try {
    const stored = await loadStorage([DATA_TIMESTAMP_KEY, STORAGE_KEYS.payload]);
    if (!stored[STORAGE_KEYS.payload]) return; // No data to clean

    const storedAt = stored[DATA_TIMESTAMP_KEY];
    if (!storedAt || (Date.now() - storedAt) > DATA_MAX_AGE_MS) {
      console.log('[CA Extension] Auto-cleaning stale PII data (>2h old)');
      await setStorage({
        [STORAGE_KEYS.payload]: null,
        [STORAGE_KEYS.caseInfo]: null,
        [STORAGE_KEYS.queueState]: null,
        [STORAGE_KEYS.signatureData]: null,
        [STORAGE_KEYS.signatureBatchId]: null,
        [STORAGE_KEYS.uploadedDocuments]: null,
        [STORAGE_KEYS.verificationFields]: null,
        [DATA_TIMESTAMP_KEY]: null,
      });
    }
  } catch (e) {
    console.warn('[CA Extension] Auto-cleanup check failed:', e);
  }
}

// Wrap setStorage to auto-timestamp when payload is stored
const setStorageWithTimestamp = async (items) => {
  if (items[STORAGE_KEYS.payload] !== undefined && items[STORAGE_KEYS.payload] !== null) {
    items[DATA_TIMESTAMP_KEY] = Date.now();
  }
  return setStorage(items);
};

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
const autoDetectIdsButton = document.getElementById("auto-detect-ids");
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
const signatureFilename = document.getElementById("signature-filename");
const logStatus = document.getElementById("log-status");
const runtimeDiagnostics = document.getElementById("runtime-diagnostics");
const logList = document.getElementById("log-list");
const copyDiagnosticsButton = document.getElementById("copy-diagnostics");
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

const formatRuntimeTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString();
};

const formatRuntimeDuration = (startTime) => {
  if (!startTime) return "-";
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return "-";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h ${remMinutes}m`;
  }
  return `${minutes}m ${seconds}s`;
};

function renderRuntimeDiagnostics(metrics) {
  if (!runtimeDiagnostics) return;
  if (!metrics || typeof metrics !== "object") {
    runtimeDiagnostics.classList.add("empty");
    runtimeDiagnostics.textContent = "";
    return;
  }

  runtimeDiagnostics.classList.remove("empty");
  const hasError = Boolean(metrics.lastError);
  const proxySummary = `${metrics.proxySuccesses || 0}/${metrics.proxyRequests || 0} ok${(metrics.proxyFailures || 0) ? ` (${metrics.proxyFailures} failed)` : ""}`;
  const lastStatus = metrics.lastProxyStatus ?? "-";
  const lastErrorText = metrics.lastError || "None";
  runtimeDiagnostics.innerHTML = [
    `<div class="runtime-diagnostics-title">Runtime diagnostics</div>`,
    `<div class="runtime-row"><span class="runtime-key">Proxy</span><span class="runtime-value runtime-badge">${proxySummary}</span></div>`,
    `<div class="runtime-row"><span class="runtime-key">Last status</span><span class="runtime-value">${lastStatus}</span></div>`,
    `<div class="runtime-row"><span class="runtime-key">Retries / Starts / Stops</span><span class="runtime-value">${metrics.proxyRetries || 0} / ${metrics.autofillStarts || 0} / ${metrics.autofillStops || 0}</span></div>`,
    `<div class="runtime-row"><span class="runtime-key">Heartbeat</span><span class="runtime-value">${metrics.heartbeatCount || 0} • ${formatRuntimeTime(metrics.lastHeartbeatAt)}</span></div>`,
    `<div class="runtime-row"><span class="runtime-key">Activity</span><span class="runtime-value">${metrics.lastActivityType || "-"} • ${formatRuntimeTime(metrics.lastActivityAt)}</span></div>`,
    `<div class="runtime-row"><span class="runtime-key">Uptime</span><span class="runtime-value">${formatRuntimeDuration(metrics.workerStartedAt)}</span></div>`,
    `<div class="runtime-row"><span class="runtime-key">Request ID</span><span class="runtime-value muted">${metrics.lastRequestId || "-"}</span></div>`,
    `<div class="runtime-row"><span class="runtime-key">Target</span><span class="runtime-value muted">${metrics.lastTargetOrigin || "-"}</span></div>`,
    `<div class="runtime-row"><span class="runtime-key">Updated</span><span class="runtime-value muted">${formatRuntimeTime(metrics.lastUpdatedAt)}</span></div>`,
    `<div class="runtime-row"><span class="runtime-key">Error</span><span class="runtime-value ${hasError ? "error" : "muted"}">${lastErrorText}</span></div>`,
  ].join("");
}

const writeToClipboard = async (value) => {
  const text = typeof value === "string" ? value : String(value || "");
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "readonly");
  helper.style.position = "fixed";
  helper.style.top = "-1000px";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  document.body.removeChild(helper);
};

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
    if (connected) {
      connectStatus.className = 'status-box success';
      connectStatus.innerHTML = `<span>\u2713 Connected as ${user?.username || "user"}</span>`;
    } else {
      connectStatus.className = 'status-box';
      connectStatus.innerHTML = `<span>Not connected</span>`;
    }
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
  
  // Try to load saved URL first
  const stored = await loadStorage(['caAcpServerUrl']);
  if (stored.caAcpServerUrl) {
    CARE_ASSURANCE_URL = stored.caAcpServerUrl;
  }
  
  let lastError = null;
  let connected = false;
  
  // Try each URL in order using API proxy (via content script)
  for (const targetOrigin of [CARE_ASSURANCE_URL, ...CARE_ASSURANCE_URLS.filter(u => u !== CARE_ASSURANCE_URL)]) {
    CARE_ASSURANCE_URL = targetOrigin;
    if (connectStatus) connectStatus.innerHTML = `<span>Trying ${targetOrigin}...</span>`;
    
    try {
      const statusRes = await apiProxy('/api/extension/status');
      
      if (statusRes.ok) {
        const status = statusRes.data;
        await setStorage({ caAcpServerUrl: targetOrigin });
        updateConnectionUI(true, status.user);
        connected = true;
        
        // Fetch service users
        try {
          const usersRes = await apiProxy('/api/extension/service-users');
          if (usersRes.ok) {
            const data = usersRes.data;
            serviceUsers = data.users || [];
            await setStorage({ [STORAGE_KEYS.serviceUsers]: serviceUsers });
            displayServiceUsers();
          }
        } catch (e) {
          console.warn("Failed to fetch service users:", e);
        }
        
        // Fetch recent items
        try {
          const recentRes = await apiProxy('/api/extension/recent');
          if (recentRes.ok) {
            const data = recentRes.data;
            displayRecentItems(data);
          }
        } catch (e) {
          console.warn("Failed to fetch recent items:", e);
        }
        
        break;
      } else if (statusRes.status === 401 || statusRes.error === 'Not logged in') {
        // Server found but not logged in
        await setStorage({ caAcpServerUrl: targetOrigin });
        lastError = `Found server but not logged in. Please log in to Care Assurance in your browser first.`;
        break; // Don't try other URLs, just need to log in
      } else if (statusRes.needsTab) {
        lastError = statusRes.error;
        // Try next URL
      } else {
        lastError = `Server returned error: ${statusRes.error || 'Unknown error'}`;
      }
    } catch (error) {
      lastError = `${targetOrigin}: ${error.message}`;
      console.warn(`Connection to ${targetOrigin} failed:`, error);
    }
  }
  
  if (!connected) {
    updateConnectionUI(false);
    const errorMsg = lastError?.includes('not logged in') || lastError?.includes('No Care Assurance tab')
      ? lastError
      : "Connection failed. Please open Care Assurance in a browser tab and log in first.";
    showError(errorMsg);
    
    // Show help text
    if (connectStatus) {
      connectStatus.className = 'status-box';
      connectStatus.innerHTML = `
        <div style="font-size: 11px; line-height: 1.5;">
          <p style="margin-bottom: 6px; color: var(--color-error);">${errorMsg}</p>
          <p style="margin-bottom: 4px; font-weight: 600;">Steps to connect:</p>
          <ol style="padding-left: 16px; margin: 0; font-size: 10px; color: var(--color-muted-foreground);">
            <li>Open careassurance.uk in a browser tab</li>
            <li>Log in to your account</li>
            <li>Click Connect again</li>
          </ol>
        </div>
      `;
    }
  }
  
  if (connectBtn) connectBtn.disabled = false;
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
    const res = await apiProxy(`/api/extension/care-plan/${selectedUser.id}`);
    if (!res.ok) throw new Error(res.error || "Failed to load care plan");
    
    const payload = res.data;
    await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: payload });
    
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
    const res = await apiProxy(`/api/extension/risk-assessment/${selectedUser.riskAssessmentId}`);
    if (!res.ok) throw new Error(res.error || "Failed to load risk assessment");
    
    const payload = res.data;
    await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: payload });
    
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
      ? `/api/extension/care-plan/${id}`
      : `/api/extension/risk-assessment/${id}`;
    
    const res = await apiProxy(endpoint);
    if (!res.ok) throw new Error(res.error || "Failed to load");
    
    const payload = res.data;
    await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: payload });
    
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

    const response = await apiProxy(
      "/api/ai/analyze-risks",
      "POST",
      { documentContent: content, allowSensitive: false },
      { timeoutMs: 180000 }
    );
    if (!response?.ok) {
      throw new Error(response?.error || "Analysis failed");
    }

    const result = response.data || response.result;
    if (!result) {
      throw new Error("No analysis result returned");
    }
    currentAnalysisResults = result;
    displayAnalysisResults(result);
    switchTab("autofill");
  } catch (error) {
    showError(error.message);
  } finally {
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
  
  await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: payload });
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
    STORAGE_KEYS.verificationFields, STORAGE_KEYS.runtimeMetrics
  ]);
  
  const payload = data.caAcpPayload;
  const verificationFields = data.caAcpVerificationFields || [];
  
  if (payloadStatus) {
    let statusHTML = '';
    if (payload?.formType === "initialAssessment") {
      payloadStatus.className = 'status-box success';
      statusHTML = '<span>\u2713 Care Plan ready for Initial Assessment</span>';
    } else if (payload?.formType === "acp" && payload?.assessments?.length) {
      payloadStatus.className = 'status-box success';
      statusHTML = `<span>\u2713 ${payload.assessments.length} assessment(s) ready</span>`;
    } else {
      payloadStatus.className = 'status-box';
      statusHTML = '<span>No data loaded</span>';
    }
    
    // Add verification status if there are fields to verify
    if (verificationFields.length > 0) {
      const missingCount = verificationFields.filter(f => f.reason === 'missing').length;
      const ambiguousCount = verificationFields.filter(f => f.reason === 'ambiguous').length;
      statusHTML += `
        <div class="verification-panel">
          <div class="verification-header">
            <strong>${verificationFields.length} field(s) need verification</strong>
          </div>
          <div class="verification-detail">
            ${missingCount > 0 ? `${missingCount} missing` : ''}
            ${missingCount > 0 && ambiguousCount > 0 ? ' \u2022 ' : ''}
            ${ambiguousCount > 0 ? `${ambiguousCount} ambiguous` : ''}
          </div>
          <div class="verification-nav">
            <button id="nav-prev-field" class="btn btn-sm btn-secondary">\u2190 Prev</button>
            <button id="nav-next-field" class="btn btn-sm btn-primary">Next \u2192</button>
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

  renderRuntimeDiagnostics(data[STORAGE_KEYS.runtimeMetrics]);
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

// Auto-detect case ID and service data group from active tab URL
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
      if (caseIdInput) caseIdInput.value = caseId;
      if (serviceDataGroupInput) serviceDataGroupInput.value = serviceDataGroupId;
      
      // Also save to storage
      await setStorage({
        [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId }
      });
      
      showSuccess(`Detected: Case ID ${caseId}, Service Data Group ${serviceDataGroupId}`);
      return { detected: true, caseId, serviceDataGroupId };
    } else if (caseId || serviceDataGroupId) {
      if (caseId && caseIdInput) caseIdInput.value = caseId;
      if (serviceDataGroupId && serviceDataGroupInput) serviceDataGroupInput.value = serviceDataGroupId;
      showSuccess(`Partial detection: ${caseId ? 'Case ID' : 'Service Data Group'} found`);
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

autoDetectIdsButton?.addEventListener("click", autoDetectIds);

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
  // Clear ALL sensitive data including signatures and uploaded documents
  await setStorage({
    [STORAGE_KEYS.payload]: null,
    [STORAGE_KEYS.caseInfo]: null,
    [STORAGE_KEYS.queueState]: null,
    [STORAGE_KEYS.signatureData]: null,
    [STORAGE_KEYS.signatureBatchId]: null,
    [STORAGE_KEYS.uploadedDocuments]: null,
    [STORAGE_KEYS.verificationFields]: null,
  });
  refreshPayloadStatus();
  if (progressStatus) progressStatus.textContent = "Cleared";
});

clearLogsButton?.addEventListener("click", async () => {
  await setStorage({
    [STORAGE_KEYS.logs]: [],
    [STORAGE_KEYS.runtimeMetrics]: null,
  });
  if (logList) logList.textContent = "";
  if (logStatus) logStatus.textContent = "No actions.";
  renderRuntimeDiagnostics(null);
});

copyDiagnosticsButton?.addEventListener("click", async () => {
  try {
    const data = await loadStorage([
      STORAGE_KEYS.runtimeMetrics,
      STORAGE_KEYS.lastError,
      STORAGE_KEYS.caseInfo,
      STORAGE_KEYS.queueState,
      STORAGE_KEYS.logs,
      STORAGE_KEYS.payload,
    ]);

    const logs = Array.isArray(data[STORAGE_KEYS.logs]) ? data[STORAGE_KEYS.logs].slice(-20) : [];
    const payloadType = data?.[STORAGE_KEYS.payload]?.formType || null;
    const diagnostics = {
      capturedAt: new Date().toISOString(),
      requestId: createRequestId(),
      targetOrigin: CARE_ASSURANCE_URL,
      connected: isConnected,
      payloadType,
      caseInfo: data[STORAGE_KEYS.caseInfo] || null,
      queueState: data[STORAGE_KEYS.queueState] || null,
      lastError: data[STORAGE_KEYS.lastError] || null,
      runtimeMetrics: data[STORAGE_KEYS.runtimeMetrics] || null,
      recentLogTail: logs,
    };

    await writeToClipboard(JSON.stringify(diagnostics, null, 2));
    if (logStatus) {
      logStatus.textContent = `Diagnostics copied (${logs.length} logs)`;
    }
    showSuccess("Diagnostics copied to clipboard");
  } catch (error) {
    console.error("Failed to copy diagnostics:", error);
    showError("Could not copy diagnostics. Try again.");
  }
});

signatureInput?.addEventListener("change", async () => {
  const file = signatureInput.files?.[0];
  if (signatureFilename) {
    signatureFilename.textContent = file ? file.name : "";
  }
  
  // Auto-upload when file is selected
  if (!file) return;
  
  // Validate file type
  if (!file.type.startsWith("image/")) {
    showError("Please select an image file (PNG, JPG, etc.)");
    if (signatureInput) signatureInput.value = "";
    if (signatureFilename) signatureFilename.textContent = "";
    return;
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    showError("Signature file is too large. Maximum size is 5MB");
    if (signatureInput) signatureInput.value = "";
    if (signatureFilename) signatureFilename.textContent = "";
    return;
  }

  try {
    // Convert file to data URL
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Get current batch ID if exists
    const stored = await loadStorage([STORAGE_KEYS.queueState]);
    const batchId = stored?.caAcpQueueState?.batchId || null;

    // Store signature data
    await setStorage({
      [STORAGE_KEYS.signatureData]: {
        dataUrl,
        fileName: file.name,
        mimeType: file.type,
        uploadedAt: new Date().toISOString()
      },
      [STORAGE_KEYS.signatureBatchId]: batchId
    });

    // Update UI
    await refreshSignatureStatus();

    showSuccess("Signature uploaded successfully!");
    
    // Clear file input
    if (signatureInput) signatureInput.value = "";
    if (signatureFilename) signatureFilename.textContent = "";
  } catch (error) {
    console.error("Signature upload error:", error);
    showError("Failed to upload signature. Please try again.");
    if (signatureInput) signatureInput.value = "";
    if (signatureFilename) signatureFilename.textContent = "";
  }
});

// Upload signature button opens file picker
uploadSignatureButton?.addEventListener("click", () => {
  signatureInput?.click();
});

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function showError(message) {
  if (errorBanner) {
    const messageEl = document.getElementById('error-message');
    if (messageEl) messageEl.textContent = message;
    else errorBanner.textContent = message;
    errorBanner.hidden = false;
    // Auto-dismiss after 8 seconds but user can dismiss earlier
    clearTimeout(errorBanner._dismissTimer);
    errorBanner._dismissTimer = setTimeout(() => { errorBanner.hidden = true; }, 8000);
  }
}

function showSuccess(message) {
  // Show toast notification
  const existing = document.querySelector('.toast-success');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast-success';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
  // Also update progress status
  if (progressStatus) progressStatus.textContent = message;
}

// Error dismiss button
const errorDismissBtn = document.getElementById('error-dismiss');
errorDismissBtn?.addEventListener('click', () => {
  if (errorBanner) {
    errorBanner.hidden = true;
    clearTimeout(errorBanner._dismissTimer);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURE STATUS
// ═══════════════════════════════════════════════════════════════════════════

async function refreshSignatureStatus() {
  const data = await loadStorage([STORAGE_KEYS.signatureData]);
  const signatureData = data.caAcpSignatureData;
  
  if (signatureStatus) {
    if (signatureData?.dataUrl) {
      signatureStatus.className = 'status-box success';
      const uploadDate = signatureData.uploadedAt 
        ? new Date(signatureData.uploadedAt).toLocaleString() 
        : '';
      signatureStatus.innerHTML = `
        <span>✓ ${signatureData.fileName || 'Signature uploaded'}</span>
        ${uploadDate ? `<small style="display: block; opacity: 0.7; font-size: 10px;">${uploadDate}</small>` : ''}
        <button id="clear-signature-btn" class="btn btn-ghost btn-sm" style="margin-top: 4px;">Clear Signature</button>
      `;
      
      // Add event listener for clear button
      const clearBtn = document.getElementById('clear-signature-btn');
      clearBtn?.addEventListener('click', async () => {
        await setStorage({
          [STORAGE_KEYS.signatureData]: null,
          [STORAGE_KEYS.signatureBatchId]: null
        });
        await refreshSignatureStatus();
        showSuccess("Signature cleared");
      });
    } else {
      signatureStatus.className = 'status-box';
      signatureStatus.innerHTML = '<span>No signature uploaded</span>';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

(async function init() {
  // GDPR: Auto-clean stale data before loading state
  await autoCleanupStaleData();
  
  await refreshPayloadStatus();
  await refreshSignatureStatus();
  
  // Load saved server URL
  const stored = await loadStorage(['caAcpServerUrl']);
  if (stored.caAcpServerUrl) {
    CARE_ASSURANCE_URL = stored.caAcpServerUrl;
  }
  
  // Auto-detect case ID and service data group from URL if on risk assessment page
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const url = new URL(tab.url);
      // Check if on Additional Risk Assessments form
      if (url.pathname.includes('new_case_form') || url.pathname.includes('edit_case_form')) {
        const caseId = url.searchParams.get('caseId');
        const serviceDataGroupId = url.searchParams.get('serviceDataGroupId');
        
        // Only auto-populate if both exist and fields are empty
        if (caseId && serviceDataGroupId) {
          const hasExistingValues = caseIdInput?.value || serviceDataGroupInput?.value;
          if (!hasExistingValues) {
            if (caseIdInput) caseIdInput.value = caseId;
            if (serviceDataGroupInput) serviceDataGroupInput.value = serviceDataGroupId;
            
            // Save to storage
            await setStorage({
              [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId }
            });
            
            console.log('[Popup] Auto-detected from URL:', { caseId, serviceDataGroupId });
          }
        }
      }
    }
  } catch (error) {
    console.log('[Popup] Auto-detect on init failed:', error);
  }
  
  // Try quick connection check using API proxy
  if (connectStatus) {
    connectStatus.innerHTML = `<span style="font-size: 11px;">Checking connection...</span>`;
  }
  
  try {
    const res = await apiProxy('/api/extension/status');
    
    if (res.ok) {
      const status = res.data;
      updateConnectionUI(true, status.user);
      // Do full refresh in background
      connectToCareAssurance();
    } else if (res.needsTab) {
      updateConnectionUI(false);
      if (connectStatus) {
        connectStatus.innerHTML = `<span style="font-size: 11px;">Open Care Assurance in a tab, then click Connect</span>`;
      }
    } else {
      updateConnectionUI(false);
      if (connectStatus) {
        connectStatus.innerHTML = `<span style="font-size: 11px;">Click "Connect" to find server</span>`;
      }
    }
  } catch (e) {
    updateConnectionUI(false);
    if (connectStatus) {
      connectStatus.innerHTML = `<span style="font-size: 11px;">Click "Connect" to find server</span>`;
    }
  }
  
  // Check if we have a payload
  const { caAcpPayload } = await loadStorage([STORAGE_KEYS.payload]);
  if (caAcpPayload) {
    switchTab("autofill");
  }
  
  setInterval(refreshPayloadStatus, 3000);
})();
