/**
 * CareAssurance Copilot API Routes
 * 
 * Non-SSE JSON endpoints designed for Microsoft 365 Copilot Studio plugin actions.
 * These endpoints mirror the functionality of the main AI endpoints but return
 * complete JSON responses instead of Server-Sent Events, making them suitable
 * for API plugin consumption by Copilot Studio.
 * 
 * Authentication: API key via X-Copilot-Key header or Authorization: Bearer <key>
 * All endpoints are prefixed with /api/copilot/
 */

import type { Express, Request, Response, NextFunction } from "express";
import {
  createChatCompletionWithLogging,
  getPreferredModel,
  getPreferredProvider,
  isAIEnabled,
  getAIDisabledMessage,
  type AiUserContext,
} from "./services/aiClient";
import { storage } from "./storage";
import { parseJsonFromContent } from "./utils/jsonParser";

// ═══════════════════════════════════════════════════════════════════════════
// COPILOT API KEY AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════

const COPILOT_API_KEY = process.env.COPILOT_API_KEY;

/**
 * Middleware to authenticate Copilot requests via API key.
 * Accepts key via X-Copilot-Key header or Authorization: Bearer <key>
 */
function requireCopilotAuth(req: Request, res: Response, next: NextFunction): void {
  if (!COPILOT_API_KEY) {
    res.status(503).json({
      error: "Copilot API not configured",
      message: "COPILOT_API_KEY environment variable is not set. Contact your administrator.",
    });
    return;
  }

  const apiKey =
    req.headers["x-copilot-key"] as string ||
    (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);

  if (!apiKey || apiKey !== COPILOT_API_KEY) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or missing API key. Provide via X-Copilot-Key header or Authorization: Bearer <key>.",
    });
    return;
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING — sliding window per API key
// ═══════════════════════════════════════════════════════════════════════════

/** Per-key rate limit: max requests within a rolling window */
const RATE_LIMIT_WINDOW_MS = 60_000;   // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30;    // 30 requests per minute per key

/** Sliding window tracker: key → list of request timestamps */
const rateLimitBuckets = new Map<string, number[]>();

/** Clean stale buckets every 5 minutes to prevent memory leaks */
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 2;
  for (const [key, timestamps] of rateLimitBuckets) {
    const active = timestamps.filter(t => t > cutoff);
    if (active.length === 0) rateLimitBuckets.delete(key);
    else rateLimitBuckets.set(key, active);
  }
}, 5 * 60_000);

function requireRateLimit(req: Request, res: Response, next: NextFunction): void {
  const apiKey =
    (req.headers["x-copilot-key"] as string) ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "anon");

  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  let timestamps = rateLimitBuckets.get(apiKey) || [];
  timestamps = timestamps.filter(t => t > windowStart);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = timestamps[0] + RATE_LIMIT_WINDOW_MS - now;
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    res.set("Retry-After", String(retryAfterSec));
    res.status(429).json({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Max ${RATE_LIMIT_MAX_REQUESTS} requests per minute. Retry after ${retryAfterSec}s.`,
      retryAfterSeconds: retryAfterSec,
    });
    return;
  }

  timestamps.push(now);
  rateLimitBuckets.set(apiKey, timestamps);

  // Set rate limit headers for the client
  res.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX_REQUESTS));
  res.set("X-RateLimit-Remaining", String(RATE_LIMIT_MAX_REQUESTS - timestamps.length));

  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Default AI user context for Copilot requests (no session user) */
const COPILOT_USER_CONTEXT: AiUserContext = {
  userId: "copilot-agent",
  username: "CareAssurance Copilot",
};

/** Get model preferences */
const getLowCostModel = () => "gpt-4.1-mini";
const getAccurateModel = () => getPreferredModel();

/** Estimate token count from text (≈3.5 chars per token for English) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Maximum input tokens allowed per request to prevent cost overruns */
const MAX_INPUT_TOKENS = 100_000;

/** Validate input size and return error response if too large */
function validateInputSize(text: string, res: Response, fieldName = "input"): boolean {
  const tokens = estimateTokens(text);
  if (tokens > MAX_INPUT_TOKENS) {
    res.status(413).json({
      error: "Input too large",
      message: `${fieldName} is approximately ${tokens.toLocaleString()} tokens (max ${MAX_INPUT_TOKENS.toLocaleString()}). Please reduce the input size.`,
    });
    return false;
  }
  return true;
}

/** Validate and clamp enum values from AI output */
function clampEnum<T extends string>(value: string | undefined, allowed: T[], fallback: T): T {
  if (!value) return fallback;
  const lower = value.toLowerCase().trim() as T;
  return allowed.includes(lower) ? lower : fallback;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE-OF-PRACTICE POST-GENERATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Care workers in the UK CANNOT perform certain clinical tasks.
 * This validator scans generated content for out-of-scope actions and flags them.
 * Ref: Skills for Care scope of practice; CQC Regulation 12 (Safe care and treatment).
 */
const OUT_OF_SCOPE_PATTERNS: Array<{ pattern: RegExp; warning: string }> = [
  { pattern: /\b(check|take|monitor|record)\s+(blood\s*pressure|bp|vitals?|vital\s*signs?|pulse|heart\s*rate|spo2|oxygen\s*saturation|temperature\s*reading)\b/i, warning: "Monitoring vital signs (BP, SpO2, pulse, temperature) requires a qualified nurse or HCA with delegation" },
  { pattern: /\b(assess|evaluate|examine)\s+(wound|pressure\s*sore|ulcer|skin\s*break|decubitus)\b/i, warning: "Wound assessment is a registered nurse responsibility; care workers can observe and report changes" },
  { pattern: /\b(change|adjust|alter|modify|increase|decrease|titrate)\s+(medication|dose|dosage|prescription|drug)\b/i, warning: "Medication changes require prescriber authorisation; care workers administer as prescribed only" },
  { pattern: /\b(diagnos|clinical\s*assessment|clinical\s*judgment|medical\s*opinion)\b/i, warning: "Clinical diagnosis and medical assessment is outside care worker scope; escalate to registered professional" },
  { pattern: /\b(insert|remove|change)\s+(catheter|cannula|peg\s*tube|ng\s*tube|naso|tracheostomy)\b/i, warning: "Invasive device management is a registered nurse task" },
  { pattern: /\b(suction|trach\s*care|stoma\s*care|wound\s*packing|debrid)\b/i, warning: "Clinical procedures like suctioning, stoma/wound care require trained nursing staff" },
  { pattern: /\b(administer|give|inject)\s+(insulin|injection|iv|intravenous|subcutaneous|intramuscular)\b/i, warning: "Injections require specific delegation and competency sign-off from a registered nurse" },
];

/**
 * Scan text or JSON content and return any scope-of-practice warnings.
 */
function checkScopeOfPractice(content: unknown): string[] {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const warnings: string[] = [];
  for (const { pattern, warning } of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(text)) {
      warnings.push(warning);
    }
  }
  return warnings;
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER ALL COPILOT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

export function registerCopilotRoutes(app: Express): void {
  // All copilot routes require API key authentication + rate limiting
  app.use("/api/copilot", requireCopilotAuth, requireRateLimit);

  // ─────────────────────────────────────────────────────────────────────
  // 1. AI STATUS CHECK
  // ─────────────────────────────────────────────────────────────────────
  app.get("/api/copilot/status", async (_req: Request, res: Response) => {
    try {
      const aiEnabled = isAIEnabled();
      const provider = getPreferredProvider();
      const model = getPreferredModel();

      res.json({
        available: aiEnabled,
        aiEnabled,
        provider,
        model,
        message: aiEnabled ? "AI services are available" : getAIDisabledMessage(),
        copilotApiVersion: "1.0",
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to check AI status", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2. EMAIL REWRITE
  // ─────────────────────────────────────────────────────────────────────
  app.post("/api/copilot/rewrite-email", async (req: Request, res: Response) => {
    try {
      const { inputText, tone, generateSubject } = req.body;

      if (!inputText || !tone) {
        res.status(400).json({ error: "Missing required fields", message: "inputText and tone are required" });
        return;
      }

      if (!isAIEnabled()) {
        res.status(503).json({ error: "AI disabled", message: getAIDisabledMessage() });
        return;
      }

      const toneInstructions: Record<string, string> = {
        professional: "Write in a formal, professional tone. Use proper business language, be courteous and respectful.",
        direct: "Write in a clear, concise, and to-the-point style. Get straight to the business matter. Be brief but not rude.",
        empathetic: "Write in a warm, understanding, and supportive tone. Show genuine care for the recipient's situation.",
        formal: "Write in a highly formal, official tone suitable for regulatory correspondence or board communications.",
        urgent: "Write with a sense of urgency and importance. Use clear, action-oriented language. Highlight time-sensitive elements.",
      };

      const subjectInstruction = generateSubject !== false
        ? '\n9. Start the email with a "Subject: [appropriate subject line]" on the first line, followed by a blank line, then the email body.'
        : "";

      const systemPrompt = `You are an expert email writer for UK care facilities. Transform rough notes or draft text into a polished, well-structured email.

TONE: ${tone.toUpperCase()}
${toneInstructions[tone] || toneInstructions.professional}

RULES:
1. Transform the input into a complete, polished email
2. Keep the core message and intent
3. Add appropriate greeting and sign-off
4. Use UK English spelling
5. Keep it concise but complete
6. Include specific people, dates, or details mentioned
7. Format with proper paragraphs
8. Use [Recipient Name] and [Your Name] as placeholders${subjectInstruction}

Return ONLY the email text, nothing else.`;

      const response = await createChatCompletionWithLogging({
        model: getLowCostModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: inputText },
        ],
        max_completion_tokens: 1000,
        temperature: 0.2,
        seed: 42,
      }, "copilot_email_assistant", COPILOT_USER_CONTEXT);

      const rewrittenEmail = response.choices[0]?.message?.content;
      if (!rewrittenEmail) {
        res.status(500).json({ error: "Generation failed", message: "AI did not return a response" });
        return;
      }

      res.json({ rewrittenEmail, tone, model: getLowCostModel() });
    } catch (error: any) {
      console.error("[Copilot] Email rewrite error:", error);
      res.status(500).json({ error: "Email rewrite failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. PRN PROTOCOL GENERATION
  // ─────────────────────────────────────────────────────────────────────
  app.post("/api/copilot/generate-prn-protocol", async (req: Request, res: Response) => {
    try {
      const { medicationName, existingData } = req.body;

      if (!medicationName) {
        res.status(400).json({ error: "Missing required field", message: "medicationName is required" });
        return;
      }

      if (!isAIEnabled()) {
        res.status(503).json({ error: "AI disabled", message: getAIDisabledMessage() });
        return;
      }

      const systemPrompt = `You are an expert UK care facility medication protocol writer following BNF (British National Formulary) guidelines. Generate a comprehensive PRN (Pro Re Nata / "as needed") medication protocol for use in a care home setting.

The protocol must follow UK care standards and regulations (CQC 2024, NICE guidelines).

SAFETY REQUIREMENTS:
- Doses MUST align with current BNF adult dosing recommendations
- Include contraindications and cautions specific to elderly patients
- Note common interactions with other medications frequently used in care settings
- Flag if the medication requires monitoring (e.g. paracetamol hepatotoxicity risk, NSAID renal function)
- Include what to do if the medication is ineffective after the specified timeframe

IMPORTANT: Return the response as a JSON object with this exact structure:
{
  "medicationName": "Name of the medication",
  "genericName": "Generic/INN name if branded name given",
  "dose": "Recommended dosage with specific amounts",
  "route": "Route of administration",
  "frequency": "How often it can be given",
  "maxDoseIn24Hours": "Maximum allowed in 24 hours (with BNF reference)",
  "minimumTimeBetweenDoses": "Minimum gap between doses",
  "onsetOfAction": "Expected time for the medication to take effect",
  "specialInstructions": "Special instructions for administration (with food, positioning, etc.)",
  "reasonsForAdministration": "Symptoms/reasons when this medication should be given",
  "contraindications": "Conditions where this medication should NOT be given",
  "cautionsInElderly": "Specific cautions for elderly patients",
  "commonInteractions": "Medications commonly used in care homes that interact with this drug",
  "predictableSideEffects": "Common side effects to monitor for",
  "whenToEscalate": "When to contact GP, pharmacist or emergency services",
  "additionalComments": "Other relevant information for care workers",
  "disclaimer": "This protocol is AI-generated and must be reviewed and approved by the prescribing GP or pharmacist before use"
}

Use UK English spelling. Be specific and clinically accurate.`;

      const userPrompt = existingData
        ? `Generate a complete PRN protocol for: ${medicationName}\n\nExisting information:\n${JSON.stringify(existingData, null, 2)}\n\nPlease enhance and complete this protocol.`
        : `Generate a complete PRN protocol for: ${medicationName}`;

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 2500,
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" },
      }, "copilot_prn_protocol", COPILOT_USER_CONTEXT);

      const content = response.choices[0]?.message?.content || "";
      const protocol = parseJsonFromContent(content);

      if (!protocol) {
        res.status(500).json({ error: "Parse failed", message: "Could not parse the generated protocol" });
        return;
      }

      // Always enforce disclaimer
      if (!protocol.disclaimer) {
        protocol.disclaimer = "This protocol is AI-generated and must be reviewed and approved by the prescribing GP or pharmacist before use.";
      }

      res.json({ protocol, model: getAccurateModel() });
    } catch (error: any) {
      console.error("[Copilot] PRN protocol error:", error);
      res.status(500).json({ error: "PRN protocol generation failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. VISIT LOG AUDIT
  // ─────────────────────────────────────────────────────────────────────
  app.post("/api/copilot/analyze-visit", async (req: Request, res: Response) => {
    try {
      const { documentContent } = req.body;

      if (!documentContent || typeof documentContent !== "string") {
        res.status(400).json({ error: "Missing required field", message: "documentContent (string) is required" });
        return;
      }

      if (!validateInputSize(documentContent, res, "documentContent")) return;

      if (!isAIEnabled()) {
        res.status(503).json({ error: "AI disabled", message: getAIDisabledMessage() });
        return;
      }

      // Load visit audit policies
      const visitPolicies = await storage.getPolicyDocumentsByCategory("visit_audit");
      const scopePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");

      let policyContext = "";
      const allPolicies = [...visitPolicies, ...scopePolicies];
      if (allPolicies.length > 0) {
        policyContext = `\n=== POLICY DOCUMENTS ===\n${allPolicies.map(p => `--- ${p.name} (${p.version || "v1.0"}) ---\n${p.content}`).join("\n")}\n=== END POLICIES ===\n\nApply these policies when analyzing the visit logs.\n`;
      }

      const systemPrompt = `You are an expert care visit auditor for a UK care facility. Analyze the visit logs and carer notes.

CRITICAL: Check EVERY visit entry against EVERY rule. Report EACH discrepancy separately with its specific date.

${policyContext}
PRIVACY RULES:
- Service users: ONLY return initials (e.g. "K.S."). NEVER full names or DOB.
- Care workers: Return in initial.lastname format (e.g. "L.Barron").

VALIDATION RULES:
1. LOCATION: Carer must log in at location (< 200m from service user address)
2. DURATION: Compliant if carer stayed >= 70% of expected time
3. JUSTIFICATIONS: Valid reasons can excuse non-compliance (hospital, early departure request)
4. CONCERNS: Check if notes mention concerns and if action was taken
5. NOTE QUALITY: Assess if notes meet professional standard

FORMATTING:
- Never use m-dashes or en-dashes. Use hyphens.
- Never use Oxford commas.

Respond ONLY with valid JSON:
{
  "serviceUserName": "Initials ONLY (e.g. K.S.)",
  "auditPeriodStart": "DD/MM/YYYY",
  "auditPeriodEnd": "DD/MM/YYYY",
  "hasDiscrepancies": true/false,
  "totalVisitsAudited": number,
  "careCalls": [
    {
      "careWorkerName": "Name",
      "date": "DD/MM",
      "locationOK": true/false,
      "expectedTime": "30m",
      "actualTime": "25m",
      "percentageStayed": 83,
      "compliant": true/false,
      "justification": "explanation or NA",
      "comment": "NA or issue description"
    }
  ],
  "discrepancies": [
    {
      "careWorkerName": "Actual name from document",
      "date": "DD/MM",
      "issue": "What went wrong",
      "actions": {
        "performanceNote": true/false,
        "meeting": "none|phone|in_person",
        "referToManager": true/false
      }
    }
  ],
  "themesAndTrends": "Summary of common patterns",
  "gapsInKnowledge": "Areas where training is needed"
}`;

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Audit these visit logs:\n\n${documentContent}` },
        ],
        max_completion_tokens: 8000,
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" },
      }, "copilot_visit_audit", COPILOT_USER_CONTEXT);

      const content = response.choices[0]?.message?.content || "";
      const analysis = parseJsonFromContent(content);

      if (!analysis) {
        res.json({
          rawAnalysis: content,
          parseWarning: "Could not parse structured JSON. Raw analysis text returned.",
        });
        return;
      }

      res.json({ analysis, model: getAccurateModel() });
    } catch (error: any) {
      console.error("[Copilot] Visit audit error:", error);
      res.status(500).json({ error: "Visit audit failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. RISK ANALYSIS (from documents)
  // ─────────────────────────────────────────────────────────────────────
  app.post("/api/copilot/analyze-risks", async (req: Request, res: Response) => {
    try {
      const { documentContent } = req.body;

      if (!documentContent || typeof documentContent !== "string") {
        res.status(400).json({ error: "Missing required field", message: "documentContent (string) is required" });
        return;
      }

      if (!validateInputSize(documentContent, res, "documentContent")) return;

      if (!isAIEnabled()) {
        res.status(503).json({ error: "AI disabled", message: getAIDisabledMessage() });
        return;
      }

      // Load risk assessment policies
      const initialPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");
      const riskPolicies = await storage.getPolicyDocumentsByCategory("risk_assessment");
      const carePlanPolicies = await storage.getPolicyDocumentsByCategory("care_plan");
      const scopePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");

      let policyContext = "";
      const allPolicies = [...initialPolicies, ...riskPolicies, ...carePlanPolicies, ...scopePolicies];
      if (allPolicies.length > 0) {
        policyContext = `\n=== POLICY/TEMPLATE DOCUMENTS (STRUCTURE REFERENCE ONLY) ===\n${allPolicies.map(p => `--- ${p.name} (${p.version || "v1.0"}) ---\n${p.content}`).join("\n")}\n=== END POLICIES ===\n\nCRITICAL: These templates contain EXAMPLE text. Only extract information from the service user documents below.\n`;
      }

      const systemPrompt = `You are an expert care assessor following CQC 2024 standards and NHS England principles for risk assessment.

${policyContext}
YOUR TASK: Build a person-centred risk profile from the service user documents.

EVIDENCE-BASED ANALYSIS:
1. Only use DOCUMENTED FACTS from service user documents
2. Each recommended assessment needs SUBSTANTIAL evidence (2+ direct quotes)
3. Quality over quantity - typically 3-7 assessments for most service users
4. NEVER assume or fabricate conditions not documented

PRIVACY:
- Service user initials only (F.O. format)
- Keep place names as written

FORMATTING:
- Never use m-dashes or en-dashes
- Never use Oxford commas

Respond with valid JSON:
{
  "serviceUser": {
    "initials": "F.O.",
    "fullName": "If found in documents or 'Not found'"
  },
  "documentSummary": "Brief overview of documents analyzed",
  "medicalConditions": [
    {
      "condition": "Name",
      "evidenceQuotes": ["Direct quote 1", "Direct quote 2"],
      "severity": "low|medium|high",
      "impactOnCare": "How it affects daily care"
    }
  ],
  "recommendedAssessments": [
    {
      "name": "Assessment category name",
      "reason": "Why this is needed for THIS person",
      "priority": "high|medium|low",
      "evidenceQuotes": ["Quote 1", "Quote 2"],
      "hazards": ["Specific hazard 1", "Specific hazard 2"]
    }
  ],
  "concerns": ["Concern 1", "Concern 2"],
  "overallRiskLevel": "low|medium|high",
  "summary": "Overall risk profile summary"
}`;

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these documents for risks:\n\n${documentContent}` },
        ],
        max_completion_tokens: 8000,
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" },
      }, "copilot_risk_analysis", COPILOT_USER_CONTEXT);

      const content = response.choices[0]?.message?.content || "";
      const riskProfile = parseJsonFromContent(content);

      if (!riskProfile) {
        res.json({
          rawAnalysis: content,
          parseWarning: "Could not parse structured JSON. Raw analysis text returned.",
        });
        return;
      }

      res.json({ riskProfile, model: getAccurateModel() });
    } catch (error: any) {
      console.error("[Copilot] Risk analysis error:", error);
      res.status(500).json({ error: "Risk analysis failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 6. RISK ASSESSMENT GENERATION
  // ─────────────────────────────────────────────────────────────────────
  app.post("/api/copilot/generate-risk-assessment", async (req: Request, res: Response) => {
    try {
      const { category, riskProfile, documentContent } = req.body;

      if (!category) {
        res.status(400).json({ error: "Missing required field", message: "category is required (e.g. 'Falls', 'Medication', 'Skin Integrity')" });
        return;
      }

      if (!isAIEnabled()) {
        res.status(503).json({ error: "AI disabled", message: getAIDisabledMessage() });
        return;
      }

      // Load risk assessment policies
      const riskPolicies = await storage.getPolicyDocumentsByCategory("risk_assessment");
      let policyContext = "";
      if (riskPolicies.length > 0) {
        policyContext = `\n=== RISK ASSESSMENT TEMPLATES ===\n${riskPolicies.map(p => `--- ${p.name} ---\n${p.content}`).join("\n")}\n=== END TEMPLATES ===\n`;
      }

      const riskProfileContext = riskProfile
        ? `\nRISK PROFILE DATA:\n${typeof riskProfile === "string" ? riskProfile : JSON.stringify(riskProfile, null, 2)}\n`
        : "";

      const documentContext = documentContent
        ? `\nSUPPORTING DOCUMENTS:\n${documentContent}\n`
        : "";

      const systemPrompt = `You are an expert UK care risk assessor following CQC 2024 standards. Generate a comprehensive risk assessment for the "${category}" category.

${policyContext}
REQUIREMENTS:
- Base on evidence from the provided documents and risk profile
- Follow UK care standards and NHS England 12 principles for risk assessment
- Include specific hazards, likelihood, impact, and control measures
- Stay within care worker scope of practice
- Use person-centred language (first person "I", "my")

Respond with valid JSON:
{
  "category": "${category}",
  "assessmentDate": "Today's date",
  "reviewDate": "6 months from now",
  "hazards": [
    {
      "description": "Specific hazard",
      "likelihood": "rare|unlikely|possible|likely|almost_certain",
      "impact": "negligible|minor|moderate|major|catastrophic",
      "riskRating": "low|medium|high|very_high",
      "existingControls": ["Current measure 1", "Current measure 2"],
      "additionalControls": ["Recommended measure 1"],
      "responsiblePerson": "Role responsible"
    }
  ],
  "overallRiskRating": "low|medium|high|very_high",
  "actionPlan": [
    {
      "action": "What needs to be done",
      "responsible": "Who",
      "deadline": "When",
      "status": "pending"
    }
  ],
  "personCentredNarrative": "First-person narrative about how this affects my daily life and what support I need",
  "escalationProcedure": "When and how to escalate concerns",
  "reviewTriggers": ["What changes would require reassessment"]
}`;

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a "${category}" risk assessment.${riskProfileContext}${documentContext}` },
        ],
        max_completion_tokens: 6000,
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" },
      }, "copilot_risk_assessment", COPILOT_USER_CONTEXT);

      const content = response.choices[0]?.message?.content || "";
      const assessment = parseJsonFromContent(content);

      if (!assessment) {
        res.json({
          rawAssessment: content,
          parseWarning: "Could not parse structured JSON. Raw assessment text returned.",
        });
        return;
      }

      // Validate enum values in hazards
      const LIKELIHOOD_ENUM = ["rare", "unlikely", "possible", "likely", "almost_certain"] as const;
      const IMPACT_ENUM = ["negligible", "minor", "moderate", "major", "catastrophic"] as const;
      const RISK_RATING_ENUM = ["low", "medium", "high", "very_high"] as const;
      if (Array.isArray(assessment.hazards)) {
        for (const hazard of assessment.hazards) {
          hazard.likelihood = clampEnum(hazard.likelihood, [...LIKELIHOOD_ENUM], "possible");
          hazard.impact = clampEnum(hazard.impact, [...IMPACT_ENUM], "moderate");
          hazard.riskRating = clampEnum(hazard.riskRating, [...RISK_RATING_ENUM], "medium");
        }
      }
      if (assessment.overallRiskRating) {
        assessment.overallRiskRating = clampEnum(assessment.overallRiskRating, [...RISK_RATING_ENUM], "medium");
      }

      res.json({ assessment, category, model: getAccurateModel() });
    } catch (error: any) {
      console.error("[Copilot] Risk assessment generation error:", error);
      res.status(500).json({ error: "Risk assessment generation failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 7. CARE PLAN GENERATION
  // ─────────────────────────────────────────────────────────────────────
  app.post("/api/copilot/generate-care-plan", async (req: Request, res: Response) => {
    try {
      const { documentContent, callType } = req.body;

      if (!documentContent || typeof documentContent !== "string") {
        res.status(400).json({ error: "Missing required field", message: "documentContent (string) is required" });
        return;
      }

      if (!validateInputSize(documentContent, res, "documentContent")) return;

      if (!isAIEnabled()) {
        res.status(503).json({ error: "AI disabled", message: getAIDisabledMessage() });
        return;
      }

      // Load care plan policies
      const carePlanPolicies = await storage.getPolicyDocumentsByCategory("care_plan");
      const taskPolicies = await storage.getPolicyDocumentsByCategory("care_tasks");
      const scopePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");
      const socialPolicies = await storage.getPolicyDocumentsByCategory("social_worker");
      const initialPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");

      let policyContext = "";
      const allPolicies = [...carePlanPolicies, ...taskPolicies, ...scopePolicies, ...socialPolicies, ...initialPolicies];
      if (allPolicies.length > 0) {
        policyContext = `\n=== POLICY DOCUMENTS ===\n${allPolicies.map(p => `--- ${p.name} ---\n${p.content}`).join("\n")}\n=== END POLICIES ===\n`;
      }

      const callTypeLabel = callType || "General";
      const callTypeContext = callType ? `\nThis care plan is for ${callType} calls ONLY. Focus EXCLUSIVELY on tasks during ${callType} visits.\n` : "";

      const mandatorySections = [
        "WARNING - Safety Concerns & Risks",
        "Introduction & My Life Story",
        "My Well-being & Emotional Needs",
        "Tasks Required by Social Workers",
        "Personal Care",
        "Mobility & Transfers",
        "Nutrition & Hydration",
        "Medication",
        "Continence Care",
        "Communication",
        "Household Tasks",
        "Secure Property Before Leaving",
      ];

      const systemPrompt = `You are an expert care plan writer for UK care facilities following CQC 2024 standards.

${policyContext}${callTypeContext}
CALL TYPE: ${callTypeLabel}

MANDATORY SECTIONS (include ALL 12):
${mandatorySections.map((s, i) => `${i + 1}. ${s}`).join("\n")}

WRITING STANDARDS:
- Write in FIRST PERSON: "I", "my", "me" (never "the service user")
- Be specific: times, preferences, equipment names
- Never use m-dashes or en-dashes
- Never use Oxford commas
- Use UK English
- Only include tasks within care worker scope of practice
- Care workers CANNOT: check vitals, assess wounds, change medication, diagnose

ZERO FABRICATION: Never invent conditions, medications, or preferences not in documents.
If information is missing, state "This has not been documented" and add a verification question.

Respond with valid JSON:
{
  "callType": "${callTypeLabel}",
  "serviceUserInitials": "F.O.",
  "sections": [
    {
      "title": "Section title (from mandatory list)",
      "priority": "high|medium|low",
      "content": "Detailed first-person narrative for this section",
      "keyActions": ["Specific action 1", "Action 2"]
    }
  ],
  "verificationQuestions": ["Question about missing information 1", "Question 2"],
  "summary": "Brief overview of the care plan"
}`;

      const currentProvider = getPreferredProvider();
      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a ${callTypeLabel} care plan from these documents:\n\n${documentContent}` },
        ],
        max_completion_tokens: currentProvider === "github" ? 8000 : 12000,
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" },
      }, "copilot_care_plan", COPILOT_USER_CONTEXT);

      const content = response.choices[0]?.message?.content || "";
      const carePlan = parseJsonFromContent(content);

      if (!carePlan) {
        res.json({
          rawCarePlan: content,
          parseWarning: "Could not parse structured JSON. Raw care plan text returned.",
        });
        return;
      }

      // Validate mandatory sections are present
      if (Array.isArray(carePlan.sections)) {
        const presentTitles = new Set(carePlan.sections.map((s: any) => s.title?.toLowerCase()));
        const missingSections = mandatorySections.filter(
          s => !presentTitles.has(s.toLowerCase())
        );
        if (missingSections.length > 0) {
          carePlan.missingSectionsWarning = `The following mandatory sections were not generated: ${missingSections.join(", ")}`;
        }
        // Validate section priorities
        const PRIORITY_ENUM = ["high", "medium", "low"] as const;
        for (const section of carePlan.sections) {
          section.priority = clampEnum(section.priority, [...PRIORITY_ENUM], "medium");
        }
      }

      // Post-generation scope-of-practice validation
      const scopeWarnings = checkScopeOfPractice(carePlan);
      if (scopeWarnings.length > 0) {
        carePlan.scopeOfPracticeWarnings = scopeWarnings;
      }

      res.json({ carePlan, callType: callTypeLabel, model: getAccurateModel() });
    } catch (error: any) {
      console.error("[Copilot] Care plan generation error:", error);
      res.status(500).json({ error: "Care plan generation failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 8. CARE PLAN ENHANCEMENT
  // ─────────────────────────────────────────────────────────────────────
  app.post("/api/copilot/enhance-plan", async (req: Request, res: Response) => {
    try {
      const { existingPlanContent, documentContent } = req.body;

      if (!existingPlanContent && !documentContent) {
        res.status(400).json({
          error: "Missing required fields",
          message: "Provide at least one of: existingPlanContent (current care plan) or documentContent (supporting documents)",
        });
        return;
      }

      if (!isAIEnabled()) {
        res.status(503).json({ error: "AI disabled", message: getAIDisabledMessage() });
        return;
      }

      // Load policies
      const carePlanPolicies = await storage.getPolicyDocumentsByCategory("care_plan");
      const initialPolicies = await storage.getPolicyDocumentsByCategory("initial_assessment");
      const scopePolicies = await storage.getPolicyDocumentsByCategory("scope_of_practice");

      let policyContext = "";
      const allPolicies = [...carePlanPolicies, ...initialPolicies, ...scopePolicies];
      if (allPolicies.length > 0) {
        policyContext = `\n=== POLICY DOCUMENTS ===\n${allPolicies.map(p => `--- ${p.name} ---\n${p.content}`).join("\n")}\n=== END POLICIES ===\n`;
      }

      const contentParts: string[] = [];
      if (existingPlanContent) {
        contentParts.push(`=== EXISTING CARE PLAN ===\n${existingPlanContent}`);
      }
      if (documentContent) {
        contentParts.push(`=== SUPPORTING DOCUMENTS ===\n${documentContent}`);
      }
      const combinedContent = contentParts.join("\n\n");

      const systemPrompt = `You are an expert care plan writer for UK care facilities following CQC 2024 standards.

${policyContext}
YOUR MISSION: Create a COMPREHENSIVE, EVIDENCE-BASED care plan with complete structured data for Initial Assessment form autofill.

WRITING STANDARDS:
- Write in FIRST PERSON: "I", "my", "me"
- Be specific and actionable
- Use UK English, no m-dashes, no Oxford commas
- Stay within care worker scope of practice
- NEVER fabricate details not in documents
- Flag missing information with verification questions
- For "EXACTLY ONE OF:" fields, select ONE option from the provided values

CRITICAL FIELD COMPLETION RULES:
1. For narrative fields: write comprehensive content using ALL available evidence (minimum word counts apply where specified)
2. For categorical fields marked "EXACTLY ONE OF:", return ONLY ONE of the specified options exactly as written
3. For Yes/No fields: use "Yes" or "No" precisely
4. For missing information: use "Not specified in documents provided" or "To be confirmed at initial visit"
5. Cross-reference information across sections to maximize completion
6. Never leave fields empty or null

Respond with valid JSON matching this comprehensive schema:
{
  "verificationQuestions": ["Specific questions about missing information"],
  "thisIsMe": {
    "whoAmI": "First-person life story starting with 'My name is...' (MINIMUM 600 words)",
    "hobbiesInterests": "Detailed hobbies with specific examples (MINIMUM 300 words)",
    "whatMakesGoodDay": "What makes a good day for me (MINIMUM 200 words)"
  },
  "goalSetting": {
    "goals": [{"goal": "My goal", "howToAchieve": "How", "potentialBarriers": "Barriers", "timeFrame": "Timeframe"}],
    "internetSupport": "Yes/No and details",
    "assistiveTechnology": "Technology details"
  },
  "advanceDecisions": {
    "advanceDecisionInPlace": "EXACTLY ONE OF: Yes / No",
    "dnrDetails": "DNR details",
    "lastingPOA": "EXACTLY ONE OF: Yes / No",
    "poaType": "Health/Finance/Both",
    "poaContact": "Contact details"
  },
  "myCarePlan": {
    "capacityAndSafeguarding": "Mental capacity assessment (MINIMUM 400 words)",
    "healthAndWellbeing": "EVERY health condition explained (MINIMUM 800 words)",
    "triggerPoints": "Warning signs to watch for",
    "medicationRequirements": "All medications with details (MINIMUM 500 words)",
    "nutrition": "Complete dietary profile (MINIMUM 400 words)",
    "personalCareNeeds": "Complete daily routine (MINIMUM 600 words)",
    "mobilityAndEquipment": "Mobility assessment with equipment (MINIMUM 400 words)",
    "houseworkAndSocial": "Housework and social needs",
    "financialArrangements": "Finance management"
  },
  "riskSection1Health": {
    "speech": "EXACTLY ONE OF: Good / Fair / Very Poor / Severe Loss",
    "speechDetails": "Speech details",
    "hearing": "EXACTLY ONE OF: Good / Fair / Very Poor / Severe Loss",
    "hearingDetails": "Hearing details",
    "eyesight": "EXACTLY ONE OF: Good / Fair / Very Poor / Severe Loss",
    "eyesightDetails": "Eyesight details",
    "breathlessness": "EXACTLY ONE OF: Independent / Use of Resources",
    "breathlessnessDetails": "Breathing details",
    "urinaryIncontinence": "EXACTLY ONE OF: Independent / Use of Resources",
    "urinaryDetails": "Continence details",
    "faecalIncontinence": "EXACTLY ONE OF: Independent / Use of Resources",
    "faecalDetails": "Details",
    "memory": "EXACTLY ONE OF: Good / Forgetful / Very Poor / Severe Loss",
    "moods": "EXACTLY ONE OF: Stable / Anxious / Depressed / Unstable",
    "orientation": "EXACTLY ONE OF: Full / Not always / Unaware / Disoriented",
    "sleepPattern": "EXACTLY ONE OF: Good / Fair / Wakes often / Sleeps little",
    "behaviours": "EXACTLY ONE OF: Good / Uncooperative / Unpredictable / Aggressive",
    "understandsInfo": "EXACTLY ONE OF: Yes / Partially / No",
    "retainsInfo": "EXACTLY ONE OF: Yes / Partially / No",
    "weighsDecision": "EXACTLY ONE OF: Yes / Partially / No",
    "communicatesDecision": "EXACTLY ONE OF: Yes / Partially / No",
    "capacityDetails": "Capacity details",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention measures"
  },
  "riskSection2Medication": {
    "prescriptionOrdering": "Who orders prescriptions",
    "dosageSystem": "System details",
    "systemMaintainer": "Who maintains",
    "medicationStorage": "Storage location",
    "currentInvestigations": "Ongoing treatments",
    "surplusMedication": "Surplus details",
    "medicationConcerns": "Concerns",
    "homeopathicMeds": "Herbal/OTC meds",
    "prnMedication": "EXACTLY ONE OF: Yes / No / N/A",
    "covertMedication": "EXACTLY ONE OF: Yes / No",
    "pickingUpTablets": "EXACTLY ONE OF: YES / NO / N/A",
    "openingBoxes": "EXACTLY ONE OF: YES / NO / N/A",
    "pouringLiquids": "EXACTLY ONE OF: YES / NO / N/A",
    "usingDosageSystem": "EXACTLY ONE OF: YES / NO / N/A",
    "applyingCreams": "EXACTLY ONE OF: YES / NO / N/A",
    "swallowingTablets": "EXACTLY ONE OF: YES / NO / N/A",
    "understandingInstructions": "EXACTLY ONE OF: YES / NO / N/A",
    "managingInhalers": "EXACTLY ONE OF: YES / NO / N/A",
    "instillingDrops": "EXACTLY ONE OF: YES / NO / N/A",
    "controlledDrugs": "Details if any",
    "warfarin": "Details if applicable",
    "skinIntegrity": "EXACTLY ONE OF: Yes / No",
    "skinDetails": "Skin concerns",
    "pictureConsent": "EXACTLY ONE OF: Yes / No",
    "bodyMapCompleted": "EXACTLY ONE OF: Yes / No",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention"
  },
  "riskSection3Nutrition": {
    "mealAssistance": "EXACTLY ONE OF: Yes / No",
    "normalDiet": "EXACTLY ONE OF: Yes / No",
    "normalDietDetails": "Details",
    "specialDietary": "EXACTLY ONE OF: Yes / No",
    "specialDietaryDetails": "Details",
    "foodAllergies": "EXACTLY ONE OF: Yes / No",
    "foodAllergiesDetails": "Details",
    "softDiet": "EXACTLY ONE OF: Yes / No",
    "softDietDetails": "Details",
    "foodIntolerances": "EXACTLY ONE OF: Yes / No",
    "foodIntolerancesDetails": "Details",
    "tubeFeed": "EXACTLY ONE OF: Yes / No",
    "tubeFeedDetails": "Details",
    "supplementaryFoods": "EXACTLY ONE OF: Yes / No",
    "supplementaryFoodsDetails": "Details",
    "foodLikes": "Foods liked",
    "foodDislikes": "Foods disliked",
    "portionSize": "Portion preferences",
    "mainMealTime": "Meal time",
    "fluidIntake": "Fluid preferences",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention"
  },
  "riskSection4Equipment": {
    "equipment": [{"name": "Equipment", "fitForPurpose": "EXACTLY ONE OF: Yes / No", "supplier": "Supplier", "nextService": "Date"}],
    "remedialAction": "Actions",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention"
  },
  "riskSection5Mobility": {
    "weightBearing": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "weightBearingDetails": "Details",
    "walking": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "walkingDetails": "Details",
    "stairs": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / No steps/stairs",
    "stairsDetails": "Details",
    "sitToStand": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "sitToStandDetails": "Details",
    "washing": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "washingDetails": "Details",
    "dressing": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "dressingDetails": "Details",
    "oralCare": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "oralCareDetails": "Details",
    "bathShower": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "bathShowerDetails": "Details",
    "toiletCommode": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "toiletCommodeDetails": "Details",
    "wheelchair": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / N/A",
    "wheelchairDetails": "Details",
    "transfers": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / N/A",
    "transfersDetails": "Details",
    "moveInBed": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "moveInBedDetails": "Details",
    "inOutOfBed": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "inOutOfBedDetails": "Details",
    "chairToWheelchair": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / N/A",
    "chairToWheelchairDetails": "Details",
    "inOutOfCar": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "inOutOfCarDetails": "Details",
    "otherTransfers": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / N/A",
    "otherTransfersDetails": "Details",
    "communityAccess": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable",
    "communityAccessDetails": "Details",
    "specialistEquipment": "EXACTLY ONE OF: Independent / Requires Assistance / Uses Equipment / Unable / N/A",
    "specialistEquipmentDetails": "Details",
    "canBeLeftAlone": "EXACTLY ONE OF: Always / Long Period / Short Period / Not at all",
    "canBeLeftAloneDetails": "Details",
    "proneToFalls": "EXACTLY ONE OF: Never / Occasionally / Often / Frequent",
    "proneToFallsDetails": "Details",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention"
  },
  "riskSection6Appliances": {
    "cooker": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "microwave": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "iron": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "kettle": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "toaster": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "tumbleDryer": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "floorCoverings": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "handRails": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "electricBlanket": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "bed": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "washingMachine": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "centralHeating": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "actionsRequired": "Actions"
  },
  "riskSection7Fire": {
    "atRisk": "EXACTLY ONE OF: Yes / No",
    "riskReasons": ["Array of: Smoking, Cooking, Hoarding, Lighter Fuel, Open Fire, Free standing heaters, Paraffin-based emollients, Oxygen, Candles, Other"],
    "ragRating": "EXACTLY ONE OF: Red / Amber / Green",
    "plugSockets": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "electricCables": "EXACTLY ONE OF: Fit for Purpose / Not Fit for Purpose / N/A",
    "smokingPolicy": "EXACTLY ONE OF: Yes / No",
    "smokeAlarmLocation": "Location",
    "smokeAlarmWorking": "EXACTLY ONE OF: Yes / No",
    "coDetectorLocation": "Location",
    "coDetectorWorking": "EXACTLY ONE OF: Yes / No",
    "actionsTaken": "EXACTLY ONE OF: Referral made to Fire Service / Social Services / No Actions Required / Other",
    "actionsDetails": "Details",
    "canEvacuate": "Evacuation details"
  },
  "riskSection8COSHH": {
    "cleaningStorage": "Storage location",
    "riddorExplained": "EXACTLY ONE OF: Yes / No"
  },
  "riskSection9External": {
    "access": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "accessLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "clearPathways": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "clearPathwaysLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "handrails": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "handrailsLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "entranceSteps": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "entranceStepsLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "lighting": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "lightingLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "ramps": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "rampsLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "personalSecurity": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "personalSecurityLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "parking": "EXACTLY ONE OF: Fit for Purpose / Concerns / N/A",
    "parkingLocation": "EXACTLY ONE OF: Front / Rear / Side / Other",
    "actionsRequired": "Actions",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention"
  },
  "riskSection10Security": {
    "meansOfAccess": "EXACTLY ONE OF: Key safe / Key held / Other",
    "propertyType": "EXACTLY ONE OF: House / Flat / Bungalow / Other",
    "enterUsing": "EXACTLY ONE OF: Front door / Side door / Back door / Other",
    "keysafeConsent": "EXACTLY ONE OF: Yes / No",
    "gasShutOff": "Location",
    "stopTap": "Location",
    "fuseBox": "Location",
    "riskLevel": "EXACTLY ONE OF: High / Medium / Low",
    "riskPrevention": "Prevention"
  },
  "section11Bands": {
    "personalCare": "EXACTLY ONE OF: Yes / No",
    "mentalHealth": "EXACTLY ONE OF: Yes / No",
    "physicalDisability": "EXACTLY ONE OF: Yes / No",
    "dementia": "EXACTLY ONE OF: Yes / No",
    "eatingDisorder": "EXACTLY ONE OF: Yes / No",
    "sensoryImpairment": "EXACTLY ONE OF: Yes / No",
    "detainedMHA": "EXACTLY ONE OF: Yes / No",
    "drugAlcoholMisuse": "EXACTLY ONE OF: Yes / No",
    "learningDifficulties": "EXACTLY ONE OF: Yes / No"
  }
}`;

      const currentProvider = getPreferredProvider();
      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Enhance/create a care plan from these documents:\n\n${combinedContent}` },
        ],
        max_completion_tokens: currentProvider === "github" ? 8000 : 12000,
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" },
      }, "copilot_plan_enhance", COPILOT_USER_CONTEXT);

      const content = response.choices[0]?.message?.content || "";
      const enhancedPlan = parseJsonFromContent(content);

      if (!enhancedPlan) {
        res.json({
          rawPlan: content,
          parseWarning: "Could not parse structured JSON. Raw enhanced plan text returned.",
        });
        return;
      }

      // Post-generation scope-of-practice validation
      const scopeWarnings = checkScopeOfPractice(enhancedPlan);
      if (scopeWarnings.length > 0) {
        enhancedPlan.scopeOfPracticeWarnings = scopeWarnings;
      }

      res.json({ enhancedPlan, model: getAccurateModel() });
    } catch (error: any) {
      console.error("[Copilot] Plan enhancement error:", error);
      res.status(500).json({ error: "Plan enhancement failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 9. DRUG INTERACTION CHECK
  // ─────────────────────────────────────────────────────────────────────
  app.post("/api/copilot/check-drug-interactions", async (req: Request, res: Response) => {
    try {
      const { medications } = req.body;

      if (!medications || !Array.isArray(medications) || medications.length < 2) {
        res.status(400).json({
          error: "Missing required field",
          message: "medications array is required with at least 2 medication names",
        });
        return;
      }

      if (!isAIEnabled()) {
        res.status(503).json({ error: "AI disabled", message: getAIDisabledMessage() });
        return;
      }

      const medNames = medications.map((m: any) => (typeof m === "string" ? m : m.name || m.medicationName).toLowerCase().trim());
      const medList = medNames.join(", ");

      // ── Rule-based safety net: catch critical interactions even if AI misses them ──
      const RULE_BASED_INTERACTIONS: Array<{
        drugs: string[][];
        severity: "severe" | "critical";
        interaction: string;
        clinicalSignificance: string;
        recommendation: string;
      }> = [
        { drugs: [["warfarin", "coumadin"], ["aspirin", "ibuprofen", "naproxen", "diclofenac", "indomethacin", "piroxicam", "meloxicam", "celecoxib"]], severity: "critical", interaction: "Anticoagulant + NSAID: greatly increased bleeding risk", clinicalSignificance: "Combined use can cause life-threatening GI haemorrhage or intracranial bleeding", recommendation: "Avoid combination. If unavoidable, add PPI gastroprotection and monitor INR closely" },
        { drugs: [["methotrexate"], ["aspirin", "ibuprofen", "naproxen", "diclofenac", "indomethacin", "piroxicam", "meloxicam"]], severity: "critical", interaction: "Methotrexate + NSAID: reduced methotrexate clearance", clinicalSignificance: "NSAIDs reduce renal clearance of methotrexate, risking fatal toxicity (pancytopenia, renal failure)", recommendation: "Avoid NSAIDs with methotrexate. Use paracetamol for analgesia if needed" },
        { drugs: [["lithium"], ["lisinopril", "enalapril", "ramipril", "perindopril", "captopril", "losartan", "candesartan", "valsartan", "irbesartan", "ibuprofen", "naproxen", "diclofenac"]], severity: "severe", interaction: "Lithium clearance reduced by ACE inhibitors/ARBs/NSAIDs", clinicalSignificance: "Elevated lithium levels can cause toxicity: tremor, confusion, seizures, cardiac arrhythmia", recommendation: "Monitor lithium levels frequently. Reduce lithium dose if combination necessary" },
        { drugs: [["citalopram", "escitalopram", "fluoxetine", "sertraline", "paroxetine", "venlafaxine", "duloxetine"], ["phenelzine", "tranylcypromine", "isocarboxazid", "moclobemide", "selegiline", "rasagiline"]], severity: "critical", interaction: "SSRI/SNRI + MAOI: serotonin syndrome risk", clinicalSignificance: "Potentially fatal hyperthermia, rigidity, myoclonus and autonomic instability", recommendation: "Absolutely contraindicated. Ensure 2-week washout (5 weeks for fluoxetine) between agents" },
        { drugs: [["citalopram", "escitalopram", "fluoxetine", "sertraline", "paroxetine", "venlafaxine", "duloxetine"], ["tramadol"]], severity: "severe", interaction: "SSRI/SNRI + tramadol: serotonin syndrome risk", clinicalSignificance: "Tramadol has serotonergic activity; combination raises serotonin syndrome risk", recommendation: "Use alternative analgesia if possible. Monitor for agitation, clonus, hyperthermia" },
        { drugs: [["morphine", "oxycodone", "fentanyl", "codeine", "tramadol", "buprenorphine"], ["diazepam", "lorazepam", "temazepam", "nitrazepam", "zopiclone", "zolpidem"]], severity: "critical", interaction: "Opioid + benzodiazepine/Z-drug: respiratory depression", clinicalSignificance: "Combined CNS depression can cause fatal respiratory arrest, especially in elderly", recommendation: "Avoid combination where possible. If essential, use lowest doses and monitor respiratory rate" },
        { drugs: [["digoxin"], ["amiodarone"]], severity: "severe", interaction: "Amiodarone increases digoxin levels", clinicalSignificance: "Digoxin toxicity: nausea, visual disturbances, arrhythmias", recommendation: "Halve digoxin dose when starting amiodarone. Monitor digoxin levels and ECG" },
        { drugs: [["digoxin"], ["verapamil"]], severity: "severe", interaction: "Verapamil increases digoxin levels and combined AV block risk", clinicalSignificance: "Risk of symptomatic bradycardia and heart block", recommendation: "Reduce digoxin dose by 25-50%. Monitor heart rate and digoxin levels" },
        { drugs: [["simvastatin", "atorvastatin", "lovastatin"], ["clarithromycin", "erythromycin", "itraconazole", "ketoconazole"]], severity: "severe", interaction: "Statin + CYP3A4 inhibitor: increased statin levels", clinicalSignificance: "Risk of rhabdomyolysis (muscle breakdown) and acute kidney injury", recommendation: "Suspend statin during short courses. Consider pravastatin or rosuvastatin as alternatives" },
        { drugs: [["spironolactone", "eplerenone", "amiloride"], ["lisinopril", "enalapril", "ramipril", "perindopril", "captopril"]], severity: "severe", interaction: "K-sparing diuretic + ACE inhibitor: hyperkalaemia risk", clinicalSignificance: "Life-threatening hyperkalaemia causing cardiac arrhythmias", recommendation: "Monitor potassium within 1 week of starting. Avoid if eGFR < 30" },
        { drugs: [["citalopram", "escitalopram", "amiodarone", "sotalol", "domperidone", "methadone", "haloperidol", "chlorpromazine"], ["citalopram", "escitalopram", "amiodarone", "sotalol", "domperidone", "methadone", "haloperidol", "chlorpromazine"]], severity: "severe", interaction: "Multiple QT-prolonging drugs: risk of torsades de pointes", clinicalSignificance: "Additive QT prolongation can trigger fatal ventricular arrhythmia", recommendation: "Avoid combining QT-prolonging drugs. If essential, obtain baseline ECG and monitor QTc" },
        { drugs: [["warfarin", "coumadin"], ["clarithromycin", "erythromycin", "fluconazole", "metronidazole", "co-trimoxazole", "ciprofloxacin"]], severity: "severe", interaction: "Warfarin + antibiotic: enhanced anticoagulant effect", clinicalSignificance: "Certain antibiotics inhibit warfarin metabolism or disrupt vitamin K gut flora, raising INR and bleed risk", recommendation: "Check INR within 3-5 days of starting antibiotic. Consider dose reduction. Use paracetamol over NSAIDs for pain" },
      ];

      // Detect rule-based interactions
      interface RuleInteraction {
        drug1: string;
        drug2: string;
        severity: string;
        interaction: string;
        clinicalSignificance: string;
        recommendation: string;
        source: string;
      }
      const ruleBasedHits: RuleInteraction[] = [];
      for (const rule of RULE_BASED_INTERACTIONS) {
        const [groupA, groupB] = rule.drugs;
        const matchesA = medNames.filter(m => groupA.some(d => m.includes(d)));
        const matchesB = medNames.filter(m => groupB.some(d => m.includes(d)));
        // For QT-prolonging drugs, need 2+ matches from the SAME group
        if (groupA === groupB) {
          const combined = medNames.filter(m => groupA.some(d => m.includes(d)));
          if (combined.length >= 2) {
            ruleBasedHits.push({
              drug1: combined[0], drug2: combined[1],
              severity: rule.severity, interaction: rule.interaction,
              clinicalSignificance: rule.clinicalSignificance,
              recommendation: rule.recommendation, source: "rule_based_safety_check",
            });
          }
        } else {
          for (const a of matchesA) {
            for (const b of matchesB) {
              if (a !== b) {
                ruleBasedHits.push({
                  drug1: a, drug2: b,
                  severity: rule.severity, interaction: rule.interaction,
                  clinicalSignificance: rule.clinicalSignificance,
                  recommendation: rule.recommendation, source: "rule_based_safety_check",
                });
              }
            }
          }
        }
      }

      const systemPrompt = `You are a senior UK clinical pharmacist following current BNF (British National Formulary) guidelines. Perform a thorough drug interaction check on the provided medication list.

CHECK FOR ALL OF THE FOLLOWING:
1. Pharmacokinetic interactions (CYP450 inhibition/induction, protein binding displacement, renal clearance changes)
2. Pharmacodynamic interactions (additive CNS depression, serotonergic effects, QT prolongation, bleeding risk, hyperkalaemia, hypotension)
3. Duplicate therapy (same drug class prescribed twice)
4. Dose-dependent risks when specific combinations are used
5. Elderly-specific risks (falls, sedation, anticholinergic burden)
6. UK-specific guidance from BNF and NICE

SEVERITY SCALE:
- mild: Theoretical or minor clinical impact. Monitor only.
- moderate: Clinically significant. May need dose adjustment or additional monitoring.
- severe: Potentially dangerous. Close monitoring essential. Consider alternatives.
- critical: Potentially life-threatening. Avoid combination or use only with specialist supervision.

IMPORTANT SAFETY DISCLAIMER: This check is advisory only and does not replace clinical pharmacist review. Always verify interactions against current BNF and consult the prescriber for any concerns.

Return JSON:
{
  "interactions": [
    {
      "drug1": "First medication",
      "drug2": "Second medication",
      "severity": "mild|moderate|severe|critical",
      "interaction": "Description of the interaction mechanism",
      "clinicalSignificance": "What this means for the patient in practical terms",
      "recommendation": "Specific action: monitor what, adjust what, avoid what",
      "bnfReference": "Reference section if applicable"
    }
  ],
  "anticholinergicBurden": {
    "score": 0,
    "contributors": ["drug1 (score)", "drug2 (score)"],
    "risk": "low|moderate|high",
    "note": "Assessment of cumulative anticholinergic load"
  },
  "summary": "Overall assessment of the medication regimen safety",
  "totalMedicationsChecked": number,
  "interactionsFound": number,
  "disclaimer": "This AI-generated interaction check is advisory only. All identified interactions should be verified against the current BNF and discussed with the prescribing clinician."
}`;

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Check for ALL drug interactions in this medication list: ${medList}` },
        ],
        max_completion_tokens: 6000,
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" },
      }, "copilot_drug_interactions", COPILOT_USER_CONTEXT);

      const content = response.choices[0]?.message?.content || "";
      const result = parseJsonFromContent(content);

      if (!result) {
        // If AI fails, still return rule-based results as a safety net
        if (ruleBasedHits.length > 0) {
          res.json({
            interactions: ruleBasedHits,
            summary: "AI analysis unavailable. Showing rule-based safety checks only. Consult a pharmacist for comprehensive review.",
            totalMedicationsChecked: medNames.length,
            interactionsFound: ruleBasedHits.length,
            source: "rule_based_fallback",
            disclaimer: "This rule-based check is not comprehensive. Always verify with a qualified pharmacist.",
            model: getAccurateModel(),
          });
          return;
        }
        res.status(500).json({ error: "Parse failed", message: "Could not parse drug interaction results" });
        return;
      }

      // Merge rule-based hits that AI may have missed
      if (ruleBasedHits.length > 0 && Array.isArray(result.interactions)) {
        const aiPairs = new Set(result.interactions.map((i: any) =>
          [i.drug1?.toLowerCase(), i.drug2?.toLowerCase()].sort().join("|")
        ));
        for (const rb of ruleBasedHits) {
          const pairKey = [rb.drug1, rb.drug2].sort().join("|");
          if (!aiPairs.has(pairKey)) {
            result.interactions.push(rb);
            result.interactionsFound = (result.interactionsFound || 0) + 1;
          }
        }
      }

      // Validate severity values
      const SEVERITY_ENUM = ["mild", "moderate", "severe", "critical"] as const;
      if (Array.isArray(result.interactions)) {
        for (const interaction of result.interactions) {
          interaction.severity = clampEnum(interaction.severity, [...SEVERITY_ENUM], "moderate");
        }
      }

      // Ensure disclaimer always present
      if (!result.disclaimer) {
        result.disclaimer = "This AI-generated interaction check is advisory only. All identified interactions should be verified against the current BNF and discussed with the prescribing clinician.";
      }

      res.json({ ...result, model: getAccurateModel() });
    } catch (error: any) {
      console.error("[Copilot] Drug interaction check error:", error);
      res.status(500).json({ error: "Drug interaction check failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 10. DASHBOARD SUMMARY
  // ─────────────────────────────────────────────────────────────────────
  app.get("/api/copilot/dashboard", async (_req: Request, res: Response) => {
    try {
      const [
        careWorkers,
        audits,
        discrepancies,
        serviceUsers,
      ] = await Promise.all([
        storage.getAllCareWorkers(),
        storage.getAllAudits(),
        storage.getAllDiscrepancies(),
        storage.getAllAnalyzedServiceUsers?.() ?? Promise.resolve([]),
      ]);

      const recentAudits = audits
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 10);

      const unresolvedDiscrepancies = discrepancies.filter((d: any) => d.status !== "resolved");

      res.json({
        summary: {
          totalCareWorkers: careWorkers.length,
          totalAudits: audits.length,
          totalDiscrepancies: discrepancies.length,
          unresolvedDiscrepancies: unresolvedDiscrepancies.length,
          totalServiceUsers: serviceUsers.length,
        },
        recentAudits: recentAudits.map((a: any) => ({
          id: a.id,
          type: a.type || a.auditType,
          serviceUserInitials: a.serviceUserInitials || a.serviceUser,
          createdAt: a.createdAt,
          status: a.status,
          discrepancyCount: a.discrepancyCount || 0,
        })),
        alerts: unresolvedDiscrepancies.length > 0
          ? `${unresolvedDiscrepancies.length} unresolved discrepancies require attention`
          : "No outstanding alerts",
      });
    } catch (error: any) {
      console.error("[Copilot] Dashboard error:", error);
      res.status(500).json({ error: "Dashboard fetch failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 11. CARE WORKER LIST
  // ─────────────────────────────────────────────────────────────────────
  app.get("/api/copilot/care-workers", async (_req: Request, res: Response) => {
    try {
      const workers = await storage.getAllCareWorkers();
      res.json({
        careWorkers: workers.map((w: any) => ({
          id: w.id,
          name: w.name,
          initials: w.initials,
          role: w.role || "Care Worker",
          status: w.status || "active",
          phone: w.phone || undefined,
          email: w.email || undefined,
        })),
        total: workers.length,
      });
    } catch (error: any) {
      console.error("[Copilot] Care workers error:", error);
      res.status(500).json({ error: "Care worker list failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 12. AUDIT HISTORY
  // ─────────────────────────────────────────────────────────────────────
  app.get("/api/copilot/audits", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const audits = await storage.getAllAudits();

      const sorted = audits
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, limit);

      res.json({
        audits: sorted.map((a: any) => ({
          id: a.id,
          type: a.type || a.auditType,
          serviceUserInitials: a.serviceUserInitials || a.serviceUser,
          createdAt: a.createdAt,
          status: a.status,
          discrepancyCount: a.discrepancyCount || 0,
          careWorkerName: a.careWorkerName,
        })),
        total: audits.length,
        showing: sorted.length,
      });
    } catch (error: any) {
      console.error("[Copilot] Audits error:", error);
      res.status(500).json({ error: "Audit list failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 13. DISCREPANCIES
  // ─────────────────────────────────────────────────────────────────────
  app.get("/api/copilot/discrepancies", async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string || undefined;
      const discrepancies = await storage.getAllDiscrepancies();

      const filtered = status
        ? discrepancies.filter((d: any) => d.status === status)
        : discrepancies;

      const sorted = filtered
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 50);

      res.json({
        discrepancies: sorted.map((d: any) => ({
          id: d.id,
          careWorkerName: d.careWorkerName,
          serviceUserInitials: d.serviceUserInitials,
          issue: d.issue || d.description,
          status: d.status,
          severity: d.severity,
          createdAt: d.createdAt,
          auditId: d.auditId,
        })),
        total: filtered.length,
        showing: sorted.length,
      });
    } catch (error: any) {
      console.error("[Copilot] Discrepancies error:", error);
      res.status(500).json({ error: "Discrepancy list failed", message: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 14. COMPLI-EE CHAT (General AI Assistant)
  // ─────────────────────────────────────────────────────────────────────
  app.post("/api/copilot/chat", async (req: Request, res: Response) => {
    try {
      const { message, context } = req.body;

      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "Missing required field", message: "message (string) is required" });
        return;
      }

      if (!isAIEnabled()) {
        res.status(503).json({ error: "AI disabled", message: getAIDisabledMessage() });
        return;
      }

      const systemPrompt = `You are Compli-ee, the CareAssurance AI assistant. You help UK care facility managers and staff with:
- Care compliance questions (CQC 2024 standards, Health and Social Care Act 2008 regulations)
- EMAR and medication management guidance (BNF references where applicable)
- Care planning assistance (12 mandatory sections, person-centred approach)
- Risk assessment advice (NHS England 12 principles, likelihood/impact matrices)
- Staff management questions (supervision, training, DBS, competency frameworks)
- Policy interpretation (safeguarding, MCA/DoLS, infection control, GDPR/DPA 2018)
- Domiciliary care compliance (visit scheduling, geographic check-in, duration thresholds)

RESPONSE FORMAT:
- Use UK English throughout
- Structure responses with clear headings and bullet points where appropriate
- Reference specific CQC Key Lines of Enquiry (KLOEs) and fundamental standards (Regulations 9-20A) when relevant
- Cite regulation numbers where applicable (e.g. "Regulation 12: Safe care and treatment")
- Stay within care worker scope of practice
- Never provide medical diagnosis or prescribing advice — always recommend consulting healthcare professionals
- For medication questions, remind users to check the current BNF and consult their pharmacist
- Privacy is paramount — never ask for or store personally identifiable information
- If unsure about current guidance, say so explicitly rather than guessing`;

      const contextPrompt = context ? `\nContext: ${context}\n` : "";

      const response = await createChatCompletionWithLogging({
        model: getLowCostModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${contextPrompt}${message}` },
        ],
        max_completion_tokens: 3000,
        temperature: 0.3,
      }, "copilot_chat", COPILOT_USER_CONTEXT);

      const reply = response.choices[0]?.message?.content;
      if (!reply) {
        res.status(500).json({ error: "No response", message: "AI did not return a response" });
        return;
      }

      res.json({ reply, model: getLowCostModel() });
    } catch (error: any) {
      console.error("[Copilot] Chat error:", error);
      res.status(500).json({ error: "Chat failed", message: error.message });
    }
  });

  console.log("[Copilot API] Registered 14 Copilot endpoints at /api/copilot/*");
}
