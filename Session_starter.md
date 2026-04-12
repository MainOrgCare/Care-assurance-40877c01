# 🧠 AI Session Starter: Care-assurance-40877c01

*Project memory file for AI assistant session continuity. Auto-referenced by custom instructions.*

---

## 📘 Project Context

**Project:** Care-assurance-40877c01  
**Type:** Full-stack React + Express + PostgreSQL platform  
**Purpose:** AI-powered healthcare compliance, auditing, and operations platform for UK domiciliary care providers, focused on CQC readiness and operational assurance.  
**Status:** 🚧 Active development (production-oriented architecture already in place)

**Core Technologies:**

- Frontend: React 19, TypeScript, Vite, wouter, TanStack Query, Tailwind CSS + Radix/shadcn patterns
- Backend: Node.js 20, Express, TypeScript, modular route registry + monolithic transition (`server/routes.ts` + `server/routes/*.ts`)
- Data: PostgreSQL + Drizzle ORM (`shared/schema.ts`, `migrations/*`)
- AI: OpenAI/GitHub Models/local LLM toggles via `server/services/aiClient.ts`
- Security/ops: Helmet CSP, CORS controls, rate limiting, request correlation IDs, session auth, file scanning, readiness/health probes
- Extension: Edge extension for ACP/eMAR autofill + in-extension AI document analysis (`extension/edge-acp-autofill`)

**Key Product Capabilities (from README):**

- Medication: EMAR auditing to flag missed doses, refusals, and non-administration codes
- Care Planning: AI-generated person-centred plans from uploaded assessments
- Risk: Rule-based + AI-assisted risk assessment support
- Auditing: Visit audit drift/missed-visit detection from planned vs actual call data
- Finance: Call reconciliation and billing variance analysis
- Rostering: Workbook import, optimization, and rota coverage analysis
- Compliance/Governance: CQC self-assessment, training tracking, GDPR workflows, audit trails

**Available AI Capabilities (workspace tooling):**

- 🔧 MCP classes available: DB tooling (`dbcode-*`), Git/GitLens/GitKraken integration, GitHub search/PR management, Mermaid rendering
- 📚 Documentation: VS Code API docs tool + web fetch/search utilities
- 🔍 Dev tools: terminal/task execution, code search, semantic search, diagnostics, notebook support

---

## 🎯 Current State

**Build Status:** ✅ `npm run quality` succeeded on 2026-04-03 after the corporate redesign follow-up pass for shared page headers and semantic colour cleanup on prominent pages.  
**Runtime Shape:** Dev server runs API + Vite HMR; production build includes client + server + worker split deployment on Render.  
**AI Enhancement:** Feature-toggled AI stack with cache/rules-first/lite-mode/provider/model controls.
**Validation Status:** ✅ Full quality gate currently verified: `npm run test`, `npm run check`, and `npm run build` all passed via `npm run quality` on 2026-04-03.

**Architecture Highlights:**

- Client routing guarded by auth/admin/terms controls in `client/src/App.tsx`
- Major page domains: dashboard, compliance, CQC assessment, EMAR/visit audit, care planning/risk assessment/plan enhancer, billing/call reconciliation, rostering studio, policy acknowledgement, messaging, system logs
- API hardening in `server/index.ts`: CSP/HSTS, per-scope rate limits, strict production CORS, anti-cache headers for `/api/*`, request ID propagation
- Domain modularization underway (`server/routes/index.ts` exports domain routes), while `server/routes.ts` remains a large integration surface
- Rich service layer in `server/services/*` (EMAR agent, billing analyzer, rota logic, support plan compare, geocoding, file scanning)
- Shared schema is broad and compliance-focused: users/roles, sessions, audits, discrepancies, risk logs, policy docs, system logs, rota templates, GDPR-related storage patterns

---

## 🧠 Technical Memory

**Critical Discoveries:**

- `getAllDocumentContent()` from `TemporaryDataContext` returns a single combined string, not a per-document object. Feature code that treats it like `Object.values(...)` silently breaks pre-analysis and document-readiness checks.
- Render build commands in `render.yaml` must use `sh -c 'export NODE_OPTIONS=...; ...'` when chaining `npm ci && npm run build*`; inline `NODE_OPTIONS=... cmd1 && cmd2` only applies the heap override to the first command, letting Vite fall back to the runtime 512 MB limit during deploys.
- README documents a mature multi-domain healthcare operations platform rather than an early MVP scaffold.
- Route-level frontend code-splitting + idle preloading already implemented for common pages.
- Security posture is explicitly engineered (canonical host controls, CSRF/origin checks via route stack, progressive lockout helpers, request logger middleware).
- Extension supports two workflows: traditional payload autofill + direct document upload for AI analysis.
- `server/routes.ts` contains a local `PIIVault` implementation; helper integrations should use structural typing for vault compatibility instead of concrete class coupling.
- Risk assessment analysis/generation now strips template/instruction artefacts like "understand the information provided" and residual `PII_*` token fragments on both server and client paths; the analyze-risks cache generation was bumped to `evidence_v5` so stale bad name/evidence payloads are bypassed.
- `server/utils/secureAiPipeline.ts` now supports both text-only and multimodal user content (scrubs text parts in multipart payloads).
- Route-level direct `createChatCompletionWithLogging` calls have been eliminated in favor of secure helper wrappers; service-level text extraction paths were also migrated.
- Production OOM on the rostering admin surface was traced to full-table materialization in `GET /api/admin/rostering/data-stats` and workbook-detail loaders; safe route behavior requires count-only stats queries plus date-window/service-user-scoped reads when reconstructing workbook views.
- Message routes return the standard `apiSuccess` envelope, so client code that uses manual `fetch` must unwrap responses with `parseApiResponse` or `normalizeApiPayload` instead of assigning raw `res.json()` into array state.
- TypeScript path aliases continue to resolve without `baseUrl` in this repo, so deprecated `baseUrl` and `downlevelIteration` options can be removed from tsconfig files instead of being silenced with `ignoreDeprecations`.

**Performance Insights:**

- Recent completed optimizations recorded in `TODO.md`:
  - O(1) Map-order cache eviction in `server/services/aiCache.ts`
  - SQL `GROUP BY` aggregation for AI usage in `server/storage.ts`
  - Parallelized dashboard stats fetches via `Promise.all`
  - Session timer tab-visibility handling on client
- Client architecture uses lazy routes and selective idle preloading to reduce initial bundle pressure.

**Known Constraints:**

- Node/NPM floor: Node >=20, npm >=10 (`package.json` engines)
- `DATABASE_URL` required for full feature set; some logging/scanning behavior degrades in dev without DB
- AI features depend on provider credentials and `AI_ENABLED` controls
- `server/routes.ts` is very large (~20k lines), increasing change risk; prefer incremental modular extraction
- README references Vite 7 in stack narrative while current package version should be checked during upgrades

---

## 🚀 Recent Achievements

| Date | Summary |
| ---- | --------- |
| 2026-04-12 | ✅ Fixed three service-user workflow regressions and revalidated with `npm run build`: Care Planning now supports a `General` fallback when no DB call types are found, Plan Enhancer pre-analysis now uses the correct combined-string document contract from `TemporaryDataContext`, and Risk Assessment custom assessments now keep canonical selection names aligned with UI state and generation payloads. |
| 2026-04-12 | ✅ Fixed Render deploy heap scoping in `render.yaml` by changing all build commands to `sh -c 'export NODE_OPTIONS=...; ...'`, ensuring Vite/esbuild inherit the intended build-time heap instead of falling back to the 512 MB runtime `NODE_OPTIONS` env var. |
| 2026-04-12 | ✅ Improved app-wide runtime resilience in `client/src/main.tsx`: all same-origin `/api` requests now pass through a single hardened fetch wrapper (default credentials include, request-id header injection, optional `VITE_API_BASE_URL` rewrite for split deployments, and 30s timeout/abort handling), while uncaught runtime errors and unhandled promise rejections now trigger throttled user-visible destructive toasts in addition to existing server-side client-error reporting. |
| 2026-04-12 | ✅ Added Render-hosted development runtime detection in `server/index.ts`: when running on Render with `NODE_ENV=development`, the app now behaves as a single hosted web service (production-like CSP/CORS handling and static serving) instead of local Vite/HMR dev mode assumptions. |
| 2026-04-12 | ✅ Enforced automatic logout on credential expiry across the frontend: added a shared auth-expired event in `client/src/lib/queryClient.ts`, added global fetch-based 401 monitoring in `client/src/main.tsx` (including direct `fetch` call sites), and updated `client/src/context/AuthContext.tsx` to force-clear auth state, redirect to `/`, and show a session-expired toast when an authenticated session receives unauthorized API responses. |
| 2026-04-10 | ✅ Fixed risk-assessment proper-name restoration on repeated analysis runs: `server/routes.ts` now bypasses the placeholder-only `analyze-risks` cache for sensitive/admin requests so the page consistently receives restorable identity data instead of cached placeholder payloads, filters placeholder-based assessment evidence before generation, and `client/src/pages/service-users/RiskAssessment.tsx` now only attempts identity refresh for admins when the current name is genuinely missing rather than just placeholder text. |
| 2026-04-10 | ✅ Fixed broken risk-assessment narrative generation caused by questionnaire/prompt snippets leaking into prose: `server/routes.ts` now rejects question-style/truncated/boilerplate evidence fragments during snippet extraction and validation, stops appending raw evidence hints into generated risk paragraphs, and the client adds a final sentence-level filter in `client/src/pages/service-users/RiskAssessment.tsx` so stray text like "If there was a fire in the home..." and office-reporting boilerplate no longer renders inside risk definitions or explanations. |
| 2026-04-10 | ✅ Fixed remaining risk-assessment identity/evidence leakage in `server/routes.ts` and `client/src/pages/service-users/RiskAssessment.tsx`: hardened full-name validation to reject template/instruction phrases, stripped residual `PII_*` token artefacts from evidence/output text, sanitized cached/client-restored payloads defensively, and bumped the analyze-risks cache generation to `evidence_v5` so stale bad results no longer reuse phrases like "understand the information provided" under Service User Information. |
| 2026-04-06 | ✅ Fixed policy page 404 by correcting client query key endpoint from `/api/policies` to `/api/policy-documents` in `client/src/lib/queryKeys.ts`, matching registered server routes and restoring Policy Acknowledgement data loading. |
| 2026-04-06 | ✅ Fixed ScheduleAnalysisDashboard runtime crash (`Cannot read properties of undefined (reading 'filter')`) in `client/src/components/rostering/ScheduleAnalysisDashboard.tsx` by adding envelope-aware defensive normalization (`normalizeApiPayload`) and safe defaults for `insights`, `recommendations`, `predictive.burnoutRisk`, `predictive.bottlenecks`, and `predictive.optimizationPotential`, ensuring all `.filter/.map/.sort` render paths are resilient to partial/malformed API payloads. |
| 2026-04-06 | ✅ **Comprehensive RosteringStudioUnified validation complete**: Verified all 35+ event handlers, 7 mutations, memo computations, and JSX render structure are fully implemented and error-free. Diagnostics passed; all components properly wired (GanttTimeline, WorkloadHeatmap, OptimizationSettings, etc.); all mutations have proper error handling and query invalidation; ResizablePanelGroup layout with 12 panels (workers, timeline, details, map, call-times, constraints, workload, optimization, database, AI analysis, comparison, costs, templates) fully functional; save/load/delete dialogs complete with localStorage persistence; keyboard shortcuts properly configured. 0 TypeScript errors. Component is production-ready. |
| 2026-04-06 | ✅ Hardened schedule-comparison rendering against malformed/partial API payloads in `client/src/components/rostering/ScheduleComparison.tsx` by normalizing response shape (including `apiSuccess` envelopes) and applying safe metric defaults, preventing runtime crashes from missing `metrics.conflictChange`. |
| 2026-04-06 | ✅ Repaired `client/src/pages/TestingFeatures.tsx` after a large top-of-file block was accidentally removed (imports/constants/types), then fixed broken JSX structure in the workbook insights section by restoring missing wrappers/closures; TypeScript errors for that page are now clear. |
| 2026-04-06 | ✅ Removed deprecated TypeScript compiler options from `tsconfig.json` and `tsconfig.server.json` by dropping `downlevelIteration` and the no-longer-needed `baseUrl`, clearing the TS 6 deprecation errors without adding `ignoreDeprecations` suppression. |
| 2026-04-06 | ✅ Fixed the Messages page crash caused by treating the wrapped `/api/messages` response as an array: `client/src/pages/Messages.tsx` now uses `parseApiResponse` and an array guard before setting local message state, preventing `messages.filter is not a function` render failures when the API returns `{ data: [...] }`. |
| 2026-04-06 | ✅ Reduced production memory pressure on rostering admin APIs by replacing full-row stats loading with `COUNT(*)` queries in `server/storage.ts`/`server/routes.ts`, and by refactoring both workbook-detail routes to rebuild workbook responses from date-scoped analyzed-call queries plus service-user-scoped profile/template lookups instead of scanning all extracted calls/service users/template assignments in memory. |
| 2026-04-04 | ✅ Delivered a focused professional-polish pass across the homepage, authenticated shell, dashboard, settings, and Edge extension popup: added an extension workflow section and richer footer/login/mobile CTAs on `client/src/pages/Homepage.tsx`, added executive overview cards on `client/src/pages/Dashboard.tsx`, added settings summary cards on `client/src/pages/Settings.tsx`, surfaced section/role badges in `client/src/components/Layout.tsx` footer, and aligned extension branding/layout in `extension/edge-acp-autofill/{popup.html,popup.css}`. Manually verified homepage/dashboard/settings in a demo-enabled dev run and revalidated with `npm run quality`. |
| 2026-04-03 | ✅ Continued the corporate UI refinement pass by adding shared page-header utilities in `client/src/index.css`, standardizing prominent route headers in `client/src/pages/{Compliance,ROICalculator,SystemLogs}.tsx`, and replacing remaining hardcoded ROI palette classes with semantic token-based styling. Revalidated with `npm run check`, `npm run build`, and `npm run quality`. |
| 2026-04-03 | ✅ Applied a broader corporate visual redesign across the frontend: refined global design tokens and shared UI primitives (`client/src/index.css`, `client/src/components/ui/{button,card,input,textarea,select}.tsx`), upgraded the authenticated shell and navigation framing (`client/src/components/Layout.tsx`), realigned homepage messaging and structure (`client/src/pages/Homepage.tsx` + `homepage-theme.css`), and brought Rostering Studio back onto the same palette and typography system (`client/src/pages/rostering-studio-redesign.css`). Revalidated with `npm run check`, `npm run build`, and `npm run quality`. |
| 2026-04-03 | ✅ Improved phone responsiveness and extension polish across shared UI surfaces: made shared table containers touch-scroll friendly (`client/src/components/ui/table.tsx`), tightened mobile shell/header spacing in `client/src/components/Layout.tsx`, added safe-area-aware connectivity toasts in `client/src/components/OfflineIndicator.tsx`, improved narrow-phone Dashboard grids and semantic quick-action colors in `client/src/pages/Dashboard.tsx`, disabled fixed background attachment on mobile in `client/src/index.css`, and made the Edge extension popup responsive with synced visible version text in `extension/edge-acp-autofill/popup.css` + `popup.html`. |
| 2026-03-18 | ✅ Fixed name leaks in legacy placeholder sanitizer path (`scrubPII`) in `server/routes.ts` by adding an unconditional final standalone-name sweep and strengthening proper-name detection (`looksLikeProperName`) with abbreviation/whitelist guards, so plain names cannot remain alongside `[SERVICE_USER]`/other redaction placeholders. |
| 2026-03-18 | ✅ Enhanced PII scrubber to catch additional quasi-identifiers and biographical leaks: added patterns for initials without dots (MS, KB), sibling count references (One of 7 siblings), family member death patterns (Daughter died at age 27), improved location detection (Well known in North Shields), sexual orientation terms, and "Raised" context for names. Updated both `server/utils/piiVault.ts` and route-local `PIIVault` in `server/routes.ts` with synchronized improvements. Enhanced narrative quasi-identifier scoring to weight location/sibling patterns higher. Added comprehensive regression tests in `server/__tests__/piiVaultRiskScrub.test.ts` covering all user-reported leak patterns. |
| 2026-03-18 | ✅ Removed the low-confidence review pathway from both PIIVault implementations (`server/utils/piiVault.ts` and route-local `PIIVault` in `server/routes.ts`) by deleting `scrubStringWithReview` and review-only threshold/type definitions; updated `server/__tests__/piiVaultRiskScrub.test.ts` to keep validating scrubber behavior without review APIs. |
| 2026-03-18 | ✅ Added configurable scrub sensitivity profiles (`strict`/`balanced`/`conservative`) and improved low-confidence review output in both PIIVault implementations: `scrubStringWithReview` now reports excerpts from original text and profile-based thresholds; added regression coverage for conservative-mode behavior and review excerpt integrity in `server/__tests__/piiVaultRiskScrub.test.ts`. |
| 2026-03-18 | ✅ Further improved risk scrubber accuracy: added quasi-identifier sentence combination detection (including contact-role combinations), reason-tagged narrative span scoring, and `scrubStringWithReview` low-confidence review flags API in both `server/utils/piiVault.ts` and route-local `PIIVault` (`server/routes.ts`), plus expanded regression tests in `server/__tests__/piiVaultRiskScrub.test.ts`. |
| 2026-03-18 | ✅ Refactored PII scrubbing into a layered flow with a narrative rescue pass in both `server/utils/piiVault.ts` and route-local `PIIVault` (`server/routes.ts`): added contextual biography/location/health span detection with allowlist guards, added `LOCATION`/`BIOGRAPHICAL`/`HEALTH` token categories and placeholders, and expanded `server/__tests__/piiVaultRiskScrub.test.ts` with direct-identifier, narrative-name, biography, health, mixed medication, and repeated-entity consistency regressions. |
| 2026-03-18 | ✅ Expanded scrubber coverage for risk-assessment leak cases in both `server/routes.ts` and `server/utils/piiVault.ts`: added sensitive health/sexual-orientation/biographical phrase tokenization, improved contextual multi-name capture (`name1 and name2`), broadened structured key-based field scrubbing (`signedBy`, `caseId`, `medicalConditions`, `biography`, etc.), and extended `server/__tests__/piiVaultRiskScrub.test.ts` to assert these cases are redacted. |
| 2026-03-18 | ✅ Hardened risk-assessment PII scrubbing in `server/routes.ts` and `server/utils/piiVault.ts` to catch leaked identifiers (case IDs, slash-month dates, initials, signed-by labels, partial addresses, narrative single names/location phrases), preserved tokenized initials in `normalizeInitials`, and added regression test `server/__tests__/piiVaultRiskScrub.test.ts`. |
| 2026-03-03 | ✅ Hardened AI usage route query parsing in `server/routes/aiUsage.ts` by trimming optional string filters and normalizing inverted date ranges (`startDate > endDate`), plus expanded `server/__tests__/aiUsageRouteQuery.test.ts` to cover whitespace-to-undefined mapping and date-range normalization behavior. |
| 2026-03-03 | ✅ Continued AI log scaling rollout by adding server-backed distinct filter options for AI Request Log dropdowns: `server/storage.ts` now exposes `getAiUsageFilterOptions`, `server/routes/aiUsage.ts` includes `filterOptions` in `/api/admin/ai-logs` responses, and `client/src/pages/SecretAdminPortal.tsx` now hydrates user/endpoint filter lists from backend data so options remain complete across paginated results. |
| 2026-03-03 | ✅ Completed AI Request Log provider/date range filters with URL + `localStorage` state sync in `client/src/pages/SecretAdminPortal.tsx`, extracted backend query parsing in `server/routes/aiUsage.ts` (`parseDateParam`, `parsePositiveIntParam`, `buildAiUsageQueryOptionsFromQuery`), and added `server/__tests__/aiUsageRouteQuery.test.ts` covering defaulting/clamping/date parsing/query mapping. |
| 2026-03-02 | ✅ Started implementation of AI log scaling pipeline: added paginated/filterable AI usage storage methods and analytics aggregations in `server/storage.ts`, upgraded `GET /api/admin/ai-logs` in `server/routes/aiUsage.ts` to return `logs + pagination + analytics`, and updated `client/src/pages/SecretAdminPortal.tsx` AI Request Log to query server-side filters/page with URL + localStorage state sync (`aiSearch`, `aiUser`, `aiEndpoint`, `aiRetry`, `aiPage`). |
| 2026-03-02 | ✅ Refined AI Request Log saved-view controls in `client/src/pages/SecretAdminPortal.tsx`: preset buttons now expose pressed state and are disabled when already active, reducing accidental re-application and making active investigation context clearer. |
| 2026-03-02 | ✅ Improved AI Request Log preset ergonomics in `client/src/pages/SecretAdminPortal.tsx`: added computed active saved-view detection (`High Retries`, `Local Only`, `PRN Focus`, `All Logs`, `Custom`), an `Active:` badge, and button highlighting for the currently active preset to make investigation context immediately visible. |
| 2026-03-02 | ✅ Added one-click triage presets to AI Request Log in `client/src/pages/SecretAdminPortal.tsx`: `High Retries`, `Local Only`, and `PRN Focus` now apply targeted filter/search states instantly, plus `Clear View` to reset; this reduces friction when switching between common reliability investigation modes. |
| 2026-03-02 | ✅ Improved AI Request Log workflow persistence in `client/src/pages/SecretAdminPortal.tsx`: added `localStorage` persistence for search/user/endpoint/retry filters (in addition to provider comparison controls) and introduced a one-click `Reset Filters` action that clears both UI state and stored preferences for faster context switching during investigations. |
| 2026-03-02 | ✅ Added persistence for AI log provider comparison controls in `client/src/pages/SecretAdminPortal.tsx`: sort mode and `Problematic only` toggle now save to `localStorage` and restore on reload, keeping reliability triage context stable across admin sessions. |
| 2026-03-02 | ✅ Added advanced provider retry analysis controls in `client/src/pages/SecretAdminPortal.tsx`: provider comparison now supports sort mode (`Retry Rate` or `Volume`) and a `Problematic only` toggle to focus on providers with non-zero retry behavior, improving triage speed for Local/OpenAI/GitHub parity work. |
| 2026-03-02 | ✅ Polished provider retry comparison UX in `client/src/pages/SecretAdminPortal.tsx`: provider names are now normalized (`OpenAI`, `Local LLM`, `GitHub AI`) and comparison badges are color-coded per provider, improving scanability of retry-rate parity in admin logs. |
| 2026-03-02 | ✅ Added provider-level retry comparison in AI Request Log (`client/src/pages/SecretAdminPortal.tsx`): now shows per-provider retry rate, retried/total request counts, and total retry attempts (filter-aware), enabling quick Local vs OpenAI vs GitHub reliability comparison in one view. |
| 2026-03-02 | ✅ Added at-a-glance retry health KPIs to AI Request Log in `client/src/pages/SecretAdminPortal.tsx`: `Requests Retried`, `Total Retry Attempts`, and `Retry Rate` now update with current filters, complementing retry-reason grouping for faster provider reliability monitoring. |
| 2026-03-02 | ✅ Enhanced AI admin troubleshooting UX in `client/src/pages/SecretAdminPortal.tsx` AI Request Log: added retry-state filter (`All`, `With Retries`, `No Retries`) and a retry-reason summary strip (grouped counts by `lastRetryReason`) to speed up Local/OpenAI/GitHub reliability triage without opening each payload. |
| 2026-03-02 | ✅ Surfaced AI retry telemetry in admin monitoring: `server/routes/aiUsage.ts` now exposes `retryCount` and `lastRetryReason` from logged `requestPayload`, and `client/src/pages/SecretAdminPortal.tsx` AI Request Log now displays retry badges in row summaries plus retry count/reason fields in expanded details. |
| 2026-03-02 | ✅ Added AI retry observability in `server/services/aiClient.ts`: `AiCompletionResult` now carries `retryCount` and `lastRetryReason`, transient retry classification is captured (`http_*`, `code_*`, timeout/network), and usage logs now include this metadata in `requestPayload` for better Local vs OpenAI/GitHub reliability analysis in admin AI logs. |
| 2026-03-02 | ✅ Improved AI reliability parity in `server/services/aiClient.ts`: retry logic now treats transient failures (`408/409/429/5xx`, timeout/network transport errors) as retryable with exponential backoff + `Retry-After` support, rather than retrying only 429 responses; this aligns Local/OpenAI/GitHub behavior more closely under unstable network/provider conditions. |
| 2026-03-02 | ✅ Strengthened Local/OpenAI response-shape parity in `server/services/aiClient.ts`: added Local completion normalization to guarantee OpenAI-like `choices[].finish_reason` defaults and populated `usage` fields when missing, while preserving model metadata and assistant content across local OpenAI-compatible and `/api/v1/chat` fallback paths. |
| 2026-03-02 | ✅ Improved Local response telemetry parity in `server/services/aiClient.ts`: added token estimation fallback for local backends that omit usage metadata (`prompt_tokens`, `completion_tokens`, `total_tokens`) both in `/api/v1/chat` fallback responses and in `createChatCompletionWithLogging`, so Local billing/logging/cost analytics behave closer to OpenAI semantics. |
| 2026-03-02 | ✅ Extended shared AI error semantics in `server/copilotRoutes.ts`: Copilot AI generation endpoints (`rewrite-email`, `analyze-visit`, `analyze-risks`, `generate-risk-assessment`, `generate-care-plan`, `enhance-plan`, `check-drug-interactions`, `chat`) now use `getAiErrorStatusCode`, aligning Local/OpenAI/GitHub policy/quota failures with consistent HTTP statuses instead of blanket 500s. |
| 2026-03-02 | ✅ Continued Local/OpenAI parity work: `server/services/aiClient.ts` now keeps requested temperature for Local calls (instead of forcing 0), exports shared `getAiErrorStatusCode` mapping, and logs Local runtime parameters consistently; `server/routes.ts` now imports shared mapping; `server/copilotRoutes.ts` now returns mapped status (e.g., `503` for Local web-policy blocks) for PRN errors. |
| 2026-03-02 | ✅ Improved Local LLM parity with OpenAI behavior in `server/services/aiClient.ts` by scoping `local_require_live_web` enforcement to medication/web-fetch feature categories (`prn`, `interaction`, `medication`, `bnf`) instead of all AI calls; updated admin messaging in `client/src/pages/SecretAdminPortal.tsx` to reflect fetch-task-only enforcement. |
| 2026-03-02 | ✅ Fixed Local web-policy error semantics in `server/routes.ts`: AI endpoints now map `LOCAL_WEB_CONTEXT_UNAVAILABLE` and `AI_DISABLED` to HTTP `503` (and `GITHUB_QUOTA_EXCEEDED` to `429`) instead of generic `500`; applied to `/api/ai/rewrite-email` and `/api/ai/generate-prn-protocol` where secure AI completion errors were surfacing as server faults. |
| 2026-03-02 | ✅ Improved AI admin visibility in `client/src/pages/SecretAdminPortal.tsx` by adding a Local provider card status badge that shows the live policy state (`Web Policy: Enforced` or `Web Policy: Permissive`) next to provider availability/active status. |
| 2026-03-02 | ✅ Added Local-only admin policy for live web/BNF access across all AI calls: `server/services/aiClient.ts` now supports persisted `local_require_live_web` setting with global enforcement before any local-provider completion (cached reachability checks), `server/routes.ts` exposes policy via `GET /api/admin/ai-provider` and new `POST /api/admin/local-web-policy`, `client/src/pages/SecretAdminPortal.tsx` adds a Local-provider-only toggle (`Require live web/BNF access`), and `server/copilotRoutes.ts` PRN BNF fail-fast now respects this Local policy instead of being unconditional. |
| 2026-03-02 | ✅ Enforced fail-fast safety gate for PRN protocol generation in `server/copilotRoutes.ts`: endpoint now returns `503 BNF retrieval unavailable` unless live BNF web context and source URLs are successfully retrieved from `bnf.nice.org.uk`, preventing generation without current internet-backed BNF evidence. |
| 2026-03-02 | ✅ Addressed accessibility and compatibility findings: strengthened slider naming in `client/src/components/ui/slider.tsx` (`title` + consistent fallback label), added Safari `-webkit-backdrop-filter` and `text-size-adjust` compatibility updates in client styles, shortened PWA manifest `name`/`short_name`, and upgraded PRN protocol generation in `server/copilotRoutes.ts` to fetch live BNF web context from NICE search/results and inject source-backed context into AI prompts (`bnfSources` returned in API response). |
| 2026-03-02 | ✅ Added admin-managed Local LLM URL configuration: backend now persists `local_llm_url` app setting (with runtime client refresh) in `server/services/aiClient.ts`, new admin endpoint `POST /api/admin/local-llm-url` in `server/routes.ts`, and new URL input + `Save URL` control in `client/src/pages/SecretAdminPortal.tsx` so Cloudflare/local endpoints can be changed without editing `.env`. |
| 2026-03-01 | ✅ Hardened local LLM request compatibility in `server/services/aiClient.ts` for broad route coverage: added local param normalization (`max_completion_tokens`→`max_tokens`, `json_object`→`json_schema`) and automatic strict-compat retry on local 400 errors (drops unsupported fields like tools/seed/response_format/options) before fallback, improving reliability for PRN and other AI endpoints via LM Studio. |
| 2026-03-01 | ✅ Merged local development startup flows in `package.json`: introduced `dev:server` and updated `dev` to run both `dev:client` and `dev:server` concurrently via `concurrently`, so one command starts both frontend and backend. |
| 2026-03-01 | ✅ Fixed local LM Studio compatibility for chat completions in `server/services/aiClient.ts` by normalizing `response_format: { type: "json_object" }` to LM Studio-accepted `json_schema` when provider is `local`, resolving PRN protocol 400 errors (`'response_format.type' must be 'json_schema' or 'text'`). |
| 2026-03-01 | ✅ Fixed `dev:setup`/Vite React Babel startup failure (`Cannot find module '../nodes.js'` from `@babel/generator`) by restoring missing `node_modules/@babel/generator/lib/nodes.js` and adding a persistent postinstall safeguard in `scripts/postinstall.cjs` to auto-create the compatibility file when package installs are incomplete. |
| 2026-03-01 | ✅ Improved admin AI UX in `client/src/pages/SecretAdminPortal.tsx` by adding a `Test Local LLM` action that re-checks `/api/admin/ai-provider`, refreshes local-provider availability state live, and surfaces clear success/failure toasts with last-checked timestamp. |
| 2026-02-28 | ✅ Simplified local LLM env contract in `server/services/aiClient.ts`: local provider no longer gated by `LOCAL_LLM_ENABLED`, and local auth now reads only `LLM_KEY` (removed `LOCAL_LLM_KEY`/`LOCAL_LLM_API_KEY` aliases and local-disabled fallback logic). |
| 2026-02-28 | ✅ Prepared local web-exposed LLM auth readiness: added `LLM_KEY`/`LOCAL_LLM_KEY`/`LOCAL_LLM_API_KEY` support to local provider client + health probes in `server/services/aiClient.ts`, and restored generic-mode compatibility in `server/services/emarComplianceAgent.ts` via neutral required `systemPrompt` field (`""`) for secure pipeline typing. |
| 2026-02-28 | ✅ Updated EMAR compliance API path to generic LM mode by removing hardcoded `systemPrompt` and strict `responseFormat` from `runComplianceAgent` request payload; aligned `server/__tests__/emarComplianceParity.test.ts` to optional-strict exports + invariant checks, and revalidated with `test:server:emar`, full `test:server`, and `build`. |
| 2026-02-28 | ✅ Integrated local LM provider readiness for both LM Studio/OpenAI-compatible servers and Ollama by expanding local availability probes in `server/services/aiClient.ts` (`/v1/models`, `/api/tags`, `/health`); validated with `npm run check` and `npm run build`. |
| 2026-02-28 | ✅ Added unit tests for EMAR artifact loader fallback behavior in `server/__tests__/emarComplianceArtifacts.test.ts` (missing artifacts, valid artifact load, invalid preset fallback), added `npm run test:server:emar:artifacts`, and revalidated `test:server` + `build`. |
| 2026-02-28 | ✅ Added explicit CI guardrail step in `.github/workflows/ci.yml` to run `npm run test:server:emar` before full test suite, ensuring EMAR schema/prompt drift fails fast in PRs and pushes. |
| 2026-02-28 | ✅ Switched eMAR compliance runtime to artifact-driven schema/prompt sourcing (from `EMAR Structured Output.schema.json` + `EMAR Strict JSON Test.preset.json`) with fallback guards; validated with `npm run test:server:emar`, `npm run test:server`, and `npm run build` (all passing). |
| 2026-02-28 | ✅ Resume checkpoint: verified latest `Main` commit `c800900f` (`test(emar): add strict schema/prompt parity guardrails`) with clean `npm run test:server:emar` (3/3) and `npm run build`. |
| 2026-02-28 | ✅ Added EMAR strict-contract guardrails: new parity test `server/__tests__/emarComplianceParity.test.ts` validates runtime schema parity with `EMAR Structured Output.schema.json`, checks prompt-rule coverage across runtime + preset + markdown prompt, and enforces semantic invariants (NH verification + summary reconciliation). |
| 2026-02-28 | ✅ Added focused script `npm run test:server:emar` and aligned LM Studio preset prompts to runtime strict directives; validated with `test:server:emar`, full `test:server` (123/123), and `build`. |
| 2026-02-28 | ✅ Tightened runtime strict-output schema in `server/services/emarComplianceAgent.ts` to match artifact constraints (`allCareWorkers.uniqueItems`, non-negative summary counters), then revalidated with `npm run check` + `npm run build`. |
| 2026-02-28 | ✅ Completed global UI standardization pass across client surfaces (shadow token unification, focus-ring normalization, legacy `corporate-*` cleanup, and unified scrollbar styling). |
| 2026-02-28 | ✅ Fixed malformed nested Tailwind shadow token classes in `slider.tsx` and `tooltip.tsx`; revalidated with clean `npm run build` (warning-free CSS optimization). |
| 2026-02-28 | ✅ Published finalized work to `origin/Main` with three commits: `83b80a68`, `f5ba4aa3`, `00f3375f`. |
| 2026-02-27 | ✅ Session context aligned to README as source-of-truth product documentation |
| 2026-02-27 | ✅ Session continuity template replaced with app-specific architecture and operational context |
| 2026-02-27 | ✅ Verified current build health from workspace terminal context (`npm run build` success) |
| 2026-02-27 | ✅ Captured full-stack module map (client routes/pages, server route domains, services, schema, extension) |
| 2026-02-27 | ✅ Documented completed performance fixes from `TODO.md` |
| 2026-02-27 | ✅ Fixed React hook-order crash in `client/src/pages/SecretAdminPortal.tsx` (`ActivePresenceSection2`) by moving memo hooks above conditional return |
| 2026-02-27 | ✅ Improved local-dev CSRF handling in `server/routes.ts` to allow configured/local origins (`localhost` + `127.0.0.1`) in non-production |
| 2026-02-27 | ✅ Made compressed sidebar module icons interactive in `client/src/components/Layout.tsx` and added one-command setup script `npm run dev:setup` |
| 2026-02-27 | ✅ Unified secure AI pipeline across route and service call sites (`routes.ts`, `scheduleAnalyzer.ts`, `emarAgent.ts`) using `executeSecureTextCompletion` / `executeSecureChatCompletion` |
| 2026-02-27 | ✅ Added tool-aware secure chat helper path and resolved vault typing via structural `VaultLike` interface in `server/utils/secureAiPipeline.ts` |
| 2026-02-27 | ✅ Re-validated end-to-end quality gate subset: build + typecheck + server/client tests all green after refactors |
| 2026-02-27 | ✅ Added focused secure helper regression tests in `server/__tests__/secureAiPipeline.test.ts` (text restore, multipart scrubbing, user-only chat scrubbing) |
| 2026-02-27 | ✅ Improved helper testability via injectable completion runners in `server/utils/secureAiPipeline.ts` without changing production behavior |
| 2026-02-27 | ✅ Applied global UI polish in `client/src/index.css` (typography rhythm, interaction transitions, focus clarity, link/readability refinements, shell/card hover polish) |
| 2026-02-27 | ✅ Improved app-wide layout balance in `client/src/components/Layout.tsx` and loading-state visual consistency in `client/src/App.tsx` |
| 2026-02-27 | ✅ Completed second-wave high-traffic page UI harmonization in `Dashboard.tsx`, `EMARAudit.tsx`, and `CarePlanning.tsx` using `app-surface` + compact shell primitives |
| 2026-02-27 | ✅ Re-validated after page-level UI updates: `npm run check` and `npm run build` passed |
| 2026-02-27 | ✅ Finalized residual card/shell consistency in `Dashboard.tsx` + `EMARAudit.tsx` and re-confirmed clean typecheck/build |
| 2026-02-27 | ✅ Completed fourth-wave UI harmonization in `VisitAudit.tsx`, `BillingTool.tsx`, and `PlanEnhancer.tsx` (compact shells + `app-surface` cards) with clean `check`/`build` |
| 2026-02-27 | ✅ Completed fifth-wave UI harmonization in `RiskAssessment.tsx`, `Upload.tsx`, and `CallReconciliation.tsx` (compact shells + unified card surfaces) with clean `check`/`build` |
| 2026-02-27 | ✅ Completed sixth-wave UI harmonization in `Messages.tsx`, `EmailAssistant.tsx`, and `Settings.tsx` (compact shells + `app-surface` cards) with clean `check`/`build` |
| 2026-02-27 | ✅ Hardened Postgres runtime compatibility for Render ingest failures by pinning `postgres-array` to `2.0.0` in `package.json` overrides and revalidating dependency resolution/build |
| 2026-02-27 | ✅ Fixed production DB TLS negotiation edge case in `server/utils/pgPoolConfig.ts` (`sslmode=prefer/allow` now keeps SSL enabled for non-local hosts, preventing Render `SSL off` ingest failures) |
| 2026-02-28 | ✅ Reduced login lockout friction by changing auth rate limiting and password-attempt blocking defaults from 15-minute windows to 2-minute windows (`server/index.ts`, `server/utils/passwordPolicy.ts`) |
| 2026-02-28 | ✅ Eliminated recurring workbook ingest `arrayParser.create` crashes by replacing destructive `scripts/postinstall.cjs` stub logic with a safe compatibility patch and adding explicit ingest error responses for DB parser/SSL misconfiguration cases in `server/routes.ts` |
| 2026-02-28 | ✅ Hardened auth UX by mapping transient DB/SSL login failures to HTTP 503 in `server/routes.ts` and suppressing unauthenticated `/api/system-logs` POST noise in `client/src/context/AuthContext.tsx` |
| 2026-02-28 | ✅ Enhanced EMAR compliance output in `server/routes.ts`: added repeated non-administration trend warnings (`R`, `SA`, `F`, `NH`), inferred unknown carer names from same date/time records, and exposed `allCareWorkers` in both standard and agent result payloads |
| 2026-02-28 | ✅ Rebuilt `emar-lmstudio-preset.json` to LM Studio native `.preset.json` schema (`identifier`, `operation.fields`, `load.fields`) based on real exported preset structure to resolve import-context validation errors |
| 2026-02-28 | ✅ Added LM Studio structured-output artifacts for eMAR testing: `EMAR Structured Output.schema.json` (strict JSON schema) and `EMAR Strict JSON Test.prompt.md` (ready-to-paste task prompt aligned with NH/MU/trend/inference rules) |

---

## 📋 Active Priorities

- [x] ✅ COMPLETED: Initial project setup and build pipeline are operational (`dev`, `build`, `start`, `quality` scripts present)
- [x] ✅ COMPLETED: Test framework is configured (Node test runner for server + Vitest for client)
- [x] ✅ COMPLETED: Core architecture baseline now documented in this file
- [x] ✅ COMPLETED: Integrate secure AI helper wrappers across route and service text/multimodal flows while preserving existing tool-call behavior
- [x] ✅ COMPLETED: Fix compile break in TestingFeatures.tsx (restored 470 lines of deleted imports/constants/types)
- [x] ✅ COMPLETED: Fix runtime crash in ScheduleComparison (added defensive response normalization)
- [x] ✅ COMPLETED: Comprehensive validation of RosteringStudioUnified.tsx (all functions verified working, 0 errors)
- [ ] 🔄 Continue decomposing `server/routes.ts` into modular route files under `server/routes/`
- [ ] 🔄 Add/refresh dedicated architecture docs in `docs/` (data flow + auth/session + AI provider fallback behavior)
- [ ] 🔄 Expand automated test coverage for route modules and end-to-end critical flows (auth, upload scanning, EMAR parsing)
- [x] ✅ COMPLETED: Add focused tests for `executeSecureChatCompletion` (user-only scrubbing + multipart text scrubbing + tool-call continuity)
- [ ] 🔄 Keep extension and web app workflows aligned (payload contracts + versioning + release notes)
- [ ] 🔄 Formalize MCP usage playbook per task type (DB investigations, PR review, issue triage)
- [x] ✅ COMPLETED: Continue incremental UI harmonization for high-traffic pages (Dashboard, EMAR Audit, Care Planning) using updated global shell primitives

---

## 🔧 Development Environment

**Common Commands:**

- `npm install`
- `npm run dev`
- `npm run dev:setup`
- `npm run build`
- `npm test`
- `npm run check`
- `npm run quality`
- `npm run db:push`

**Key Files:**

- Product/ops overview: `README.md`, `render.yaml`
- Session memory: `Session_starter.md`, `TODO.md`
- Client entry/routing: `client/src/App.tsx`, `client/src/main.tsx`
- Server entry/security: `server/index.ts`
- API registration: `server/routes.ts`, `server/routes/index.ts`
- Data model: `shared/schema.ts`, `migrations/`
- Extension: `extension/edge-acp-autofill/README.md`, `extension/edge-acp-autofill/manifest.json`

**Setup Requirements:**

- Install Node 20+ and npm 10+
- Configure `.env` with at least `DATABASE_URL` and `SESSION_SECRET`
- Configure AI provider keys when AI features are enabled
- Run `npm run db:push` for first local DB alignment

**AI/MCP Tooling Notes:**

- Use DB MCP tools for live schema/data checks when debugging backend behavior
- Use GitHub/PR MCP tools for review workflows and issue-linked work
- Use search + semantic tools first before broad file edits in large server modules

---

*This file serves as persistent project memory for enhanced AI assistant session continuity with repository-verified context.*
