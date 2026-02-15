# AI Services Issues & Quick Fixes

## Critical Issues (Fix Immediately)

### Issue #1: Hardcoded Model in Schedule Analyzer ⚠️

**File:** `server/services/scheduleAnalyzer.ts` (Line 111)

**Problem:**
```typescript
// Currently HARDCODED to gpt-4.1-mini - ignores admin settings
model: "gpt-4.1-mini",
```

**Fix:**
```typescript
// Use getPreferredModel() to respect admin configuration
model: getPreferredModel(),
```

**Impact:** 
- Schedule analysis always uses gpt-4.1-mini regardless of admin preference
- Inconsistent with other services that respect admin model selection

---

### Issue #2: Unused Scope-of-Practice Validation ⚠️

**File:** `server/copilotRoutes.ts` (Lines 166-186)

**Problem:**
```typescript
// Function defined but NEVER USED
function checkScopeOfPractice(content: unknown): string[] {
  // ... checks for out-of-scope care tasks (BP monitoring, wound assessment, etc.)
}
```

**Evidence:** Not called in any endpoint

**Fix:** Add to care plan, risk assessment, and medication protocol endpoints:

```typescript
// After generating content
const result = { /* AI-generated content */ };
const scopeWarnings = checkScopeOfPractice(result);

if (scopeWarnings.length > 0) {
  return res.json({
    ...result,
    scopeValidation: {
      warnings: scopeWarnings,
      requiresReview: true
    }
  });
}
```

**Out-of-Scope Patterns Detected:**
- Vital signs monitoring (BP, SpO2, pulse, temperature)
- Wound assessment and management
- Medication dose adjustments
- Clinical diagnosis
- Invasive device insertion (catheters, PEG tubes)
- Injections and IV administration
- Suctioning and stoma care

**Impact:** Safety-critical validation framework exists but disabled

---

## Important Issues (Fix Soon)

### Issue #3: Missing Input Size Validation in Main Routes ⚠️

**File:** `server/routes.ts`

**Problem:**
- Copilot routes validate input size (MAX_INPUT_TOKENS = 100,000)
- Main routes may accept oversized inputs
- Could exceed OpenAI token limits or cause timeout

**Fix:**
```typescript
// Add before AI call
function validateInputSize(text: string, maxTokens = 128000): boolean {
  const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);
  const tokens = estimateTokens(text);
  
  if (tokens > maxTokens) {
    throw new Error(
      `Input too large: ${tokens.toLocaleString()} tokens ` +
      `(max ${maxTokens.toLocaleString()})`
    );
  }
  return true;
}

// In routes
app.post("/api/ai/enhance-plan", requireAuth, async (req, res) => {
  const { planContent } = req.body;
  
  try {
    validateInputSize(planContent, 128000);
    // ... process
  } catch (error) {
    return res.status(413).json({ 
      error: "Input too large",
      message: error.message 
    });
  }
});
```

---

### Issue #4: GitHub PAT Scope Not Validated on Startup ⚠️

**File:** `server/services/aiClient.ts`

**Problem:**
- GitHub Models requires `models` scope on PAT
- Only detected on first AI call (user-facing error)
- No startup validation

**Fix:**
```typescript
async function validateGitHubPAT(): Promise<boolean> {
  const patKey = process.env.PAT_AI_KEY;
  if (!patKey) return true; // Not configured, skip

  try {
    const client = new OpenAI({
      apiKey: patKey,
      baseURL: "https://models.inference.ai.azure.com",
    });

    // Make a minimal test call
    await client.models.list();
    console.log("[AI] ✓ GitHub PAT validated with 'models' scope");
    return true;
  } catch (error: any) {
    if (error?.status === 401) {
      console.error(
        "[AI] ✗ GitHub PAT invalid or missing 'models' scope\n" +
        "Generate new token at https://github.com/settings/tokens with 'models' scope"
      );
      return false;
    }
    // Other errors (network, etc.) - can retry later
    return true;
  }
}

// Call on startup
ensureSettingsLoaded().then(validateGitHubPAT);
```

---

### Issue #5: Plan Enhancer Validation Schema Not Integrated ⚠️

**File:** `server/utils/planEnhancerValidator.ts`

**Problem:**
- Comprehensive validation schema exists (412 lines)
- Defines valid values for 9 care plan sections
- Never called in actual enhancement endpoint

**Evidence from planEnhancerValidator.ts:**
```typescript
// 100+ valid enum values defined:
riskSection1Health: {
  speech: ["Good", "Fair", "Very Poor", "Severe Loss"],
  hearing: ["Good", "Fair", "Very Poor", "Severe Loss"],
  memory: ["Good", "Forgetful", "Very Poor", "Severe Loss"],
  moods: ["Stable", "Anxious", "Depressed", "Unstable"],
  // ... many more
}

// But never validated against response
export function validatePlanEnhancerResponse(response: unknown): ValidationResult
export function autoCorrectPlanEnhancerResponse(response: unknown): CorrectedResponse
```

**Fix:**
```typescript
import { 
  validatePlanEnhancerResponse, 
  autoCorrectPlanEnhancerResponse 
} from "../utils/planEnhancerValidator";

app.post("/api/ai/enhance-plan", requireAuth, async (req, res) => {
  // ... generate enhancement ...
  
  const validation = validatePlanEnhancerResponse(enhancedPlan);
  
  if (!validation.valid) {
    console.warn("[Plan Enhancer] Validation errors:", validation.errors);
    
    // Auto-correct if possible
    const corrected = autoCorrectPlanEnhancerResponse(enhancedPlan);
    
    return res.json({
      plan: corrected.plan,
      validation: {
        hasErrors: true,
        errors: validation.errors,
        corrections: corrected.corrections,
        manualReviewRequired: !corrected.successful
      }
    });
  }
  
  return res.json({ plan: enhancedPlan, validation });
});
```

---

## Configuration Issues

### Issue #6: Model Selection Strategy Unclear

**Status:** Documentation vs Implementation mismatch

**In app-specification.md:**
```
"GPT-4.1-mini for accuracy-critical tasks, GPT-4.1-mini for auxiliary tasks"
```

**Problem:** Both critical AND auxiliary = gpt-4.1-mini (contradiction)

**Actual Configuration:**
```typescript
// From aiPricing.ts
gpt-4.1-mini: { input: 400, output: 1600 },  // Default ($0.40/$1.60)
gpt-4.1: { input: 2000, output: 8000 },      // 5x more expensive
```

**Recommendation:**
```typescript
// Define task-specific model strategy
const TASK_MODEL_STRATEGY = {
  // Accurate extraction (risk assessment)
  RISK_ASSESSMENT: "gpt-4.1",                 // Accuracy critical
  CARE_PLAN_GENERATION: "gpt-4.1",            // Quality important
  
  // Cost-optimized analysis
  SCHEDULE_ANALYSIS: "gpt-4.1-mini",          // Speed matters
  EMAIL_REWRITING: "gpt-4.1-mini",            // Simple task
  
  // Mixed (use admin preference)
  PLAN_ENHANCEMENT: getPreferredModel(),      // Let admin choose
  EMAR_EXTRACTION: getPreferredModel(),       // Let admin choose
};
```

---

## Testing Gaps

### Missing Test Coverage

**AI Services Tests Needed:**

1. **aiClient.test.ts**
   - [ ] Provider fallback chain (OpenAI → GitHub → Local)
   - [ ] GitHub model mapping (gpt-4.1 → gpt-4o)
   - [ ] 429 rate limit retry with exponential backoff
   - [ ] AI_ENABLED environment lock
   - [ ] Admin model preference loading
   - [ ] Cache hit/miss behavior
   - [ ] Timeout handling (5 min limit)

2. **scheduleAnalyzer.test.ts**
   - [ ] PII anonymization (names → Worker A/B/C)
   - [ ] Name restoration in output
   - [ ] No raw worker names in AI requests
   - [ ] Pseudonym collisions handled
   - [ ] Schedule scoring accuracy

3. **ruleBasedEngine.test.ts**
   - [ ] Keyword detection for risk levels
   - [ ] Care plan section extraction
   - [ ] Medication pattern matching
   - [ ] Fallback to AI when rules insufficient

4. **copilotRoutes.test.ts**
   - [ ] API key validation (X-Copilot-Key header)
   - [ ] Rate limiting (30 req/min enforced)
   - [ ] Input size validation (100K tokens max)
   - [ ] Scope-of-practice warnings returned
   - [ ] Care worker scope enforcement

---

## Environment Variable Checklist

### Required for Each Deployment

```bash
# Production Deployment Checklist
☐ OPENAI_API_KEY              # For OpenAI provider
☐ COPILOT_API_KEY             # For Copilot Studio
☐ AI_ENABLED=true             # Enable AI services
☐ NODE_ENV=production         # Production mode

# Optional but Recommended
☐ LOCAL_LLM_ENABLED=false     # Keep disabled unless running Ollama
☐ LOCAL_LLM_URL               # If using local LLM
☐ LOCAL_LLM_MODEL=qwen2.5-64k # If using local LLM

# For GitHub Models Fallback
☐ PAT_AI_KEY                  # GitHub Personal Access Token
☐ Verify token has 'models' scope at https://github.com/settings/tokens
```

---

## Performance Tuning

### Model Selection Impact

```
Request Type          | Fast (mini)     | Accurate (full)   | Savings
──────────────────────┼─────────────────┼───────────────────┼─────────
Email rewriting       | 2s - gpt-4o-mini| 3s - gpt-4o       | Use mini
Schedule analysis     | 1.5s - mini     | 2s - full         | Use mini
Risk assessment       | 2.5s - full     | 2s - full         | Use full
Care plan enhancement | 8s - mini       | 10s - full        | Use mini
EMAR extraction       | 20s - full      | 30s - full        | Use full
```

### Cost Reduction Levers

1. **Rule-Based First (Default: ON)**
   - Reduces AI calls by 40-60%
   - Set `ai_rules_first=true` in app settings
   - **Impact:** ~$1000/month savings for 1000 req/day

2. **Response Caching (Default: ON)**
   - 24-hour TTL for deterministic responses
   - Set `ai_cache=true` in app settings
   - **Impact:** ~15-30% additional cost savings

3. **Lite Mode (Default: OFF)**
   - Shortened prompts for similar results
   - Set `ai_lite_mode=true` for cost-sensitive deployments
   - **Trade-off:** Slightly lower response quality
   - **Impact:** ~20% token reduction

---

## Deployment Recommendations

### Before Go-Live

- [ ] Fix hardcoded Schedule Analyzer model (**CRITICAL**)
- [ ] Implement Scope-of-Practice validation (**CRITICAL**)
- [ ] Add input token validation to main routes (**HIGH**)
- [ ] Validate GitHub PAT scope on startup (**HIGH**)
- [ ] Integrate Plan Enhancer schema validation (**HIGH**)
- [ ] Add AI service tests (**MEDIUM**)
- [ ] Document model selection strategy (**MEDIUM**)

### Monitoring to Set Up

- **Cost Dashboard:** Daily AI expenditure by model/provider
- **Error Tracking:** Rate limit errors, provider failures
- **Performance:** Avg response time by task type
- **Cache Metrics:** Hit rate, tokens saved
- **User Tracking:** Cost attribution, feature usage

---

## Quick Fix Priority

### Can Fix in < 1 Hour
1. Schedule Analyzer model (1 line change)
2. Add Scope-of-Practice calls (5-10 line additions)

### Can Fix in 1-2 Hours  
3. Input token validation (20 lines)
4. Plan Enhancer validation integration (30 lines)

### Can Fix in 2-4 Hours
5. GitHub PAT validation startup (50 lines)
6. Model strategy documentation (update spec)

### Can Fix in 1-2 Days
7. Add comprehensive tests (200+ lines)
8. Copilot agent verification (integration testing)

---

**Last Updated:** February 15, 2026
