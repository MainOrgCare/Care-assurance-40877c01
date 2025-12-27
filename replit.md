# CareAssurance - MAR Analysis & Care Planning

## Overview

CareAssurance is a healthcare compliance management application designed for care facilities. It provides automated CQC compliance analysis, medication administration record (MAR) auditing, care plan generation, and care worker performance tracking. The application prioritizes privacy with features like automatic data sealing, time-based record redaction, and role-based access control. Its purpose is to streamline compliance, improve care planning, and enhance operational efficiency in care facilities, ultimately reducing manual labor costs and improving service user outcomes.

## User Preferences

Preferred communication style: Simple, everyday language.
**Homepage/Marketing Changes**: Remove all free trial messaging, fake reviews/testimonials, and NHS Approved Supplier claims. Keep only authentic content (CQC Compliant, GDPR Certified badges).

## Recent Changes (December 27, 2025)

- **Added ROI Calculator**: Interactive calculator on homepage with slider for number of service users (1-200). Shows annual time/money savings comparing manual vs AI-powered task completion at £14.50/hr office staff rate. Displays task breakdown for Care Plans (12/yr), Initial Assessments (1/yr), Risk Assessments (2/yr), EMAR Audits (48/yr), and Visit Audits (48/yr).
- **Fixed Care Plan React Error**: Resolved "Objects are not valid as React child" error by ensuring all care plan fields are properly typed as strings or string arrays before rendering. Added type guards to convert objects to JSON strings.
- **Removed Light Theme**: Removed light colour option from theme selector. Now offers Dark, Midnight, and Ocean themes only.
- **Cleaned Up Homepage**: 
  - Removed all "free trial" messaging and call-to-action buttons
  - Removed fake testimonials/reviews section entirely
  - Removed "NHS Approved Supplier" badge (kept only CQC Compliant and GDPR Certified)
  - Removed "Limited time" offers and free setup/training promises
  - Simplified final CTA to just "Sign In" button with authentic copy
- **Enhanced Dashboard**: Added theme selector visual with all available options and quick action cards for key features

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query for server state, React Context for local state
- **UI Components**: shadcn/ui built on Radix UI
- **Styling**: Tailwind CSS v4 with custom "liquid glass" dark theme and three color palettes (Dark, Midnight, Ocean)
- **Build Tool**: Vite
- **Available Themes**: Dark, Midnight, Ocean (Light theme removed)

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ES modules)
- **Authentication**: Custom session-based auth with bcrypt hashing and PostgreSQL session store. Supports "admin" and "staff" roles with a user approval workflow.
- **API Pattern**: RESTful JSON API under `/api`

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation. Schema is shared between frontend and backend.
- **Key Tables**: users, careWorkers, discrepancies, audits, adminAlerts, activeSessions, blockedIps, emarRefusalReviews, fileScanLogs.

### Key Design Patterns & Features
- **Shared Schema**: Database schema and Zod validators defined once and used by both client and server.
- **Protected Routes**: Client-side route protection.
- **Glass Morphism UI**: Dark theme with translucent effects and gradient backgrounds.
- **AI-Powered Features**: EMAR analysis, risk assessment, and plan enhancement utilize AI (GPT-5.1) for content generation and data extraction. Care plan generation uses GPT-4o-mini for faster response times. These features use Server-Sent Events (SSE) for real-time progress updates.
- **Chunked Care Plan Generation**: Care plans are generated section-by-section (12 sections total), with each section streamed to the frontend immediately upon completion. This provides real-time visual feedback as sections appear incrementally.
- **AI Failover**: Server-side AI wrapper (server/services/aiClient.ts) with automatic failover from Replit AI to direct OpenAI key on billing/rate limit/connection errors.
- **EMAR Analysis**: Employs a simplified 3-pass consensus with domain validation for accurate medication record extraction. Includes PRN code support and a refusal grouping system with an admin review process. Features include:
  - **Time Gap Detection**: Only applies to PRN medications - scheduled medications are excluded since each time slot row is a discrete scheduled dose, not cumulative dosing. Includes date validation and duplicate tolerance to prevent false positives.
  - **Pre-Analysis Validation**: Regex-based pre-parsing extracts dates and time slots from document text BEFORE AI extraction. If AI date count differs significantly from pre-parsed count, the system uses pre-parsed dates. Logs a summary of days, medications, and time slots per medication.
  - **Blank Entry Handling**: Blank cells in the EMAR grid are completely ignored - they do not create discrepancies and are not tracked. Only cells with actual codes (AD, AS, R, MU, etc.) are analyzed.
  - **Unified Refusal Review**: Single "Reasons Not Administered" accordion with nested sections for each refusal code type (R, MU, NH, FA, SA, PRN-R, etc.)
  - **Batch Refusal Review Workflow**: Mark each refusal as acceptable or escalate, then submit to persist all decisions to the database via `/api/refusal-reviews/bulk`. Escalated items are added to main discrepancies.
  - **Escalation Feature**: Users can select refusals with inadequate reasoning and escalate them to Main Discrepancies
  - **Medication Equivalence Detection**: AI-powered detection of duplicate medications under different names (e.g., Oxycodone = Oxypro MR)
  - **PRN Protocol Generation**: AI-powered generation of PRN medication protocols when existing protocols are incomplete or not up to standard. Generates: medication name, dose, route, frequency, max dose in 24 hours, minimum time between doses, special instructions, reasons for administration, predictable side effects, and additional comments. Available via the "Generate" button in the PRN medications table.
- **Security Monitoring**: Tracks client IP addresses for active sessions, allowing admins to block malicious IPs.
- **PII Scrubbing**: Enhanced whitelisting in PII scrubbing to prevent over-redaction of common terms.
- **Plan Enhancer**: Generates comprehensive care plan content across 11 sections in a first-person perspective.
- **File Scanning**: All file uploads are scanned for malware using Cloudmersive Virus Scan API with SHA256 hash caching.
- **ROI Calculator**: Interactive homepage tool with slider for service user count (1-200). Calculates annual time/money savings based on:
  - Care Plans: 12/year (90min manual vs 60sec AI)
  - Initial Assessments: 1/year (150min manual vs 90sec AI)
  - Risk Assessments: 2/year (180min manual vs 120sec AI)
  - EMAR Audits: 48/year (45min manual vs 30sec AI)
  - Visit Audits: 48/year (30min manual vs 30sec AI)
  - Office staff rate: £14.50/hr
  - Result: ~85.5 hours saved per service user per year = ~£1,240 saved

## External Dependencies

### Database
- PostgreSQL

### Authentication
- bcrypt
- express-session
- connect-pg-simple (for PostgreSQL session store)

### AI/External APIs
- OpenAI (via `openai` package)
- Google Generative AI (via `@google/generative-ai` package)
- Cloudmersive Virus Scan API (for malware scanning)

### Third-Party Services
- Stripe (for payment processing, if enabled)
- Nodemailer (for email sending, if enabled)

### Frontend Libraries
- Recharts (data visualization)
- react-day-picker (calendar components)
- embla-carousel (carousels)
- xlsx (spreadsheet handling)

### Environment Variables
- `DATABASE_URL` (required)
- `SESSION_SECRET` (required)
- `CLOUDMERSIVE_API_KEY` (required for file scanning)
- Optional: OpenAI API key, Google AI API key, Stripe keys, SMTP configuration.