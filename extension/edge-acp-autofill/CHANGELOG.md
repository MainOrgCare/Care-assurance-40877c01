# Changelog - Care Assurance ACP Autofill Extension

## Version 0.6.43 - Realistic Typing Fidelity & Shared Helper

### Improvements

- **"Realistic Typing" fill mode now actually behaves like a human typist.** The shared `typeLikeHuman` helper across `content-acp.js`, `content-initial-assessment.js`, and `content-emar.js` previously only fired `input` events at a uniform 25–55ms cadence. Many Mobizio form fields and embedded validators key off `keydown` / `beforeinput` / `keyup`, so typed values were sometimes ignored or treated as a paste, and the cadence felt mechanical. The helper now:
  - Dispatches a full `keydown` → `beforeinput` → value mutation → `input` → `keyup` event sequence for each character, with `KeyboardEvent.key`/`code` populated for letters, digits, space, and Enter.
  - Uses character-aware delays: faster for letters/digits, longer pauses for spaces, punctuation, and newlines, plus an occasional ~7% "thinking" pause mid-word so the cadence is not perfectly periodic.
  - Awaits an initial focus delay before clearing the field so focus listeners run before the first character.
  - Falls back gracefully on contenteditable targets by mutating `textContent` instead of the `value` setter.
  - **Caps total per-field typing duration at ~6 seconds** by scaling per-character delays proportionally for very long inputs (e.g. 400-char control measures), so a multi-field workflow no longer stalls for several minutes in Realistic mode.
  - **Skips disabled/read-only/`aria-disabled` fields** rather than silently emitting events into a non-fillable target.
- **Extracted shared typing pipeline into `realistic-typing.js`**, loaded first in `manifest.content_scripts` so each Mobizio content script delegates to a single `window.__CA_RealisticTyping` implementation. Each consumer keeps a small inline fallback in case the shared module fails to load. Net: ~330 lines of duplicated typing logic removed across the three content scripts.

### Versioning

- Bumped extension version to `0.6.43` and synchronized manifest.

## Version 0.6.42 - Auto-Collect XHR Fallback Fix

### Bug Fixes

- **Auto-collect: XHR string-response downloads no longer silently fail.** When Mobizio serves a document via XHR with the default `responseType = ""` (i.e. the page does not explicitly request a blob), the extension could not capture the response body. Previously the code detected a download-like response (by Content-Type / Content-Disposition), failed to extract a Blob because the response was a DOMString, and then silently dropped the result — *without* recording the URL as a candidate for the direct-fetch retry loop, because the `else if (responseUrl)` branch was only reached when `isDownloadLikeResponse` returned false. The auto-collect workflow would end with no downloaded file and no actionable error.
  - Fixed in **`runRowClickDownload`** and **`runCarePlanDashboardExport`**: when a download-like XHR response arrives but blob extraction yields nothing, the `responseURL` is now recorded as a candidate URL, allowing the direct-fetch fallback loop to attempt the download independently.

### Versioning

- Bumped extension version to `0.6.42` and synchronized manifest.

## Version 0.6.41 - Corporate Visual Refresh & Reliability Hardening

### Visual Polish (popup)

- Flattened popup surfaces to match the refreshed corporate slate/sky design system: removed `backdrop-filter: blur` from connection badges and tab nav, replaced light-leak gradients (`hsl(220, 18%, 97%)`, near-white pastels) on `.workspace-summary`, `.workspace-context-card`, `.main-launchpad-card`, `.main-view-state` (and variants), `.page-companion-state` (and variants), `.route-pill`, `.card`, `.card-header`, and `.popup-container` with theme-token solid surfaces.
- `.btn-primary` no longer uses a 180deg gradient with inset highlight — solid `var(--color-primary)` + restrained `--shadow-xs` / `--shadow-sm` only.
- Status variants now use `color-mix(in oklab, var(--color-muted), <accent>)` so they adapt cleanly across dark, midnight, ocean, and aurora themes instead of clashing with hardcoded near-white backgrounds.

### Reliability

- `executeScriptInTab` now races `chrome.scripting.executeScript` against a 30s timeout (configurable via `options.timeoutMs`, capped at 120s) so a stalled Mobizio page can no longer hang the auto-collect / autofill workflow indefinitely.
- `requestCareAssurancePageExtensionStatus` (Page Companion health probe) now races a 3s timeout so a stale content-script bridge that receives but never replies surfaces as a refresh-required warning instead of hanging the popup.

### Diagnostics

- `cacheDomElements` in `popup/ui.js` now logs the list of missing DOM IDs after caching so template/HTML drift is visible in the console immediately rather than degrading silently.
- `apiProxy` in `popup/api.js` now logs proxy bridge errors and empty responses with `endpoint`, `method`, and `requestId` context so operators can distinguish runtime errors from absent responses without changing the public response shape.

### Versioning

- Bumped extension version to `0.6.41` and synchronized manifest.

## Version 0.6.40 - Built-In Operator Guide

### Help & Usability

- Replaced the tiny inline help note behind the popup header `?` button with a full operator guide dialog that explains the recommended Workspace → Intake → Autofill flow, auto-download recovery actions, and keyboard shortcuts.
- Added a `Copy Guide` action so operators can copy the workflow reference for handoff, troubleshooting, or rollout support without leaving the extension.

### Versioning

- Bumped extension version to `0.6.40` and synchronized popup module headers and visible version labels.

## Version 0.6.39 - Guided Next-Step UX

### Workflow Guidance

- Added explicit `Recommended next step` guidance to the Upload `Target & Readiness`, `Auto-Download Info`, and Autofill `Session Snapshot` cards so operators no longer have to infer the next action from button labels alone.
- The guidance now adapts to live workflow state with info, warning, and ready styling for cases such as disconnected sessions, retry-needed auto-downloads, staged analysis review, page refresh recovery, and ready-to-start Autofill runs.

### Versioning

- Bumped extension version to `0.6.39` and synchronized popup module headers and visible version labels.

## Version 0.6.38 - Rollout Guidance Alignment

### Extension Status Guidance

- Extended the popup `Extension Status` card with a dedicated website-sync summary so operators can immediately tell whether the current CareAssurance page is attached to the published build, needs a refresh, or has not detected the extension yet.
- Added the same three-step rollout guidance used by the admin `Extension Manager`: update the published build, install the package in Edge, then refresh CareAssurance tabs so website and extension contexts stay aligned.

### Operator Recovery

- Popup rollout guidance now adapts to admin and non-admin roles, current package availability, CRX availability, and stale page-attachment state instead of relying on one long status paragraph.
- This keeps popup and admin recovery wording aligned when operators are troubleshooting package updates or stale content-script attachment after an extension rollout.

### Versioning

- Bumped extension version to `0.6.38` and synchronized popup module headers and visible version labels.

## Version 0.6.37 - At-a-Glance Workflow UX

### Popup Clarity

- Added live status subtitles to the Workspace, Intake, and Autofill tabs so operators can see whether the extension is offline, staging files, ready to run, or waiting on recovery actions without opening each section first.
- Upgraded the context strip with readiness highlights for target alignment, payload staging, service-group readiness, and live workspace route context, making the active case state easier to scan.

### Operations Snapshot

- Added a compact Command Center quick bar in the collapsible header so health, queue posture, mode, and the top next-step recommendation stay visible even when the full diagnostics panel is closed.
- Styled the new summary surfaces to match the flatter corporate popup system instead of looking like ad-hoc diagnostics.

### Versioning

- Bumped extension version to `0.6.37` and synchronized popup module headers and visible version labels.

## Version 0.6.36 - Workflow Safety and Context Continuity

### Workflow Safety

- Added a shared popup workflow-safety model so the Workspace launchpad, Intake handoff summary, Autofill session card, and tab badges all react to the same continuity blockers instead of using separate readiness heuristics.
- New warnings now surface before operators start a fresh run when the extension is behind the server version, the payload case does not match the active target, or the selected service user and typed Case ID drift apart.

### Context Continuity

- Upload handoff and Autofill start now block on real target mismatches and missing IDs instead of letting the run fail deeper in the workflow.
- Session-card actions can now route directly into the right recovery step, including reviewing Extension Status, re-detecting IDs, reloading a stale page, or jumping back to the Autofill target fields.

### Versioning

- Bumped extension version to `0.6.36` and synchronized popup module headers and visible version labels.

## Version 0.6.35 - Auto-Download Reliability Signals

### Auto-Download Reliability

- Added a preflight download check to the Intake auto-download flow and reused that first result in the real download loop, so operators get an early warning without double-requesting the same first document.
- Increased the Mobizio scrape retry curve and surfaced an explicit render-wait status note while document tables are still settling, reducing false negatives on slower pages.

### Retry Diagnostics

- Failed auto-downloads are now categorized into actionable buckets such as auth, timeout, network, link-resolution, and file-format failures.
- The popup Auto-Download Info panel and copied run report now include failure-mix summaries, preflight state, and recovery guidance so operators know whether to retry, re-authenticate, or inspect the source page manually.

### Versioning

- Bumped extension version to `0.6.35` and synchronized popup module headers and visible version labels.

## Version 0.6.34 - Popup Version-Bump Download Shortcut

### Extension Status Actions

- Added a dedicated `Bump Version & Download ZIP` action to the popup `Extension Status` card so connected admins can generate a freshly versioned package without leaving the popup.
- Threaded the popup ZIP download flow through the existing server-side manifest bump path (`update=1`), preserving the current ZIP and CRX shortcuts while making one-click version increments available from the same rollout surface.

### Status Feedback

- Popup download success messages now report manifest-version bumps explicitly when a package action increments the extension version.

### Versioning

- Bumped extension version to `0.6.34` and synchronized popup module headers and visible version labels.

## Version 0.6.33 - Popup CRX Rebuild Shortcut

### Extension Status Actions

- Added a direct `Rebuild & Download CRX` action to the popup `Extension Status` card for connected admins when the CRX artifact is unavailable but can be regenerated through the existing authenticated `package.crx?fresh=1` flow.
- Kept the lighter `Download CRX` action for cases where a current CRX artifact already exists, so popup rollout actions now cover both immediate download and on-demand CRX regeneration.

### Status Visibility

- Updated popup status messaging and the `CRX` readiness row so admins can see when the CRX is available versus build-on-demand without leaving the popup.

### Versioning

- Bumped extension version to `0.6.33` and synchronized popup module headers and visible version labels.

## Version 0.6.32 - Direct CRX Popup Access

### Extension Status Actions

- Extended `/api/extension/status` to expose whether a CRX artifact is currently available, so the popup can make rollout choices without needing the heavier admin package-info path.
- The popup `Extension Status` card can now offer `Download CRX` directly for connected admins when a current CRX artifact is available, alongside the existing ZIP actions.

### Status Visibility

- Added a `CRX` readiness row to the popup status metadata so admins can see at a glance whether the signed-browser-installable artifact is available before opening `Extension Manager`.

### Versioning

- Bumped extension version to `0.6.32` and synchronized popup module headers and visible version labels.

## Version 0.6.31 - Status Action Locking and Refresh

### Extension Status Actions

- Locked the popup `Extension Status` actions while a package operation is running so admins cannot double-trigger download or rebuild requests from repeated clicks.
- After direct download or rebuild-and-download completes, the popup now refreshes extension status automatically so the card no longer stays stale until a manual refresh.

### Versioning

- Bumped extension version to `0.6.31` and synchronized popup module headers and visible version labels.

## Version 0.6.30 - Popup Rebuild and Download Shortcut

### Extension Status Actions

- Fixed the popup `Extension Status` renderer so it no longer references version-comparison state before initialization when deciding admin actions.
- Added a direct `Rebuild & Download ZIP` action for connected admins when the server package is stale or missing, using the existing authenticated `?fresh=1` package rebuild path from the popup.

### Status Clarity

- Updated stale and unavailable package guidance so admins can rebuild directly from the popup while `Extension Manager` remains available for the broader rollout workflow.

### Versioning

- Bumped extension version to `0.6.30` and synchronized popup module headers and visible version labels.

## Version 0.6.29 - Direct Admin Package Download from Popup

### Extension Status Actions

- Added an authenticated popup-side package download path so connected admins can download the latest extension ZIP directly from the `Extension Status` card when the server package is already current.
- Kept `Extension Manager` as the guided path when the server package is missing or stale, so rebuild-required cases still land in the right admin workflow.

### Status Clarity

- Updated the status-card guidance to be role-aware: admins now see direct download/rebuild guidance, while non-admin users are told when they need an admin to publish or rebuild the package.

### Versioning

- Bumped extension version to `0.6.29` and synchronized popup module headers and visible version labels.

## Version 0.6.28 - Faster Admin Access in Popup

### Admin Workflow Navigation

- Changed the popup Workspace Pulse admin action to open `Extension Manager` instead of the older generic admin portal, so extension rollout and package tasks land in the correct page immediately.
- Added an admin-only `Extension Manager` quick-launch pill to the popup Workflow Launchpad for one-click access from the main workspace tab.

### Versioning

- Bumped extension version to `0.6.28` and synchronized popup module headers and visible version labels.

## Version 0.6.27 - Popup Update Readiness Panel

### Extension Status Visibility

- Added a new `Extension Status` card to the popup Workspace tab so operators can compare the installed extension version against the server version without leaving the extension.
- The new panel also shows whether a packaged extension ZIP is currently available, whether that package is stale relative to source changes, and when runtime config was last updated.

### Guided Update Actions

- Added context-aware popup actions so disconnected users are prompted to sync first, while connected admins can jump straight into `Extension Manager` when an update or rebuild is recommended.
- Added `Extension Manager` workspace-route recognition in the popup so the live workspace context reads clearly when that admin page is opened from the extension.

### Versioning

- Bumped extension version to `0.6.27` and synchronized popup module headers and visible version labels.

## Version 0.6.26 - Latest-Document Auto-Collect Prioritization

### Intake Auto-Collect Relevance and Recency

- Strengthened section keyword matching for Initial Assessment and Care Plan so suggested files are more tightly aligned with section intent.
- Upgraded uploaded-date parsing to handle additional Mobizio date formats and avoid ambiguous numeric date misreads.
- Added inferred timestamp fallback from document metadata (filename/name/description) when upload-date columns are missing.
- Updated ranking behavior so Initial Assessment, Care Plan, and Additional Documents prioritize the latest relevant records before older suggestions.

### Picker Defaults and Download Reliability

- Updated default picker selection so single-select sections preselect the strongest latest candidate.
- Added latest-first preselection for multi-select sections where operators typically want the newest document quickly.
- Enabled Initial Assessment source fallback to case Documents when the source page has no downloadable records, improving latest-file retrieval reliability.

### Versioning

- Bumped extension version to `0.6.26` and synchronized popup module headers and visible version labels.

## Version 0.6.25 - Workflow Hardening and Professional Upload Controls

### Upload Workflow Reliability

- Added upload operation interlocks across Intake actions so conflicting controls are disabled while Send, Auto-Collect, AI analysis, or dropped-link downloads are in progress.
- Added explicit busy-state guidance and guarded action handlers to prevent duplicate clicks, race conditions, and accidental mid-run reset attempts.

### Staging Quality Controls

- Added duplicate-file suppression for manual/dropped uploads (both in-selection duplicates and files already staged in the target bucket).
- Added a practical staging cap of `80` files with operator feedback when additional files are skipped, helping keep heavy sessions stable and predictable.

### Operator UX

- Added an `Upload readiness summary` row in the Intake upload toolbar that reports staged file count, total size, section coverage, and current case-target readiness.
- Added disabled-state visuals for upload dropzones during active operations, improving clarity and reducing accidental interactions.

### Versioning

- Bumped extension version to `0.6.25` and synchronized popup module headers and visible version labels.

## Version 0.6.24 - Upload Reset Toolbar Action

### Upload Workflow UX

- Added a visible `Reset Upload` button beside `Send to CareAssurance Upload` in the Intake Upload toolbar for faster staging recovery.
- Refactored upload reset behavior into a shared handler so both the new toolbar reset action and existing clear action fully reset staged files, notes, analysis selections, sync status, and persisted uploaded-doc markers.
- Updated upload-toolbar layout styling to keep Send + Reset controls responsive on narrow popup widths.

### Versioning

- Bumped extension version to `0.6.24` and synchronized popup module headers and visible version labels.

## Version 0.6.23 - Deep-Link Download Reliability and Retry Telemetry

### Intake Auto-Collect Reliability

- Hardened documents-page URL detection by extracting real `case_document_list` targets from complex onclick/data-attribute navigation payloads.
- Improved scrape URL extraction so attribute/handler links are resolved against the correct document/frame base URI instead of only the top-level page URL.
- Improved download URL extraction and queueing so relative links discovered on intermediate HTML pages are resolved against each response URL before retrying.

### Auto-Collect Diagnostics

- Added scrape-attempt telemetry (`scrapeAttempts`) across auto-collect runs and surfaced it in both the live Auto-Download Info panel and copied report output.
- Expanded scrape retry behavior to three phased attempts before failing, reducing transient empty-result failures on slow Mobizio renders.

### Versioning

- Bumped extension version to `0.6.23` and synchronized popup module headers and visible version labels.

## Version 0.6.22 - Auto-Collect Reliability Hardening

### Intake Auto-Collect Reliability

- Improved Mobizio URL resolution during scraping/downloading so relative and query-style links are resolved against the active page correctly.
- Added same-origin frame-aware table discovery for document scraping, allowing auto-collect to detect records when table markup is rendered inside embedded frames.
- Added non-table loose-link extraction fallback for download/document controls when standard table structures are missing or delayed.
- Added retry-aware scraping before failure and after source fallback transitions to reduce transient empty-result runs on slow Mobizio renders.
- Expanded in-page download candidate discovery with filename-hint element matching and a larger candidate queue to better handle intermediate HTML download pages.

### Versioning

- Bumped extension version to `0.6.22` and synchronized popup module headers and visible version labels.

## Version 0.6.21 - Confidence Scoring and Detail Hardening

### Intake Auto-Collect Quality Improvements

- Upgraded document suggestion scoring from simple keyword counts to weighted confidence scoring across document name, filename, description, uploader metadata, upload recency, and download signal strength.
- Added confidence metadata to picker rows (confidence label + keyword match hints) to improve operator decision quality before download.
- Added `Select suggested` action in the picker for faster high-signal selection workflows.
- Added duplicate-selection protection before download to prevent repeated downloads of the same Mobizio document entry in one run.

### Diagnostics Enhancements

- Auto-Download diagnostics now track high-confidence suggestion counts and deduped selection counts in the live panel and copyable report output.

### Risk Assessment Detail Hardening (App)

- Strengthened risk-assessment quality gates with additional checks for risk diversity, low-detail risk rows, and evidence-to-risk coverage.
- Improved supporting-evidence backfill logic so generated outputs retain richer, document-grounded evidence sets when AI output is sparse.
- Upgraded rule-based fallback risk assessments to produce more detailed, evidence-anchored multi-risk narratives.

### Versioning

- Bumped extension version to `0.6.21` and synchronized popup module headers and visible version labels.

## Version 0.6.20 - Auto-Download Diagnostics and Picker Upgrades

### Intake Auto-Collect Diagnostics

- Added a dedicated `Auto-Download Info` panel in the Intake Upload tab to surface live auto-collect telemetry (source, discovered/suggested/selected counts, downloaded/failed counts, fallback usage, and duration).
- Added `Copy Report` for one-click export of the latest auto-collect diagnostics packet for troubleshooting and support handoff.

### Auto-Collect Picker Improvements

- Improved the picker subtitle with source-aware context (section source + case ID) rather than generic document-list copy.
- Added an in-dialog filter/search field for fast narrowing by name, filename, description, uploader, date, or document ID.
- Added result counters and enhanced row metadata (`downloadId` and URL hint counts) to improve operator visibility before download.

### Download Failure Transparency

- Enhanced partial-failure messaging and diagnostics capture to include attempted download paths per failed document where available.
- Auto-collect status now reports partial outcomes with warning-level upload sync status instead of masking mixed success/failure runs as full success.

### Versioning

- Bumped extension version to `0.6.20` and synchronized popup module headers and visible version labels.

## Version 0.6.19 - Intake Auto-Collect Download Reliability

### Auto-Collect Download Pipeline

- Hardened Intake auto-collect file staging when Mobizio returns generic file metadata (`application/octet-stream` or filename without extension).
- Added post-download file type inference (filename hints + MIME + content signature) so selected documents are normalized into supported upload formats (`pdf`, `doc`, `docx`, `txt`, `csv`) before staging.
- Extended downloaded-file metadata transfer from in-page fetch results to improve fallback naming and reduce false "unsupported file" rejects.

### Intake Upload Validation

- Updated upload bucket validation to accept supported MIME types as a fallback when extension metadata is incomplete, improving compatibility with auto-collected files.

### Versioning

- Bumped extension version to `0.6.19` and synchronized popup module headers and visible version labels.

## Version 0.6.18 - Section-Specific Auto-Collect Routing

### Source URL Routing

- Updated Intake auto-collect to open section-specific Mobizio sources instead of always starting from the documents page:
  - Initial Assessment now starts from `/case_data_group?caseId=<id>&serviceDataGroupId=1014998`
  - Support Plan now starts from `/eoutcomeservice/branch/case_care_plans_dashboard?caseId=<id>`
  - Other sections continue to start from `/case_document_list?caseId=<id>&serviceId=1000801`

### Download Fallback Behavior

- Added a safe fallback path: when a section source page does not expose a downloadable documents table directly, auto-collect discovers and navigates to the case Documents link and continues download/picker flow there.

### Versioning

- Bumped extension version to `0.6.18` and synchronized popup module headers and visible version labels.

## Version 0.6.17 - Mobizio Auto-Collect Reliability Hardening

### Document Discovery Improvements

- Hardened Mobizio document list scraping to wait for delayed table rendering before failing.
- Added fallback table detection beyond `#documentsTable` so auto-collect remains resilient when Mobizio markup varies.
- Expanded row parsing to detect document rows from classes, IDs, and column structure instead of relying on a single row marker.

### Download Reliability Improvements

- Improved download ID extraction from row/element attributes and click handlers.
- Added broader candidate download path inference and case-aware URL templates.
- Added HTML follow-up parsing during download attempts so redirect/intermediate pages can surface the real file URL.

### Versioning

- Bumped extension version to `0.6.17` and synchronized popup module headers and visible version labels.

## Version 0.6.16 - Complete Popup Design Overhaul

### Visual System Refresh

- Rebuilt the popup visual language with a new "Operations Studio" theme using a refreshed teal/brass palette, atmospheric layered backgrounds, and redesigned card surfaces.
- Updated header, tab navigation, buttons, forms, status boxes, upload buckets, dialogs, logs, and footer to create a more cohesive and modern extension UI.
- Added staged entry animations and refined spacing/typography so the popup feels faster and easier to scan during workflows.

### Responsiveness and Stability

- Added responsive refinements for narrow popup widths so header, tab shell, cards, and action rows remain usable on smaller viewport sizes.
- Kept existing interaction and workflow logic unchanged so all extension features continue to work with the redesigned interface.

### Versioning

- Bumped extension version to `0.6.16` and synchronized popup module headers and visible version labels.

## Version 0.6.15 - Mobizio Auto-Collect for Intake Documents

### Intake Auto-Collect Workflow

- Added `Upload` and `Auto-Collect` action buttons to every Intake upload section.
- Added Mobizio document auto-collect flow that opens `/case_document_list?caseId=<selectedCaseId>&serviceId=1000801`, reads `#documentsTable`, and presents a picker with Name, Filename, Description, Uploaded Date, and uploader.
- Added section-aware document suggestions and selection rules in the picker:
  - Support Plan and Moving & Handling enforce single selection.
  - Social Work, Initial Assessment, and Additional Documents allow multi-selection.
- Added staged-download conversion from Mobizio document entries into extension file buckets so selected files are immediately ready for `Send to CareAssurance Upload`.

### Versioning

- Bumped extension version to `0.6.15` and synchronized popup module headers and visible version labels.

## Version 0.6.14 - Main View Launchpad Refresh

### Popup Main View Improvements

- Added a new `Workflow Launchpad` panel on the default `Workspace` tab to improve the first-click extension experience.
- Introduced a context-aware main status card that adapts to disconnected, connected-without-tab, and live-workspace states.
- Added smart primary/secondary launch actions that dynamically switch between `Sync Session`, `Focus Current Page`, `Refresh Context`, and route navigation based on live workspace state.
- Added fast workflow shortcut pills for `Care Planning`, `Risk Assessment`, `Plan Enhancer`, and `Messages`, including active-route highlighting when the connected tab matches a shortcut.

### Versioning

- Bumped extension version to `0.6.14` and synchronized popup module headers and visible version labels.

## Version 0.6.13 - Anchored Popup Drag Reliability

### Main Menu Dragging Reliability

- Fixed main extension menu dragging when opened under the browser Extensions button: dragging from the header/tab bar now detaches the anchored popup into a movable window.
- Added detached-window reuse behavior so opening the extension again focuses the existing detached popup window when one is already open.
- Preserved drag target guardrails so button/input interactions (including pin controls) do not trigger drag.

### Versioning

- Bumped extension version to `0.6.13` and synchronized popup module headers and visible version labels.

## Version 0.6.12 - Main Menu Drag Reintroduced

### Popup Main Menu Dragging

- Reintroduced draggable behavior for the main extension popup menu using the same click-and-drag pointer interaction model used by risk-assessment autofill overlays.
- Drag handles are applied to the popup header and tab-navigation surfaces, with guardrails to avoid dragging when interacting with buttons, inputs, or tabs.

### Versioning and Permissions

- Restored the `windows` permission in `manifest.json` for popup window reposition updates.
- Bumped extension version to `0.6.12` and synchronized popup module headers and visible version labels.

## Version 0.6.11 - Simplified Overlay Controls + URL Drop Downloads

### Interaction Simplification

- Removed draggable behavior from popup and in-page ACP/EMAR/Initial Assessment panels to prevent unstable movement interactions.
- Removed panel resize interactions and hidden resize handles while preserving existing pin and minimize controls.

### Upload Dropzone Enhancement

- Added dropped-link upload support in extension dropzones: dragging an `http`/`https` file URL into a section now downloads the file and stages it in that specific upload bucket.
- Added validation and feedback for unsupported link types or failed downloads.

### Versioning

- Bumped extension version to `0.6.11`, removed the no-longer-required `windows` permission, and synchronized popup module headers and visible version labels.

## Version 0.6.10 - Drag/Resize Runtime Fixes

### In-Page Overlay Reliability

- Hardened ACP, EMAR, and Initial Assessment panel drag/resize interactions with explicit pointer-capture tracking so drag/resize continues to work even when pointer events are noisy or move across nested frame boundaries.
- Added `touch-action: none` + user-select guards on resize handles to prevent gesture conflicts that could leave the resize icon visible but non-responsive.

### Popup Dragging Behavior

- Native popup-window dragging is now only enabled when the extension is already running in a detached popup window.
- Dragging from the toolbar popup now launches a detached popup window automatically, which can then be moved and resized normally at the OS/window-manager level.

### Versioning

- Bumped extension version to `0.6.10` and synchronized popup module headers and visible version labels.

## Version 0.6.9 - Draggable Main Menu

### Popup Main Menu Dragging

- Added draggable behavior for the popup main menu surfaces (header and tab navigation) so operators can reposition the extension popup window while it is open.
- Implemented guarded pointer handling to avoid interfering with interactive controls (tab buttons, inputs, and action buttons) while dragging.
- Added robust window-move queuing/cleanup in `popup/main.js` to keep drag interactions smooth and resilient.

### Permissions and Versioning

- Added the `windows` permission in `manifest.json` to support popup window repositioning.
- Bumped extension version to `0.6.9` and synchronized popup module headers and visible version labels.

## Version 0.6.8 - Drag/Resize Reliability Fix

### Runtime Panel Interaction Fixes

- Replaced browser-native panel resizing with explicit in-panel resize handles for ACP and EMAR overlays, improving reliability across extension runtime contexts.
- Upgraded overlay drag interactions to robust primary-pointer handling (mouse/touch) with viewport-safe bounds and interaction cleanup.
- Preserved collapse behavior while retaining custom panel size by forcing collapsed overlays to use auto dimensions.

### Initial Assessment Verification Panel

- Added an explicit resize handle and matching pointer interaction handling to the verification summary panel for consistent resize/move behavior.
- Improved minimized-state sizing so resizing remains stable when toggling between minimized and expanded states.

### Versioning

- Bumped extension version to `0.6.8` and synchronized popup module headers and visible version labels.

## Version 0.6.7 - Draggable + Resizable Runtime Panels

### Overlay Mobility Improvements

- Added drag-to-move behavior for ACP and EMAR in-page runtime overlays using the overlay header as a drag handle, with viewport clamping to keep panels accessible.
- Enabled panel resizing for ACP and EMAR overlays (`resize: both`) with minimum size and viewport-aware bounds so operators can tune panel footprint while working.

### Initial Assessment Verification Panel

- Added drag-to-move and resize support to the Initial Assessment verification summary panel while preserving existing pin/minimize controls.
- Updated minimized-state sizing behavior so the verification panel collapses cleanly even after custom resizing.

### Versioning

- Bumped extension version to `0.6.7` and synchronized popup module headers and visible version labels.

## Version 0.6.6 - Header Clarity + Global Pin Control

### Header UX Fixes

- Removed duplicate username rendering in the popup header by simplifying the connection badge display and clearing the extra header user chip.
- Added an always-visible header pin control so operators can lock/unlock in-page overlays directly from the extension popup without switching tabs.

### Overlay Pin Coordination

- Extended `CA_EXTENSION_TOGGLE_OVERLAY` handling in ACP/EMAR/Initial Assessment content scripts to accept a `pin` payload from the popup and immediately apply persistent pin state.

### Versioning

- Bumped extension version to `0.6.6` and synchronized popup module headers and visible version labels.

## Version 0.6.5 - Manual Send Staging

### Upload Transfer Control

- Updated extension upload mirroring so drag/drop only stages files in the popup and does not auto-send them to CareAssurance.
- Removed automatic sync triggers tied to file add/remove, notes edits, and connection checks; files now transfer only when `Send to CareAssurance Upload` is clicked.
- Refined upload status messaging to make staged vs sent state explicit for operators.

### Versioning

- Bumped extension version to `0.6.5` and synchronized popup module headers and visible version labels.

## Version 0.6.4 - Upload Mirror + Overlay Pin Controls

### Upload Workflow Parity

- Replaced the popup single upload area with app-style sectioned buckets (`Social Work`, `Initial Assessment`, `Care Plan`, `Moving & Handling`, `Additional Documents`) and drag/drop support per section in `popup.html`, `popup.css`, and `popup/main.js`.
- Added connected-session upload mirroring: popup files are serialized and sent to CareAssurance via `CA_EXTENSION_SEND_TO_APP`, then imported into the web app upload pipeline by `client/src/context/TemporaryDataContext.tsx`.
- Added upload sync status messaging and a manual `Sync to CareAssurance Upload` action alongside automatic sync scheduling.

### Overlay Lock/Pin UX

- Added persistent pin controls to the ACP and EMAR in-page overlays so users can keep the panel expanded and prevent accidental minimize/toggle while pinned.
- Added matching pin behavior to the Initial Assessment verification summary panel, including storage-backed persistence and pinned minimize guards.

### Versioning

- Bumped extension version to `0.6.4` and synchronized popup module headers and visible version labels.

## Version 0.6.3 - Command Center State Layer + Runtime Resilience

### Critical Content-Script Fixes

- Fixed Initial Assessment dedupe guards to use `batchId + currentIndex` so later people in the same batch are not skipped as already processed.
- Hardened ACP/EMAR/generic content-script logging so `chrome.runtime.sendMessage` failures from invalidated extension contexts are treated as safe fallbacks instead of unhandled crashes.
- Improved ACP/EMAR/generic retry behavior by setting processed markers only after key preconditions pass and clearing markers when autofill aborts or fails, preventing stuck queue entries after transient page-state issues.

### Command Center State Layer

- Added centralized command-center and diagnostics view-model builders in `popup/state.js`.
- `popup/main.js` now builds command-center state and runtime diagnostics state once per refresh cycle and passes model objects to rendering, reducing UI-side derivation drift.
- Added `Operational Flags` chips and a new `Copy Incident Packet` command-center action for faster support handoffs.

### Runtime Diagnostics UX

- Upgraded diagnostics from plain rows to a severity-aware panel with summary badge, key metric cards, structured runtime rows, and alert strips.
- Added severity styling (`healthy`, `degraded`, `critical`) and responsive diagnostics card layout updates in `popup.css`.

### Popup Layout Refinements

- Added a dedicated header actions container so the connected-user chip can render alongside connection/help controls.
- Refreshed the popup default footer version label and synchronized module headers/manifests to `v0.6.3`.

## Version 0.6.2 - Popup Performance + UI Refresh

### Performance Improvements

- Replaced popup's fixed 3-second full refresh loop with a debounced scheduler in `popup/main.js` to prevent overlapping refresh calls and reduce repeated storage/tab query load.
- Added workspace refresh cooldown logic and visibility-aware refresh behavior so heavy companion/workspace updates are skipped while the popup is hidden.
- Added log-render fingerprinting to avoid re-rendering the log panel when nothing changed.
- Reduced in-page overlay polling load for ACP and EMAR workflows by increasing interval cadence and skipping refreshes when the page is hidden or overlay is collapsed.
- Added field/table lookup caching in `content-initial-assessment.js` so large IA forms do not re-run expensive selectors for every fill operation.

### Design Refresh

- Updated popup typography to a local-first stack (no remote font dependency) for faster first paint.
- Applied visual hierarchy upgrades in `popup.css` with stronger card depth, sticky frosted tab navigation, clearer status rails, and a more prominent primary Autofill action style.

## Version 0.6.1 - Initial Assessment Review Type Selection

### Initial Assessment Workflow

- Added support for the Mobizio assessment-type selector (`form_component_1277_1`) with explicit values for `Initial Visit / Service Setup`, `6 Monthly Review`, and `Annual Review`.
- Initial Assessment autofill now applies the selected review type before filling section 13 details and writes the matching conditional review-date field (`form_component_1283_1`, `form_component_1284_1`, or `form_component_1285_1`) when an assessment date is present.
- Plan Enhancer "Send to IA Form" payloads can now include the selected assessment type so the extension fills the correct branch automatically.

### Runtime Mapping Fix

- Fixed auto-run payload handling in `content-initial-assessment.js` so mapped Plan Enhancer data is used during autofill execution instead of the unmapped nested source object.

## Version 0.6.0 - Command Center Foundations

### Runtime Stability Gate

- Rebuilt the custom-form adapter in `content-generic.js` to remove malformed helper placement and restore a deterministic field-resolution pipeline.
- Removed duplicate processed-key declarations in `content-emar.js` and `content-initial-assessment.js` so batch-aware dedup guards execute safely on every run.
- Standardized custom-form dedup behavior with batch-aware processed keys (`batchId + currentIndex`) to prevent stale session guards from skipping new queue runs.

### Popup Command Center (Phase 1)

- Added a new `Operations Command Center` panel to the Autofill workspace with:
  - Live health posture (`Idle`, `Ready`, `Running`, `Incident`)
  - Reliability score based on runtime proxy metrics
  - Queue progress snapshot and active mode indicator
  - Timeline feed for runtime activity, queue progression, and incidents
  - Actionable recommendations based on payload, verification, reliability, and error state
- Added `Sync`, `Copy Ops Snapshot`, and `Clear Incident` controls for faster operational handling during live autofill sessions.
- Wired command-center state updates to queue, payload, metrics, and incident changes so operators see status shifts immediately.

### Diagnostics Improvements

- `refreshPayloadStatus` now includes queue and incident keys in its storage load path, ensuring popup state and companion context stay aligned.
- Storage listeners now trigger payload/command-center refresh on queue and incident updates, improving telemetry coherence.

### Versioning

- Bumped extension version to `0.6.0` and synchronized popup module headers and inline version references.

## Version 0.5.9 - Invalidated Context Guard

### Runtime Resilience

- Fixed an unhandled promise path after extension reloads or updates by making the shared storage helper catch synchronous `chrome.storage` and runtime bridge failures and resolve safe fallbacks instead of throwing into content scripts.
- This prevents ACP and other content scripts from crashing their overlay refresh path with `Extension context invalidated` while the page is waiting for the user to refresh and attach the new extension context.

## Version 0.5.8 - ACP Risk Form Auto-Detection

### Risk Assessment Autofill

- Replaced the ACP risk-assessment hardcoded table id and fixed `form_component_10*` to `form_component_16*` row mapping with automatic table, row, and field discovery based on labels, headers, and nearby form context.
- Added fallbacks that can identify top-level service-user, assessor, assessment-date, reason, training-needs, and per-risk row fields even when Mobizio layout details drift between forms.
- Kept the runtime fail-safe behavior: if the script cannot confidently detect the risk form structure, it now logs the mapping failure and stops instead of writing into the wrong fields.

## Version 0.5.7 - Batch Autofill Reliability & Realistic Typing

### Batch Autofill Reliability

- Fixed reused Mobizio tabs skipping later autofill runs for different people by making content-script processed guards batch-specific instead of reusing only the queue index.
- Applied the batch-specific processed-key fix across ACP, EMAR, Initial Assessment, and generic custom-form autofill flows.

### Realistic Typing

- Fixed `Realistic Typing` mode so it is honored on Initial Assessment and EMAR flows instead of silently falling back to instant value assignment.
- Switched slow and instant text entry paths to safer native value-setting plus input/change/blur dispatching so Mobizio form listeners are more likely to register typed values consistently.

## Version 0.4.2 - Accessibility, Code Quality & UX Polish

### Accessibility (A11Y)

- Skip-to-content link for keyboard users.
- Tab navigation uses `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`, and `aria-controls`/`aria-labelledby` for screen-reader compliance.
- Error banner now has `role="alert"` and `aria-live="assertive"`.
- Decorative SVG icons marked `aria-hidden="true"`.
- Search input, file upload label, connection badge, and sort dropdown all have `aria-label`.
- Auto-submit/Dry-run checkboxes wrapped in `<fieldset>` with `<legend>`.
- `@media (prefers-reduced-motion: reduce)` disables all animations/transitions.
- Focus-visible outlines on service user items, recent items, and autofill user options.
- Arrow key navigation between tabs (Left/Right).

### Event Delegation

- Service user list and autofill user dropdown now use parent-level event delegation instead of per-item `addEventListener`, preventing memory leaks when lists re-render.

### Dialog Improvements

- Confirmation dialog now has `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap (Tab/Shift+Tab cycle), and ESC to dismiss.
- "Clear All Data" dialog now enumerates all items being removed in a styled detail list.

### Inline Validation

- Case ID and Service Data Group inputs show inline red border + error message on blur when empty.
- `aria-invalid="true"` set on invalid fields for screen readers.
- Validation clears automatically on input.
- Focus moves to first invalid field when Start Autofill is pressed with missing data.

### Service User Show-More & Sort

- Service user list now paginates with "Show X more" link instead of hard 10-item cap.
- Sort dropdown (A–Z, Has Care Plan, Has Risk) in service users section header.

### Keyboard Shortcuts

- `Ctrl+Enter` → Start Autofill from anywhere.
- `Escape` → Close dialogs, dropdowns, or help panel.
- Help `?` button in header toggles keyboard shortcut reference panel.

### UX Polish

- Connected user chip with initials shown in header when connected.
- File upload label shows visual drag-over state (blue border, scale) with proper drag counter.
- Footer status dot pulses green when connected.
- Payload size warning shown when payload exceeds 1 MB.
- Service user items have `tabindex="0"` and `role="button"` for keyboard activation (Enter/Space).
- Autofill user options have `role="option"` and `tabindex="0"`.
- Focus management: selecting an autofill user focuses Case ID input and clears validation errors.
- Auto-detect button has a more descriptive title tooltip.

### Code Quality

- Storage listener (`chrome.storage.onChanged`) wrapped in try-catch per branch to prevent silent crashes.
- `switchTab()` now manages `aria-selected` and `hidden` attributes for proper ARIA tab semantics.

### CSS Additions (~280 lines)

- Form validation error states, search focus ring, file upload drag states.
- Skip link, help button, show-more link, sort dropdown, keyboard shortcut badge.
- Header user chip with glass-morphism, fieldset/legend styling, Firefox scrollbar.
- Dialog fade-in animation, enhanced live-progress pip with glow, dialog detail list.
- Info panel toggle, payload size warning, footer live pulse dot.

---

## Version 0.4.1 - UX Enhancement & Interactive Polish

### Loading States

- All async buttons (Connect, Load Care Plan, Load Risk Assessment, Analyze, Start Autofill) now show an inline CSS spinner with disabled state during operations.
- `setButtonLoading()` helper toggles `.is-loading` class and injects/removes `.spinner` element.

### Confirmation Dialog

- "Clear All Data" now opens a centered confirmation dialog with blur backdrop overlay before destructive action.
- `showConfirmDialog(title, message, onConfirm)` helper creates modal dialog with Cancel/Confirm buttons.

### Enhanced Toast Notifications

- `showSuccess()`, `showError()`, `showInfo()` now render styled toasts with SVG icons (checkmark, X, info circle).
- Toasts auto-dismiss with exit slide animation after 3.5 seconds.

### Tab Badge Indicators

- Autofill tab shows a green success dot when payload is loaded.
- Upload tab shows a count badge when files are selected.
- `updateTabBadges()` manages badge lifecycle across payload and file state changes.

### Structured Log Display

- Log entries now render as formatted `<div class="log-entry">` with timestamp, color-coded level badge, and message.
- Auto-detects log level (error/warn/success/info) from message content.

### Step Indicator

- Upload tab shows a 3-step progress indicator (Select → Upload → Analyze).
- `updateUploadSteps(step)` manages active/completed states and connector fills.

### Service User Count Badge

- Service Users section header shows a badge with the total user count.

---

## Version 0.4.0 - Design System Overhaul & UX Polish

### Complete CSS Redesign

- New v0.4.0 design system with refined HSL-based color palette, multi-layered shadows, and CSS custom properties for motion and timing.
- Header: gradient background with radial overlays, backdrop-filter blur, refined typography with -0.02em letter-spacing.
- Connection badge: glass-morphism with backdrop-filter blur, per-state glow effects (connected/connecting/error/disconnected).
- Tab navigation: pill-style active indicator with primary-ghost background and subtle border.
- Cards: hover elevation transitions, refined card-header borders, consistent 12px radius.
- Buttons: gradient backgrounds with inset highlight, scale(0.98) active press states, disabled opacity 0.45.
- Forms: accent-colored focus rings with box-shadow, improved placeholder opacity.
- Log container: dark theme (hsl(222, 30%, 14%)) with JetBrains Mono font for diagnostics.
- Animations: healthPulse, connectingPulse, pipPulse, alertSlideIn, toastSlide, fadeIn, slideUp.
- All transitions use CSS custom property durations (--duration-fast/normal/slow) with ease-out cubic-bezier.
- Responsive breakpoints at 520px, 420px, and 360px for small-popup graceful degradation.
- Inter font family as primary, JetBrains Mono for code/logs.

### Enhanced HTML Structure

- Document type grid: Added colored SVG icons (blue/violet/amber/sky) and descriptive hints for each document type card.
- File upload area: Added upload icon SVG with "Drop files here or click to browse" prompt and format hint.
- Signature upload: Replaced button with styled label-based upload area with pen icon and format hint.
- Footer: Cleaned up version display, now shows "CareAssurance v0.4.0" from manifest.

### Service User List Improvements

- Service users are fetched from CareAssurance on connect and held in memory only — never persisted to extension storage.
- Removed stale `caAcpServiceUsers` fallback storage key.
- Improved `displayServiceUsers` with proper HTML escaping, better empty states for search vs no-data, and "Showing 10 of N" overflow indicator.
- `selectUser` now shows user avatar with initials, badges, and optional summary box for richer context.

### Code Quality

- Version header bumped to v0.4.0 across manifest.json, popup.js, and CSS.
- Dead files slated for cleanup: popup-old.js, background-enhanced.js, test-extract-single-value.js, popup.css (replaced by popup.css.new).

---

## Version 0.3.7 - Reliability & Code Quality Overhaul

### MV3 Service Worker Resilience

- Integrated keep-alive mechanism (25-second self-ping) to prevent premature MV3 5-minute timeout during long-running batch autofill operations.
- Keep-alive automatically starts on autofill begin and stops on completion or manual stop.
- Added `onSuspend` cleanup listener to gracefully stop keep-alive on worker shutdown.
- Service worker `onMessage` listener is now wrapped in try-catch to prevent unhandled exceptions from crashing the worker.

### Content Script Stability

- All four content scripts (ACP, EMAR, Initial Assessment, Generic) now have `window.__CA_*_INITIALIZED` guards to prevent double-initialization when scripts are re-injected.
- Overlay initialization in content-acp.js and content-emar.js now guards against missing `document.body`, deferring to `DOMContentLoaded` when DOM is not ready.
- Overlay refresh interval reduced from 1.5s to 3s to decrease CPU overhead on long-running pages.

### Storage Key Centralization

- Added `serverUrl`, `lastTab`, and `lastAutofillUser` to `STORAGE_KEYS` in constants.js.
- Replaced all hardcoded storage key strings in popup.js with proper `STORAGE_KEYS.*` references for consistency and maintainability.
- Fallback storage key definitions in popup.js updated to include the three new keys.

### Debug & Production Logging

- Added a global `DEBUG` flag to constants.js (default `false`) exported via `CA_EXTENSION_CONSTANTS`.
- All DEBUG console.log statements in content-app.js and content-initial-assessment.js are now gated behind the `CA_DEBUG` flag — zero console noise in production.

### Pre-Start Validation

- Autofill start now validates: Case ID present, Service Data Group ID present, payload loaded, and assessments non-empty before proceeding.
- Stale verification fields are cleared before each new autofill start.
- Background response errors are surfaced to the user with a visible error message.

### Connection Error UX

- Connection badge shows distinct "error" state with red styling when connection fails.
- "Open CareAssurance in a New Tab" action button appears automatically when no connected tab is found.
- Skipped files during document analysis now show a visible warning message (mentioning supported .txt/.csv formats).

### Autofill Completion Notification

- Badge text flashes "✓ Complete" for 4 seconds when an autofill batch finishes.
- 30-minute periodic GDPR cleanup interval runs while the popup is open to remove stale sensitive data.

### Code Cleanup

- Removed unused files: popup-old.js (~600 lines), background-enhanced.js (~210 lines), test-extract-single-value.js.

---

## Version 0.3.6 - UX & Productivity Overhaul

### Persistent State

- Popup now remembers the last active tab (Workspace / Intake / Autofill) and restores it on next open.
- Last selected autofill service user is restored across popup sessions.

### Connection Health Widget

- Connection badge shows four distinct states: Connected (with uptime timer), Connecting (pulsing), Error, and Disconnected.
- Live uptime counter ticks every second while connected.

### Signature Preview

- Uploaded signature images now show an 80×48 thumbnail preview alongside the upload controls.
- Preview clears when the signature is removed.

### Keyboard Navigation

- Autofill user dropdown supports Arrow Up/Down, Enter to select, and Escape to close.
- Active option is visually highlighted as you navigate.

### Payload Review Panel

- New collapsible "Payload Review" card previews the structured data that will be filled (assessment titles, field counts, first few values).
- "Looks Good — Start Autofill" button confirms and starts directly from the review.

### Live Autofill Progress

- New collapsible "Live Autofill Progress" panel with animated progress bar, percentage label, current-field indicator, and per-field pip indicators (done / active / error states).
- Driven by storage change events for real-time updates without polling.

---

## Version 0.3.5 - Connected Session Privacy Update (April 13, 2026)

### Privacy and Data Handling

- Sensitive care payloads now stay in transient extension session storage instead of persistent local extension storage.
- Care plan, risk assessment, initial assessment, signature, uploaded document, and verification payloads are cleared automatically when the session expires or the user clears the workflow.
- Service-user search results and selected-user state are kept in popup memory only and are no longer persisted in extension storage.

### Connected Page Integration

- Improved seamless interaction with an open Care Assurance tab through the authenticated content-script proxy.
- The popup continues to load data and trigger workflows against the connected web page without requiring users to manually copy tokens or re-enter connection details.
- Background retry handling is more resilient when the MV3 service worker is waking up or the content script needs to reattach after an update.
- Added a live `Workspace Pulse` panel that detects the current CareAssurance route, tab title, and app host from the connected browser tab.
- Added integrated quick actions that move the connected CareAssurance tab directly into Dashboard, Care Planning, Risk Assessment, Plan Enhancer, and Admin Portal flows.
- The website admin extension card now detects the installed extension build on the current page, compares it with the latest package version, and warns when the page needs a refresh after an extension update.

### Popup and Autofill Workflow

- Added a `Latest Payload` inspector in the popup Autofill tab so users can review the current payload summary and raw JSON before starting autofill.
- Improved payload status handling for ACP, EMAR, custom, and Initial Assessment workflows.
- Added clearer extension test and refresh guidance when the page and extension are out of sync after an update.
- Retitled the primary popup navigation around app-native workflows (`Workspace`, `Intake`, `Autofill`) and refreshed the shell styling so the popup reads more like a CareAssurance workspace surface than a standalone browser utility.
- ACP, EMAR, Initial Assessment, and generic Mobizio content scripts now use the shared session-aware storage helpers, so in-page autofill reads the same transient care payload state as the popup and background worker.
- Redesigned the ACP in-page overlay with a richer CareAssurance-style status surface, including service-user context, mode, assessment progress, and recent activity logs.

### Packaging and Installation

- Standardized extension packaging on the canonical build script and clarified that downloaded ZIP packages should be extracted before using `Load unpacked` in Edge.
- The admin `Update Extension` action now bumps the manifest patch version before rebuilding the ZIP, so the update flow produces a real new extension version instead of repackaging the same one.
- Updated release flow so admins can rebuild and download the current package more reliably from CareAssurance.

### Notes

- This release focuses on preserving the live connected-page experience while reducing the chance of sensitive care data being retained by the browser extension beyond the active session.

## Version 0.2.0 - Major UI Redesign (February 4, 2025)

### 🎨 Complete UI Redesign

**Objective**: Match the professional look and feel of the Care Assurance website

#### Design System Overhaul

- **Color Scheme**: Implemented exact website HSL color values
  - Primary Blue: `hsl(215, 45%, 40%)`
  - Background: `hsl(210, 20%, 98%)`
  - Cards: `hsl(0, 0%, 100%)`
  - Muted: `hsl(210, 20%, 95%)`
  - Success Green: `hsl(142, 71%, 45%)`
  - Warning Orange: `hsl(38, 92%, 50%)`

- **Typography**: Switched to Inter font family (matching website)
  - Professional font sizes and weights
  - Consistent spacing and line heights

- **Components**: All UI components redesigned to match website
  - Card components with 12px border radius and subtle shadows
  - Gradient headers (blue to teal)
  - Badge system for service user initials
  - Professional button styles with gradients and shadows
  - Custom checkboxes with hover effects
  - Animated progress bars

### 📝 Files Completely Rewritten

#### 1. popup.html (11KB)

**New Structure**: 4-section workflow

- **Upload Section**:
  - Professional card with gradient header
  - File input with custom styling
  - "Analyze with AI" button with ShieldAlert icon
  - Animated progress bar
  - Status message display

- **Results Section**:
  - Service user summary card with initials badge
  - Medical conditions and care activities lists
  - Recommended assessments with checkboxes
  - Evidence snippets below each assessment
  - Custom notes textarea
  - "Proceed to Autofill" button

- **Autofill Section**:
  - Case ID and Service Data Group inputs
  - Auto-submit and dry run toggles
  - Interaction mode selector
  - Start/Stop/Clear buttons
  - Status displays

#### 2. popup.css (12KB, 850+ lines)

**Complete Redesign**: Professional styling matching website

- Root CSS variables for consistent theming
- Card component system (headers, bodies, footers)
- Badge components (primary, success, warning, danger)
- Button system (primary, secondary, danger) with gradients
- Checkbox styling with hover states
- Progress bar animations
- Evidence list styling
- Smooth transitions throughout
- Responsive layout (fixed 500px width)

#### 3. popup.js (30KB, 700+ lines)

**Complete Rewrite**: Enhanced workflow and state management

**Key Functions**:

- `showSection(sectionName)`: UI state transitions
- `readFilesAsText(files)`: File reading with PDF support
- `analyzeDocuments()`: Main AI analysis workflow
- `getAuthToken()`: Extract session cookie for API auth
- `parseSSEMessage(message)`: Handle server-sent events
- `displayAnalysisResults(analysis)`: Render results UI
- `proceedWithSelectedAssessments()`: Create payload and switch to autofill
- Event listeners for all user interactions
- Professional error handling and user feedback

**Workflow Implementation**:

1. **Upload Phase**: User selects care documents
2. **Analysis Phase**: SSE streaming with live progress updates
3. **Results Phase**: Display assessments with selection UI
4. **Autofill Phase**: Original extension functionality

### 🔧 Technical Enhancements

#### Authentication

- Uses Chrome Cookies API to extract session token
- Seamless integration with Care Assurance backend
- No manual token input required

#### API Integration

- SSE (Server-Sent Events) streaming for real-time progress
- Endpoint: `https://careassurance.uk/api/ai/analyze-risks`
- Progress events displayed in animated progress bar
- Error handling with user-friendly messages

#### State Management

- `UI_STATES` constant for clean state transitions
- `currentAnalysisResults` stores analysis data
- Preserved original autofill functionality
- Checkbox selection state tracking

### 🎯 User Experience Improvements

1. **Visual Consistency**: Extension now looks like part of the Care Assurance suite
2. **Professional Polish**: Gradient cards, badges, shadows, animations
3. **Clear Workflow**: Upload → Analyze → Select → Generate → Send
4. **Live Feedback**: Animated progress bar with status messages
5. **Evidence Display**: Shows AI reasoning for each assessment recommendation
6. **Flexible Selection**: Checkboxes for easy assessment inclusion/exclusion
7. **Custom Notes**: Textarea for additional context
8. **Smooth Transitions**: Fade effects and hover states throughout

### 📦 Packaging

- Extension packaged to: `dist/edge-acp-autofill.zip`
- Ready for installation in Edge/Chrome browsers
- All assets included and optimized

### 🚀 How to Use

1. **Load Extension**: Extract `dist/edge-acp-autofill.zip`, then load the extracted folder in Edge/Chrome
2. **Login**: Ensure you're logged into Care Assurance website
3. **Navigate**: Go to any ACP page in ACCESS
4. **Open Extension**: Click extension icon to open popup
5. **Upload Files**: Select care documents (PDF, TXT, DOC, DOCX)
6. **Analyze**: Click "Analyze with AI" and watch progress
7. **Review**: Check service user summary and recommended assessments
8. **Select**: Use checkboxes to include/exclude assessments
9. **Notes**: Add custom notes if needed
10. **Proceed**: Click "Proceed to Autofill" to prepare payload
11. **Configure**: Enter Case ID and Service Data Group
12. **Autofill**: Click "Start Autofill" to begin automated form filling

### 🎨 Before & After

**Before (v0.1.2)**:

- Basic form layout
- Generic styling
- Simple text inputs
- No visual feedback
- Disconnected from website design

**After (v0.2.0)**:

- Professional card-based layout
- Website-matching color scheme
- Gradient headers and buttons
- Animated progress indicators
- Evidence-based recommendations
- Seamless visual integration
- Enhanced user workflow

### ✨ What Makes This Special

1. **Design Parity**: Exact color scheme from website (HSL values)
2. **Professional Components**: Matching cards, badges, buttons
3. **Live Streaming**: Real-time AI analysis progress
4. **Evidence-Based**: Shows reasoning for each recommendation
5. **Flexible Workflow**: Review and customize before autofill
6. **Preserved Functionality**: All original features intact
7. **Enhanced UX**: Smooth, professional, delightful to use

---

## Version 0.1.2 - File Upload Feature (February 3, 2025)

### New Features

- Added file upload capability
- Basic AI analysis integration
- Document content parsing
- Initial risk assessment workflow

### Files Modified

- manifest.json: Added cookies permission
- background.js: Added analyzeRisks handler
- constants.js: Added message types
- README.md: Updated documentation

---

*Extension developed for Care Assurance by the development team*
*Designed to streamline risk assessment creation in ACCESS care planning platform*
