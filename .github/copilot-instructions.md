# Care Assurance — Copilot Instructions

## Project Overview

Operational intelligence platform for domiciliary care providers. Features: compliance tracking, EMAR auditing, AI-assisted care planning, rostering, workforce management, and a browser extension for autofilling the Mobizio ACP system.

## Build, Test, and Lint Commands

```bash
# Development
npm run dev              # Concurrently: Vite client (:5173) + Express server (:5000)
npm run dev:full         # Same but sources .env first (recommended for local dev)
npm run dev:client       # Client only
npm run dev:server       # Server only — AI_ENABLED defaults to true

# Build & type-check
npm run build            # Build client (Vite) + server (esbuild → dist/index.cjs)
npm run check            # TypeScript type-check only (tsgo via @typescript/native-preview — no lint step exists)
npm run quality          # Full CI gate: test + check + build

# Production
npm start                # Run the built server (dist/index.cjs)

# Tests
npm test                 # Run all tests (server then client)
npm run test:server      # Server tests — Node native test runner
npm run test:client      # Client tests — Vitest

# Run a single server test file
node --import tsx --test --test-force-exit server/__tests__/visitAuditWorkflow.test.ts

# Run a single client test file
npx vitest run client/src/pages/service-users/__tests__/riskAssessmentUtils.test.ts

# EMAR-specific test suites
npm run test:server:emar           # EMAR compliance parity tests
npm run test:server:emar:artifacts # EMAR artifact schema tests

# Database
npm run db:push          # Push schema changes (Drizzle Kit)

# Extension
npm run package:extension  # Package the Edge browser extension as ZIP/CRX
```

> Server tests use the **Node native test runner** (`node --test`). Client tests use **Vitest**. Do not mix runners. There is no separate lint script — type-checking is via `npm run check`.

## Architecture

### Stack

- **Client**: React 19, Vite, Tailwind CSS v4, Radix UI, TanStack Query, Wouter (routing), React Hook Form + Zod
- **Server**: Express on Node ≥20, TypeScript compiled with esbuild for production
- **Database**: PostgreSQL via **Drizzle ORM** — schema defined in `shared/schema.ts`
- **AI**: OpenAI / GitHub Models / local LLM (Ollama-compatible), provider switchable at runtime via admin panel

### Directory Layout
```
client/src/       React app — pages/, components/, context/, hooks/, lib/
server/           Express API
  routes/         Modular route files, each exports register*Routes()
  services/       Business logic / AI workflows
  utils/          Shared utilities (PII vault, security audit, etc.)
  __tests__/      Server unit tests
shared/
  schema.ts       Single source of truth — Drizzle table defs + Zod insert schemas
  apiTypes.ts     Shared request/response types
extension/edge-acp-autofill/   MV3 Edge extension (vanilla JS, no build step)
migrations/       Drizzle migration SQL files
```

### Request Lifecycle

1. Client calls `/api/...` via TanStack Query (`client/src/lib/queryClient.ts`)
2. `server/routes.ts` registers monolithic routes; modular routes are registered via `server/routes/index.ts`
3. Storage layer (`server/storage.ts`) executes all DB queries through Drizzle
4. AI features call `server/utils/secureAiPipeline.ts` → PII vault scrub → AI provider → PII restore

### Browser Extension
The `extension/edge-acp-autofill/` directory is a **plain MV3 extension** (no build step, no bundler). It autofills the Mobizio ACP system (`clece.mobizio.com`) using data pulled from the Care Assurance app. Content scripts:

- `content-app.js` — injected into Care Assurance pages, pushes data to background
- `content-acp.js` — injected into Mobizio, fills ACP risk/care-plan forms
- `content-initial-assessment.js` — fills Initial Assessment forms
- `content-emar.js` — fills EMAR forms
- `background.js` — service worker, brokers data between content scripts via `chrome.storage`

## Key Conventions

### Schema & Types

- **All table definitions live in `shared/schema.ts`**. Insert schemas are generated with `createInsertSchema` (drizzle-zod), then `omit({ id, createdAt })`. Always export both `Insert*` and inferred select types.
- IDs use `varchar` with `gen_random_uuid()` default (not serial integers).
- Dates stored as `text` in `DD/MMM/YYYY` format where human-readable audit trails matter.

### Route Registration Pattern
Each modular route file exports a single `register*Routes(app, deps)` function. Register it in `server/routes/index.ts` (barrel) and call it from `server/routes.ts`. Never add routes directly to `server/index.ts`.

### AI Pipeline — PII Safety
All AI calls that involve care plan or service user text **must** go through `secureAiPipeline.ts` or manually use `PIIVault` from `server/utils/piiVault.ts`. The vault scrubs PII tokens before sending to the AI provider and restores them in the response. Bypassing this is a GDPR violation.

AI features are gated by the `AI_ENABLED` env var. The env var takes precedence; it cannot be overridden by admin settings. Use `getAIDisabledMessage()` / `getAiErrorStatusCode()` from `server/services/aiClient.ts` for consistent error responses.

### Path Aliases

- `@/` → `client/src/`
- `@shared/` → `shared/`

Both are configured in `tsconfig.json` and `vitest.config.ts`.

### Theming
CSS design tokens follow a corporate slate/sky palette. Theme classes are `theme-light`, `theme-dark`, `theme-high-contrast`, `theme-accessible`, etc., applied to `<html>`. A transient `theme-transitioning` class is also present — do not use it for theme detection. Never hard-code `white` or `#fff` as backgrounds; use `var(--color-card)` / `var(--color-sidebar)`.

### Care Worker Anonymization
Care worker names in the database are stored in anonymized `Initial.Surname` format (e.g., `L.Barron`). Do not store or display full names.

### Visit Duration Parsing (`parseVisitDurationMinutes`)
In `server/services/visitAuditWorkflow.ts`: integer values are raw **minutes**; values containing `"."` are **hours** (decimal); `"H:MM"` strings are parsed as hours+minutes. Do not infer units from numeric magnitude.

### Date Parsing (`parseComparableDate`)
In `server/services/auditCareWorkerWorkflow.ts`: the `DD/MM[/YYYY]` regex **must** run before `Date.parse` — Node/V8's `Date.parse` misinterprets `"02/04/2026"` as MM/DD.

### Risk Assessment Normalization
Before sending risk rows to the extension or to ACP autofill, call `normalizeGeneratedRiskRows()` from `server/services/riskAnalysisWorkflow.ts`. Blank or duplicate rows must be dropped at the server before quality scoring and before SSE emission.

### EMAR Compliance System
The EMAR (Electronic Medication Administration Record) audit pipeline works as follows:

1. A scanned EMAR PDF is uploaded and parsed to text.
2. `server/services/emarComplianceAgent.ts` calls `runComplianceAgent()` which uses `secureAiPipeline` with **strict JSON schema output** (structured outputs, `temperature: 0`).
3. The JSON schema and system prompt are loaded at startup from two root-level artifact files: `EMAR Structured Output.schema.json` and `EMAR Strict JSON Test.preset.json`. Do not hardcode these — `loadEmarComplianceArtifacts()` in `server/utils/emarComplianceArtifacts.ts` owns that loading with a fallback schema.
4. Each EMAR record row has a `code` field constrained to `"R" | "SA" | "F" | "NH" | null`. `NH` (not home) always sets `requiresVerification: true`.
5. The `emarGridParser.ts` handles raw grid/table extraction before the AI compliance pass.

### Extension Popup State Model
The popup (`extension/edge-acp-autofill/popup/`) is split into four modules:

- `state.js` — storage key constants (`STORAGE_KEYS`), message type constants (`MESSAGE_TYPES`), form config constants, and `buildWorkflowSafetyState()` which is the **single source of truth** for readiness/guard decisions (stale page, version drift, case target mismatch).
- `ui.js` — all DOM rendering; consumes state from `state.js`. Tab badges go in `updateTabBadges()`, target readiness in `renderCaseContextStrip()`, command center in `renderCommandCenter()`.
- `api.js` — all fetch calls to the Care Assurance server (payload load, extension package endpoints, etc.).
- `main.js` — event wiring and orchestration; imports from the other three.

**Critical rule**: both UI summaries and real action handlers must consume `buildWorkflowSafetyState()` — do not add parallel readiness checks in `main.js` or `ui.js` that could diverge.

### Session Continuity
`Session_starter.md` at the repo root is a living progress document. Read it for context at the start of any session and update it with significant decisions or changes.

## Environment Variables

Copy `.env.example` to `.env`. Required for local dev:

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — session cookie signing secret
- `AI_ENABLED=true` — `dev:server` defaults this to `true`; set explicitly in `.env` for `dev:full`
- `OPENAI_API_KEY` or `GITHUB_TOKEN` — depending on chosen AI provider

Deployment target is **Render.com** (`render.yaml`). The server trusts one proxy hop (`app.set("trust proxy", 1)`).