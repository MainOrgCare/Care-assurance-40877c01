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
- **AI-Powered Features**: EMAR analysis, risk assessment, and plan enhancement use AI (GPT-5.1, GPT-4o-mini). Features utilize Server-Sent Events (SSE) for real-time updates and include AI failover logic.
  - **EMAR Analysis**: Employs a 3-pass consensus with domain validation for medication record extraction, including PRN code support and a refusal grouping system with admin review. Features time gap detection (excluding once-daily meds), pre-analysis validation of document layout, and handling of blank entries. Office staff manual entries are tracked and reported. Strict PRN code validation and administered medication code validation are enforced.
  - **Optimized EMAR Agent**: Uses GPT-5.1 with 2-pass validation (reduced from 3 parallel passes - saves ~33% tokens). Domain validation includes medication coverage, date coverage, code distribution, and refusal detection. Consensus merging for 85%+ agreement. Compact prompts with abbreviated JSON keys for cost and speed.
  - **Drug Interaction Alerts**: AI-powered detection of high-risk medication interactions with severity ratings.
  - **Manual Correction UI**: Admin-only feature to correct AI extraction mistakes, storing corrections for audit and feeding them back into AI prompts for training.
  - **PRN Protocol Generation**: AI generates detailed PRN medication protocols.
- **Security Monitoring**: Tracks client IP addresses for active sessions and allows blocking malicious IPs.
- **PII Scrubbing**: Enhanced whitelisting to prevent over-redaction.
- **Plan Enhancer**: Generates comprehensive care plan content across 11 sections.
- **File Scanning**: All file uploads are scanned for malware using Cloudmersive Virus Scan API.
- **AI Cost Calculator**: Admin-only dashboard to monitor AI spending, API calls, and cost breakdown by feature.
- **Demo Mode**: Allows exploration with sample data without registration, with read-only restrictions.

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