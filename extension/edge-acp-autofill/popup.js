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
};

const { STORAGE_KEYS, MESSAGE_TYPES } = window.CA_EXTENSION_CONSTANTS || {
  STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
  MESSAGE_TYPES: FALLBACK_MESSAGE_TYPES,
};

const loadStorage = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

const setStorage = (items) =>
  new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));

const payloadStatus = document.getElementById("payload-status");
const caseIdInput = document.getElementById("case-id");
const serviceDataGroupInput = document.getElementById("service-data-group-id");
const startButton = document.getElementById("start-autofill");
const stopButton = document.getElementById("stop-autofill");
const status = document.getElementById("autofill-status");
const clearButton = document.getElementById("clear-data");
const autoSubmitToggle = document.getElementById("auto-submit");
const dryRunToggle = document.getElementById("dry-run");
const interactionModeSelect = document.getElementById("interaction-mode");
const signatureInput = document.getElementById("signature-file");
const uploadSignatureButton = document.getElementById("upload-signature");
const signatureStatus = document.getElementById("signature-status");
const showOverlayButton = document.getElementById("show-overlay");
const logStatus = document.getElementById("log-status");
const logList = document.getElementById("log-list");
const clearLogsButton = document.getElementById("clear-logs");
const progressStatus = document.getElementById("progress-status");
const errorBanner = document.getElementById("error-banner");

// File upload & analysis elements
const documentFilesInput = document.getElementById("document-files");
const analyzeButton = document.getElementById("analyze-documents");
const analysisStatus = document.getElementById("analysis-status");
const analysisProgress = document.getElementById("analysis-progress");
const analysisProgressFill = document.getElementById("analysis-progress-fill");
const resultsSection = document.getElementById("results-section");
const resultsSummary = document.getElementById("results-summary");
const recommendedAssessments = document.getElementById("recommended-assessments");
const additionalNotes = document.getElementById("additional-notes");
const proceedWithResults = document.getElementById("proceed-with-results");
const cancelResults = document.getElementById("cancel-results");

let lastAutoFilledCaseInfo = { caseId: "", serviceDataGroupId: "" };
let currentAnalysisResults = null;

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
    payloadStatus.textContent = `Ready: ${caAcpPayload.assessments.length} assessment(s)`;
  } else if (caAcpPayload && caAcpPayload.formType === "emar") {
    payloadStatus.textContent = "Ready: EMAR audit";
  } else if (caAcpPayload && caAcpPayload.formType === "custom") {
    payloadStatus.textContent = "Ready: Custom document";
  } else {
    payloadStatus.textContent = "Waiting for data...";
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

  if (errorBanner) {
    if (caAcpLastError) {
      errorBanner.textContent = caAcpLastError;
      errorBanner.hidden = false;
    } else {
      errorBanner.hidden = true;
    }
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
    status.textContent = "Enter both Case ID and Service Data Group ID.";
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
        status.textContent = chrome.runtime.lastError.message;
        return;
      }
      status.textContent = response?.ok
        ? "Autofill started."
        : response?.error || "Failed to start.";
    }
  );
});

if (stopButton) {
  stopButton.addEventListener("click", async () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.stopAutofill }, () => {
      status.textContent = "Autofill stopped.";
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
    status.textContent = "Cleared stored data.";
    await refreshPayloadStatus();
  });
}

if (clearLogsButton) {
  clearLogsButton.addEventListener("click", async () => {
    await setStorage({ [STORAGE_KEYS.logs]: [] });
    await refreshPayloadStatus();
  });
}

if (errorBanner) {
  errorBanner.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.clearError }, () => {
      refreshPayloadStatus();
    });
  });
}

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

if (showOverlayButton) {
  showOverlayButton.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      status.textContent = "No active tab found.";
      return;
    }
    chrome.tabs.sendMessage(
      tab.id,
      { type: MESSAGE_TYPES?.toggleOverlay || "CA_EXTENSION_TOGGLE_OVERLAY", payload: { open: true } },
      () => {
        if (chrome.runtime.lastError) {
          status.textContent = chrome.runtime.lastError.message;
          return;
        }
        status.textContent = "Status overlay shown.";
      }
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE UPLOAD & AI ANALYSIS WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

// Convert files to base64 and extract text
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

// Get authentication token from Care Assurance site
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

// Process uploaded files and send to AI analysis endpoint via background script
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
    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.analyzeRisks || "CA_EXTENSION_ANALYZE_RISKS",
        documentContent: combinedContent,
        authToken: authToken
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Analysis failed"));
          return;
        }
        resolve(response.result);
      }
    );
  });
};

// Display analysis results in the UI
const displayAnalysisResults = (results) => {
  currentAnalysisResults = results;

  // Build summary
  const serviceUser = results.serviceUser || {};
  const summary = `
    <div><strong>Service User:</strong> ${serviceUser.initials || "N/A"}</div>
    ${results.documentSummary ? `<div style="margin-top: 8px;"><strong>Summary:</strong> ${results.documentSummary}</div>` : ""}
    ${results.medicalConditions && results.medicalConditions.length > 0 ? `<div style="margin-top: 6px;"><strong>Conditions:</strong> ${results.medicalConditions.join(", ")}</div>` : ""}
    ${results.careActivities && results.careActivities.length > 0 ? `<div style="margin-top: 6px;"><strong>Care Activities:</strong> ${results.careActivities.join(", ")}</div>` : ""}
  `;
  resultsSummary.innerHTML = summary;

  // Display recommended assessments with checkboxes
  const assessments = results.recommendedAssessments || [];
  if (assessments.length === 0) {
    recommendedAssessments.innerHTML = '<div style="padding: 10px; text-align: center; color: #64748b;">No assessments recommended</div>';
  } else {
    recommendedAssessments.innerHTML = assessments.map((assessment, index) => `
      <div class="assessment-item" data-index="${index}">
        <label style="display: flex; align-items: start; cursor: pointer;">
          <input type="checkbox" checked data-index="${index}" />
          <div style="flex: 1;">
            <div class="assessment-name">${assessment.name || "Unknown Assessment"}</div>
            ${assessment.reason ? `<div class="assessment-reason">${assessment.reason}</div>` : ""}
            ${assessment.evidence ? `<div class="assessment-evidence"><strong>Evidence:</strong> ${assessment.evidence}</div>` : ""}
          </div>
        </label>
      </div>
    `).join("");

    // Add click handlers for checkboxes
    const checkboxes = recommendedAssessments.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener("change", (e) => {
        const item = e.target.closest(".assessment-item");
        if (e.target.checked) {
          item.classList.add("selected");
        } else {
          item.classList.remove("selected");
        }
      });
      // Initialize selected state
      if (checkbox.checked) {
        checkbox.closest(".assessment-item").classList.add("selected");
      }
    });
  }

  // Show results section
  resultsSection.hidden = false;
  analysisProgress.hidden = true;
  analysisStatus.textContent = `✓ Analysis complete! Found ${assessments.length} recommended assessment(s).`;
};

// Handle analyze button click
if (analyzeButton) {
  analyzeButton.addEventListener("click", async () => {
    const files = documentFilesInput?.files;
    if (!files || files.length === 0) {
      analysisStatus.textContent = "Please select at least one file to analyze.";
      return;
    }

    try {
      analyzeButton.disabled = true;
      const results = await analyzeDocuments(files);
      displayAnalysisResults(results);
    } catch (error) {
      console.error("Analysis error:", error);
      analysisStatus.textContent = `Error: ${error.message}`;
      analysisProgress.hidden = true;
    } finally {
      analyzeButton.disabled = false;
    }
  });
}

// Handle proceed with results button
if (proceedWithResults) {
  proceedWithResults.addEventListener("click", async () => {
    if (!currentAnalysisResults) {
      status.textContent = "No analysis results available.";
      return;
    }

    // Get selected assessments
    const checkboxes = recommendedAssessments.querySelectorAll('input[type="checkbox"]:checked');
    const selectedAssessments = Array.from(checkboxes).map(checkbox => {
      const index = parseInt(checkbox.getAttribute("data-index"), 10);
      return currentAnalysisResults.recommendedAssessments[index];
    }).filter(Boolean);

    if (selectedAssessments.length === 0) {
      status.textContent = "Please select at least one assessment to proceed.";
      return;
    }

    // Get additional notes
    const notes = additionalNotes?.value || "";

    // Convert analysis results to ACP payload format
    const payload = {
      formType: "acp",
      assessments: selectedAssessments.map(assessment => ({
        assessmentType: assessment.name,
        riskLevel: "To be determined", // Will be filled during autofill
        findings: assessment.evidence || assessment.reason || "",
        recommendations: assessment.reason || "",
        evidence: (assessment.evidenceSnippets || []).join(" | "),
        additionalNotes: notes
      }))
    };

    // Store payload
    await setStorage({ [STORAGE_KEYS.payload]: payload });

    // Hide results, show main interface
    resultsSection.hidden = true;
    currentAnalysisResults = null;
    documentFilesInput.value = "";
    additionalNotes.value = "";

    // Refresh payload status
    await refreshPayloadStatus();

    status.textContent = `✓ ${selectedAssessments.length} assessment(s) ready for autofill!`;
  });
}

// Handle cancel results button
if (cancelResults) {
  cancelResults.addEventListener("click", () => {
    resultsSection.hidden = true;
    currentAnalysisResults = null;
    documentFilesInput.value = "";
    additionalNotes.value = "";
    analysisStatus.textContent = "";
    analysisProgress.hidden = true;
  });
}

refreshPayloadStatus();

setInterval(refreshPayloadStatus, 1500);
