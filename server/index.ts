import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import cors, { CorsOptions } from "cors";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Domain redirect middleware - redirect non-canonical hosts to the custom domain in production
const CANONICAL_DOMAIN = process.env.CANONICAL_DOMAIN || "careassurance.uk";
const enableCanonicalRedirect = process.env.ENABLE_CANONICAL_REDIRECT === "true";
app.use((req, res, next) => {
  const host = (req.get("host") || "").split(":")[0];
  if (process.env.NODE_ENV === "production" && enableCanonicalRedirect && host && host !== CANONICAL_DOMAIN) {
    const redirectUrl = `https://${CANONICAL_DOMAIN}${req.originalUrl}`;
    return res.redirect(301, redirectUrl);
  }
  next();
});

// Security headers via Helmet
const isProduction = process.env.NODE_ENV === "production";

// CSP is stricter in production, relaxed in dev for HMR/debugging
const cspDirectives: Record<string, string[]> = {
  defaultSrc: ["'self'"],
  scriptSrc: isProduction 
    ? ["'self'"] // No unsafe-inline/eval in production
    : ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for Vite HMR
  // Google Fonts stylesheets + CSS-in-JS inline styles
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: isProduction 
    ? ["'self'", `https://${CANONICAL_DOMAIN}`, `https://www.${CANONICAL_DOMAIN}`, "https://fonts.googleapis.com", "https://fonts.gstatic.com"]
    : ["'self'", "ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  frameSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  ...(isProduction && { upgradeInsecureRequests: [] }), // Empty array enables directive
};

app.use(helmet({
  contentSecurityPolicy: {
    directives: cspDirectives,
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  dnsPrefetchControl: { allow: false },
  ieNoOpen: true,
  originAgentCluster: true,
}));
app.disable('x-powered-by'); // Remove Express fingerprinting

// Additional security headers for API responses
app.use('/api/', (req, res, next) => {
  // Prevent caching of sensitive data
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  // Permissions Policy (formerly Feature Policy) - restrict browser features
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  
  // Additional security headers
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Download-Options', 'noopen');
  
  next();
});

log(`Security headers enabled (Helmet) - CSP mode: ${isProduction ? 'strict' : 'development'}`);

// CORS middleware
const corsOriginEnv = process.env.CORS_ORIGIN;
const defaultOrigins = [`https://${CANONICAL_DOMAIN}`, `https://www.${CANONICAL_DOMAIN}`];
const devOrigins = process.env.NODE_ENV !== "production" ? [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5000", // Express default
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5000",
] : [];
const allowedOrigins = (corsOriginEnv ? corsOriginEnv.split(",") : defaultOrigins)
  .map((origin) => origin.trim())
  .filter(Boolean)
  .concat(devOrigins);

log(`Allowed CORS origins: ${allowedOrigins.join(", ")}`);
log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

const corsOptions: CorsOptions = {
  origin: (origin, cb) => {
    // Log the origin for debugging
    log(`CORS request from origin: ${origin || '(no origin - same origin request)'}`);
    
    // In development, allow ALL origins for easier debugging
    if (process.env.NODE_ENV !== "production") {
      if (!origin) {
        log(`✓ No origin header - same-origin request allowed`);
        return cb(null, true);
      }
      log(`✓ Origin allowed (dev mode - all origins permitted): ${origin}`);
      return cb(null, true);
    }
    
    // Production mode - strict checking
    if (!origin) return cb(null, true);
    
    if (allowedOrigins.includes(origin)) {
      log(`✓ Origin allowed (in allowedOrigins): ${origin}`);
      return cb(null, true);
    }
    
    // Allow browser extensions (Chrome, Edge, Firefox)
    if (origin.startsWith('chrome-extension://') || 
        origin.startsWith('moz-extension://') || 
        origin.startsWith('extension://')) {
      log(`✓ Origin allowed (browser extension): ${origin}`);
      return cb(null, true);
    }
    
    // Allow Render.com subdomains for API server
    if (origin.includes('.onrender.com')) {
      log(`✓ Origin allowed (Render subdomain): ${origin}`);
      return cb(null, true);
    }
    
    log(`✗ Origin rejected: ${origin} (not in allowed list)`);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
log(`CORS enabled for origin(s): ${allowedOrigins.join(", ")}`);

// Lightweight health endpoint for infrastructure checks (Render, load balancers, etc.)
// Keep this outside /api so it bypasses API-specific middleware and auth concerns.
app.get("/healthz", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

// Global API rate limiting (100 requests per 15 minutes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  skip: (req) => {
    // Never rate limit health/status probes (Render health checks can be frequent)
    if (req.path === "/api/contact/status") return true;

    // Skip rate limiting in development for easier testing
    return process.env.NODE_ENV !== 'production';
  },
});
app.use('/api/', apiLimiter);
if (process.env.NODE_ENV === 'production') {
  log('API rate limiting enabled (100 req/15min)');
}

// Stricter rate limiting for authentication endpoints (5 requests per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Very strict: 5 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again in 15 minutes.' },
  skip: (req) => process.env.NODE_ENV !== 'production',
  keyGenerator: (req) => {
    // Prefer forwarded client IP if present (common behind proxies/load balancers).
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedIp =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : Array.isArray(forwarded)
          ? forwarded[0]?.split(',')[0]?.trim()
          : undefined;

    // Normalize IPv6 keys via express-rate-limit helper to prevent bypasses.
    return ipKeyGenerator(forwardedIp || req.ip || req.socket?.remoteAddress || 'unknown');
  },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
if (process.env.NODE_ENV === 'production') {
  log('Auth rate limiting enabled (5 req/15min for auth endpoints)');
}

// Sensitive action rate limiting (10 requests per hour for admin actions)
const adminActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many administrative actions. Please try again later.' },
  skip: (req) => process.env.NODE_ENV !== 'production',
});
// Apply to user management endpoints
app.use('/api/admin/users', adminActionLimiter);
app.use('/api/users/status', adminActionLimiter);
app.use('/api/users/role', adminActionLimiter);
if (process.env.NODE_ENV === 'production') {
  log('Admin action rate limiting enabled (10 req/hour)');
}

// Compression middleware - configured to allow flushing for SSE streams
// The compression middleware adds res.flush() which is needed to push SSE events through proxies
app.use(compression({
  filter: (req, res) => {
    // Check if this is an SSE response (Content-Type will be set later)
    // We still want compression middleware active for SSE so we get res.flush()
    // but the compression itself won't apply to text/event-stream content
    return compression.filter(req, res);
  }
}));

// Request body size limits
// Raw file uploads are handled by specific endpoints with multer
const DEFAULT_BODY_LIMIT = '200mb'; // JSON API requests (includes large workbook ingestion payloads)

app.use(
  express.json({
    limit: DEFAULT_BODY_LIMIT,
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: DEFAULT_BODY_LIMIT }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

const safeStringify = (payload: unknown, maxLength = 1500): string => {
  try {
    const json = JSON.stringify(payload);
    if (json.length <= maxLength) return json;
    return `${json.slice(0, maxLength)}... [truncated]`;
  } catch {
    return "[unserializable]";
  }
};

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        logLine += ` :: ${safeStringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

const DEFAULT_ADMIN_USERNAME = "Lewis.barron";

(async () => {
  // Admin bootstrap (development or explicit production bootstrap only)
  try {
    const bootstrapUsername = process.env.ADMIN_BOOTSTRAP_USERNAME || DEFAULT_ADMIN_USERNAME;
    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    const shouldSeedAdmin =
      process.env.NODE_ENV !== "production" || Boolean(process.env.ADMIN_BOOTSTRAP_PASSWORD);

    if (!shouldSeedAdmin) {
      log("Admin bootstrap skipped (set ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD to seed in production).");
    } else {
      const existingAdmin = await storage.getUserByUsername(bootstrapUsername);
      if (!existingAdmin) {
        if (process.env.NODE_ENV === "production" && !bootstrapPassword) {
          log("Admin bootstrap skipped: ADMIN_BOOTSTRAP_PASSWORD not provided in production.");
        } else {
          await storage.createUser({
            username: bootstrapUsername,
            password: bootstrapPassword || "testtest",
            role: "admin",
            status: "active",
          });
          log(`Created admin user (username: ${bootstrapUsername})`);
        }
      }
    }
  } catch (error) {
    log("Note: Could not check/create admin user - database may not be ready yet");
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      return _next(err);
    }
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // In production, sanitize error messages to prevent information disclosure
    const safeMessage = process.env.NODE_ENV === "production" && status === 500
      ? "Internal Server Error"
      : message;

    res.status(status).json({ message: safeMessage });
    
    // Log full error server-side only (never send to client)
    if (process.env.NODE_ENV !== "production") {
      console.error("[API Error]", err);
    } else {
      console.error(`[API Error] ${status} - ${message}`, {
        path: _req.path,
        method: _req.method,
        error: err.message,
        stack: err.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines only
      });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production" && process.env.SERVE_STATIC === "true") {
    serveStatic(app);
  } else if (process.env.NODE_ENV !== "production") {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
