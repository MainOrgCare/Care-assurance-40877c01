import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Domain redirect middleware - redirect Replit domain to custom domain in production
const CUSTOM_DOMAIN = "careassurance.uk";
app.use((req, res, next) => {
  const host = req.get("host") || "";
  // Only redirect in production and if accessing via Replit domain
  if (process.env.NODE_ENV === "production" && 
      (host.includes(".replit.app") || host.includes(".replit.dev"))) {
    const redirectUrl = `https://${CUSTOM_DOMAIN}${req.originalUrl}`;
    return res.redirect(301, redirectUrl);
  }
  next();
});

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

app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '50mb' }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

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
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Auto-seed admin user in all environments
  try {
    const existingAdmin = await storage.getUserByUsername("Lewis.barron");
    if (!existingAdmin) {
      await storage.createUser({
        username: "Lewis.barron",
        password: "testtest",
        role: "admin",
        status: "active",
      });
      log("Created admin user (username: Lewis.barron)");
    }
  } catch (error) {
    log("Note: Could not check/create admin user - database may not be ready yet");
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
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
