#!/usr/bin/env node
// Postinstall script to add missing pg-types arrayParser stub
const fs = require('fs');
const path = require('path');

const arrayParserPath = path.join(__dirname, '..', 'node_modules', 'pg-types', 'lib', 'arrayParser.js');
const arrayParserDir = path.dirname(arrayParserPath);

// Check if directory exists
if (fs.existsSync(arrayParserDir)) {
  // Create the arrayParser stub
  const content = `// Minimal arrayParser stub to satisfy pg-types imports
// This is a workaround for missing pg-types arrayParser dependency
module.exports = {
  parse: function(source, transform) {
    return [];
  }
};
`;

  fs.writeFileSync(arrayParserPath, content);
  console.log('✓ Created pg-types arrayParser stub');
} else {
  console.log('⚠ pg-types not found, skipping arrayParser stub creation');
}
