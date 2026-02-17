# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in CareAssurance, please report it responsibly.

**Do NOT open a public GitHub issue.**

Instead, email: **security@careassurance.uk**

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested remediation (if any)

We aim to acknowledge reports within **48 hours** and provide an initial assessment within **5 business days**.

---

## Security Architecture

### Authentication & Session Management

| Control | Implementation |
|---------|---------------|
| Password hashing | bcrypt (cost factor 12) |
| Password policy | NIST SP 800-63B compliant — 12+ characters, complexity rules, common password blocklist |
| Login throttling | Progressive lockout — 5 attempts then 1 min, escalating to 15 min |
| Sessions | Server-side via `express-session` with secure, httpOnly, sameSite cookies |
| Session expiry | Configurable idle timeout (default: 30 minutes) |
| CSRF protection | Origin/Referer header validation on mutating requests |

### Transport Security

| Control | Implementation |
|---------|---------------|
| TLS | Enforced in production (HSTS with 1-year max-age) |
| Upgrade insecure | CSP `upgrade-insecure-requests` directive in production |
| Secure cookies | `secure: true` flag in production |

### HTTP Security Headers (via Helmet)

| Header | Value |
|--------|-------|
| Content-Security-Policy | Strict; `script-src 'self'` in production (no inline/eval) |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` (via `frame-ancestors: 'none'`) |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | Camera, microphone, geolocation disabled |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |

### Rate Limiting

| Endpoint group | Limit |
|---------------|-------|
| General API | 1,000 requests / 15 minutes per IP |
| Authentication | 5 requests / 15 minutes per IP |
| Admin actions | 10 requests / hour per IP |
| Copilot API | 30 requests / minute per API key |

### Data Protection (UK GDPR)

- **Subject Access Requests (SAR)** — built-in workflow with admin review
- **Right to Erasure** — soft-delete with cryptographic erasure verification
- **Consent Management** — granular consent tracking per purpose
- **Data Retention** — configurable retention policies with automated purge
- **Audit Logging** — security events logged with timestamps, actors, and outcomes
- **Privacy by Design** — PII scoped to minimum necessary; AI data scrubbing before analysis

### API Security

- All endpoints require authentication (except health checks and public contact form)
- Role-based access control (RBAC): `admin`, `manager`, `user`, `viewer`
- Demo mode restrictions (`blockDemoWrites` middleware)
- Request ID correlation (`X-Request-ID`) on all requests
- JSON body size limits (10 MB default, configurable per-route)
- Input sanitisation on all user-provided strings

---

## Dependency Risk: `xlsx`

The project depends on SheetJS Community Edition (`xlsx`), which has public advisories and no upstream fix published on npm at this time.

Risk mitigations implemented in this repository:
- Mandatory safe wrapper usage (`server/utils/safe-xlsx.ts`, `client/src/lib/safe-xlsx.ts`)
- Prototype-pollution key stripping for parsed worksheet objects
- Strict workbook size limits before parsing to reduce ReDoS blast radius

**Do not import raw `xlsx` directly in application code; use `SafeXLSX` wrappers.**

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

---

## Compliance

CareAssurance is designed to meet:

- **UK GDPR** (Data Protection Act 2018)
- **CQC Digital Standards** (Care Quality Commission)
- **NIST SP 800-63B** (Digital Identity Guidelines — password policy)
- **OWASP Top 10** (Web Application Security Risks)

For GDPR-specific documentation, see:
- [GDPR Privacy Notice](GDPR_PRIVACY_NOTICE.md)
- [GDPR Lawful Basis](GDPR_LAWFUL_BASIS.md)
- [GDPR DPIA](GDPR_DPIA.md)
- [GDPR Logging Compliance](GDPR_LOGGING_COMPLIANCE.md)
