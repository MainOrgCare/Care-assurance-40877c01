# Edge ACP Autofill Extension

## Summary

- Receives risk assessments from Care Assurance and autofills Access Care Planning risk assessment forms.

## Setup

1. Load unpacked extension from extension/edge-acp-autofill in Edge.
2. Open Care Assurance and use the admin-only "Send to ACP Extension" button.
3. Open the Access Care Planning new case form page and set Case ID + Service Data Group ID in the popup.
4. Click Start Autofill.
5. Use Stop Autofill to cancel and click the error banner to clear errors if needed.

## Notes

- The extension opens [https://clece.mobizio.com/new_case_form](https://clece.mobizio.com/new_case_form) with a fixed formId and queues each assessment. It will reuse an existing ACP tab when possible.
- If the ACP form URL or selectors change, update content-acp.js.
