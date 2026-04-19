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
- The Upload toolbar now includes `Reset Upload` so operators can quickly clear staged files, notes, analysis selections, and synced-upload summary state before starting a new intake pass.
- The Upload mirror now includes a live readiness summary (staged file count/size/section coverage + case targeting) so operators can validate upload context before sending.
- Upload actions now use operation interlocks: while Send, Auto-Collect, AI analysis, or dropped-link downloads are running, conflicting upload actions are disabled to prevent duplicate clicks and race conditions.
- Multi-file staging now skips duplicate files automatically and enforces a practical staging cap (80 files) to keep sessions stable under heavy operator workloads.
- `Auto-Collect` uses section-specific Mobizio source URLs:
  - `Social Work`, `Moving & Handling`, and `Additional Documents` start from `/case_document_list?caseId=<id>&serviceId=1000801`
  - `Initial Assessment` starts from `/case_data_group?caseId=<id>&serviceDataGroupId=1014998`
  - `Care Plan` starts from `/eoutcomeservice/branch/case_care_plans_dashboard?caseId=<id>`
- Initial Assessment and Care Plan source pages now fallback to case Documents when no downloadable records are exposed, improving recovery on sparse section dashboards.
- Selection rules for auto-collect: Care Plan and Moving & Handling are single-select; all other Intake sections allow multi-select.
- Auto-collect ranking now uses latest-first prioritization for Initial Assessment, Care Plan, and Additional Documents, and the picker preselects the strongest latest candidate by default.
- Intake now includes an `Auto-Download Info` diagnostics panel that tracks the latest auto-collect run (source, counts, fallback use, duration, and error details) with a `Copy Report` shortcut.
- The Upload `Target & Readiness`, `Auto-Download Info`, and Autofill `Session Snapshot` cards now each show an explicit recommended next step so operators can tell whether to sync, retry, analyze, review, send, or start without interpreting raw diagnostics first.
- The popup header `?` button now opens a built-in operator guide with the recommended workflow, auto-download recovery advice, and keyboard shortcuts, and the guide can be copied directly for support handoffs.
- The auto-collect picker now supports inline filtering by document metadata, `Select suggested` bulk actions, confidence-aware row diagnostics (confidence label + keyword matches), and richer technical row details (download ID and URL hint count) before files are fetched.
- Auto-collect now deduplicates repeated document selections before download to avoid duplicate file staging in a single run.
- Auto-collect now performs retry-aware scraping and includes frame/loose-link fallback discovery so collection is more resilient when Mobizio table rendering is delayed or non-standard.
- Auto-collect download resolution now follows response-aware deep links from intermediate HTML pages and resolves relative links against the correct page/frame base URL.
- Auto-Download diagnostics now include scrape-attempt counts to make retry behavior visible when Mobizio pages render slowly.
- Auto-Download diagnostics now include high-confidence suggestion counts and deduped selection counts in both the live panel and copied report output.
- The extension popup now uses a fully overhauled visual design system (cards, tabs, controls, dialogs, and responsive spacing) while preserving existing workflows.

## Extension Packaging & Rollout

1. Update `manifest.json` if you are preparing a release build.
1. Build the package with `npm run package:extension`.

   - This always produces `dist/edge-acp-autofill.zip`.
   - It also produces `dist/edge-acp-autofill.crx` when Chromium is available in the build environment.

1. Install or distribute the artifact using one of the supported flows below.

### Local Browser Install

- ZIP workflow: extract `dist/edge-acp-autofill.zip`, then open Edge **Extensions** and choose **Load unpacked** for the extracted folder.
- CRX workflow: if `dist/edge-acp-autofill.crx` is available and your environment allows direct CRX installs, use that artifact for browser installation.

### CareAssurance Admin Rollout

- Popup workflow: open the extension popup, connect to CareAssurance, and use the **Extension Status** card to download, rebuild/download, or `Bump Version & Download ZIP` directly from the popup. The CRX shortcut remains available when that artifact is present or can be rebuilt.
- Workflow safety: the popup now uses one shared readiness model across Workspace, Intake, and Autofill. If the attached page is stale, the installed extension version is behind the server package, or the selected service user and Case ID drift apart, the popup will warn first and route the operator to the correct recovery step before upload sync or Autofill start continues.
- Popup UX: the main tabs now show live status subtitles, the context strip highlights target/payload readiness, and the Command Center keeps a condensed health snapshot visible even while the detailed diagnostics remain collapsed.
- Guided next steps: the popup now keeps explicit operator guidance on the Upload target card, Auto-Download diagnostics card, and Autofill session card so the recommended recovery or continuation action stays visible even when deeper diagnostics remain collapsed.
- Rollout guidance: the popup `Extension Status` card now mirrors the same rollout sequence as `Extension Manager` by showing website-sync state plus the three practical next steps: update the published build, install the package in Edge, and refresh CareAssurance tabs.
- Admin page workflow: use `/admin/extension-manager` for the full rollout workspace, including rebuild/download actions and runtime-config review.
- Server behavior: the popup/admin rebuild actions call the same packaging script as `npm run package:extension`, so ZIP/CRX artifacts stay aligned across local and server-assisted rollout paths.

### Notes

- A CRX artifact is optional. If Chromium is not installed on the machine doing the build, the ZIP flow still succeeds and remains the default install path.
- The repository currently documents packaging plus authenticated rebuild/download workflows. If Edge Add-ons store publication is reintroduced later, add those scripts and workflows explicitly before documenting them here again.

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
