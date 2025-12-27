# CareAssurance - MAR Analysis & Care Planning

## Overview

CareAssurance is a healthcare compliance management application designed for care facilities. It provides automated CQC compliance analysis, medication administration record (MAR) auditing, care plan generation, and care worker performance tracking. The application prioritizes privacy with features like automatic data sealing, time-based record redaction, and role-based access control. Its purpose is to streamline compliance, improve care planning, and enhance operational efficiency in care facilities, ultimately reducing manual labor costs and improving service user outcomes.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query for server state, React Context for local state
- **UI Components**: shadcn/ui built on Radix UI
- **Styling**: Tailwind CSS v4 with custom "liquid glass" dark theme and multiple color palettes (Dark, Midnight, Ocean, Light)
- **Build Tool**: Vite

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
- **AI-Powered Features**: EMAR analysis, care plan generation, risk assessment, and plan enhancement utilize AI (GPT-5.1) for content generation and data extraction. These features use Server-Sent Events (SSE) for real-time progress updates.
- **AI Failover**: Server-side AI wrapper (server/services/aiClient.ts) with automatic failover from Replit AI to direct OpenAI key on billing/rate limit/connection errors.
- **EMAR Analysis**: Employs a simplified 3-pass consensus with domain validation for accurate medication record extraction. Includes PRN code support, time gap fixes, and a refusal grouping system with an admin review process. Features include:
  - **Pre-Analysis Validation**: Regex-based pre-parsing extracts dates and time slots from document text BEFORE AI extraction. If AI date count differs significantly from pre-parsed count, the system uses pre-parsed dates. Logs a summary of days, medications, and time slots per medication.
  - **Call Cancelled Handling**: Blank cells in the EMAR grid indicate the care call was cancelled - these are tracked as `callCancelledCount` but NOT flagged as discrepancies. No further action is required.
  - **Missing Scheduled Dose Detection (CHECK 6b)**: For scheduled medications with multiple daily time slots (e.g., Amoxicillin 3x daily), the system detects when only some slots have entries. If 08:00 and 20:30 have entries but 12:00 is missing, it flags: "Missing scheduled dose - 12:00-12:30 slot has no entry while other slots were administered"
  - **Unified Refusal Review**: Single "Reasons Not Administered" accordion with nested sections for each refusal code type (R, MU, NH, FA, SA, PRN-R, etc.)
  - **Batch Refusal Review Workflow**: Mark each refusal as acceptable or escalate, then submit to persist all decisions to the database via `/api/refusal-reviews/bulk`. Escalated items are added to main discrepancies.
  - **Escalation Feature**: Users can select refusals with inadequate reasoning and escalate them to Main Discrepancies
  - **Medication Equivalence Detection**: AI-powered detection of duplicate medications under different names (e.g., Oxycodone = Oxypro MR)
  - **PRN Protocol Generation**: AI-powered generation of PRN medication protocols when existing protocols are incomplete or not up to standard. Generates: medication name, dose, route, frequency, max dose in 24 hours, minimum time between doses, special instructions, reasons for administration, predictable side effects, and additional comments. Available via the "Generate" button in the PRN medications table.
- **Security Monitoring**: Tracks client IP addresses for active sessions, allowing admins to block malicious IPs.
- **PII Scrubbing**: Enhanced whitelisting in PII scrubbing to prevent over-redaction of common terms.
- **Plan Enhancer**: Generates comprehensive care plan content across 11 sections in a first-person perspective.
- **File Scanning**: All file uploads are scanned for malware using Cloudmersive Virus Scan API with SHA256 hash caching.
- **ROI Calculator**: Interactive tool to demonstrate cost savings and return on investment from using CareAssurance.

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