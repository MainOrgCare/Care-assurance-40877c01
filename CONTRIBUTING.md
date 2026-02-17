# Contributing to Care Assurance

Thank you for your interest in contributing to the Care Assurance platform. This
document outlines the conventions and workflows that keep the codebase
consistent, reviewable, and production-ready.

---

## Getting Started

```bash
# 1. Clone the repository
git clone <repo-url> && cd care-assurance

# 2. Install dependencies
npm install

# 3. Copy environment config
cp .env.example .env   # then edit .env

# 4. Push the database schema (first run)
npm run db:push

# 5. Start the dev server
npm run dev
```

## Branch Strategy

| Branch | Purpose |
| --- | --- |
| `main` | Production-ready code; protected with CI checks |
| `develop` | Integration branch for feature work |
| `feature/*` | New features and enhancements |
| `fix/*` | Bug fixes |
| `chore/*` | Tooling, dependency updates, refactors |

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

**Scopes:** `server`, `client`, `shared`, `extension`, `ci`, `docs`

Examples:

```
feat(server): add GDPR data export endpoint
fix(client): prevent dashboard widget duplicate on drag
chore(ci): upgrade Node.js to 20.x in CI workflow
docs: update deployment guide for split architecture
```

## Code Style

- **TypeScript** everywhere (client + server + shared)
- **2-space indentation**, LF line endings (see `.editorconfig`)
- Prefer `const` over `let`; avoid `var`
- Use explicit return types on exported functions
- Prefer named exports (avoid default exports except for page components)
- Use `import type` when importing types only

### Server

- Route handlers belong in `server/routes/` as modular files
- Business logic belongs in `server/services/`
- Shared utilities belong in `server/utils/`
- Never expose raw error messages in production (use `safeErrorMessage()`)
- Log security-relevant events via `logSecurityEvent()`
- Validate inputs with Zod schemas where possible

### Client

- Components use shadcn/ui primitives from `client/src/components/ui/`
- Pages are lazy-loaded in `App.tsx` for code splitting
- State management via React Context + TanStack Query (no Redux)
- Use `apiRequest()` or `getQueryFn()` for API calls (automatic `X-Request-ID`)
- Styles use Tailwind CSS utility classes (no CSS modules)

## Testing

```bash
# Full test suite
npm test

# Server tests only
npm run test:server

# Client tests only
npm run test:client

# Type checking
npm run check

# Full quality gate (test + check + build)
npm run quality
```

- Server tests use Node.js built-in test runner
- Client tests use Vitest
- Write tests for new utilities, validators, and service functions
- UI components are tested through integration tests on pages

## Database Changes

- Schema is defined in `shared/schema.ts` using Drizzle ORM
- Push schema changes with `npm run db:push`
- Migrations are in the `migrations/` directory

## Security

- **Never commit secrets** — use `.env` (listed in `.gitignore`)
- Review `SECURITY.md` for the current security posture
- Run `npm run audit:prod` before merging dependency changes
- PII must be scrubbed before AI processing (see `server/routes.ts` PII vault)

## Pull Requests

1. Create a feature/fix branch from `develop`
2. Make focused, well-described commits
3. Ensure `npm run quality` passes locally
4. Open a PR with a clear description of **what** and **why**
5. Request review from at least one team member
6. Squash-merge into `develop` after approval
