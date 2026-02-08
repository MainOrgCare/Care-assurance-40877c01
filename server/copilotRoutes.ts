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
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Default AI user context for Copilot requests (no session user) */
const COPILOT_USER_CONTEXT: AiUserContext = {
  userId: "copilot-agent",
  username: "CareAssurance Copilot",
};

/** Get model preferences */
const getLowCostModel = () => "gpt-4o-mini";
const getAccurateModel = () => getPreferredModel();

/** Estimate token count from text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER ALL COPILOT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

export function registerCopilotRoutes(app: Express): void {
  // All copilot routes require API key authentication
  app.use("/api/copilot", requireCopilotAuth);

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

      const systemPrompt = `You are an expert UK care facility medication protocol writer. Generate a comprehensive PRN (Pro Re Nata / "as needed") medication protocol for use in a care home setting.

The protocol must follow UK care standards and regulations.

IMPORTANT: Return the response as a JSON object with this exact structure:
{
  "medicationName": "Name of the medication",
  "dose": "Recommended dosage",
  "route": "Route of administration",
  "frequency": "How often it can be given",
  "maxDoseIn24Hours": "Maximum allowed in 24 hours",
  "minimumTimeBetweenDoses": "Minimum gap between doses",
  "specialInstructions": "Special instructions for administration",
  "reasonsForAdministration": "Symptoms/reasons when this medication should be given",
  "predictableSideEffects": "Common side effects to monitor for",
  "additionalComments": "Other relevant information for care workers"
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
        max_completion_tokens: 1500,
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
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a "${category}" risk assessment.${riskProfileContext}${documentContext}` },
        ],
        max_completion_tokens: 6000,
        temperature: 0,
        seed: 42,
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

      res.json({ assessment, category, model: "gpt-5.2" });
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

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a ${callTypeLabel} care plan from these documents:\n\n${documentContent}` },
        ],
        max_completion_tokens: 12000,
        temperature: 0,
        seed: 42,
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
YOUR MISSION: Create a COMPREHENSIVE, EVIDENCE-BASED care plan by combining information from all provided documents.

WRITING STANDARDS:
- Write in FIRST PERSON: "I", "my", "me"
- Be specific and actionable
- Use UK English, no m-dashes, no Oxford commas
- Stay within care worker scope of practice
- NEVER fabricate details not in documents
- Flag missing information with verification questions

Include ALL 12 mandatory sections:
1. WARNING - Safety Concerns & Risks
2. Introduction & My Life Story
3. My Well-being & Emotional Needs
4. Tasks Required by Social Workers
5. Personal Care
6. Mobility & Transfers
7. Nutrition & Hydration
8. Medication
9. Continence Care
10. Communication
11. Household Tasks
12. Secure Property Before Leaving

Respond with valid JSON:
{
  "serviceUserInitials": "F.O.",
  "sections": [
    {
      "title": "Section title",
      "priority": "high|medium|low",
      "content": "Detailed first-person narrative",
      "improvements": ["What was added or improved from the original"],
      "keyActions": ["Specific action 1"]
    }
  ],
  "verificationQuestions": ["Question about missing information"],
  "enhancementSummary": "What was improved and why",
  "sourceDocuments": ["List of documents that provided information"]
}`;

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Enhance/create a care plan from these documents:\n\n${combinedContent}` },
        ],
        max_completion_tokens: 12000,
        temperature: 0,
        seed: 42,
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

      const medList = medications.map((m: any) => typeof m === "string" ? m : m.name || m.medicationName).join(", ");

      const systemPrompt = `You are a UK pharmacist. Check for dangerous drug interactions in this medication list. Focus on:
1. Serious drug-drug interactions
2. Duplicate therapy
3. Dose concerns when combinations are used
4. UK BNF guidelines

Return JSON array:
{
  "interactions": [
    {
      "drug1": "First medication",
      "drug2": "Second medication",
      "severity": "mild|moderate|severe|critical",
      "interaction": "Description of the interaction",
      "clinicalSignificance": "What this means for the patient",
      "recommendation": "What action to take"
    }
  ],
  "summary": "Overall assessment of the medication regimen",
  "totalMedicationsChecked": number,
  "interactionsFound": number
}`;

      const response = await createChatCompletionWithLogging({
        model: getAccurateModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Check for drug interactions: ${medList}` },
        ],
        max_completion_tokens: 4000,
        temperature: 0,
        seed: 42,
        response_format: { type: "json_object" },
      }, "copilot_drug_interactions", COPILOT_USER_CONTEXT);

      const content = response.choices[0]?.message?.content || "";
      const result = parseJsonFromContent(content);

      if (!result) {
        res.status(500).json({ error: "Parse failed", message: "Could not parse drug interaction results" });
        return;
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
- Care compliance questions (CQC standards, regulations)
- EMAR and medication management guidance
- Care planning assistance
- Risk assessment advice
- Staff management questions
- Policy interpretation

RULES:
- Use UK English
- Reference CQC 2024 standards where relevant
- Stay within care worker scope of practice
- Never provide medical advice - always recommend consulting healthcare professionals
- Be helpful, professional and concise
- Privacy is paramount - never ask for or reference personal identifiable information`;

      const contextPrompt = context ? `\nContext: ${context}\n` : "";

      const response = await createChatCompletionWithLogging({
        model: getLowCostModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${contextPrompt}${message}` },
        ],
        max_completion_tokens: 2000,
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
