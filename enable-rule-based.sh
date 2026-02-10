#!/bin/bash

echo "🔄 Enabling Rule-Based Fallback (No AI Required)"
echo ""
echo "This will disable AI and use smart rule-based analysis instead."
echo "Works for Risk Assessment, Plan Enhancer, EMAR Analysis, etc."
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  # Create/update .env file to disable AI
  echo "AI_ENABLED=false" >> .env
  echo "✅ AI disabled - rule-based system will be used"
  echo ""
  echo "Restart your server:"
  echo "  Ctrl+C"
  echo "  npm run dev"
  echo ""
  echo "Or for production (Render):"
  echo "  Set AI_ENABLED=false in environment variables"
  echo "  Redeploy service"
fi
