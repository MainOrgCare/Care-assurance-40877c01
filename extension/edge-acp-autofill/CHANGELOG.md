# Changelog - Care Assurance ACP Autofill Extension

## Version 0.3.5 - Connected Session Privacy Update (April 13, 2026)

### Privacy and Data Handling

- Sensitive care payloads now stay in transient extension session storage instead of persistent local extension storage.
- Care plan, risk assessment, initial assessment, signature, uploaded document, and verification payloads are cleared automatically when the session expires or the user clears the workflow.
- Service-user search results and selected-user state are kept in popup memory only and are no longer persisted in extension storage.

### Connected Page Integration

- Improved seamless interaction with an open Care Assurance tab through the authenticated content-script proxy.
- The popup continues to load data and trigger workflows against the connected web page without requiring users to manually copy tokens or re-enter connection details.
- Background retry handling is more resilient when the MV3 service worker is waking up or the content script needs to reattach after an update.

### Popup and Autofill Workflow

- Added a `Latest Payload` inspector in the popup Autofill tab so users can review the current payload summary and raw JSON before starting autofill.
- Improved payload status handling for ACP, EMAR, custom, and Initial Assessment workflows.
- Added clearer extension test and refresh guidance when the page and extension are out of sync after an update.

### Packaging and Installation

- Standardized extension packaging on the canonical build script and clarified that downloaded ZIP packages should be extracted before using `Load unpacked` in Edge.
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
