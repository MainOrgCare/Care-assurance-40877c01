import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { serveStatic } from "../static";

// Builds an isolated dist dir with a recognisable index.html, wires serveStatic
// onto a throwaway Express app, and returns a helper to issue real HTTP requests.
function bootStaticApp() {
  const distPath = fs.mkdtempSync(path.join(os.tmpdir(), "ca-static-"));
  fs.writeFileSync(path.join(distPath, "index.html"), "<!doctype html><title>SPA SHELL</title>");
  fs.writeFileSync(path.join(distPath, "app.js"), "console.log('asset');");

  const app = express();
  // A real API route so we can assert the SPA fallback does NOT swallow /api.
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));

  // This must not throw at registration: a bare "*" path is invalid under
  // Express 5 / path-to-regexp v8 and previously crashed the server at boot.
  serveStatic(app, distPath);

  const server = http.createServer(app).listen(0);
  const { port } = server.address() as { port: number };

  const request = (method: string, urlPath: string) =>
    new Promise<{ status: number; body: string; type?: string }>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: urlPath, method }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body, type: res.headers["content-type"] }),
        );
      });
      req.on("error", reject);
      req.end();
    });

  return { request, close: () => new Promise<void>((r) => server.close(() => r())).then(() => fs.rmSync(distPath, { recursive: true, force: true })), distPath };
}

test("serveStatic registers SPA fallback without throwing (Express 5 wildcard)", () => {
  const app = express();
  const distPath = fs.mkdtempSync(path.join(os.tmpdir(), "ca-static-"));
  fs.writeFileSync(path.join(distPath, "index.html"), "<!doctype html>");
  // The bug: app.get("*") throws "Missing parameter name" here under Express 5.
  assert.doesNotThrow(() => serveStatic(app, distPath));
  fs.rmSync(distPath, { recursive: true, force: true });
});

test("serveStatic serves the SPA shell for deep GET routes", async () => {
  const { request, close } = bootStaticApp();
  try {
    for (const route of ["/", "/dashboard", "/service-users/care-planning"]) {
      const res = await request("GET", route);
      assert.equal(res.status, 200, `${route} should return 200`);
      assert.match(res.body, /SPA SHELL/, `${route} should serve index.html`);
    }
  } finally {
    await close();
  }
});

test("serveStatic does not swallow /api routes", async () => {
  const { request, close } = bootStaticApp();
  try {
    const res = await request("GET", "/api/ping");
    assert.equal(res.status, 200);
    assert.match(res.type ?? "", /application\/json/);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
  } finally {
    await close();
  }
});

test("serveStatic SPA fallback is GET-only (non-GET to a non-API path 404s)", async () => {
  const { request, close } = bootStaticApp();
  try {
    const post = await request("POST", "/dashboard");
    assert.equal(post.status, 404, "POST to a non-API path must not serve the SPA shell");
  } finally {
    await close();
  }
});
