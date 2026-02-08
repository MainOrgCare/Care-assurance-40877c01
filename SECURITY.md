# Security Notes

## Reporting a Vulnerability

If you discover a security issue, report it privately to the maintainers and avoid public disclosure until a fix is available.

## Current Posture

- Security headers and CSP are enforced via Helmet.
- API/auth/admin endpoints are rate limited.
- Request correlation IDs (`X-Request-ID`) are added for traceability.
- CSRF origin checks are enforced in production for state-changing requests.
- Sensitive API responses use no-cache headers.

## Dependency Risk: `xlsx`

The project currently depends on SheetJS Community Edition (`xlsx`), which has public advisories and no upstream fix published on npm at this time.

Risk mitigations implemented in this repository:
- mandatory safe wrapper usage (`server/utils/safe-xlsx.ts`, `client/src/lib/safe-xlsx.ts`)
- prototype-pollution key stripping for parsed worksheet objects
- strict workbook size limits before parsing to reduce ReDoS blast radius

Do not import raw `xlsx` directly in app code; use `SafeXLSX` wrappers.
