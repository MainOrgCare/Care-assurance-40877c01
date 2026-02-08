# CareAssurance Copilot — Microsoft 365 Copilot Agent

A specialist Microsoft 365 Copilot Agent that mirrors **every AI capability** of the CareAssurance healthcare compliance and operations platform. Assists UK care organisations with EMAR audits, visit audits, care planning, risk assessments, PRN protocols, email rewriting, drug interaction checking, call reconciliation, performance tracking, rostering, GDPR compliance, and safeguarding.

## AI Capabilities (Matching the Platform)

### Analysis & Auditing
| Capability | How It Works | Platform Location |
|---|---|---|
| **EMAR Audit** | 6-pass AI pipeline: table detection → metadata extraction (2-pass) → entry extraction (3-pass with voting) → validation → domain validation → drug interaction check | Care Workers → EMAR Audit |
| **Visit Audit** | Triple-check validated (3 AI passes) auditing of visit logs: location (200m), duration (≥70%), note quality, concern detection | Care Workers → Visit Audit |
| **Risk Analysis** | AI document scanning with PIIVault protection, CQC 2024 + NHS England 12 Principles, 20+ assessment categories | Service Users → Risk Assessment |
| **Drug Interactions** | UK pharmacist persona, severity levels (high/moderate/low), 24-hour caching | Auto during EMAR analysis |

### Content Generation
| Capability | How It Works | Platform Location |
|---|---|---|
| **Care Plan Generation** | 12 mandatory CQC 2024 sections, call-type aware (Morning/Lunch/Tea/Bed/Domestic/General) | Service Users → Care Planning |
| **Care Plan Enhancement** | Merges existing plans with supporting documents (M&H, GP letters, medical records), CQC + NICE + NHS standards | Service Users → Plan Enhancer |
| **Risk Assessment Generation** | Category-specific, first-person, evidence-based with zero fabrication policy, scope-of-practice limits | Service Users → Risk Assessment |
| **PRN Protocol** | Clinically accurate UK medication protocols: dose, route, frequency, max 24hr, side effects | Service Users → Care Planning |
| **Email Rewriter** | 5 tones (professional/direct/empathetic/formal/urgent), optional subject line | Email Assistant (sidebar) |

### Operations & Compliance
| Capability | How It Works | Platform Location |
|---|---|---|
| **Call Reconciliation** | Excel processing: strips ~150 columns, maps cancellation reasons to variation codes (L1/L4/L5/A1) | Call Reconciliation |
| **Performance Tracking** | Discrepancy metrics, auto-alerts at 3+ EMAR discrepancies, corrective action workflow | Care Workers → Performance |
| **Rostering** | Rota planning, shift gap analysis, staff allocation, working time compliance | Rostering tools |
| **Chat Assistant (Compli-ee)** | In-app mascot with role-aware guidance, function calling for inbox messages, pattern-matched fallback | Sidebar chat |
| **GDPR & Privacy** | PIIVault, PII scrubbing, clinical whitelist, DSAR support, lawful basis under Care Act 2014 | Governance features |
| **Safeguarding** | Care Act 2014 principles, emergency contacts, CQC reporting guidance | Safeguarding topic |

## Project Structure

```
Microsoft 365 Copilot Agent/
├── .mcs/                          # Copilot Studio metadata
├── Microsoft 365 Copilot Agent/
│   ├── agent.mcs.yml              # Main agent — ALL 12 AI capabilities defined
│   ├── settings.mcs.yml           # Agent settings & AI configuration
│   ├── icon.png                   # Agent icon
│   └── topics/                    # 22 conversation topics
│       │
│       │── (AI Analysis Topics)
│       ├── EMARaudit.mcs.yml               # 6-pass EMAR analysis + EMAR codes
│       ├── VisitAudit.mcs.yml              # Triple-check visit log auditing
│       ├── DrugInteractions.mcs.yml        # Drug-drug interaction checking
│       │
│       │── (AI Generation Topics)
│       ├── CarePlanning.mcs.yml            # 12-section + call-type plans + enhancement
│       ├── RiskAssessment.mcs.yml          # Doc scanning + 20+ categories
│       ├── PRNProtocol.mcs.yml             # PRN medication protocol generation
│       ├── EmailAssistant.mcs.yml          # Email rewriting with 5 tones
│       │
│       │── (Operations Topics)
│       ├── CallReconciliation.mcs.yml      # ECM Excel + variation codes
│       ├── PerformanceTracking.mcs.yml     # Discrepancy metrics & alerts
│       ├── RosteringStaffing.mcs.yml       # Rota planning & staffing
│       ├── GDPRPrivacy.mcs.yml             # Data protection & PIIVault
│       ├── Safeguarding.mcs.yml            # Care Act 2014 & emergency contacts
│       │
│       │── (System Topics)
│       ├── ConversationStart.mcs.yml       # Welcome with full capability menu
│       ├── Greeting.mcs.yml                # Greeting responses
│       ├── Escalate.mcs.yml                # Care-specific escalation paths
│       ├── Search.mcs.yml                  # Generative search fallback
│       ├── Goodbye.mcs.yml                 # Conversation end
│       ├── ThankYou.mcs.yml                # Thank you responses
│       ├── StartOver.mcs.yml               # Conversation restart
│       ├── Fallback.mcs.yml                # Unknown intent handling
│       ├── MultipleTopicsMatched.mcs.yml   # Disambiguation
│       ├── EndofConversation.mcs.yml       # Survey & feedback
│       ├── OnError.mcs.yml                 # Error handling + telemetry
│       ├── ResetConversation.mcs.yml       # State reset
│       └── Signin.mcs.yml                  # OAuth authentication
└── README.md
```

## EMAR Code Reference

| Code | Meaning | Notes |
|------|---------|-------|
| AD | Administered | Standard administration |
| R | Refused | Requires admin review |
| NH | Not Home | Service user absent |
| SA | Self Administered | Independent medication |
| F | Family Administered | Family member gave medication |
| MU | Medication Unavailable | Stock/supply issue |
| PRN | As Needed | Pro Re Nata |
| PRN-AD/R/AS | PRN sub-codes | PRN administered/refused/as-stated |
| MISSED | Missed dose | Blank entry in records |
| AS/P | As Stated / Prompted | Verbal prompt given |

## Variation Code Reference

| Code | Meaning |
|------|---------|
| L1 | Hospital — service user in hospital |
| L4 | Cancellation >24 hours notice |
| L5 | Cancellation <24 hours / capacity |
| A1 | Empty service requirement |

## Care Plan Sections (12 Mandatory)

1. Warning/Safety Information
2. Introduction/Life Story
3. Well-being & Mental Health
4. Social Worker Tasks
5. Personal Care & Hygiene
6. Mobility & Transfers
7. Nutrition & Hydration
8. Medication Management
9. Continence Care
10. Communication Needs
11. Household Tasks
12. Secure Property

## Risk Assessment Categories (20+)

Falls Prevention, Medication Administration, Skin Integrity, Mobility & Moving/Handling, Personal Care, Continence Care, Nutrition, Communication, Mental Health, Dementia Care, Behaviour Support, End of Life Care, Fire Safety, Environmental Safety, Lone Working, Safeguarding, Infection Control, COSHH, Diabetes Management, Epilepsy Management

## Deployment

### Prerequisites
- Microsoft 365 Copilot Studio access
- Appropriate Microsoft 365 licensing

### Steps
1. Open **Microsoft Copilot Studio** (https://copilotstudio.microsoft.com)
2. Import this agent or push via the Copilot Studio CLI/VS Code extension
3. Configure authentication (Integrated mode is pre-configured)
4. Add knowledge sources (SharePoint, internal docs)
5. Test in the Copilot Studio test panel
6. Publish to your Microsoft 365 environment

### Knowledge Sources (Recommended)
Connect the agent to your organisation's knowledge base for best results:
- **SharePoint** — Care policies, procedures, medication guides, risk frameworks
- **Platform docs** — CareAssurance user guides, training materials
- **CQC guidance** — Regulatory frameworks and inspection criteria
- **Policy documents** — Uploaded via the CareAssurance admin portal

## Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `GenerativeActionsEnabled` | `true` | Enable generative AI actions |
| `isSemanticSearchEnabled` | `true` | Semantic search over knowledge |
| `isFileAnalysisEnabled` | `true` | Document upload and analysis |
| `optInUseLatestModels` | `true` | Latest available AI models |
| `authenticationMode` | `Integrated` | Microsoft 365 SSO |
| `recognizer` | `GenerativeAIRecognizer` | AI-powered intent recognition |

## Safety & Compliance

- **No PII** — PIIVault system scrubs all personal data; clinical terms whitelisted
- **Safeguarding** — Urgent concerns trigger immediate safety guidance + emergency contacts (999, CQC 03000 616161)
- **Clinical disclaimer** — All clinical decisions deferred to qualified healthcare professionals
- **CQC alignment** — All care planning follows Care Quality Commission 2024 standards
- **GDPR compliance** — Data handling follows UK GDPR, Care Act 2014, and Data Protection Act 2018
- **Zero fabrication** — AI only uses documented evidence; never invents clinical details
