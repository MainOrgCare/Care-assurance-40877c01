# CareAssurance Copilot — Microsoft 365 Copilot Agent

A specialist Microsoft 365 Copilot Agent that mirrors **every AI capability** of the CareAssurance healthcare compliance and operations platform. Assists UK care organisations with EMAR audits, visit audits, care planning, risk assessments, PRN protocols, email rewriting, drug interaction checking, call reconciliation, performance tracking, rostering, billing, GDPR compliance, safeguarding, admin operations, and more.

## AI Capabilities (21 Platform Features Covered)

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
| **Rostering** | Workbook ingestion, service order builder, schedule optimisation with Gantt, route planning, cost analysis, workload heatmap | Rostering Hub / Rostering Studio |
| **Chat Assistant (Compli-ee)** | In-app mascot with role-aware guidance, function calling for inbox messages, pattern-matched fallback | Sidebar chat |
| **GDPR & Privacy** | PIIVault, PII scrubbing, clinical whitelist, DSAR support, consent management, retention policies, lawful basis under Care Act 2014 | Governance features |
| **Safeguarding** | Care Act 2014 principles, emergency contacts, CQC reporting guidance | Safeguarding topic |

### Administration & Platform
| Capability | How It Works | Platform Location |
|---|---|---|
| **Billing Tool** | Vision AI extraction from service requirement screenshots, support plan comparison | Billing Tool |
| **User Management** | Create/approve/delete users, role changes, password reset, suspension/reinstatement | Admin Portal |
| **Security** | Progressive lockout, password complexity, virus scanning, session management, IP blocking | Admin Portal |
| **AI Configuration** | Provider switching, model selection, cache, lite mode, rules-first, usage tracking | Admin Portal |
| **Policy Documents** | Upload/manage policies by category, AI references during generation, gap analysis | Compliance |
| **Edge Extension** | Browser extension for Access Care Planning auto-fill from CareAssurance data | Edge browser |

## Project Structure

```
Microsoft 365 Copilot Agent/
├── agent.mcs.yml              # Main agent — ALL 21 AI capabilities + knowledge sources
├── settings.mcs.yml           # Agent settings & AI configuration
├── README.md                  # This file
├── .mcs/                      # Copilot Studio metadata
├── CareAssurance Copilot/     # Inner agent (synced copy)
│   ├── agent.mcs.yml
│   ├── settings.mcs.yml
│   ├── icon.png
│   └── topics/                # 36 conversation topics (synced)
└── topics/                    # 36 conversation topics
    │
    │── (AI Analysis Topics — 4)
    ├── EMARaudit.mcs.yml               # 6-pass EMAR analysis + EMAR codes
    ├── VisitAudit.mcs.yml              # Triple-check visit log auditing
    ├── DrugInteractions.mcs.yml        # Drug-drug interaction checking
    ├── CareWorkerManagement.mcs.yml    # Care worker directory & discrepancies
    │
    │── (AI Generation Topics — 4)
    ├── CarePlanning.mcs.yml            # 12-section + call-type plans + enhancement
    ├── RiskAssessment.mcs.yml          # Doc scanning + 20+ categories
    ├── PRNProtocol.mcs.yml             # PRN medication protocol generation
    ├── EmailAssistant.mcs.yml          # Email rewriting with 5 tones
    │
    │── (Operations Topics — 5)
    ├── CallReconciliation.mcs.yml      # ECM Excel + variation codes
    ├── PerformanceTracking.mcs.yml     # Discrepancy metrics & alerts
    ├── RosteringStaffing.mcs.yml       # Rota planning & staffing
    ├── GDPRPrivacy.mcs.yml             # Data protection & PIIVault
    ├── Safeguarding.mcs.yml            # Care Act 2014 & emergency contacts
    │
    │── (Administration Topics — 8)
    ├── BillingTool.mcs.yml             # Vision AI billing + support plan comparison
    ├── Dashboard.mcs.yml               # Dashboard widgets & customisation
    ├── UserManagement.mcs.yml          # Accounts, sessions, suspensions, IP blocking
    ├── AIConfiguration.mcs.yml         # AI provider, model, cache, optimisation
    ├── MessagingChat.mcs.yml           # Internal messaging & Compli-ee chat
    ├── SystemLogs.mcs.yml              # Audit trails & event logs
    ├── PolicyCompliance.mcs.yml        # Policy documents & CQC compliance
    ├── SecurityAuthentication.mcs.yml  # Login, password, sessions, virus scan
    │
    │── (Utility Topics — 3)
    ├── EdgeExtension.mcs.yml           # Browser extension for ACP auto-fill
    ├── ROICalculator.mcs.yml           # Return on investment calculator
    │
    │── (System Topics — 12)
    ├── ConversationStart.mcs.yml       # Welcome with full capability menu
    ├── Greeting.mcs.yml                # Greeting responses
    ├── Escalate.mcs.yml                # Care-specific escalation paths
    ├── Search.mcs.yml                  # Generative search fallback
    ├── Goodbye.mcs.yml                 # Conversation end
    ├── ThankYou.mcs.yml                # Thank you responses
    ├── StartOver.mcs.yml               # Conversation restart
    ├── Fallback.mcs.yml                # Unknown intent handling with feature list
    ├── MultipleTopicsMatched.mcs.yml   # Disambiguation
    ├── EndofConversation.mcs.yml       # Survey & feedback
    ├── OnError.mcs.yml                 # Error handling + telemetry
    ├── ResetConversation.mcs.yml       # State reset
    └── Signin.mcs.yml                  # OAuth authentication
```

## Knowledge Sources (Configured in agent.mcs.yml)

### SharePoint Sources (connect after import)
| Source | Content |
|--------|---------|
| **Care Policies and Procedures** | Medication policies, safeguarding protocols, H&S, infection control, HR |
| **CQC Regulatory Guidance** | Fundamental standards, KLOEs, quality statements, inspection frameworks |
| **Training and User Guides** | Platform user guides, SOPs, training materials, onboarding packs |
| **Clinical and Medication Guidance** | MAR policies, PRN guidelines, BNF references, clinical pathways |
| **GDPR and Data Protection** | Privacy notices, DPIAs, retention schedules, consent forms, processor agreements |
| **Risk Assessment Templates** | Category-specific guidance, NHS 12 Principles, M&H standards |

### Website Sources (approved regulatory sites)
| Source | URL |
|--------|-----|
| **CQC Official Guidance** | https://www.cqc.org.uk/guidance-providers |
| **NHS England Adult Social Care** | https://www.england.nhs.uk/ourwork/part-rel/adult-social-care/ |
| **NICE Social Care Guidelines** | https://www.nice.org.uk/guidance/conditions-and-diseases |

### File Sources (upload during setup)
| Source | Content |
|--------|---------|
| **EMAR Code Reference** | All medication administration codes with meanings and actions |
| **Variation Code Reference** | ECM call reconciliation codes (L1/L4/L5/A1) with mapping rules |
| **Care Plan Section Guide** | 12 mandatory sections with content requirements and call-type variations |
| **Risk Assessment Category Guide** | 20+ categories with scope, hazards, and evidence requirements |
| **Platform Quick Reference** | All pages, workflows, shortcuts, and common tasks |

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
- Appropriate Microsoft 365 licensing (E3/E5 with Copilot add-on)

### Steps
1. Open **Microsoft Copilot Studio** (https://copilotstudio.microsoft.com)
2. Import this agent or push via the Copilot Studio CLI/VS Code extension
3. Configure authentication (Integrated mode is pre-configured)
4. **Connect knowledge sources:**
   - Add your SharePoint sites containing care policies, CQC guidance, training materials
   - Upload reference files (EMAR codes, variation codes, care plan guide, risk category guide)
   - Approve the website URLs for web grounding
5. Test in the Copilot Studio test panel — try each topic area
6. Publish to your Microsoft 365 environment
7. Pin the agent in Microsoft Teams for easy access

### Post-Deployment Checklist
- [ ] All 6 SharePoint knowledge sources connected
- [ ] 3 website knowledge sources approved
- [ ] 5 file knowledge sources uploaded
- [ ] Authentication tested with SSO
- [ ] All 24 feature topics tested
- [ ] All 12 system topics verified
- [ ] Safeguarding topic tested with emergency contacts
- [ ] EMAR code and variation code lookups tested
- [ ] Care plan generation guidance tested for all 6 call types
- [ ] Admin-only topics tested with admin and non-admin accounts

## Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `GenerativeActionsEnabled` | `true` | Enable generative AI actions |
| `isSemanticSearchEnabled` | `true` | Semantic search over knowledge |
| `isFileAnalysisEnabled` | `true` | Document upload and analysis |
| `optInUseLatestModels` | `true` | Latest available AI models |
| `useModelKnowledge` | `true` | Allow model's built-in knowledge |
| `authenticationMode` | `Integrated` | Microsoft 365 SSO |
| `authenticationTrigger` | `Always` | Require auth for all conversations |
| `recognizer` | `GenerativeAIRecognizer` | AI-powered intent recognition |
| `webBrowsing` | `true` | Allow web grounding for regulatory queries |
| `modelNameHint` | `GPT5Reasoning` | Preferred model for reasoning tasks |

## Safety & Compliance

- **No PII** — PIIVault system scrubs all personal data; clinical terms whitelisted
- **Safeguarding** — Urgent concerns trigger immediate safety guidance + emergency contacts (999, CQC 03000 616161)
- **Clinical disclaimer** — All clinical decisions deferred to qualified healthcare professionals
- **CQC alignment** — All care planning follows Care Quality Commission 2024 standards
- **GDPR compliance** — Data handling follows UK GDPR, Care Act 2014, and Data Protection Act 2018
- **Zero fabrication** — AI only uses documented evidence; never invents clinical details
- **Virus scanning** — All uploads scanned via Cloudmersive before processing
- **Progressive lockout** — Brute-force protection on authentication
- **Audit trail** — All agent interactions logged for accountability
