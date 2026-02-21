#!/bin/bash
# One-shot cleanup script — run once then delete this file.
# Usage: bash cleanup.sh && git add -A && git commit -m "chore: clean up project" && git push

set -e

echo "=== Removing Docker files ==="
rm -f Dockerfile Dockerfile.localllm docker-compose.yml .dockerignore

echo "=== Removing Python agent ==="
rm -rf foundry-agent-render/

echo "=== Removing Python scripts ==="
rm -f script/bump-extension-version.py script/edge-addons-publish.py script/package-extension.py
rm -f script/generate-copilot-vs-gpt51-pptx.js

echo "=== Removing dead directories ==="
rm -rf backups/
rm -rf docs/
rm -rf extension/
rm -rf "Microsoft 365 Copilot Agent/"
rm -rf .anima/
rm -rf .devcontainer/
rm -rf attached_assets/

echo "=== Removing shell scripts ==="
rm -f check-ai-status.sh demo-plan-enhancer-output.sh enable-rule-based.sh test-plan-enhancer.sh

echo "=== Removing dead files ==="
rm -f test-plan-enhancer.js extracted-info-demonstration.txt EXTENSION_IMPROVEMENTS_GUIDE.js
rm -f server.log COPILOT_VS_GPT51_PRESENTATION.pptx postcss.config.js vite-plugin-meta-images.ts
rm -f CareAssurance-Copilot-Import.zip CareAssuranceCopilot-clean.zip
rm -f CareAssuranceCopilot-manifest.zip CareAssuranceCopilot.zip
rm -f .markdownlintignore .editorconfig components.json

echo "=== Removing .md files (keeping README.md and .github/copilot-instructions.md) ==="
find . -maxdepth 1 -name '*.md' ! -name 'README.md' ! -name 'LICENSE' -delete

echo "=== Removing edge-addons workflow ==="
rm -f .github/workflows/edge-addons-publish.yml

echo "=== Removing unused .vscode files ==="
rm -f .vscode/database-client-config.json .vscode/mcp.json

echo "=== Done! Now delete this script ==="
echo "rm cleanup.sh"
echo "Then: git add -A && git commit -m 'chore: clean up project' && git push"
