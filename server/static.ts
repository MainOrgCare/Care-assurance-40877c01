import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static assets with long-lived cache headers for hashed filenames.
  // Vite produces content-hashed filenames (e.g. index-abc123.js) so
  // aggressive caching is safe — a new hash means a new URL.
  app.use(
    express.static(distPath, {
      maxAge: "1y",
      immutable: true,
      etag: true,
      lastModified: true,
    }),
  );

  // SPA fallback — only for GET/HEAD requests so that a mistyped POST/DELETE
  // to a non-API path returns 404 instead of silently serving index.html.
  app.get("*", (_req, res, _next) => {
    if (_req.originalUrl.startsWith("/api")) {
      return _next();
    }
    // index.html itself should not be cached — it references hashed asset URLs
    // that change on every deployment.
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
