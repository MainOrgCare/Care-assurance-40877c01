// EXTENSION DESIGN IMPROVEMENTS GUIDE
// This document outlines the UI/UX improvements needed for a "massive upgrade"

/**
 * KEY IMPROVEMENTS FOR EXTENSION v0.4.0+
 * 
 * These improvements transform the extension from functional to production-grade
 */

// ============================================================================
// IMPROVEMENT 1: ENHANCED ERROR RECOVERY UI
// ============================================================================
// Replace generic "Proxy request failed" with specific, actionable errors

const ImprovedErrorMessages = {
  // Field-level errors
  "FIELD_NOT_FOUND": "Form field '{{fieldName}}' not found. The form structure may have changed. Refresh and try again.",
  "FIELD_READONLY": "Field '{{fieldName}}' is read-only. Manual entry required.",
  "VALIDATION_FAILED": "Field '{{fieldName}}' failed validation. Check the value format.",
  
  // Form-level errors  
  "FORM_STRUCTURE_CHANGED": "⚠️ Form structure has changed. Some fields may not be pre-filled. Please verify all required fields.",
  "TIMEOUT": "Autofill timed out. {{reasony}} - Please try again or autofill individual fields manually.",
  "NETWORK_ERROR": "Network connection lost. Check your internet and try again.",
  
  // Batch operation errors
  "BATCH_INTERRUPTED": "Batch autofill was interrupted after {{completedCount}} of {{totalCount}} forms. Resuming from form {{nextIndex}}...",
  "SERVICE_WORKER_CRASH": "Extension connection lost (Chrome restarted service worker). Reconnecting...",
};

// ============================================================================
// IMPROVEMENT 2: BATCH PROCESSING UI WITH PROGRESS
// Transformation from silent operation to visual feedback
// ============================================================================

const ImprovedBatchUI = `
<!-- Enhanced batch processing view -->
<div class="batch-progress-container">
  <!-- Header showing batch stats -->
  <div class="batch-header">
    <h3>Autofilling {{totalCount}} Forms</h3>
    <span class="batch-time">Est. {{estimatedTime}}min remaining</span>
  </div>
  
  <!-- Overall progress bar -->
  <div class="batch-progress-bar">
    <div class="progress-fill" style="width: {{progressPercent}}%"></div>
    <span class="progress-text">{{completedCount}}/{{totalCount}}</span>
  </div>
  
  <!-- Individual form status list -->
  <div class="batch-items">
    {{#each forms}}
      <div class="batch-item status-{{status}}">
        <span class="batch-item-name">Assessment: {{name}}</span>
        <span class="batch-item-status">
          {{#if status === 'completed'}} ✓ Done {{/if}}
          {{#if status === 'in-progress'}} ⊙ Filling... {{/if}}
          {{#if status === 'pending'}} ○ Pending {{/if}}
          {{#if status === 'error'}} ✗ Failed: {{errorMessage}} {{/if}}
        </span>
      </div>
    {{/each}}
  </div>
  
  <!-- Action buttons -->
  <div class="batch-actions">
    <button class="btn btn-secondary" onclick="pauseBatch()">Pause</button>
    <button class="btn btn-secondary" onclick="resumeBatch()">Resume</button>
    <button class="btn btn-tertiary" onclick="cancelBatch()">Cancel</button>
  </div>
</div>
`;

// ============================================================================
// IMPROVEMENT 3: FIELD VALIDATION PREVIEW
// Shows what will be filled before committing
// ============================================================================

const ImprovedFieldPreview = `
<!-- Field preview before autofill -->
<div class="field-preview-panel">
  <h4>About to fill {{fieldCount}} fields</h4>
  <button class="preview-toggle">Show Preview</button>
  
  <div class="preview-list" hidden>
    {{#each fields}}
      <div class="preview-field">
        <label>{{label}}</label>
        <div class="preview-value">
          <code>{{truncate(value, 60)}}</code>
          {{#if truncated}}...{{/if}}
        </div>
        <button class="icon-btn" title="Skip this field">
          <svg><!-- skip icon --></svg>
        </button>
      </div>
    {{/each}}
  </div>
  
  <div class="preview-actions">
    <button class="btn btn-primary">Fill All</button>
    <button class="btn btn-secondary">Review Fields</button>
  </div>
</div>
`;

// ============================================================================
// IMPROVEMENT 4: ACTIVITY AUDIT LOG
// Provides transparency and debugging capability
// ============================================================================

const ImprovedActivityLog = `
<!-- Activity audit log with timestamps -->
<div class="activity-log">
  <div class="log-header">
    <h4>Activity History</h4>
    <button class="icon-btn" title="Export as CSV">
      <svg><!-- download icon --></svg>
    </button>
  </div>
  
  <table class="log-table">
    <thead>
      <tr>
        <th>Time</th>
        <th>Action</th>
        <th>Status</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      {{#each activities}}
        <tr class="log-row status-{{status}}">
          <td class="log-time">{{formatTime(timestamp)}}</td>
          <td class="log-action">{{action}}</td>
          <td class="log-status">
            <span class="badge badge-{{status}}">{{statusLabel}}</span>
          </td>
          <td class="log-details">{{details}}</td>
        </tr>
      {{/each}}
    </tbody>
  </table>
  
  <div class="log-actions">
    <button class="btn btn-secondary">Clear History</button>
    <button class="btn btn-secondary">Export</button>
  </div>
</div>
`;

// ============================================================================
// IMPROVEMENT 5: SCHEMA DISCOVERY & FORM SUPPORT EXPANSION
// Instead of hardcoded selectors, learn form structure dynamically
// ============================================================================

/**
 * Schema learning approach:
 * 1. When form loads, scan DOM for all input/select/textarea fields
 * 2. Extract field labels, types, placeholders, validation rules
 * 3. Match against known mappings (email → email field, phone → tel field, etc.)
 * 4. Fallback to semantic matching for unknown fields
 * 5. Log which fields were matched for debugging
 * 
 * Benefits:
 * - Works with ANY form, not just 4 hardcoded types
 * - Auto-adapts when form structure changes
 * - Provides fallback UI for unmapped fields
 */

const FormSchemaDiscovery = {
  /**
   * Analyze form structure and extract field information
   */
  async analyzeForm() {
    const fields = [];
    const unmatched = [];
    
    // Find all input fields
    document.querySelectorAll('input, select, textarea').forEach(element => {
      const info = {
        name: element.name || element.id,
        type: element.type,
        label: this.extractLabel(element),
        placeholder: element.placeholder,
        required: element.required,
        validation: this.extractValidation(element),
        element: element
      };
      
      // Try to match against known field types
      const mapped = this.mapField(info);
      if (mapped.careName) {
        fields.push(mapped);
      } else {
        unmatched.push(info);
      }
    });
    
    return { fields, unmatched, analysisTime: new Date().toISOString() };
  },
  
  /**
   * Extract label text for a form field
   */
  extractLabel(element) {
    // Try associate label
    const labelText = element.labels?.[0]?.textContent;
    if (labelText) return labelText;
    
    // Try aria-label
    if (element.ariaLabel) return element.ariaLabel;
    
    // Try placeholder
    if (element.placeholder) return element.placeholder;
    
    // Try name/id
    return element.name || element.id || "Unnamed field";
  },
  
  /**
   * Extract validation rules from element
   */
  extractValidation(element) {
    return {
      pattern: element.pattern,
      maxLength: element.maxLength,
      minLength: element.minLength,
      dataType: element.type,
      required: element.required
    };
  },
  
  /**
   * Map form field to Care Assurance data field
   */
  mapField(fieldInfo) {
    const name = (fieldInfo.name + fieldInfo.label).toLowerCase();
    
    // Simple fuzzy matching
    const mappings = {
      'email': { careName: 'email', transform: v => v?.toLowerCase() },
      'phone|tel|mobile': { careName: 'phone', transform: v => v?.replace(/\D/g, '') },
      'postcode|zip': { careName: 'postcode', transform: v => v?.toUpperCase() },
      'date': { careName: 'dateOfVisit', transform: v => v },
      'name': { careName: 'name', transform: v => v?.trim() },
      'address': { careName: 'address', transform: v => v?.trim() }
    };
    
    for (const [pattern, mapping] of Object.entries(mappings)) {
      if (new RegExp(pattern).test(name)) {
        return { ...fieldInfo, ...mapping };
      }
    }
    
    return fieldInfo;
  }
};

// ============================================================================
// IMPROVEMENT 6: MULTI-PAGE FORM HANDLING
// Navigate and fill multi-step forms automatically
// ============================================================================

/**
 * Multi-page form navigation:
 * - Detect "Next" / "Continue" buttons
 * - Fill current page fields
 * - Click Next automatically
 * - Repeat until form complete
 * - Provides per-page progress feedback
 */
const MultiPageFormHandler = {
  async handleMultiPageForm(data) {
    let currentPage = 1;
    const maxPages = 10; // Safety limit
    
    while (currentPage < maxPages) {
      // Fill fields on current page
      await this.fillCurrentPage(data);
      
      // Check if there's a Next button
      const nextButton = this.findNextButton();
      if (!nextButton) {
        // Last page - look for Submit
        const submitButton = this.findSubmitButton();
        if (submitButton) {
          submitButton.click();
          return { success: true, pagesCompleted: currentPage };
        }
        break;
      }
      
      // Click Next and wait for new page to load
      nextButton.click();
      await this.waitForPageLoad();
      currentPage++;
    }
    
    return { success: false, error: "Could not navigate form", pagesAttempted: currentPage };
  },
  
  findNextButton() {
    const patterns = ['next', 'continue', 'forward', '→', '→→'];
    for (const btn of document.querySelectorAll('button, input[type="button"], input[type="submit"]')) {
      const text = btn.textContent.toLowerCase();
      if (patterns.some(p => text.includes(p))) {
        return btn;
      }
    }
    return null;
  },
  
  findSubmitButton() {
    const patterns = ['submit', 'save', 'complete', 'finish'];
    for (const btn of document.querySelectorAll('button, input[type="submit"]')) {
      const text = btn.textContent.toLowerCase();
      const type = btn.type?.toLowerCase();
      if (type === 'submit' || patterns.some(p => text.includes(p))) {
        return btn;
      }
    }
    return null;
  },
  
  async waitForPageLoad(timeout = 5000) {
    return new Promise(resolve => {
      setTimeout(resolve, timeout);
    });
  }
};

// ============================================================================
// CSS STYLING IMPROVEMENTS FOR MODERN UI
// ============================================================================

const ModernUI_CSS = `
/* Modern button styles with proper states */
.btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: all 200ms ease;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.btn:active {
  transform: translateY(0);
}

/* Status colors for batch operations */
.status-completed { color: #10b981; }
.status-in-progress { color: #3b82f6; animation: pulse 1s infinite; }
.status-pending { color: #9ca3af; }
.status-error { color: #ef4444; }

/* Progress indicators */
.progress-bar {
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #1e40af);
  transition: width 300ms ease;
}

/* Activity log styling */
.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.log-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.badge-success { background: #d1fae5; color: #065f46; }
.badge-error { background: #fee2e2; color: #7f1d1d; }
.badge-pending { background: #fef3c7; color: #78350f; }
`;

console.log("✅ Extension improvement guide loaded - Use these patterns for v0.4.0+");
