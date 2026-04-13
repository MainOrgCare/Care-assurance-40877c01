# Changelog - Care Assurance ACP Autofill Extension

## Version 0.3.7 - Reliability & Code Quality Overhaul (Latest)

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
