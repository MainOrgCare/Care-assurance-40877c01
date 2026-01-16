# Deployment Configuration

## Domain Setup

The application is configured to deploy to the custom domain **careassurance.uk**.

### Key Configuration Files

1. **server/index.ts** (lines 17-28)
   - Implements automatic redirect from non-canonical hosts to the custom domain
   - Ensures consistent URL across all users in production

2. **vite-plugin-meta-images.ts** (lines 58-68)
   - Configures Open Graph and Twitter meta tags to use the custom domain
   - In production builds, meta images point to `https://careassurance.uk/opengraph.jpg`
   - Ensures proper social media previews when sharing the site

3. **vite.config.ts**
   - Configured with `allowedHosts: true` to accept requests from custom domains
   - Server runs on `0.0.0.0` to accept connections from any interface

### Render Deployment (Web Service)

This repo is a single Node.js web service that serves both the API and the built client from the same process.

In Render, create a **Web Service** (Environment: **Node**) pointing at this repository.

- **Build Command**: `npm run build` (runs `npm ci --include=dev` internally for a clean install)
- **Start Command**: `npm run start`
- **Node version**: use Node 20 (already declared via `package.json` `engines.node = 20.x`).
- **Environment variables**:
   - `NODE_ENV=production`
   - `DATABASE_URL` (if using Postgres)
   - Contact form SMTP vars (see below)

Important: The server build uses `esbuild --packages=external`, so `dist/index.cjs` requires installed runtime dependencies at start-up.

If you are using Render **Docker** instead of Node:

- Ensure your Docker build runs `npm ci --omit=dev` (or `npm ci`) in the final runtime stage.
- Do not copy only `dist/` without also installing runtime dependencies.

### Testing

The application has been tested locally in production mode:
- Build process completes successfully
- Frontend renders correctly
- Static assets (favicon, images, JS, CSS) are served properly
- Meta tags include correct domain URLs

### Build Process

```bash
# Production build
NODE_ENV=production npm run build

# Start production server
NODE_ENV=production npm run start
```

The build creates:
- Client bundle in `dist/public/`
- Server bundle at `dist/index.cjs`

Note: The `dist/` directory is gitignored and rebuilt during deployment.
