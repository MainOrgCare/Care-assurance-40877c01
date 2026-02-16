# Care Assurance Platform

Care Assurance is a full-stack healthcare compliance and operations platform for:

- risk assessment and care planning workflows
- EMAR and visit auditing
- staffing, rota analysis, and rostering tools
- billing and reconciliation support
- governance features (security logging, GDPR controls, admin policy controls)

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, TanStack Query
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL via Drizzle ORM
- Background processing: Node worker (`server/worker.ts`)
- Extension tooling: Edge Add-ons packaging and publishing scripts

## Getting Started

### Prerequisites

- Node.js `20.x`
- npm `10+`
- Python `3.x` (for extension packaging/publishing scripts)
- PostgreSQL (required for production; optional for limited local flows)

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Default app/API URL: `http://localhost:5000`

## Quality Commands

- Tests (server + client): `npm run test`
- Server tests only: `npm run test:server`
- Client utility tests only: `npm run test:client`
- Type check: `npm run check`
- Full quality gate: `npm run quality`
- Production build: `npm run build`
- Production dependency audit: `npm run audit:prod`

## Deployment Notes

- CI workflow: `.github/workflows/ci.yml`
- Render blueprint: `render.yaml`
- Edge extension publishing workflow: `.github/workflows/edge-addons-publish.yml`

## Key Environment Variables

- `NODE_ENV` (`development` or `production`)
- `PORT` (default `5000`)
- `DATABASE_URL` (required in production)
- `SESSION_SECRET` (required in production)
- `CANONICAL_DOMAIN` (default `careassurance.uk`)
- `CORS_ORIGIN` (comma-separated allow list in production)

## Security and Reliability

- Helmet security headers and CSP
- API/auth/admin rate limiting
- request correlation IDs (`X-Request-ID`) on API responses
- health and readiness endpoints: `/healthz`, `/readyz`
- graceful shutdown handling for `SIGTERM` and `SIGINT`
- dependency-risk notes and mitigation policy in `SECURITY.md`

## Extension Tooling

For Edge Add-ons release flow, see:

- `extension/edge-acp-autofill/README.md`
- `script/edge-addons-publish.py`
