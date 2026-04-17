# Edge ACP Autofill Extension

## Summary

- **NEW in v0.2.0**: Upload care documents directly in the extension for AI-powered risk assessment analysis
- Receives risk assessments from Care Assurance and autofills Access Care Planning risk assessment forms
- Supports EMAR audit autofill for the EMAR Quality Assurance form
- Supports custom documents by sending a payload with `formType: "custom"` and a `fields` array

## Features

### 🎯 AI-Powered Document Analysis (New!)

The extension now supports uploading care documents (PDF, Word, text files, images) directly into the extension popup for AI analysis:

1. **Upload Documents**: Click "📄 Upload Documents for AI Analysis" section
2. **Select Files**: Choose one or more care documents (PDF, Word, images, text files)
3. **Analyze**: Click "Analyze with AI" to send documents to Care Assurance backend
4. **Review Results**: See AI-generated risk assessment recommendations with evidence
5. **Customize**: Select which assessments to include and add additional notes
6. **Auto-fill**: Click "Use This Analysis & Continue" to convert results to payload and proceed with autofill

**Workflow:**

- User stays on Access Care Planning page
- Extension popup remains open
- Care Assurance backend analyzes documents and identifies risk assessments
- Extension displays recommendations with evidence snippets
- User can add custom notes and select specific assessments
- Extension converts results to ACP payload format
- Normal autofill process continues seamlessly

**Requirements:**

- Must be logged in to Care Assurance (careassurance.uk)
- Documents should contain care-related information (medical records, assessments, care notes)
- AI analysis follows NHS England 12 Principles and CQC 2024 standards

### 📋 Traditional Payload Method

Alternatively, use Care Assurance website's "Send to ACP Extension" button to send pre-analyzed assessments.

## Setup

1. Load unpacked extension from `extension/edge-acp-autofill` in Edge
2. For AI Analysis, log in to Care Assurance first.
3. In Intake, select a service user in Autofill settings (Case ID), then use `Upload` or `Auto-Collect` in each section.
4. Click "Analyze with AI" after staging files.
5. For the traditional method, use the admin-only "Send to ACP Extension" or "Send to EMAR Extension" button in Care Assurance.
6. For custom documents, send a payload with `formType: "custom"`, a `formId` (optional), and `fields`.
7. Open the Access Care Planning new case form page and set Case ID + Service Data Group ID in the popup.
8. Click Start Autofill.
9. Use Stop Autofill to cancel and click the error banner to clear errors if needed.

## Notes

- The extension opens [https://clece.mobizio.com/new_case_form](https://clece.mobizio.com/new_case_form) with a fixed formId and queues each assessment. It will reuse an existing ACP tab when possible.
- EMAR autofill uses the EMAR Quality Assurance formId and fills core audit fields when available.
- Custom autofill uses `fields` with `selector`, `name`, or `label` plus a `value`, and can target any formId.
- If the ACP form URL or selectors change, update content-acp.js.
- The default popup `Workspace` view now includes a `Workflow Launchpad` with context-aware primary actions and one-click workflow shortcuts so operators can jump to the right CareAssurance page immediately.
- Main extension popup menu dragging is enabled from the header/tab bar using the same hold-and-drag interaction style as risk-assessment autofill overlays. If opened from the toolbar anchor, drag detaches the popup to a movable window and future opens focus that detached window when available.
- In-page ACP/EMAR/Initial Assessment overlays keep pin and minimize controls, but drag/resize interactions are disabled.
- Upload dropzones accept either local files or dropped http/https links. Dropped links are downloaded and staged directly into the selected section when the file type is supported.
- Each Intake section now provides both `Upload` and `Auto-Collect` actions.
- `Auto-Collect` uses section-specific Mobizio source URLs:
  - `Social Work`, `Moving & Handling`, and `Additional Documents` start from `/case_document_list?caseId=<id>&serviceId=1000801`
  - `Initial Assessment` starts from `/case_data_group?caseId=<id>&serviceDataGroupId=1014998`
  - `Care Plan` starts from `/eoutcomeservice/branch/case_care_plans_dashboard?caseId=<id>`
- Selection rules for auto-collect: Care Plan and Moving & Handling are single-select; all other Intake sections allow multi-select.
- Intake now includes an `Auto-Download Info` diagnostics panel that tracks the latest auto-collect run (source, counts, fallback use, duration, and error details) with a `Copy Report` shortcut.
- The auto-collect picker now supports inline filtering by document metadata and shows extra row diagnostics (download ID and URL hint count) before files are fetched.
- The extension popup now uses a fully overhauled visual design system (cards, tabs, controls, dialogs, and responsive spacing) while preserving existing workflows.

## Edge Add-ons Publishing (Unlisted Release Process)

1. Update `manifest.json` version if you are preparing a release build
2. Build package: `npm run package:extension` (outputs `dist/edge-acp-autofill.zip`)
3. Publish via API: `npm run publish:edge-addon`
4. Privacy policy URL for listing: `https://careassurance.uk/privacy`

For local installation from the packaged artifact, extract `dist/edge-acp-autofill.zip` to a folder first, then choose that extracted folder in Edge via **Extensions** → **Load unpacked**.

### Local Publishing Commands

- Standard publish: `npm run publish:edge-addon`
- Preflight validation only (no API calls): `python3 script/edge-addons-publish.py --zip dist/edge-acp-autofill.zip --dry-run`
- Strict mode (fail if another submission is currently being processed): `python3 script/edge-addons-publish.py --zip dist/edge-acp-autofill.zip --fail-on-in-progress`

The publish script validates `manifest.json` before upload, including required fields, icon references, and Edge description length limits.

### GitHub Actions Auto-Publish

This repository includes `.github/workflows/edge-addons-publish.yml` for automated publication on pushes to `main` (when extension or publish files change), and manual workflow dispatch.

Required GitHub secrets:

- `EDGE_ADDONS_PRODUCT_ID`
- `EDGE_ADDONS_CLIENT_ID`
- `EDGE_ADDONS_API_KEY`

Certification notes can be provided through the manual workflow input or by setting `EDGE_ADDONS_NOTES`.

Note: If icon validation fails in store review, ensure PNG icon files exist and are referenced correctly in `manifest.json`.

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
