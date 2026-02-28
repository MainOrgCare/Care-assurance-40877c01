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
**Build Status:** ✅ Last recorded build succeeded (`npm run build`, exit code 0 on 2026-02-28)  
**Runtime Shape:** Dev server runs API + Vite HMR; production build includes client + server + worker split deployment on Render.  
**AI Enhancement:** Feature-toggled AI stack with cache/rules-first/lite-mode/provider/model controls.
**Validation Status:** ✅ `npm run check`, `npm run test:server` (117/117), and `npm run test:client` (22/22) all passed on 2026-02-27.

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
- README documents a mature multi-domain healthcare operations platform rather than an early MVP scaffold.
- Route-level frontend code-splitting + idle preloading already implemented for common pages.
- Security posture is explicitly engineered (canonical host controls, CSRF/origin checks via route stack, progressive lockout helpers, request logger middleware).
- Extension supports two workflows: traditional payload autofill + direct document upload for AI analysis.
- `server/routes.ts` contains a local `PIIVault` implementation; helper integrations should use structural typing for vault compatibility instead of concrete class coupling.
- `server/utils/secureAiPipeline.ts` now supports both text-only and multimodal user content (scrubs text parts in multipart payloads).
- Route-level direct `createChatCompletionWithLogging` calls have been eliminated in favor of secure helper wrappers; service-level text extraction paths were also migrated.

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
|------|---------|
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