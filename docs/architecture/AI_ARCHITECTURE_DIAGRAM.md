# Care-assurance AI Services Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER (React)                         │
├─────────────────────────────────────────────────────────────────┤
│ • Care Plan Editor (enhancement UI)                             │
│ • Risk Assessment Dashboard                                     │
│ • Schedule Optimizer                                            │
│ • EMAR Upload & Results Display                                 │
│ • Email Composition Tools                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    (NO direct AI calls)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS API LAYER                            │
├──────────────────────┬──────────────────────────────────────────┤
│   Main Routes        │      Copilot Routes                      │
│  (routes.ts)         │    (copilotRoutes.ts)                    │
│                      │                                          │
│ POST /api/ai/*       │ POST /api/copilot/*                     │
│ ├─ analyze-risks     │ ├─ status                               │
│ ├─ generate-risk     │ ├─ rewrite-email                        │
│ ├─ generate-plan     │ ├─ generate-prn-protocol                │
│ ├─ enhance-plan      │ ├─ risk-assessment                      │
│ ├─ upload-emar       │ ├─ care-plan-generation                 │
│ └─ schedule-analyze  │ └─ (more endpoints)                     │
│                      │                                          │
│ Auth: Session        │ Auth: X-Copilot-Key / Bearer token      │
│ Rate Limit: None     │ Rate Limit: 30 req/min                  │
└──────────────────────┴──────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│            AI ORCHESTRATION LAYER (aiClient.ts)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Admin Settings                    Provider Selection           │
│  ┌──────────────────────────────┐  ┌──────────────────────┐   │
│  │ • ai_enabled (on/off)        │  │ Preferred Provider:  │   │
│  │ • ai_model (gpt-4.1-mini)    │  │ • openai (default)   │   │
│  │ • ai_provider (openai)       │  │ • github             │   │
│  │ • ai_cache (true)            │  │ • local (Ollama)     │   │
│  │ • ai_rules_first (true)      │  │                      │   │
│  │ • ai_lite_mode (false)       │  │ Fallback: openai →   │   │
│  │ • emar_agent (true)          │  │ github → local       │   │
│  └──────────────────────────────┘  └──────────────────────┘   │
│                                                                 │
│            createChatCompletionWithLogging()                   │
│            createHybridCompletion()                            │
│            createChatCompletionWithProvider()                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴──────────┐
                    ↓                    ↓
        ┌──────────────────────┐  ┌──────────────────┐
        │  CACHE LAYER         │  │  RULES ENGINE    │
        │  (aiCache.ts)        │  │  (ruleBasedEng)  │
        │                      │  │                  │
        │ • SHA256 cache key   │  │ Keywords parsing │
        │ • 24h TTL            │  │ Pattern matching │
        │ • Max 500 entries    │  │ Template filling │
        │ • LRU eviction       │  │ Cost: $0         │
        │ • Token savings      │  │                  │
        └──────────────────────┘  └──────────────────┘
                    ↓                    ↓
        ┌──────────Cache Hit──────┐  ┌─AI Fallback────┐
        │ Return cached result    │  │ (if needed)    │
        │ Cost: $0                │  │                │
        └─────────────────────────┘  └────────┬───────┘
                                              ↓
┌──────────────────────────────────────────────────────────────────┐
│              PROVIDER ABSTRACTION LAYER                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Provider Detection & Model Mapping                             │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ OPENAI         │  │ GITHUB MODELS  │  │ LOCAL LLM        │  │
│  │ ─────────────  │  │ ──────────────┤  │ ─────────────────┤  │
│  │ API Key:       │  │ API Key:       │  │ No API key       │  │
│  │ OPENAI_API_KEY │  │ PAT_AI_KEY     │  │ URL:             │  │
│  │                │  │                │  │ LOCAL_LLM_URL    │  │
│  │ Endpoint:      │  │ Endpoint:      │  │                  │  │
│  │ api.openai.com │  │ models.        │  │ Model:           │  │
│  │                │  │ inference.     │  │ qwen2.5-64k      │  │
│  │ Models:        │  │ ai.azure.com   │  │                  │  │
│  │ • gpt-4.1      │  │                │  │ Models:          │  │
│  │ • gpt-4.1-mini │  │ Mapped Models: │  │ • qwen2.5-64k    │  │
│  │ • gpt-4o       │  │ • gpt-4o       │  │ • phi3:mini      │  │
│  │ • gpt-4o-mini  │  │ • gpt-4o-mini  │  │ • mistral:7b     │  │
│  │                │  │                │  │ • llama3.1:8b    │  │
│  │ Cost:          │  │ Cost:          │  │                  │  │
│  │ Billed         │  │ Free tier      │  │ Cost: $0         │  │
│  │                │  │ (limited)      │  │ (self-hosted)    │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
│                                                                  │
│  Retry Logic (429 Rate Limit)                                  │
│  ┌────────────────────────────────────────────┐               │
│  │ MAX_RETRIES = 5                            │               │
│  │ Backoff: 5s → 10s → 20s → 40s → 80s      │               │
│  │ Max wait: ~155 seconds                     │               │
│  │ Overall timeout: 5 minutes (AI_CALL_TIMEOUT)               │
│  └────────────────────────────────────────────┘               │
│                                                                  │
│  Error Handling                                                 │
│  ┌──────────────────┐  ┌──────────────────────────────┐       │
│  │ GitHub 429       │  │ GitHub 401 (Auth)            │       │
│  │ "Quota exceeded" │  │ "Missing 'models' scope"     │       │
│  │                  │  │ or "Token invalid/expired"   │       │
│  │ Fallback: Wait   │  │                              │       │
│  │ + retry + switch │  │ Fallback: Switch to OpenAI   │       │
│  │ provider         │  │ or instruct user to fix PAT  │       │
│  └──────────────────┘  └──────────────────────────────┘       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│              EXTERNAL AI SERVICES                                │
├──────────────────────┬────────────────────┬─────────────────────┤
│   OpenAI API         │  GitHub Models API │  Ollama Local       │
│   api.openai.com     │  models.inference. │  localhost:11434    │
│                      │  ai.azure.com      │                     │
└──────────────────────┴────────────────────┴─────────────────────┘
```

---

## Data Flow: EMAR Extraction Example

```
User uploads EMAR PDF
         ↓
  routes.ts POST /api/ai/upload-emar
         ↓
  ┌─────────────────────────────────────┐
  │ Validation:                         │
  │ • File type check (PDF/DOCX)       │
  │ • Size validation (< 40MB)         │
  │ • Virus scan (Cloudmersive API)    │
  └─────────────────────────────────────┘
         ↓
  ┌─────────────────────────────────────┐
  │ PDF Extraction:                     │
  │ • Parse pages (pdfjs-dist)         │
  │ • Extract text/grid structure      │
  │ • Estimate token count             │
  └─────────────────────────────────────┘
         ↓
  Rule-based parsing attempt?
         ↓
  ┌─────────────────────────────────────┐
  │ Rule-Based Grid Parser:             │
  │ • If simple structure → parse       │
  │ • Get basic medication list         │
  │ • Cost: $0                          │
  └─────────────────────────────────────┘
         ↓
       Success? ───→ Return rule-based result
         │
         ↓ No / Partial
         │
  ┌─────────────────────────────────────┐
  │ Check cache:                        │
  │ • Hash(pdf_content + model)        │
  │ • Look up in 500-entry cache       │
  │ • TTL check (24h)                  │
  └─────────────────────────────────────┘
         ↓
       Hit? ───→ Return cached result (Cost: $0)
         │
         ↓ Miss
         │
  ┌─────────────────────────────────────┐
  │ EMAR Agent Multi-Part AI Call:      │
  │ Part A: Grid parsing                │
  │   Prompt: "Identify table structure" │
  │   Temperature: 0 (deterministic)    │
  │                                     │
  │ Part B: Medication extraction       │
  │   Prompt: "Extract medications"     │
  │   Temperature: 0                    │
  │   Model: getPreferredModel()        │
  │                                     │
  │ Part C: Consensus check             │
  │   Validate across time slots        │
  │   Check for gaps/anomalies          │
  └─────────────────────────────────────┘
         ↓
  ┌─────────────────────────────────────┐
  │ Provider Check:                     │
  │ if (preferredProvider === "github") │
  │   model = mapModelForGitHub(model)  │
  │   // gpt-4.1 → gpt-4o               │
  └─────────────────────────────────────┘
         ↓
  Call selected provider (with retry)
         ↓
  ┌─────────────────────────────────────┐
  │ Log to database:                    │
  │ • userId, username                 │
  │ • model, provider                  │
  │ • input/output tokens              │
  │ • cost (micro-dollars)             │
  │ • duration (ms)                    │
  │ • request payload (async)          │
  └─────────────────────────────────────┘
         ↓
  ┌─────────────────────────────────────┐
  │ Cache result:                       │
  │ • Store in memory cache            │
  │ • 24h TTL                          │
  │ • SHA256 key                       │
  │ • Track tokens saved               │
  └─────────────────────────────────────┘
         ↓
  Parse AI response JSON
         ↓
  Validate medication list
         ↓
  Return to frontend
         ↓
  Display results to user
```

---

## Decision Tree: Provider Selection

```
START: Need AI processing
  │
  ├─ AI_ENABLED env var = false?
  │  └──→ REJECT with "AI_DISABLED" error
  │
  ├─ App setting ai_enabled = false?
  │  └──→ REJECT with "AI_DISABLED_BY_ADMIN" error
  │
  ├─ User context captured?
  │  └─→ No: WARN (cost attribution will be incomplete)
  │
  ├─ Cache query...
  │  │  (generateCacheKey = hash(messages + model + feature))
  │  │
  │  ├─ CACHE HIT?
  │  │  └──→ RETURN cached response
  │  │       Cost: $0
  │  │       Duration: <10ms
  │  │
  │  └─ CACHE MISS?
  │     └──→ Continue to AI
  │
  ├─ Rules-First Enabled (default)?
  │  │
  │  ├─ YES (useRulesFirst = true)
  │  │  │
  │  │  ├─ Can rule-based result answer query?
  │  │  │  ├─ YES (high confidence)
  │  │  │  │  └──→ RETURN rule-based result
  │  │  │  │       Cost: $0
  │  │  │  │
  │  │  │  └─ NO (needs AI)
  │  │  │     └──→ Continue to AI
  │  │  │
  │  │  └─ useRulesFirst = false?
  │  │     └──→ Skip rules, go straight to AI
  │  │
  │  └─ Lite Mode?
  │     └─ YES: Use simplified prompts (20% shorter)
  │
  └─ SELECT PROVIDER:
     │
     ├─ preferredProvider = "local"?
     │  │
     │  ├─ LOCAL_LLM_ENABLED = false?
     │  │  └──→ Switch to GitHub or OpenAI
     │  │
     │  ├─ Create local client
     │  │  └──→ Ollama URL: LOCAL_LLM_URL
     │  │
     │  ├─ Use LOCAL_LLM_MODEL (qwen2.5-64k)
     │  │  └──→ Temperature: 0 (deterministic)
     │  │
     │  └─ Call: client.chat.completions.create(...)
     │     └──→ Cost: $0 (self-hosted)
     │
     ├─ preferredProvider = "github"?
     │  │
     │  ├─ Has PAT_AI_KEY?
     │  │  ├─ NO?
     │  │  │  └──→ Throw error: "GitHub AI not configured"
     │  │  │
     │  │  ├─ YES:
     │  │  │  ├─ Create GitHub client
     │  │  │  │  └──→ BaseURL: models.inference.ai.azure.com
     │  │  │  │
     │  │  │  ├─ Map model for GitHub:
     │  │  │  │  └──→ gpt-4.1 maps to gpt-4o
     │  │  │  │  └──→ gpt-4.1-mini maps to gpt-4o-mini
     │  │  │  │
     │  │  │  └─ Call: client.chat.completions.create(...)
     │  │  │     └──→ Cost: Free tier (limited quota)
     │  │  │
     │  │  └─ Error Handling:
     │  │     ├─ 429 (quota exceeded)?
     │  │     │  └──→ Retry with exponential backoff
     │  │     │
     │  │     └─ 401 (auth failed)?
     │  │        └──→ Enhanced error message about PAT scope
     │  │
     │  └─ Return result
     │
     └─ DEFAULT: preferredProvider = "openai"
        │
        ├─ Has OPENAI_API_KEY or OPENAI_FALLBACK_API_KEY?
        │  ├─ NO?
        │  │  ├─ Fall back to PAT_AI_KEY (GitHub endpoint)?
        │  │  │  └──→ Mark: openaiUsingPATFallback = true
        │  │  │
        │  │  └─ Throw error: "No AI configured"
        │  │
        │  └─ YES:
        │     ├─ Create OpenAI client
        │     │  └──→ api.openai.com (or custom base URL)
        │     │
        │     ├─ Force model & temperature:
        │     │  ├─ model: gpt-4.1-mini (default)
        │     │  └─ temperature: 0 (deterministic)
        │     │
        │     └─ Call: client.chat.completions.create(...)
        │        └──→ Cost: Billed per token
        │
        └─ RETRY LOOP (Rate Limit):
           │
           ├─ isRateLimitError(error)?
           │  ├─ YES & retries remaining?
           │  │  ├─ Calculate backoff: 5s * 2^attempt
           │  │  ├─ Sleep(backoff)
           │  │  └─ Retry (go back to provider call)
           │  │
           │  └─ NO or max retries?
           │     └──→ Format error & throw
           │
           └─ Success? ───→ Log usage + cache + return
                           (async, don't block)
```

---

## AI Service Dependencies

```
aiClient.ts
  ├── Dependencies:
  │   ├── openai (OpenAI SDK)
  │   ├── storage (AI usage logging)
  │   ├── aiCache (getCachedResponse, setCachedResponse)
  │   └── ruleBasedEngine (shouldUseAI, extractCommonFields)
  │
  ├── Exports:
  │   ├── createChatCompletionWithLogging() [main function]
  │   ├── createHybridCompletion()
  │   ├── getPreferredModel()
  │   ├── getPreferredProvider()
  │   ├── setAIEnabled()
  │   ├── setPreferredProvider()
  │   ├── getUseEmarAgent()
  │   └── ... (15+ config functions)
  │
  └── Used by:
      ├── routes.ts
      ├── copilotRoutes.ts
      ├── emarAgent.ts
      └── scheduleAnalyzer.ts

aiCache.ts
  ├── Dependencies:
  │   └── crypto (SHA256 hashing)
  │
  ├── Exports:
  │   ├── generateCacheKey()
  │   ├── getCachedResponse()
  │   ├── setCachedResponse()
  │   └── cleanCache()
  │
  └── Used by:
      └── aiClient.ts

emarAgent.ts
  ├── Dependencies:
  │   ├── aiClient (createChatCompletionWithLogging)
  │   └── jsonParser (parseJsonFromContent)
  │
  ├── Exports:
  │   ├── emarAgent()
  │   └── inferRequiredGapHoursFromText()
  │
  └── Used by:
      └── routes.ts (POST /api/ai/upload-emar)

ruleBasedEngine.ts
  ├── Dependencies:
  │   └── (none - pure functions)
  │
  ├── Exports:
  │   ├── shouldUseAI()
  │   ├── extractCommonFields()
  │   ├── analyzeRiskLevel()
  │   ├── extractMedicationInfo()
  │   └── ... (10+ extraction functions)
  │
  └── Used by:
      ├── aiClient.ts (createHybridCompletion)
      └── routes.ts (direct rule-based calls if AI disabled)

scheduleAnalyzer.ts
  ├── Dependencies:
  │   ├── aiClient (createChatCompletionWithLogging)
  │   └── jsonParser (parseJsonFromContent)
  │
  ├── Named Anomaly:
  │   └── ISSUE: Hardcoded model = "gpt-4.1-mini"
  │       Should be: getPreferredModel()
  │
  ├── Exports:
  │   └── analyzeScheduleWithAI()
  │
  └── Used by:
      └── routes.ts (POST /api/schedule/analyze)

aiPricing.ts
  ├── Exports:
  │   ├── AI_PRICING (Record<string, costs>)
  │   ├── AVAILABLE_MODELS (array)
  │   └── calculateCostMicroDollars()
  │
  └── Used by:
      └── aiClient.ts (logging cost calculations)
```

---

## Configuration Flow

```
Startup (index.ts)
  ↓
Express app initialized
  ↓
registerRoutes & registerCopilotRoutes
  ↓
First AI request arrives
  ↓
ensureSettingsLoaded() called
  ↓
┌──────────────────────────────────────┐
│ Database Query (if not cached):      │
│ SELECT * FROM app_settings           │
│ WHERE key IN (                       │
│   'ai_enabled',                      │
│   'ai_provider',                     │
│   'ai_model',                        │
│   'emar_agent',                      │
│   'ai_cache',                        │
│   'ai_rules_first',                  │
│   'ai_lite_mode'                     │
│ )                                    │
└──────────────────────────────────────┘
  ↓
┌──────────────────────────────────────┐
│ Apply Settings:                      │
│ • preferredProvider = db value      │
│ • preferredModel = db value         │
│ • aiEnabled = db value              │
│ • useEmarAgent = db value           │
│ • useAICache = db value             │
│ • useRulesFirst = db value          │
│ • aiLiteMode = db value             │
│                                     │
│ If loading fails:                   │
│   settingsLoaded = false (retry)    │
│   But continue with defaults        │
└──────────────────────────────────────┘
  ↓
┌──────────────────────────────────────┐
│ Validation/Fallback:                │
│ • If provider="local" &&            │
│   LOCAL_LLM_ENABLED=false           │
│   → preferredProvider = getFallback()│
│                                     │
│ • If AI_ENABLED env = false         │
│   → LOCK aiEnabled = false          │
│   → cannot be overridden by DB      │
└──────────────────────────────────────┘
  ↓
Active settings → all subsequent AI calls
```
