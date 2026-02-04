// ═══════════════════════════════════════════════════════════════════════════
// CARE ASSURANCE ACP AUTOFILL - POPUP SCRIPT v0.2.0
// Professional UI matching Care Assurance website design
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
};

const FALLBACK_MESSAGE_TYPES = {
  startAutofill: "CA_EXTENSION_START_AUTOFILL",
  stopAutofill: "CA_EXTENSION_STOP_AUTOFILL",
  clearError: "CA_EXTENSION_CLEAR_ERROR",
  analyzeRisks: "CA_EXTENSION_ANALYZE_RISKS",
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

// Sections
const uploadSection = document.getElementById("upload-section");
const selectionSection = document.getElementById("selection-section");
const readySection = document.getElementById("ready-section");

// Upload section
const documentFilesInput = document.getElementById("document-files");
const fileListContainer = document.getElementById("file-list");
const analyzeButton = document.getElementById("analyze-documents");
const analysisStatus = document.getElementById("analysis-status");
const analysisProgress = document.getElementById("analysis-progress");
const analysisProgressFill = document.getElementById("analysis-progress-fill");
const progressDetails = document.getElementById("progress-details");

// Selection section
const serviceUserSummary = document.getElementById("service-user-summary");
const assessmentList = document.getElementById("assessment-list");
const selectionCount = document.getElementById("selection-count");
const selectAllBtn = document.getElementById("select-all-btn");
const clearSelectionBtn = document.getElementById("clear-selection-btn");
const additionalNotes = document.getElementById("additional-notes");
const proceedWithSelection = document.getElementById("proceed-with-selection");
const cancelSelection = document.getElementById("cancel-selection");

// Ready section
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
const backToUploadBtn = document.getElementById("back-to-upload");

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

// ═══════════════════════════════════════════════════════════════════════════
// SECTION NAVIGATION
// ═══════════════════════════════════════════════════════════════========================
function showSection(section) {
  uploadSection.hidden = section !== "upload";
  selectionSection.hidden = section !== "selection";
  readySection.hidden = section !== "ready";
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE UPLOAD HANDLING
// ═══════════════════════════════════════════════════════════════════════════

documentFilesInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  selectedFilesList = files;
  displayFileList();
  analyzeButton.disabled = files.length === 0;
});

function displayFileList() {
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
      analyzeButton.disabled = selectedFilesList.length === 0;
    });
  });
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
  if (!files || files.length === 0) {
    throw new Error("Please select at least one file to analyze");
  }

  analysisStatus.textContent = "Reading files...";
  analysisProgress.hidden = false;
  analysisProgressFill.style.width = "5%";

  // Read all files and combine content
  let combinedContent = "";
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    analysisStatus.textContent = `Reading ${file.name}...`;
    
    try {
      if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        const text = await readFileAsText(file);
        combinedContent += `\n\n=== File: ${file.name} ===\n${text}`;
      } else if (file.type.startsWith("image/")) {
        const dataUrl = await readFileAsDataURL(file);
        combinedContent += `\n\n=== Image File: ${file.name} ===\n[Image uploaded - OCR processing needed on server side]\nData URL: ${dataUrl.substring(0, 100)}...`;
      } else {
        // For PDF, Word, etc. - indicate file was uploaded
        combinedContent += `\n\n=== File: ${file.name} (${file.type}) ===\n[Binary file uploaded - text extraction needed on server side]`;
      }
    } catch (error) {
      console.warn(`Failed to read ${file.name}:`, error);
      combinedContent += `\n\n=== File: ${file.name} ===\n[Could not read file content]`;
    }
  }

  if (!combinedContent.trim()) {
    throw new Error("No readable content found in uploaded files");
  }

  analysisStatus.textContent = "Connecting to Care Assurance AI...";
  analysisProgressFill.style.width = "10%";

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
        analysisProgressFill.style.width = `${currentProgress}%`;
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
        progressDetails.textContent = messages[msgIndex];
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
        
        analysisProgressFill.style.width = "100%";
        progressDetails.textContent = "Analysis complete!";
        resolve(response.result);
      }
    );
  });
};

analyzeButton.addEventListener("click", async () => {
  if (selectedFilesList.length === 0) {
    analysisStatus.textContent = "Please select at least one file to analyze.";
    return;
  }

  try {
    analyzeButton.disabled = true;
    analysisStatus.textContent = "Starting analysis...";
    
    const results = await analyzeDocuments(selectedFilesList);
    currentAnalysisResults = results;
    
    displayAnalysisResults(results);
    showSection("selection");
    
    // Clear file selection
    selectedFilesList = [];
    documentFilesInput.value = "";
    fileListContainer.innerHTML = "";
  } catch (error) {
    console.error("Analysis error:", error);
    analysisStatus.textContent = `Error: ${error.message}`;
    analysisProgress.hidden = true;
    showError(error.message);
  } finally {
    analyzeButton.disabled = false;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DISPLAY ANALYSIS RESULTS
// ═══════════════════════════════════════════════════════════════════════════

function displayAnalysisResults(results) {
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
    selectionCount.textContent = "0 selected";
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
  selectionCount.textContent = `${checkedCount} selected`;
}

// Selection toolbar buttons
selectAllBtn.addEventListener("click", () => {
  document.querySelectorAll(".assessment-checkbox").forEach(checkbox => {
    checkbox.checked = true;
    checkbox.closest(".assessment-item").classList.add("selected");
  });
  updateSelectionCount();
});

clearSelectionBtn.addEventListener("click", () => {
  document.querySelectorAll(".assessment-checkbox").forEach(checkbox => {
    checkbox.checked = false;
    checkbox.closest(".assessment-item").classList.remove("selected");
  });
  updateSelectionCount();
});

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE ASSESSMENTS (PREPARE PAYLOAD)
// ═══════════════════════════════════════════════════════════════════════════

proceedWithSelection.addEventListener("click", async () => {
  if (!currentAnalysisResults) {
    showError("No analysis results available.");
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
  additionalNotes.value = "";

  // Show ready section
  await refreshPayloadStatus();
  showSection("ready");
});

cancelSelection.addEventListener("click", () => {
  currentAnalysisResults = null;
  additionalNotes.value = "";
  showSection("upload");
  analyzeButton.disabled = selectedFilesList.length === 0;
});

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

  if (caAcpPayload && Array.isArray(caAcpPayload.assessments)) {
    payloadStatus.querySelector("span").textContent = `Ready: ${caAcpPayload.assessments.length} assessment(s)`;
  } else if (caAcpPayload && caAcpPayload.formType === "emar") {
    payloadStatus.querySelector("span").textContent = "Ready: EMAR audit";
  } else if (caAcpPayload && caAcpPayload.formType === "custom") {
    payloadStatus.querySelector("span").textContent = "Ready: Custom document";
  } else {
    payloadStatus.querySelector("span").textContent = "Waiting for data...";
  }

  if (caAcpCaseInfo) {
    caseIdInput.value = caAcpCaseInfo.caseId || "";
    serviceDataGroupInput.value = caAcpCaseInfo.serviceDataGroupId || "";
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
    } else {
      progressStatus.textContent = "Not started.";
    }
  }

  if (caAcpLastError) {
    showError(caAcpLastError);
  }

  await maybeAutofillCaseInfoFromActiveTab();
};

startButton.addEventListener("click", async () => {
  const caseId = caseIdInput.value.trim();
  const serviceDataGroupId = serviceDataGroupInput.value.trim();
  const autoSubmit = autoSubmitToggle ? autoSubmitToggle.checked : true;
  const dryRun = dryRunToggle ? dryRunToggle.checked : false;
  const interactionMode = interactionModeSelect ? interactionModeSelect.value : "auto";

  if (!caseId || !serviceDataGroupId) {
    progressStatus.textContent = "Enter both Case ID and Service Data Group ID.";
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
        progressStatus.textContent = chrome.runtime.lastError.message;
        return;
      }
      progressStatus.textContent = response?.ok
        ? "Autofill started."
        : response?.error || "Failed to start.";
    }
  );
});

if (stopButton) {
  stopButton.addEventListener("click", async () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.stopAutofill }, () => {
      progressStatus.textContent = "Autofill stopped.";
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
    progressStatus.textContent = "Cleared stored data.";
    await refreshPayloadStatus();
  });
}

if (backToUploadBtn) {
  backToUploadBtn.addEventListener("click", () => {
    showSection("upload");
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
      signatureStatus.textContent = "Choose a signature file first.";
      return;
    }
    const file = signatureInput.files[0];
    try {
      await sendSignatureToActiveTab(file);
      signatureStatus.textContent = "Signature uploaded to form.";
    } catch (error) {
      signatureStatus.textContent = error.message || "Signature upload failed.";
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

function showError(message) {
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
  await refreshPayloadStatus();
  
  // Check if we have a payload - if so, show ready section, otherwise show upload
  const { caAcpPayload } = await loadStorage([STORAGE_KEYS.payload]);
  if (caAcpPayload && (caAcpPayload.assessments || caAcpPayload.formType)) {
    showSection("ready");
  } else {
    showSection("upload");
  }
  
  // Refresh status periodically
  setInterval(refreshPayloadStatus, 2000);
})();
