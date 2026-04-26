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
// U4 round 1 (adv-u4-002, adv-u4-005) widened coverage:
// - `createRedactionStream` buffers partial lines across data events so a
//   cookie value split between two stream chunks cannot leak its trailing
//   half (see `scripts/capacity-local-worker.mjs` `attachRedactedLogPipe`).
// - Redaction patterns now cover OAuth artefacts (`access_token=`,
//   `refresh_token=`, `id_token=`), quote-delimited cookie/Bearer values,
//   JSON-shape `"*_token"/"*_secret"/"*_password"/"*_key"` payloads, and
//   common third-party secret env assignments (`NPM_TOKEN=`, `OPENAI_API_KEY=`,
//   etc.). Idempotency is preserved — previously scrubbed lines pass through
//   unchanged because every replacement rewrites the value to `[redacted]`.
//
// Kept free of Node runtime imports so unit tests can import this without any
// filesystem or child_process side effects.

const REDACTED = '[redacted]';

// `ks2_session=<value>` in a Cookie or Set-Cookie line. Stops at the next
// `;`, whitespace, quote, or end of line so later cookie flags (`Path`,
// `HttpOnly`) survive the scrub. Matches both unquoted and the value inside
// quote delimiters (the quote-delimited handler runs separately below so the
// surrounding quotes survive for log readability).
const COOKIE_PATTERN = /(ks2_session=)([^;\s"']+)/g;

// Quote-delimited cookie: `ks2_session="..."` or `ks2_session='...'`.
// Captures the quote so the replacement preserves the quote character.
const COOKIE_QUOTED_PATTERN = /(ks2_session=)(["'])([^"']*)\2/g;

// `Bearer <token>` in an Authorization header (case-insensitive prefix). Stops
// at whitespace, `;`, `,`, quote, or the end of line. `;` is included so the
// artefact class is preserved separately from an immediately-following cookie
// flag (`;` is a cookie-header separator), keeping the filter idempotent when
// a line ends `Bearer [redacted]; access_token=...`.
const BEARER_PATTERN = /(Bearer\s+)([^\s;,"']+)/gi;

// Quote-delimited Bearer: `"Bearer <token>"` or `'Bearer <token>'`. Preserves
// the surrounding quote characters.
const BEARER_QUOTED_PATTERN = /(["'])(Bearer\s+)([^"']+)(\1)/gi;

// Known-named secret env assignments. Conservative: only the widely-recognised
// variables that operators commonly have in local shells. Matches the
// allowlist-rationale in `sanitiseWranglerEnv` — anything the env sanitiser
// is expected to strip, the redaction filter also scrubs from any line that
// prints a `KEY=value` pair.
const NAMED_SECRET_PATTERN = /(CLOUDFLARE_API_TOKEN|cloudflare_api_token|CF_API_TOKEN|CLOUDFLARE_TOKEN|NPM_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|DATABASE_PASSWORD|OAUTH_CLIENT_SECRET)=([^\s,"']+)/g;

// OAuth artefacts (access_token, refresh_token, id_token, api_key, api_token).
// Case-insensitive. Stops at whitespace, `;`, `&`, quote, or end of line.
const OAUTH_PATTERN = /(access_token|refresh_token|id_token|api_key|api_token)=([^\s;&"']+)/gi;

// JSON-shape `"somekey_token": "value"` (also `_secret`, `_password`, `_key`).
// The key regex is anchored by the surrounding quotes so only keys that carry
// a token-shape suffix are scrubbed. Idempotent because the replacement keeps
// the key and injects `[redacted]` as the value. Case-insensitive.
const JSON_SECRET_PATTERN = /"([A-Za-z0-9_]*(?:token|secret|password|key))"(\s*:\s*)"([^"]*)"/gi;

/**
 * Redact token-shaped artefacts in a single log line.
 *
 * Keeps the cookie/header name and the leading `=` or `Bearer ` separator so
 * operators can still see the artefact class that was scrubbed; only the value
 * is replaced with `[redacted]`. Idempotent — previously redacted lines pass
 * through unchanged because the patterns only match non-bracket, non-whitespace
 * payloads (and the JSON-shape pattern rewrites the value in place).
 */
export function redactLogLine(line) {
  if (typeof line !== 'string') return line;
  let result = line;

  // Quoted variants first so the surrounding quotes are preserved. Running the
  // quoted patterns before the unquoted ones avoids the unquoted regex
  // mistakenly consuming the first quote and breaking the pair.
  result = result.replace(COOKIE_QUOTED_PATTERN, (_full, prefix, quote, value) => {
    if (value === REDACTED) return `${prefix}${quote}${REDACTED}${quote}`;
    return `${prefix}${quote}${REDACTED}${quote}`;
  });
  result = result.replace(BEARER_QUOTED_PATTERN, (_full, openQuote, prefix, _value, closeQuote) => {
    return `${openQuote}${prefix}${REDACTED}${closeQuote}`;
  });

  // JSON-shape secrets before unquoted patterns so a `"access_token":"..."`
  // match is consumed intact (the OAuth unquoted pattern would otherwise leave
  // the value unscrubbed because `"` is a terminator there).
  result = result.replace(JSON_SECRET_PATTERN, (_full, key, separator, _value) => {
    return `"${key}"${separator}"${REDACTED}"`;
  });

  // Unquoted assignments.
  result = result.replace(COOKIE_PATTERN, (_full, prefix, _value) => `${prefix}${REDACTED}`);
  result = result.replace(BEARER_PATTERN, (_full, prefix, _value) => `${prefix}${REDACTED}`);
  result = result.replace(NAMED_SECRET_PATTERN, (_full, prefix, _value) => `${prefix}=${REDACTED}`);
  result = result.replace(OAUTH_PATTERN, (_full, prefix, _value) => `${prefix}=${REDACTED}`);

  return result;
}

/**
 * Redact an entire buffer/chunk of log text, preserving newlines so downstream
 * log consumers (`tail -f`, `jq`) still see line boundaries.
 *
 * NOTE: when chunks arrive mid-line (a real `child.stdout` event can split a
 * cookie value between two buffers), prefer `createRedactionStream` which
 * buffers partial lines across writes. `redactLogChunk` only sees what's in
 * its argument and cannot know whether a trailing fragment continues in a
 * subsequent call.
 */
export function redactLogChunk(chunk) {
  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  // Keep line terminators intact — split on `\n` then rejoin, applying the
  // per-line scrub. Empty tail (trailing newline) is preserved.
  const parts = text.split(/(\n)/);
  return parts.map((part) => (part === '\n' ? part : redactLogLine(part))).join('');
}

/**
 * Create a stateful redaction pipe that buffers partial lines across chunks.
 *
 * Contract (adv-u4-002 regression — prevents second-half leaks when a secret
 * value spans two `data` events):
 *
 * - `write(chunk)` accumulates the chunk into an internal buffer. Complete
 *   lines (up to and including the trailing `\n`) are scrubbed and forwarded
 *   to the sink's `write`. Any trailing fragment without a newline stays in
 *   the buffer until the next `write` or `end` call.
 * - `end()` flushes the residual buffer through the redaction filter even
 *   when it does not end in a newline, then calls the sink's `end` (if the
 *   sink exposes one).
 *
 * The sink is any object exposing `write(string)` and optionally `end()`.
 * Typical callers pass a `fs.WriteStream`. Tests pass a plain `{write(s)}`.
 */
export function createRedactionStream(sink) {
  if (!sink || typeof sink.write !== 'function') {
    throw new TypeError('createRedactionStream requires a sink with a `write` method');
  }
  let buffer = '';
  let ended = false;

  return {
    write(chunk) {
      if (ended) return;
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const lastNewline = buffer.lastIndexOf('\n');
      if (lastNewline < 0) return;
      const completed = buffer.slice(0, lastNewline + 1);
      buffer = buffer.slice(lastNewline + 1);
      sink.write(redactLogChunk(completed));
    },
    end() {
      if (ended) return;
      ended = true;
      if (buffer.length > 0) {
        sink.write(redactLogChunk(buffer));
        buffer = '';
      }
      if (typeof sink.end === 'function') {
        return sink.end();
      }
      return undefined;
    },
  };
}
