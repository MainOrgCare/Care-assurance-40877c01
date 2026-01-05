# CareAssurance - MAR Analysis & Care Planning

## Overview
CareAssurance is a healthcare compliance management application for care facilities. It automates CQC compliance analysis, medication administration record (MAR) auditing, care plan generation, and care worker performance tracking. The application emphasizes data privacy through automatic data sealing, time-based record redaction, and role-based access control. Its core purpose is to streamline compliance, enhance care planning, and boost operational efficiency, leading to reduced manual labor costs and improved service user outcomes.

## User Preferences
Preferred communication style: Simple, everyday language.
**Homepage/Marketing Changes**: Remove all free trial messaging, fake reviews/testimonials, and NHS Approved Supplier claims. Keep only authentic content (CQC Compliant, GDPR Certified badges).

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query for server state, React Context for local state
- **UI Components**: shadcn/ui built on Radix UI
- **Styling**: Tailwind CSS v4 with custom "liquid glass" dark theme and three color palettes (Dark, Midnight, Ocean)
- **Build Tool**: Vite
- **Available Themes**: Dark, Midnight, Ocean

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ES modules)
- **Authentication**: Custom session-based auth with bcrypt hashing and PostgreSQL session store. Supports "admin" and "staff" roles with user approval workflow.
- **API Pattern**: RESTful JSON API under `/api`

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation. Schema is shared between frontend and backend.
- **Key Tables**: users, careWorkers, discrepancies, audits, adminAlerts, activeSessions, blockedIps, emarRefusalReviews, emarCorrections, aiUsageLogs, fileScanLogs.

### Key Design Patterns & Features
- **Shared Schema**: Database schema and Zod validators are shared between client and server.
- **Protected Routes**: Client-side route protection.
- **Glass Morphism UI**: Dark theme with translucent effects and gradient backgrounds.
- **AI-Powered Features**: EMAR analysis, risk assessment, and plan enhancement use AI. Features utilize Server-Sent Events (SSE) for real-time updates and include AI failover logic.
  - **Tiered AI Model Approach**: Automatic model selection based on task complexity. GPT-5.1 for accuracy-critical tasks (EMAR extraction), GPT-4.1-mini for auxiliary tasks (validation, drug interactions). This provides significant cost savings on auxiliary tasks while maintaining temperature support for deterministic outputs.
  - **EMAR Analysis**: Employs a 3-pass consensus with domain validation for medication record extraction. Features admin review for non-administration codes (R=Refused, NH=Not Home, SA=Self Administered, F/FA=Family Administered, MU=Medication Unavailable). Includes time gap detection (excluding once-daily meds), PRN code support, pre-analysis validation of document layout, and handling of blank entries. Office staff manual entries are tracked and reported.
  - **Optimized EMAR Agent**: Uses tiered model approach - GPT-5.1 for core metadata/entry extraction, GPT-4.1-mini for count validation, equivalence checks, drug interactions, and validation passes 2/3. Domain validation includes medication coverage, date coverage, code distribution, and refusal detection. Consensus merging for 85%+ agreement. Compact prompts with abbreviated JSON keys for cost and speed.
  - **Drug Interaction Alerts**: AI-powered detection of high-risk medication interactions with severity ratings. Includes 24-hour caching to prevent duplicate API calls for the same medication lists.
  - **Manual Correction UI**: Admin-only feature to correct AI extraction mistakes, storing corrections for audit and feeding them back into AI prompts for training.
  - **PRN Protocol Generation**: AI generates detailed PRN medication protocols.
- **Security Monitoring**: Tracks client IP addresses for active sessions and allows blocking malicious IPs.
- **PII Scrubbing**: Enhanced whitelisting to prevent over-redaction.
- **Plan Enhancer**: Generates comprehensive care plan content across 11 sections.
- **File Scanning**: All file uploads are scanned for malware using Cloudmersive Virus Scan API.
- **AI Cost Calculator**: Admin-only dashboard to monitor AI spending, API calls, and cost breakdown by feature.
- **Demo Mode**: Allows exploration with sample data without registration, with read-only restrictions.
- **Call Reconciliation**: Admin-only Excel processing tool for ECM call data. Removes unnecessary columns (A-E, G-I, K-T, U, V-W, Z-AD, AE, AH-AM, AP-BO, BR-DY, DZ, EA-FW), maps cancellation reasons to variation codes (Hospital→L1, More than 24hrs→L4, Less than 24hrs/Capacity→L5), marks empty Service Requirements as A1, and outputs a processed Excel file with a new "Variation Reason" column. The original Service Requirement (U) and Cancellation Reason (DZ) columns are removed after their values are used to generate the variation codes.

## External Dependencies

### Database
- PostgreSQL

### Authentication
- bcrypt
- express-session
- connect-pg-simple

### AI/External APIs
- OpenAI
- Google Generative AI
- Cloudmersive Virus Scan API

### Third-Party Services
- Stripe (optional)
- Nodemailer (optional)

### Frontend Libraries
- Recharts
- react-day-picker
- embla-carousel
- xlsx