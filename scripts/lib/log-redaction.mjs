// U4 (capacity-release-gates-and-telemetry): shared redaction filter used by
// `scripts/capacity-local-worker.mjs` when persisting wrangler stdout/stderr
// under `reports/capacity/local-worker-stdout.log`.
//
// Design contract:
// - Patterns are conservative: they match well-formed artefacts produced by the
//   Worker + wrangler logging surfaces we already control. Matching benign text
//   (e.g. random UUIDs in debug output that happen to look like session ids) is
//   avoided so operators can still correlate real-world runs.
// - Redaction is idempotent: a line that already reads `[redacted]` passes
//   through unchanged.
// - Token values are replaced with the literal string `[redacted]` (no hash,
//   no truncation, no hint) so `rg '\[redacted\]' reports/capacity/` always
//   surfaces the same marker.
//
// Kept free of Node runtime imports so unit tests can import this without any
// filesystem or child_process side effects.

const REDACTED = '[redacted]';

// `ks2_session=<value>` in a Cookie or Set-Cookie line. Stops at the next
// `;`, whitespace, or end of line so later cookie flags (`Path`, `HttpOnly`)
// survive the scrub.
const COOKIE_PATTERN = /(ks2_session=)([^;\s"']+)/g;

// `Bearer <token>` in an Authorization header (case-insensitive prefix). Stops
// at whitespace or the end of line.
const BEARER_PATTERN = /(Bearer\s+)([^\s"']+)/gi;

// `CLOUDFLARE_API_TOKEN=<value>` as it would appear in a logged `env=...` line
// or a dumped process environment. Defence-in-depth; the spawned wrangler
// child should never receive the token in the first place
// (`sanitiseWranglerEnv` strips it). Stops at whitespace, comma, or end.
const API_TOKEN_PATTERN = /(CLOUDFLARE_API_TOKEN=)([^\s,]+)/g;

/**
 * Redact token-shaped artefacts in a single log line.
 *
 * Keeps the cookie/header name and the leading `=` or `Bearer ` separator so
 * operators can still see the artefact class that was scrubbed; only the value
 * is replaced with `[redacted]`. Idempotent — previously redacted lines pass
 * through unchanged because the patterns only match non-bracket, non-whitespace
 * payloads.
 */
export function redactLogLine(line) {
  if (typeof line !== 'string') return line;
  return line
    .replace(COOKIE_PATTERN, (_full, prefix, value) => {
      if (value === REDACTED) return `${prefix}${REDACTED}`;
      return `${prefix}${REDACTED}`;
    })
    .replace(BEARER_PATTERN, (_full, prefix, value) => {
      if (value === REDACTED) return `${prefix}${REDACTED}`;
      return `${prefix}${REDACTED}`;
    })
    .replace(API_TOKEN_PATTERN, (_full, prefix, value) => {
      if (value === REDACTED) return `${prefix}${REDACTED}`;
      return `${prefix}${REDACTED}`;
    });
}

/**
 * Redact an entire buffer/chunk of log text, preserving newlines so downstream
 * log consumers (`tail -f`, `jq`) still see line boundaries.
 */
export function redactLogChunk(chunk) {
  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  // Keep line terminators intact — split on `\n` then rejoin, applying the
  // per-line scrub. Empty tail (trailing newline) is preserved.
  const parts = text.split(/(\n)/);
  return parts.map((part) => (part === '\n' ? part : redactLogLine(part))).join('');
}
