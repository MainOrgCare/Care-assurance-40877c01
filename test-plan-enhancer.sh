#!/bin/bash

echo "🚀 Testing Plan Enhancer with Joseph Williamson documents..."
echo ""

PDF1="/workspaces/Care-assurance-40877c01/attached_assets/202601281346MrJosephKennethWilliamsonMrJosephKennethWilliamson (2).pdf"
PDF2="/workspaces/Care-assurance-40877c01/attached_assets/Fast Track forml 2023 Joseph williamson (1) (1) (2).pdf"

echo "📄 Document 1: $(wc -c < "$PDF1") bytes"
echo "📄 Document 2: $(wc -c < "$PDF2") bytes"
echo ""
echo "⏳ Sending request to Plan Enhancer API..."
echo ""

# Make the API call
curl -s -N --max-time 180 \
  -F "supportingDocuments=@$PDF1" \
  -F "supportingDocuments=@$PDF2" \
  http://localhost:5000/api/ai/enhance-plan > /tmp/plan-enhancer-response.txt

echo "✅ Response received. Processing..."
echo ""

# Extract and display the result
cat /tmp/plan-enhancer-response.txt | grep -A 1 "event: result" | grep "^data:" | sed 's/^data: //' > /tmp/plan-result.json

if [ -s /tmp/plan-result.json ]; then
  echo "================================================================================"
  echo "📋 GENERATED CARE PLAN"
  echo "================================================================================"
  echo ""
  
  # Pretty print the JSON
  cat /tmp/plan-result.json | jq -r '
    "Service User: \(.serviceUserName // "N/A")",
    "Date: \(.planDate // "N/A")",
    "",
    "────────────────────────────────────────────────────────────────────────────────",
    (.sections // [] | to_entries[] | 
      "\n  SECTION \(.key + 1): \(.value.heading)\n  " + ("─" * 76) + "\n\n\(.value.content)\n"
    ),
    "────────────────────────────────────────────────────────────────────────────────",
    "",
    "✅ Care plan generated successfully!",
    "   Sections: \((.sections // []) | length)",
    "   Total characters: \(. | tostring | length)"
  '
  
  # Save full output
  cat /tmp/plan-result.json | jq . > /workspaces/Care-assurance-40877c01/test-output-care-plan.json
  echo ""
  echo "💾 Full output saved to: /workspaces/Care-assurance-40877c01/test-output-care-plan.json"
else
  echo "❌ No result found in response"
  echo ""
  echo "Response content:"
  cat /tmp/plan-enhancer-response.txt | head -50
fi
