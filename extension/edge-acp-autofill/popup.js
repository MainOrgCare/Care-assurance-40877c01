// ═══════════════════════════════════════════════════════════════════════════
// CARE ASSURANCE ACP AUTOFILL - POPUP SCRIPT v0.2.5
// Professional UI matching Care Assurance website design
// Tab-based layout: Upload Documents | Send to ACP
// ═══════════════════════════════════════════════════════════════════════════

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
};

const FALLBACK_MESSAGE_TYPES = {
  startAutofill: "CA_EXTENSION_START_AUTOFILL",
  stopAutofill: "CA_EXTENSION_STOP_AUTOFILL",
  clearError: "CA_EXTENSION_CLEAR_ERROR",
  analyzeRisks: "CA_EXTENSION_ANALYZE_RISKS",
  sendToApp: "CA_EXTENSION_SEND_TO_APP",
};

const { STORAGE_KEYS, MESSAGE_TYPES } = window.CA_EXTENSION_CONSTANTS || {
  STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
  MESSAGE_TYPES: FALLBACK_MESSAGE_TYPES,
};

const loadStorage = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

const setStorage = (items) =>
  new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));

// ═══════════════════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════

// Tab navigation
const tabUploadBtn = document.getElementById("tab-upload");
const tabSendBtn = document.getElementById("tab-send");
const tabContentUpload = document.getElementById("tab-content-upload");
const tabContentSend = document.getElementById("tab-content-send");

// Upload tab elements
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

// Send tab - Selection section
const selectionSection = document.getElementById("selection-section");
const serviceUserSummary = document.getElementById("service-user-summary");
const assessmentList = document.getElementById("assessment-list");
const selectionCount = document.getElementById("selection-count");
const selectAllBtn = document.getElementById("select-all-btn");
const clearSelectionBtn = document.getElementById("clear-selection-btn");
const additionalNotes = document.getElementById("additional-notes");
const proceedWithSelection = document.getElementById("proceed-with-selection");

// Send tab - Ready section
const readySection = document.getElementById("ready-section");
const payloadStatus = document.getElementById("payload-status");
const caseIdInput = document.getElementById("case-id");
const serviceDataGroupInput = document.getElementById("service-data-group-id");
const autoSubmitToggle = document.getElementById("auto-submit");
const dryRunToggle = document.getElementById("dry-run");
const interactionModeSelect = document.getElementById("interaction-mode");
const progressStatus = document.getElementById("progress-status");
const startButton = document.getElementById("start-autofill");
const stopButton = document.getElementById("stop-autofill");
const clearButton = document.getElementById("clear-data");

// Other elements
const errorBanner = document.getElementById("error-banner");
const signatureInput = document.getElementById("signature-file");
const uploadSignatureButton = document.getElementById("upload-signature");
const signatureStatus = document.getElementById("signature-status");
const logStatus = document.getElementById("log-status");
const logList = document.getElementById("log-list");
const clearLogsButton = document.getElementById("clear-logs");

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

let currentAnalysisResults = null;
let selectedFilesList = [];
let lastAutoFilledCaseInfo = { caseId: "", serviceDataGroupId: "" };
let uploadedDocuments = []; // { type, name, size, timestamp, content }

// Document type labels
const DOCUMENT_TYPE_LABELS = {
  socialWork: "Social Work Document",
  initialAssessment: "Initial Assessment",
  carePlan: "Care Plan",
  movingHandling: "Moving & Handling",
  otherDocuments: "Other Documents",
};

const DOCUMENT_TYPE_COLORS = {
  socialWork: "blue",
  initialAssessment: "violet",
  carePlan: "amber",
  movingHandling: "sky",
  otherDocuments: "indigo",
};

// ═══════════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

function switchTab(tabName) {
  // Update tab buttons
  if (tabUploadBtn) tabUploadBtn.classList.toggle("active", tabName === "upload");
  if (tabSendBtn) tabSendBtn.classList.toggle("active", tabName === "send");
  
  // Update tab content
  if (tabContentUpload) tabContentUpload.classList.toggle("active", tabName === "upload");
  if (tabContentSend) tabContentSend.classList.toggle("active", tabName === "send");
}

if (tabUploadBtn) tabUploadBtn.addEventListener("click", () => switchTab("upload"));
if (tabSendBtn) tabSendBtn.addEventListener("click", () => switchTab("send"));

// ═══════════════════════════════════════════════════════════════════════════
// FILE UPLOAD HANDLING
// ═══════════════════════════════════════════════════════════════════════════

if (documentFilesInput) {
  documentFilesInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    selectedFilesList = files;
    displayFileList();
    if (analyzeButton) analyzeButton.disabled = files.length === 0;
  });
}

function displayFileList() {
  if (!fileListContainer) return;
  
  if (selectedFilesList.length === 0) {
    fileListContainer.innerHTML = "";
    return;
  }

  fileListContainer.innerHTML = selectedFilesList.map((file, index) => `
    <div class="file-item">
      <span class="file-item-name" title="${file.name}">${file.name}</span>
      <button class="file-item-remove" data-index="${index}" title="Remove file">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  `).join("");

  // Add remove button handlers
  document.querySelectorAll(".file-item-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.currentTarget.getAttribute("data-index"), 10);
      selectedFilesList.splice(index, 1);
      
      // Update input files (create new FileList)
      const dt = new DataTransfer();
      selectedFilesList.forEach(file => dt.items.add(file));
      documentFilesInput.files = dt.files;
      
      displayFileList();
      if (analyzeButton) analyzeButton.disabled = selectedFilesList.length === 0;
    });
  });
}

// Get selected document type
function getSelectedDocumentType() {
  const selected = document.querySelector('input[name="document-type"]:checked');
  return selected ? selected.value : "otherDocuments";
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOADED DOCUMENTS DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

async function loadUploadedDocuments() {
  const data = await loadStorage([STORAGE_KEYS.uploadedDocuments || "caAcpUploadedDocuments"]);
  uploadedDocuments = data.caAcpUploadedDocuments || [];
  displayUploadedDocuments();
}

function displayUploadedDocuments() {
  if (!uploadedDocsSection || !uploadedDocsList) return;
  
  if (uploadedDocuments.length === 0) {
    uploadedDocsSection.hidden = true;
    return;
  }
  
  uploadedDocsSection.hidden = false;
  uploadedDocsList.innerHTML = uploadedDocuments.map((doc, index) => `
    <div class="uploaded-doc-item">
      <div class="uploaded-doc-icon doc-icon ${DOCUMENT_TYPE_COLORS[doc.type] || 'indigo'}">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
      </div>
      <div class="uploaded-doc-info">
        <div class="uploaded-doc-name">${doc.name}</div>
        <div class="uploaded-doc-type">${DOCUMENT_TYPE_LABELS[doc.type] || doc.type}</div>
      </div>
      <button class="uploaded-doc-remove" data-index="${index}" title="Remove">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  `).join("");
  
  // Add remove handlers
  document.querySelectorAll(".uploaded-doc-remove").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const index = parseInt(e.currentTarget.getAttribute("data-index"), 10);
      uploadedDocuments.splice(index, 1);
      await setStorage({ [STORAGE_KEYS.uploadedDocuments || "caAcpUploadedDocuments"]: uploadedDocuments });
      displayUploadedDocuments();
      updateAnalyzeButtonState();
    });
  });
}

if (clearUploadsBtn) {
  clearUploadsBtn.addEventListener("click", async () => {
    uploadedDocuments = [];
    await setStorage({ [STORAGE_KEYS.uploadedDocuments || "caAcpUploadedDocuments"]: [] });
    displayUploadedDocuments();
    updateAnalyzeButtonState();
  });
}

function updateAnalyzeButtonState() {
  if (analyzeButton) {
    analyzeButton.disabled = selectedFilesList.length === 0 && uploadedDocuments.length === 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};

const readFileAsDataURL = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
};

const getAuthToken = async () => {
  try {
    const cookies = await chrome.cookies.getAll({ domain: "careassurance.uk" });
    const sessionCookie = cookies.find(c => c.name && c.name.includes("session"));
    
    if (!sessionCookie) {
      throw new Error("Not logged in. Please log in to Care Assurance first.");
    }
    
    return sessionCookie.value;
  } catch (error) {
    throw error;
  }
};

const analyzeDocuments = async (files) => {
  if ((!files || files.length === 0) && uploadedDocuments.length === 0) {
    throw new Error("Please select at least one file to analyze");
  }

  if (analysisStatus) analysisStatus.textContent = "Reading files...";
  if (analysisProgress) analysisProgress.hidden = false;
  if (analysisProgressFill) analysisProgressFill.style.width = "5%";

  // Get the selected document type
  const docType = getSelectedDocumentType();
  
  // Read new files and add to uploaded documents
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (analysisStatus) analysisStatus.textContent = `Reading ${file.name}...`;
    
    try {
      let content = "";
      if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        content = await readFileAsText(file);
      } else if (file.type.startsWith("image/")) {
        const dataUrl = await readFileAsDataURL(file);
        content = `[Image: ${file.name}]\nData URL: ${dataUrl.substring(0, 100)}...`;
      } else {
        content = `[Binary file: ${file.name} (${file.type})]`;
      }
      
      uploadedDocuments.push({
        type: docType,
        name: file.name,
        size: file.size,
        timestamp: Date.now(),
        content: content,
      });
    } catch (error) {
      console.warn(`Failed to read ${file.name}:`, error);
    }
  }
  
  // Save uploaded documents
  await setStorage({ [STORAGE_KEYS.uploadedDocuments || "caAcpUploadedDocuments"]: uploadedDocuments });
  displayUploadedDocuments();

  // Combine all document content
  let combinedContent = "";
  for (const doc of uploadedDocuments) {
    combinedContent += `\n\n=== ${DOCUMENT_TYPE_LABELS[doc.type] || doc.type}: ${doc.name} ===\n${doc.content}`;
  }

  if (!combinedContent.trim()) {
    throw new Error("No readable content found in uploaded files");
  }

  if (analysisStatus) analysisStatus.textContent = "Connecting to Care Assurance AI...";
  if (analysisProgressFill) analysisProgressFill.style.width = "10%";

  // Get auth token
  const authToken = await getAuthToken();

  // Send to background script for processing
  return new Promise((resolve, reject) => {
    let progressTimer;
    
    // Simulate progress updates
    let currentProgress = 10;
    progressTimer = setInterval(() => {
      if (currentProgress < 90) {
        currentProgress += 10;
        if (analysisProgressFill) analysisProgressFill.style.width = `${currentProgress}%`;
        const messages = [
          "Analyzing documents...",
          "Extracting service user profile...",
          "Identifying medical conditions...",
          "Mapping care activities...",
          "Matching risk assessments...",
          "Gathering evidence...",
          "Finalizing recommendations..."
        ];
        const msgIndex = Math.floor(currentProgress / 15) % messages.length;
        if (progressDetails) progressDetails.textContent = messages[msgIndex];
      }
    }, 1500);

    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.analyzeRisks || "CA_EXTENSION_ANALYZE_RISKS",
        documentContent: combinedContent,
        authToken: authToken
      },
      (response) => {
        clearInterval(progressTimer);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Analysis failed"));
          return;
        }
        
        if (analysisProgressFill) analysisProgressFill.style.width = "100%";
        if (progressDetails) progressDetails.textContent = "Analysis complete!";
        resolve(response.result);
      }
    );
  });
};

if (analyzeButton) {
  analyzeButton.addEventListener("click", async () => {
    if (selectedFilesList.length === 0 && uploadedDocuments.length === 0) {
      if (analysisStatus) analysisStatus.textContent = "Please select at least one file to analyze.";
      return;
    }

    try {
      analyzeButton.disabled = true;
      if (analysisStatus) analysisStatus.textContent = "Starting analysis...";
      
      const results = await analyzeDocuments(selectedFilesList);
      currentAnalysisResults = results;
      
      // Clear file selection
      selectedFilesList = [];
      if (documentFilesInput) documentFilesInput.value = "";
      if (fileListContainer) fileListContainer.innerHTML = "";
      
      displayAnalysisResults(results);
      
      // Switch to Send tab and show results
      switchTab("send");
      
    } catch (error) {
      console.error("Analysis error:", error);
      if (analysisStatus) analysisStatus.textContent = `Error: ${error.message}`;
      if (analysisProgress) analysisProgress.hidden = true;
      showError(error.message);
    } finally {
      analyzeButton.disabled = false;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPLAY ANALYSIS RESULTS
// ═══════════════════════════════════════════════════════════════════════════

function displayAnalysisResults(results) {
  if (!serviceUserSummary || !assessmentList) return;
  
  // Display service user summary
  const serviceUser = results.serviceUser || {};
  const summaryParts = [
    `<div><strong>Service User:</strong> ${serviceUser.initials || "N/A"}</div>`
  ];
  
  if (results.documentSummary) {
    summaryParts.push(`<div style="margin-top: 10px;"><strong>Summary:</strong> ${results.documentSummary}</div>`);
  }
  
  if (results.medicalConditions && results.medicalConditions.length > 0) {
    summaryParts.push(`<div style="margin-top: 8px;"><strong>Medical Conditions:</strong> ${results.medicalConditions.join(", ")}</div>`);
  }
  
  if (results.careActivities && results.careActivities.length > 0) {
    summaryParts.push(`<div style="margin-top: 8px;"><strong>Care Activities:</strong> ${results.careActivities.join(", ")}</div>`);
  }
  
  serviceUserSummary.innerHTML = summaryParts.join("");

  // Display recommended assessments
  const assessments = results.recommendedAssessments || [];
  
  if (assessments.length === 0) {
    assessmentList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-muted-foreground);">No assessments recommended</div>';
    if (selectionCount) selectionCount.textContent = "0 selected";
  } else {
    assessmentList.innerHTML = assessments.map((assessment, index) => `
      <div class="assessment-item" data-index="${index}">
        <div class="assessment-item-header">
          <input type="checkbox" class="assessment-checkbox" data-index="${index}" checked />
          <div class="assessment-content">
            <div class="assessment-name">${assessment.name || "Unknown Assessment"}</div>
            ${assessment.reason ? `<div class="assessment-reason">${assessment.reason}</div>` : ""}
            ${assessment.evidence ? `<div class="assessment-evidence"><strong>Evidence:</strong> ${assessment.evidence}</div>` : ""}
          </div>
        </div>
      </div>
    `).join("");

    // Add checkbox event listeners
    updateSelectionCount();
    
    document.querySelectorAll(".assessment-checkbox").forEach(checkbox => {
      checkbox.addEventListener("change", (e) => {
        const item = e.target.closest(".assessment-item");
        if (e.target.checked) {
          item.classList.add("selected");
        } else {
          item.classList.remove("selected");
        }
        updateSelectionCount();
      });
      
      // Initialize selected state
      if (checkbox.checked) {
        checkbox.closest(".assessment-item").classList.add("selected");
      }
    });
  }
}

function updateSelectionCount() {
  const checkedCount = document.querySelectorAll(".assessment-checkbox:checked").length;
  if (selectionCount) selectionCount.textContent = `${checkedCount} selected`;
}

// Selection toolbar buttons
if (selectAllBtn) {
  selectAllBtn.addEventListener("click", () => {
    document.querySelectorAll(".assessment-checkbox").forEach(checkbox => {
      checkbox.checked = true;
      checkbox.closest(".assessment-item").classList.add("selected");
    });
    updateSelectionCount();
  });
}

if (clearSelectionBtn) {
  clearSelectionBtn.addEventListener("click", () => {
    document.querySelectorAll(".assessment-checkbox").forEach(checkbox => {
      checkbox.checked = false;
      checkbox.closest(".assessment-item").classList.remove("selected");
    });
    updateSelectionCount();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE ASSESSMENTS (PREPARE PAYLOAD)
// ═══════════════════════════════════════════════════════════════════════════

if (proceedWithSelection) {
  proceedWithSelection.addEventListener("click", async () => {
    if (!currentAnalysisResults) {
      showError("No analysis results available. Please analyze documents first.");
      return;
    }

    // Get selected assessments
    const checkboxes = document.querySelectorAll(".assessment-checkbox:checked");
    const selectedAssessments = Array.from(checkboxes).map(checkbox => {
      const index = parseInt(checkbox.getAttribute("data-index"), 10);
      return currentAnalysisResults.recommendedAssessments[index];
    }).filter(Boolean);

    if (selectedAssessments.length === 0) {
      showError("Please select at least one assessment to proceed.");
      return;
    }

    // Get additional notes
    const notes = additionalNotes?.value || "";

    // Convert analysis results to ACP payload format
    const payload = {
      formType: "acp",
      assessments: selectedAssessments.map(assessment => ({
        assessmentType: assessment.name,
        riskLevel: "To be determined",
        findings: assessment.evidence || assessment.reason || "",
        recommendations: assessment.reason || "",
        evidence: (assessment.evidenceSnippets || []).join(" | "),
        additionalNotes: notes
      }))
    };

    // Store payload
    await setStorage({ [STORAGE_KEYS.payload]: payload });

    // Clear selection state
    currentAnalysisResults = null;
    if (additionalNotes) additionalNotes.value = "";

    // Refresh and scroll to ready section
    await refreshPayloadStatus();
    
    // Show success message
    if (progressStatus) progressStatus.textContent = `Ready: ${payload.assessments.length} assessment(s) prepared.`;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// READY SECTION - AUTOFILL
// ═══════════════════════════════════════════════════════════════════════════

const maybeAutofillCaseInfoFromActiveTab = async () => {
  if (!caseIdInput || !serviceDataGroupInput) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const url = new URL(tab.url);
    if (!url.pathname.includes("case_data_group")) return;
    const caseId = (url.searchParams.get("caseId") || "").trim();
    const serviceDataGroupId = (url.searchParams.get("serviceDataGroupId") || "").trim();
    if (!caseId || !serviceDataGroupId) return;

    const existingCaseId = caseIdInput.value.trim();
    const existingServiceDataGroupId = serviceDataGroupInput.value.trim();
    const shouldSetCaseId = !existingCaseId;
    const shouldSetServiceDataGroupId = !existingServiceDataGroupId;

    if (!shouldSetCaseId && !shouldSetServiceDataGroupId) return;
    if (caseId === lastAutoFilledCaseInfo.caseId && serviceDataGroupId === lastAutoFilledCaseInfo.serviceDataGroupId) {
      return;
    }

    if (shouldSetCaseId) caseIdInput.value = caseId;
    if (shouldSetServiceDataGroupId) serviceDataGroupInput.value = serviceDataGroupId;

    lastAutoFilledCaseInfo = { caseId, serviceDataGroupId };

    await setStorage({
      [STORAGE_KEYS.caseInfo]: {
        caseId: caseIdInput.value.trim(),
        serviceDataGroupId: serviceDataGroupInput.value.trim(),
      },
    });
  } catch (error) {
    console.warn("Failed to auto-fill case info from URL", error);
  }
};

const refreshPayloadStatus = async () => {
  const {
    caAcpPayload,
    caAcpCaseInfo,
    caAcpAutoSubmit,
    caAcpDryRun,
    caAcpLogs,
    caAcpInteractionMode,
    caAcpQueueState,
    caAcpLastError,
  } = await loadStorage([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.caseInfo,
    STORAGE_KEYS.autoSubmit,
    STORAGE_KEYS.dryRun,
    STORAGE_KEYS.logs,
    STORAGE_KEYS.interactionMode,
    STORAGE_KEYS.queueState,
    STORAGE_KEYS.lastError,
  ]);

  if (payloadStatus) {
    const statusSpan = payloadStatus.querySelector("span");
    if (statusSpan) {
      if (caAcpPayload && Array.isArray(caAcpPayload.assessments)) {
        statusSpan.textContent = `Ready: ${caAcpPayload.assessments.length} assessment(s)`;
      } else if (caAcpPayload && caAcpPayload.formType === "emar") {
        statusSpan.textContent = "Ready: EMAR audit";
      } else if (caAcpPayload && caAcpPayload.formType === "initialAssessment") {
        statusSpan.textContent = "Ready: Initial Assessment";
      } else if (caAcpPayload && caAcpPayload.formType === "custom") {
        statusSpan.textContent = "Ready: Custom document";
      } else {
        statusSpan.textContent = "Waiting for data...";
      }
    }
  }

  if (caAcpCaseInfo) {
    if (caseIdInput) caseIdInput.value = caAcpCaseInfo.caseId || "";
    if (serviceDataGroupInput) serviceDataGroupInput.value = caAcpCaseInfo.serviceDataGroupId || "";
  }

  if (autoSubmitToggle) {
    autoSubmitToggle.checked = caAcpAutoSubmit !== false;
  }

  if (dryRunToggle) {
    dryRunToggle.checked = caAcpDryRun === true;
  }

  if (interactionModeSelect) {
    interactionModeSelect.value = caAcpInteractionMode || "auto";
  }

  if (logList && logStatus) {
    const logs = Array.isArray(caAcpLogs) ? caAcpLogs : [];
    logList.textContent = logs.join("\n");
    logStatus.textContent = logs.length > 0 ? `Entries: ${logs.length}` : "No actions yet.";
  }

  if (progressStatus) {
    if (caAcpQueueState && typeof caAcpQueueState.currentIndex === "number") {
      progressStatus.textContent = `Progress: ${caAcpQueueState.currentIndex + 1} of ${caAcpQueueState.total}`;
    }
  }

  if (caAcpLastError) {
    showError(caAcpLastError);
  }

  await maybeAutofillCaseInfoFromActiveTab();
};

if (startButton) {
  startButton.addEventListener("click", async () => {
    const caseId = caseIdInput ? caseIdInput.value.trim() : "";
    const serviceDataGroupId = serviceDataGroupInput ? serviceDataGroupInput.value.trim() : "";
    const autoSubmit = autoSubmitToggle ? autoSubmitToggle.checked : true;
    const dryRun = dryRunToggle ? dryRunToggle.checked : false;
    const interactionMode = interactionModeSelect ? interactionModeSelect.value : "auto";

    if (!caseId || !serviceDataGroupId) {
      if (progressStatus) progressStatus.textContent = "Enter both Case ID and Service Data Group ID.";
      return;
    }

    await setStorage({
      [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
      [STORAGE_KEYS.autoSubmit]: autoSubmit,
      [STORAGE_KEYS.dryRun]: dryRun,
      [STORAGE_KEYS.interactionMode]: interactionMode,
    });

    chrome.runtime.sendMessage(
      { type: MESSAGE_TYPES.startAutofill, caseId, serviceDataGroupId },
      (response) => {
        if (chrome.runtime.lastError) {
          if (progressStatus) progressStatus.textContent = chrome.runtime.lastError.message;
          return;
        }
        if (progressStatus) {
          progressStatus.textContent = response?.ok
            ? "Autofill started."
            : response?.error || "Failed to start.";
        }
      }
    );
  });
}

if (stopButton) {
  stopButton.addEventListener("click", async () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.stopAutofill }, () => {
      if (progressStatus) progressStatus.textContent = "Autofill stopped.";
    });
  });
}

if (autoSubmitToggle) {
  autoSubmitToggle.addEventListener("change", async () => {
    await setStorage({ [STORAGE_KEYS.autoSubmit]: autoSubmitToggle.checked });
  });
}

if (dryRunToggle) {
  dryRunToggle.addEventListener("change", async () => {
    await setStorage({ [STORAGE_KEYS.dryRun]: dryRunToggle.checked });
  });
}

if (interactionModeSelect) {
  interactionModeSelect.addEventListener("change", async () => {
    await setStorage({ [STORAGE_KEYS.interactionMode]: interactionModeSelect.value });
  });
}

if (clearButton) {
  clearButton.addEventListener("click", async () => {
    await setStorage({
      [STORAGE_KEYS.payload]: null,
      [STORAGE_KEYS.caseInfo]: null,
      [STORAGE_KEYS.queueState]: null,
      [STORAGE_KEYS.lastError]: null,
      [STORAGE_KEYS.signatureData]: null,
      [STORAGE_KEYS.signatureBatchId]: null,
    });
    if (progressStatus) progressStatus.textContent = "Cleared stored data.";
    await refreshPayloadStatus();
  });
}

if (clearLogsButton) {
  clearLogsButton.addEventListener("click", async () => {
    await setStorage({ [STORAGE_KEYS.logs]: [] });
    await refreshPayloadStatus();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURE UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

const sendSignatureToActiveTab = async (file) => {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  const { caAcpQueueState } = await loadStorage([STORAGE_KEYS.queueState]);
  const signatureBatchId = caAcpQueueState?.batchId || null;

  await setStorage({
    [STORAGE_KEYS.signatureData]: {
      dataUrl,
      fileName: file.name,
      mimeType: file.type,
    },
    [STORAGE_KEYS.signatureBatchId]: signatureBatchId,
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: "CA_EXTENSION_UPLOAD_SIGNATURE",
        payload: {
          dataUrl,
          fileName: file.name,
          mimeType: file.type,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Failed to upload signature."));
          return;
        }
        resolve(true);
      }
    );
  });
};

if (uploadSignatureButton) {
  uploadSignatureButton.addEventListener("click", async () => {
    if (!signatureInput || !signatureInput.files || signatureInput.files.length === 0) {
      if (signatureStatus) signatureStatus.textContent = "Choose a signature file first.";
      return;
    }
    const file = signatureInput.files[0];
    try {
      await sendSignatureToActiveTab(file);
      if (signatureStatus) signatureStatus.textContent = "Signature uploaded to form.";
    } catch (error) {
      if (signatureStatus) signatureStatus.textContent = error.message || "Signature upload failed.";
    }
  });
}

// Show selected filename for signature upload
if (signatureInput) {
  const signatureFilenameEl = document.getElementById("signature-filename");
  signatureInput.addEventListener("change", () => {
    if (signatureFilenameEl) {
      if (signatureInput.files && signatureInput.files.length > 0) {
        signatureFilenameEl.textContent = "Selected: " + signatureInput.files[0].name;
      } else {
        signatureFilenameEl.textContent = "";
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

function showError(message) {
  if (!errorBanner) return;
  errorBanner.textContent = message;
  errorBanner.hidden = false;
  setTimeout(() => {
    errorBanner.hidden = true;
  }, 5000);
}

if (errorBanner) {
  errorBanner.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.clearError }, () => {
      errorBanner.hidden = true;
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

(async function init() {
  // Load uploaded documents
  await loadUploadedDocuments();
  
  // Refresh payload status
  await refreshPayloadStatus();
  
  // Check if we have a payload - if so, start on Send tab
  const { caAcpPayload } = await loadStorage([STORAGE_KEYS.payload]);
  if (caAcpPayload && (caAcpPayload.assessments || caAcpPayload.formType)) {
    switchTab("send");
  } else {
    switchTab("upload");
  }
  
  // Refresh status periodically
  setInterval(refreshPayloadStatus, 2000);
})();
