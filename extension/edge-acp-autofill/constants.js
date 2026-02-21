(() => {
  const globalScope = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : window;
  if (globalScope?.CA_EXTENSION_CONSTANTS) return;

  const STORAGE_KEYS = {
    payload: "caAcpPayload",
    caseInfo: "caAcpCaseInfo",
    queueState: "caAcpQueueState",
    logs: "caAcpLogs",
    autoSubmit: "caAcpAutoSubmit",
    dryRun: "caAcpDryRun",
    interactionMode: "caAcpInteractionMode",
    signatureData: "caAcpSignatureData",
    signatureBatchId: "caAcpSignatureBatchId",
    lastError: "caAcpLastError",
    uploadedDocuments: "caAcpUploadedDocuments",
    verificationFields: "caAcpVerificationFields",
  };

  const FORM_CONFIGS = {
    acp: {
      url: "https://clece.mobizio.com/new_case_form",
      formId: "1048191",
    },
    initialAssessment: {
      url: "https://clece.mobizio.com/new_case_form",
      formId: "1040788",
    },
    emar: {
      url: "https://clece.mobizio.com/new_case_form",
      formId: "1044009",
    },
    custom: {
      url: "https://clece.mobizio.com/new_case_form",
    },
  };

  const MESSAGE_TYPES = {
    storePayload: "CA_EXTENSION_STORE_PAYLOAD",
    startAutofill: "CA_EXTENSION_START_AUTOFILL",
    stepComplete: "CA_EXTENSION_STEP_COMPLETE",
    log: "CA_EXTENSION_LOG",
    uploadSignature: "CA_EXTENSION_UPLOAD_SIGNATURE",
    stopAutofill: "CA_EXTENSION_STOP_AUTOFILL",
    clearError: "CA_EXTENSION_CLEAR_ERROR",
    toggleOverlay: "CA_EXTENSION_TOGGLE_OVERLAY",
    analyzeRisks: "CA_EXTENSION_ANALYZE_RISKS",
    sendToApp: "CA_EXTENSION_SEND_TO_APP",
    scrollToNextVerification: "CA_EXTENSION_SCROLL_TO_NEXT",
    getVerificationStatus: "CA_EXTENSION_GET_VERIFICATION_STATUS",
  };

  /**
   * Shared verification utilities for all content scripts
   */
  const VERIFICATION_HELPERS = {
    /**
     * Check if a value indicates missing or ambiguous information
     * Returns: 'missing' | 'ambiguous' | 'valid'
     */
    checkValueStatus: (value) => {
      if (!value) return 'missing';
      const normalized = String(value).toLowerCase().trim();
      
      // Check for "information not provided" variations
      if (normalized.includes('information is not provided') ||
          normalized.includes('information not provided') ||
          normalized.includes('not provided') ||
          normalized.includes('no information') ||
          normalized.includes('unable to assess') ||
          normalized.includes('requires assessment') ||
          normalized.includes('to be confirmed') ||
          normalized.includes('tbc') ||
          normalized === 'n/a' ||
          normalized === 'na' ||
          normalized === 'unknown' ||
          normalized === '-' ||
          normalized === '') {
        return 'missing';
      }
      
      // Check for ambiguous yes/no (both selected or unclear)
      if (normalized.includes('yes') && normalized.includes('no')) {
        return 'ambiguous';
      }
      if (normalized === 'both' || normalized === 'unclear' || normalized === 'unsure' || 
          normalized === 'mixed' || normalized === 'varies') {
        return 'ambiguous';
      }
      
      return 'valid';
    },

    /**
     * Highlight styles for verification-needed fields
     */
    HIGHLIGHT_STYLES: {
      missing: {
        backgroundColor: '#fff3cd',
        border: '2px solid #ffc107',
        boxShadow: '0 0 5px rgba(255, 193, 7, 0.5)',
      },
      ambiguous: {
        backgroundColor: '#fff3cd',
        border: '2px solid #ffc107',
        boxShadow: '0 0 5px rgba(255, 193, 7, 0.5)',
      },
      success: {
        outline: '2px solid #1ea97a',
        outlineOffset: '2px',
      },
      dryRun: {
        outline: '2px solid #1ea97a',
        outlineOffset: '2px',
      },
    },

    /**
     * Apply highlight styling to a field
     */
    highlightField: (field, reason = 'missing') => {
      if (!field) return;
      const styles = VERIFICATION_HELPERS.HIGHLIGHT_STYLES[reason] || VERIFICATION_HELPERS.HIGHLIGHT_STYLES.missing;
      Object.assign(field.style, styles);
      
      // Add tooltip
      const tooltipText = reason === 'missing' 
        ? 'Information not provided - requires verification' 
        : reason === 'ambiguous'
        ? 'Ambiguous answer - requires verification'
        : '';
      if (tooltipText) field.title = tooltipText;
      
      // Add data attribute for easy querying later
      field.dataset.caVerification = reason;
      
      // Highlight parent container for visibility
      const container = field.closest('.form-group') || field.closest('td') || field.parentElement;
      if (container && container !== field) {
        container.style.backgroundColor = styles.backgroundColor || '';
        container.dataset.caVerificationContainer = 'true';
      }
    },

    /**
     * Highlight radio button group
     */
    highlightRadioGroup: (fieldName, reason = 'missing') => {
      const radios = document.querySelectorAll(`[name="${fieldName}"]`);
      radios.forEach(radio => {
        radio.dataset.caVerification = reason;
        const label = radio.closest('label') || radio.parentElement;
        if (label) {
          label.style.backgroundColor = '#fff3cd';
          label.style.border = '2px solid #ffc107';
          label.style.padding = '2px 4px';
          label.style.borderRadius = '4px';
        }
      });
      
      // Highlight the container
      if (radios.length > 0) {
        const container = radios[0].closest('.form-group') || radios[0].closest('td');
        if (container) {
          container.style.backgroundColor = '#fff3cd';
          container.dataset.caVerificationContainer = 'true';
          container.title = reason === 'missing' 
            ? 'Information not provided - requires verification' 
            : 'Ambiguous answer (both yes/no indicated) - requires verification';
        }
      }
    },

    /**
     * Get all highlighted fields that need verification
     */
    getVerificationFields: () => {
      return Array.from(document.querySelectorAll('[data-ca-verification]'));
    },

    /**
     * Scroll to the next verification-needed field
     */
    scrollToNextVerification: (currentIndex = -1) => {
      const fields = VERIFICATION_HELPERS.getVerificationFields();
      if (fields.length === 0) return { found: false, index: -1, total: 0 };
      
      const nextIndex = (currentIndex + 1) % fields.length;
      const field = fields[nextIndex];
      
      if (field) {
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a temporary pulse animation
        field.style.animation = 'none';
        field.offsetHeight; // Trigger reflow
        field.style.animation = 'ca-pulse 0.5s ease-in-out 2';
      }
      
      return { found: true, index: nextIndex, total: fields.length, fieldName: field?.name || field?.id };
    },

    /**
     * Inject pulse animation styles
     */
    injectAnimationStyles: () => {
      if (document.getElementById('ca-verification-styles')) return;
      
      const style = document.createElement('style');
      style.id = 'ca-verification-styles';
      style.textContent = `
        @keyframes ca-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); box-shadow: 0 0 15px rgba(255, 193, 7, 0.8); }
        }
        [data-ca-verification] {
          transition: all 0.2s ease;
        }
        [data-ca-verification]:focus {
          box-shadow: 0 0 10px rgba(255, 193, 7, 0.8) !important;
        }
      `;
      document.head.appendChild(style);
    },
  };

  globalScope.CA_EXTENSION_CONSTANTS = { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES, VERIFICATION_HELPERS };
})();
