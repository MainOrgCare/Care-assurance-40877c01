# ───────────────────────────────────────────────────────────────────────────────
# CareAssurance — Production Dockerfile
#
# Multi-stage build for the full-stack application (API + static client).
# Optimised for small final image size, security, and layer caching.
#
# Usage:
#   docker build -t care-assurance .
#   docker run -p 5000:5000 --env-file .env care-assurance
# ───────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# Alpine needs libc6-compat for some native modules (e.g. bcrypt)
RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev --legacy-peer-deps

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM deps AS build

WORKDIR /app

# Copy full source (deps already installed in previous stage)
COPY . .

# Build client (Vite) and server (esbuild)
RUN npm run build:client && npm run build:server && npm run build:worker

# ── Stage 3: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache libc6-compat dumb-init

# Security: run as non-root user
RUN addgroup --gid 1001 appgroup && \
    adduser --uid 1001 --ingroup appgroup --disabled-password --shell /bin/false appuser

WORKDIR /app

# Install production-only dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy built artefacts from build stage
COPY --from=build /app/dist ./dist

# Set environment defaults
ENV NODE_ENV=production \
    PORT=5000 \
    SERVE_STATIC=true

# Health check for container orchestrators
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://localhost:5000/healthz', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.end();"

# Switch to non-root user
USER appuser

EXPOSE 5000

# Use dumb-init to properly handle PID 1 signal forwarding (SIGTERM, etc.)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.cjs"]
