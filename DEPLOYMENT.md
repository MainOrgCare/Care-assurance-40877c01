# Deployment Configuration

## Domain Setup

The application is configured to deploy to the custom domain **careassurance.uk**.

### Key Configuration Files

1. **server/index.ts** (lines 17-28)
   - Implements automatic redirect from Replit domains to the custom domain
   - Redirects `.replit.app` and `.replit.dev` domains to `https://careassurance.uk` in production
   - Ensures consistent URL across all users

2. **vite-plugin-meta-images.ts** (lines 58-68)
   - Configures Open Graph and Twitter meta tags to use the custom domain
   - In production builds, meta images point to `https://careassurance.uk/opengraph.jpg`
   - Ensures proper social media previews when sharing the site

3. **vite.config.ts**
   - Configured with `allowedHosts: true` to accept requests from custom domains
   - Server runs on `0.0.0.0` to accept connections from any interface

### Replit Deployment Settings

The `.replit` file contains the deployment configuration:
- **Deployment Target**: autoscale
- **Build Command**: `npm run build`
- **Run Command**: `npm run start`
- **Port Configuration**: Internal port 5000 maps to external port 80

### Domain Configuration in Replit

To complete the deployment to your custom domain:

1. Go to your Replit project
2. Navigate to the "Deployments" tab
3. Click on your deployment
4. Under "Custom Domains", add `careassurance.uk`
5. Follow Replit's instructions to configure DNS records:
   - Add a CNAME record pointing to your Replit deployment URL
   - Or add A records pointing to Replit's IP addresses

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
