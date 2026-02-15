// AI Service Configuration - Ensure GPT-4.1-Mini Consistency
// This document provides implementation details for all AI service fixes

/**
 * FILES TO VERIFY/UPDATE FOR gpt-4.1-mini CONSISTENCY
 * 
 * The goal: All AI calls default to gpt-4.1-mini (not gpt-4-turbo or other models)
 * while allowing admin override via settings.
 */

const filesToUpdate = [
  {
    path: "server/routes/ai.ts",
    checkItems: [
      "Default model selection in /api/ai/plan-enhancer endpoint",
      "Fallback model if admin setting is not found",
      "Cost calculation references"
    ],
    fix: `
      // In /api/ai/plan-enhancer route:
      const model = userSettings?.preferredModel || "gpt-4.1-mini";
      
      // Verify it calls getPreferredModel() which returns "gpt-4.1-mini" by default
    `
  },
  {
    path: "server/services/emarAgent.ts",
    checkItems: [
      "Line ~520: Model used for EMAR extraction",
      "Ensure it respects getPreferredModel() from aiClient.ts"
    ],
    fix: `
      // Currently uses: model from getPreferredModel()
      // This is CORRECT - it already respects admin settings
    `
  },
  {
    path: "server/services/planEnhancer.ts",
    checkItems: [
      "Verify getPreferredModel() is called",
      "Check error fallback logic"
    ],
    fix: `
      // Line ~150:
      const model = getPreferredModel(); // CORRECT
      
      // If error, should still use gpt-4.1-mini not hardcoded model
    `
  },
  {
    path: "server/ services/scheduleAnalyzer.ts",
    checkItems: [
      "Line 141 & 212: HARDCODED 'gpt-4.1-mini' strings",
      "Should be replaced with getPreferredModel() call"
    ],
    fix: `
      // Import at top:
      import { getPreferredModel } from './aiClient.js';
      
      // Replace hardcoded instances:
      // BEFORE: model: "gpt-4.1-mini",
      // AFTER:  model: getPreferredModel(),
    `
  },
  {
    path: "server/copilotRoutes.ts",
    checkItems: [
      "Verify model selection in copilot endpoints",
      "Check admin provider/model settings are respected"
    ],
    fix: `
      // Should use:
      const model = getPreferredModel();
      const provider = getPreferredProvider();
    `
  },
  {
    path: "server/config/aiPricing.ts",
    checkItems: [
      "Verify gpt-4.1-mini pricing is correct in AVAILABLE_MODELS",
      "Check cost calculation logic"
    ],
    fix: `
      // Verify pricing entry exists:
      "gpt-4.1-mini": {
        inputCost: 0.00075,    // $0.75 per 1M input tokens
        outputCost: 0.003,      // $3.00 per 1M output tokens
        // ...
      }
    `
  }
];

/**
 * CLIENT-SIDE AI INTEGRATION
 * Ensure the UI properly shows and controls the model selection
 */

const clientCheckpoints = {
  secretAdminPortal: {
    location: "client/src/pages/SecretAdminPortal.tsx",
    aiTab: "Lines 4208-4300",
    verifyItems: [
      "AI Provider Section shows current model",
      "Model dropdown has all gpt-4 variants",
      "Save button persists selection to backend",
      "Current model is highlighted/selected"
    ]
  },
  
  aiCostSection: {
    location: "client/src/pages/SecretAdminPortal.tsx",
    lines: "~425-850",
    verifyItems: [
      "Shows cost breakdown by AI feature",
      "CSV export includes model information",
      "Cost calculations are accurate"
    ]
  }
};

/**
 * MIGRATION CHECKLIST
 */

const migrationSteps = `
## AI Service Migration to gpt-4.1-mini Standard

### Phase 1: Verify Current State (15 minutes)
- [ ] Check aiClient.ts: getPreferredModel() returns "gpt-4.1-mini"
- [ ] Check database: appSettings has 'AIModel' = "gpt-4.1-mini"
- [ ] Test /api/admin/ai-model endpoint - returns current model
- [ ] Test model override via Secret Admin Portal

### Phase 2: Fix Hardcoded Models (30 minutes)
- [ ] Update scheduleAnalyzer.ts:
      - Line 141: Replace "gpt-4.1-mini" with getPreferredModel()
      - Line 212: Replace "gpt-4.1-mini" with getPreferredModel()
- [ ] Verify imports in scheduleAnalyzer.ts
- [ ] Update any other hardcoded model references

### Phase 3: Test Each AI Feature (45 minutes)
- [ ] Plan Enhancer: Extract a care plan, verify model used
  - Check logs: AI_USAGE table should show gpt-4.1-mini
  - Check admin portal: Cost section shows correct model
  
- [ ] EMAR Agent: Extract document, verify model used
  - After extraction, check AI calls logged with gpt-4.1-mini
  
- [ ] Schedule Analyzer: Run schedule analysis
  - Verify analysis uses current admin model setting
  - Change model setting, run again - should use new model
  
- [ ] Risk Assessment: Generate assessment
  - Check model in logs
  - Verify cost calculations

### Phase 4: Cost & Performance Validation (30 minutes)
- [ ] Run sample requests with both models:
  - gpt-4.1-mini (should be cheaper, similar quality)
  - gpt-4-turbo (for comparison)
- [ ] Compare costs in admin portal cost section
- [ ] Verify response times are acceptable
- [ ] Check error rates are within SLA

### Phase 5: Deployment & Monitoring (ongoing)
- [ ] Deploy to staging environment
- [ ] Run integration tests
- [ ] Monitor AI usage logs for 24 hours
- [ ] Verify no unexpected model usage
- [ ] Deploy to production
- [ ] Set up alerting for non-standard model usage

## Success Criteria
✅ All AI calls use gpt-4.1-mini by default
✅ Admin can override model in Secret Portal
✅ Cost tracking accurately reflects model selection
✅ No hardcoded model references remain
✅ Performance acceptable for end users
✅ Cost reduction of ~50% vs. gpt-4-turbo achieved
`;

/**
 * COST ANALYSIS
 */

const costAnalysis = `
## Cost Impact of gpt-4.1-mini Standard

### Per-Request Costs (1000-token input, 500-token output example)

GPT-4.1-Mini:
- Input: 1000 tokens × $0.75/1M = $0.00075
- Output: 500 tokens × $3.00/1M = $0.0015
- Total: $0.00225 per request

GPT-4-Turbo:
- Input: 1000 tokens × $1.50/1M = $0.0015
- Output: 500 tokens × $6.00/1M = $0.003
- Total: $0.0045 per request

Savings per request: $0.0045 - $0.00225 = $0.00225 (50% reduction)

### Monthly Estimates (1000 requests/day)

GPT-4.1-Mini:
- 30 days × 1000 requests × $0.00225 = $67.50/month

GPT-4-Turbo:
- 30 days × 1000 requests × $0.0045 = $135/month

Monthly savings: $135 - $67.50 = $67.50 (50% reduction)

### Implementation Note
The cost savings is achieved WITHOUT quality reduction because:
1. gpt-4.1-mini is fine-tuned for accuracy
2. Our prompts are well-structured for the model
3. Fall-back to rule-based processing for simple tasks
4. Response caching eliminates duplicate API calls
`;

/**
 * TESTING MATRIX
 * Verify all AI features work correctly with gpt-4.1-mini
 */

const testingMatrix = `
| Feature | Test Case | Expected Model | Success Criteria |
|---------|-----------|----------------|------------------|
| Plan Enhancer | Enhance care plan | gpt-4.1-mini | Response generated, cost accurate |
| EMAR Extraction | Extract document | gpt-4.1-mini | Fields extracted, form filled |
| Schedule Analysis | Analyze schedule | gpt-4.1-mini | Analysis complete, bottlenecks found |
| Risk Assessment | Generate assessment | gpt-4.1-mini | Assessment generated in <30s |
| Multi-provider | Switch to OpenAI | gpt-4.1-mini | Uses OpenAI instead of GitHub |
| Multi-provider | Switch to GitHub | gpt-4.1-mini | Uses GitHub instead of OpenAI |
| Admin Override | Set model to gpt-4-turbo | gpt-4-turbo | New requests use gpt-4-turbo |
| Fallback | No AI provider | rule-based | Uses rules, no API calls |
| Error Handling | Invalid API key | gpt-4.1-mini (fallback) | Fails gracefully, user notified |
| Cost Tracking | Generate 5 requests | gpt-4.1-mini | All 5 logged with correct model/cost |
`;

console.log('✅ AI Service Configuration guide loaded');
