# ───────────────────────────────────────────────────────────────────────────────
# CareAssurance — Production Dockerfile
#
# Multi-stage build for the full-stack application (API + static client).
# Optimised for small final image size and layer caching.
#
# Usage:
#   docker build -t care-assurance .
#   docker run -p 5000:5000 --env-file .env care-assurance
# ───────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-slim AS deps

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
FROM node:20-slim AS production

# Security: run as non-root user
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/false --create-home appuser

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

CMD ["node", "dist/index.cjs"]
