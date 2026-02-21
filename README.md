# Care Assurance

Operational intelligence platform for domiciliary care providers.

## Quick Start

```bash
npm install
npm run dev
```

## Deploy to Render

Push to `main` — Render auto-deploys via `render.yaml`.

Or manually: **New > Web Service > Connect repo > Apply**.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (API + Vite HMR) |
| `npm run build` | Build client + server for production |
| `npm start` | Run production server |
| `npm test` | Run all tests |
| `npm run check` | TypeScript type check |
| `npm run db:push` | Push schema to database |

## Environment Variables

Set in Render dashboard or `.env` locally:

- `DATABASE_URL` — PostgreSQL connection string (required)
- `SESSION_SECRET` — Session encryption key
- `AI_ENABLED` — Enable AI features (default: true)
- `OPENAI_API_KEY` or `PAT_AI_KEY` — AI provider key Platform

> **AI-powered healthcare compliance, auditing, and operations platform** built for UK domiciliary care providers.

Care Assurance helps care organisations stay CQC-ready by automating EMAR audits, generating person-centred care plans, tracking staff training, and surfacing compliance risks — all from a single, role-based dashboard.

---

## Key Capabilities

| Domain | Feature | Description |
|--------|---------|-------------|
| **Medication** | EMAR Auditing | Parse eMAR sheets to flag missed doses, PRN refusals, and non-administration codes |
| **Care Planning** | AI Plan Generation | Draft 11-section person-centred care plans from uploaded assessments |
| **Risk** | Risk Assessments | Automated risk scoring with rule-based and AI-powered analysis |
| **Auditing** | Visit Audits | Match planned vs actual call data to detect drift and missed visits |
| **Finance** | Call Reconciliation | Process ECM call exports into billing variance summaries |
| **Rostering** | Rostering Studio | Import workbooks, optimise schedules, and analyse rota coverage |
| **Compliance** | CQC Self-Assessment | Track inspection readiness with live risk indicators |
| **Staff** | Training Tracker | Monitor mandatory training, certifications, and expiry dates |
| **Governance** | GDPR Controls | Consent management, data subject requests, PII scrubbing, and audit trails |
| **Admin** | System Logs & Security | Real-time user activity, IP blocking, progressive lockout, and session management |

## Architecture

```text
┌────────────────────────────────┐
│         Client (SPA)           │
│  React · TypeScript · Vite     │
│  Tailwind CSS · shadcn/ui      │
│  TanStack Query · wouter       │
├────────────────────────────────┤
│         API Server             │
│  Express · TypeScript          │
│  Helmet · CORS · Rate Limiting │
│  Session Auth (cookie-based)   │
├────────────────────────────────┤
│  PostgreSQL  │  AI (OpenAI /   │
│  Drizzle ORM │  GitHub Models) │
└──────────────┴─────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, TanStack Query |
| UI Components | shadcn/ui (Radix Primitives), Lucide Icons, Framer Motion |
| Backend | Node.js 20, Express, TypeScript |
| Database | PostgreSQL via Drizzle ORM |
| AI | OpenAI GPT-4.1-mini (default), GitHub Models, or local Ollama |
| Auth | Cookie-based sessions, bcrypt, NIST password policy |
| Security | Helmet CSP, CSRF protection, rate limiting, request correlation IDs |
| Deployment | Render.com (static + API split), worker process |
| Extension | Edge browser extension for care system auto-fill |

## Getting Started

### Prerequisites

- **Node.js** `20.x`
- **npm** `10+`
- **PostgreSQL** (required in production; optional for limited local flows)
- **Python** `3.x` (only for extension packaging scripts)

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env — set DATABASE_URL and SESSION_SECRET at minimum

# 3. Push database schema (first run)
npm run db:push

# 4. Start the development server
npm run dev
```

The app will be available at `http://localhost:5000`.

In development the initial admin user (`Lewis.barron` / `testtest`) is created automatically.

### Environment Variables

See [`.env.example`](.env.example) for a fully documented list. Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Production | — | PostgreSQL connection string |
| `SESSION_SECRET` | Production | — | Session cookie signing secret |
| `AI_ENABLED` | No | `true` | Master toggle for all AI features |
| `OPENAI_API_KEY` | When AI on | — | OpenAI API key |
| `GITHUB_TOKEN` | When GitHub AI | — | GitHub PAT with `models` scope |
| `CANONICAL_DOMAIN` | No | `careassurance.uk` | Production domain for HSTS/redirects |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (API + Vite HMR) |
| `npm run build` | Production build (client + server + worker) |
| `npm start` | Start production API server |
| `npm test` | Run all tests (server + client) |
| `npm run check` | TypeScript type checking |
| `npm run quality` | Full quality gate (test + check + build) |
| `npm run db:push` | Push Drizzle schema to database |
| `npm run audit:prod` | Audit production dependencies |

## Project Structure

```
├── client/                # React SPA
│   ├── src/
│   │   ├── components/    # Shared UI components (shadcn/ui + custom)
│   │   ├── context/       # React context providers (Auth, Session, Settings)
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utilities, query client, validation
│   │   └── pages/         # Route-level page components
│   └── public/            # Static assets
├── server/                # Express API server
│   ├── routes/            # Modular route handlers
│   ├── routes.ts          # Main route registration (being modularised)
│   ├── services/          # Business logic (AI client, EMAR agent, billing, etc.)
│   ├── utils/             # Shared utilities (security audit, password policy, etc.)
│   ├── config/            # Configuration (AI pricing)
│   ├── storage.ts         # Database layer (Drizzle ORM)
│   └── worker.ts          # Background processing
├── shared/                # Shared types & Drizzle schema
├── extension/             # Edge browser extension
├── migrations/            # Database migration files
├── docs/                  # Project documentation
├── .env.example           # Environment variable template
├── render.yaml            # Render.com deployment blueprint
└── SECURITY.md            # Security posture & vulnerability reporting
```

## Deployment

The platform deploys as a **split architecture** on [Render.com](https://render.com):

- **Static site** — pre-built Vite output served via Render's CDN
- **API service** — Node.js Express server with health checks at `/healthz` and `/readyz`
- **Worker** — background process for scheduled tasks

See [`render.yaml`](render.yaml) for the full blueprint.

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /healthz` | Lightweight liveness probe (plain text `ok`) |
| `GET /readyz` | Readiness probe — verifies database connectivity |

## Security

- **Helmet** security headers and strict Content Security Policy
- **CSRF** origin verification on state-changing requests (production)
- **Rate limiting** — 1000 req/15min API, 5 req/15min auth, 10 req/hr admin actions
- **Progressive lockout** — brute-force protection with auto-suspension
- **Request correlation** — `X-Request-ID` on every API response
- **PII scrubbing** — UK GDPR compliant anonymisation before AI processing
- **Graceful shutdown** — handles `SIGTERM`/`SIGINT` with connection draining
- **Dependency mitigation** — `xlsx` prototype-pollution guards via safe wrappers

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Documentation

Additional documentation is available in the [`docs/`](docs/) directory and as standalone files:

- [Deployment Guide](DEPLOYMENT.md)
- [Security Policy](SECURITY.md)
- [GDPR Privacy Notice](GDPR_PRIVACY_NOTICE.md)
- [GDPR Data Protection Impact Assessment](GDPR_DPIA.md)
- [AI Architecture Overview](AI_ARCHITECTURE_DIAGRAM.md)
- [App Specification](app-specification.md)

## Licence

MIT
