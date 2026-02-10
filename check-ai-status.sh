#!/bin/bash

echo "🔍 Checking AI Configuration..."
echo ""

# Check if server is running
if curl -s http://localhost:5000/healthz > /dev/null 2>&1; then
  echo "✅ Server is running"
  echo ""
  
  # Check AI readiness
  echo "📊 AI Provider Status:"
  curl -s http://localhost:5000/api/ai/readiness | jq -r '
    "Provider: \(.provider // "unknown")",
    "AI Enabled: \(.aiEnabled // false)",
    "Has GitHub PAT: \(.hasGitHubPAT // false)",
    "Has OpenAI Key: \(.hasOpenAIKey // false)",
    "Local LLM Available: \(.localLlmAvailable // false)",
    "",
    "Provider Configured: \(.providerConfigured // false)",
    if .providerIssue then "⚠️  Issue: \(.providerIssue)" else "✅ Provider OK" end
  ' 2>/dev/null || echo "❌ Could not fetch AI status (requires authentication)"
  
  echo ""
  echo "───────────────────────────────────────────────────────────────"
  echo ""
  echo "🔧 To Change Provider:"
  echo "   1. Go to: http://localhost:5000/secret-admin-portal"
  echo "   2. Navigate to 'AI Optimization' tab"
  echo "   3. Under 'Provider', select:"
  echo "      • GitHub (uses PAT_AI_KEY)"
  echo "      • OpenAI (uses OPENAI_API_KEY)"
  echo "      • Local (uses local Ollama server - if available)"
  echo "   4. Click 'Save Changes'"
  echo ""
  echo "Or disable AI entirely and use rule-based system:"
  echo "   Toggle 'AI Enabled' to OFF"
  
else
  echo "❌ Server not running"
  echo ""
  echo "Start with: npm run dev"
fi

echo ""
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "📝 Environment Variables to Check:"
echo ""

# Check env vars (hide actual values for security)
if [ -f .env ]; then
  echo "From .env file:"
  grep -E "^(AI_ENABLED|PAT_AI_KEY|OPENAI)" .env 2>/dev/null | sed 's/=.*/=***/' || echo "  No AI variables found"
else
  echo "  No .env file found"
fi

echo ""
echo "From environment:"
env | grep -E "^(AI_ENABLED|PAT_AI_KEY|OPENAI)" | sed 's/=.*/=***/' | sed 's/^/  /' || echo "  No AI variables in environment"

echo ""
echo "───────────────────────────────────────────────────────────────"
