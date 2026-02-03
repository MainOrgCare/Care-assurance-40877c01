# Edge ACP Autofill Extension

## Summary

- Receives risk assessments from Care Assurance and autofills Access Care Planning risk assessment forms.
- Supports EMAR audit autofill for the EMAR Quality Assurance form.
- Supports custom documents by sending a payload with `formType: "custom"` and a `fields` array.

## Setup

1. Load unpacked extension from extension/edge-acp-autofill in Edge.
2. Open Care Assurance and use the admin-only "Send to ACP Extension" or "Send to EMAR Extension" button.
3. For custom documents, send a payload with `formType: "custom"`, a `formId` (optional), and `fields`.
4. Open the Access Care Planning new case form page and set Case ID + Service Data Group ID in the popup.
5. Click Start Autofill.
6. Use Stop Autofill to cancel and click the error banner to clear errors if needed.

## Notes

- The extension opens [https://clece.mobizio.com/new_case_form](https://clece.mobizio.com/new_case_form) with a fixed formId and queues each assessment. It will reuse an existing ACP tab when possible.
- EMAR autofill uses the EMAR Quality Assurance formId and fills core audit fields when available.
- Custom autofill uses `fields` with `selector`, `name`, or `label` plus a `value`, and can target any formId.
- If the ACP form URL or selectors change, update content-acp.js.

### Custom payload example

```json
{
  "formType": "custom",
  "formId": "123456",
  "fields": [
    { "name": "form_component_2_2", "value": "Jane Smith" },
    { "label": "Audit Date", "value": "2026-02-03" },
    { "selector": "#custom-input", "value": "Notes here" },
    { "name": "form_component_10_1", "type": "select", "value": "Yes" }
  ]
}
```
