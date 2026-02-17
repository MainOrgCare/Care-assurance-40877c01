/**
 * Safe Error Message Helper
 *
 * Prevents leaking internal error details (database URIs, SQL, file paths)
 * to API consumers.  Raw messages are only exposed in development mode.
 *
 * @module server/utils/safeError
 */

/**
 * Return a client-safe error message.
 *
 * In development the original error string is returned for easier debugging.
 * In production only the `fallback` text is sent to prevent information
 * disclosure.
 */
export function safeErrorMessage(
  error: unknown,
  fallback = "Internal server error",
): string {
  if (process.env.NODE_ENV === "development") {
    return (
      (error instanceof Error ? error.message : String(error)) || fallback
    );
  }
  return fallback;
}
