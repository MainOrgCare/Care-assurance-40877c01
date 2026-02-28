#!/usr/bin/env node
// Postinstall guard for pg-types arrayParser compatibility.
// - Never overwrite a healthy upstream file.
// - If create() is missing, patch in a minimal compatible implementation.
const fs = require("fs");
const path = require("path");

const arrayParserPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "pg-types",
  "lib",
  "arrayParser.js"
);

const compatContent = `"use strict";
// Compatibility shim for pg-types arrayParser API used by textParsers.js
const postgresArray = require("postgres-array");

function create(source, transform) {
  return {
    parse() {
      return postgresArray.parse(source, transform);
    }
  };
}

module.exports = {
  create,
  parse(source, transform) {
    return create(source, transform).parse();
  }
};
`;

if (!fs.existsSync(arrayParserPath)) {
  fs.mkdirSync(path.dirname(arrayParserPath), { recursive: true });
  fs.writeFileSync(arrayParserPath, compatContent, "utf8");
  console.log("✓ Created pg-types arrayParser compatibility file");
  process.exit(0);
}

try {
  const existing = fs.readFileSync(arrayParserPath, "utf8");
  if (/module\.exports\s*=\s*\{[\s\S]*\bcreate\s*:/.test(existing) || /exports\.create\s*=/.test(existing)) {
    console.log("✓ pg-types arrayParser already provides create(); no patch needed");
    process.exit(0);
  }

  fs.writeFileSync(arrayParserPath, compatContent, "utf8");
  console.log("✓ Patched pg-types arrayParser to provide create() compatibility");
} catch (error) {
  console.warn("⚠ Unable to patch pg-types arrayParser:", error && error.message ? error.message : error);
}
