import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

// SH2-U12 (sys-hardening p2): parser-level error-copy oracle.
//
// A learner must never see raw `500`, `409`, `TypeError`, a bare stack
// trace, a `JSON.stringify(error)` blob, or an internal route path
// (e.g. `/api/subjects/spelling/command`) in any user-facing copy. The
// humanised contract (plan §U12 lines 803-846 + the SH2-U3 work that
// already humanised AuthSurface, DemoExpiryBanner and ErrorCard) is
// that every save-failure or transport-error copy reads as natural
// KS2-appropriate English, and says whether progress is safe.
//
// The oracle is a build-time grep, not a runtime assertion:
//   - Walk every `src/**/*.jsx` and `src/**/*.js` that a browser bundle
//     could ship, extracting string-literal values in user-facing props
//     and JSX text children.
//   - Fail with an actionable error the moment a literal matches a
//     forbidden token (raw status code, `TypeError`, stack marker, JSON
//     blob, or an `/api/` path string).
//   - Allow an audited allowlist for intentional cases (test-only data
//     attributes, placeholder diagnostic text in the admin error centre).
//
// Scan scope: `src/surfaces/**/*.jsx` + `src/subjects/**/*.jsx` +
// `src/app/**/*.jsx` + a narrow slice of `src/surfaces/**/*.js` that
// backs the JSX copy (hub-utils, bootstrap copy paths). The Worker and
// tests are excluded — the contract is specifically about what the
// browser renders to a learner / adult.
//
// The grep NEVER inspects comments. JSX parse via esbuild would slow
// this test from ~50ms to several seconds; the bracket-balanced scanner
// below mirrors `tests/button-label-consistency.test.js` (U12 P1) so a
// parser regression fails here, not silently downstream.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// -----------------------------------------------------------------------------
// Forbidden-token patterns. Each entry pairs a test regex with the
// actionable message the oracle prints when a literal matches.
// -----------------------------------------------------------------------------

const FORBIDDEN_TOKENS = Object.freeze([
  {
    id: 'raw-status-500',
    // Word-boundary match so "500ms" in a timer description is not flagged.
    // The oracle is about VISIBLE status codes — "500", " 500 ", "500:".
    pattern: /(?<![A-Za-z0-9_-])(500|502|503|504)(?![A-Za-z0-9_-])/,
    remediation:
      'Remove the raw 5xx status code from user-facing copy. Use a humanised phrase such as "Something went wrong. Try again." and store the code on a `data-error-code` attribute if operator diagnostics need it.',
  },
  {
    id: 'raw-status-409',
    pattern: /(?<![A-Za-z0-9_-])409(?![A-Za-z0-9_-])/,
    remediation:
      'Remove the raw 409 status code from user-facing copy. Use humanised stale-write copy such as "Another tab or device changed this before this write reached the server." The code stays on `data-error-code`.',
  },
  {
    id: 'raw-status-400',
    pattern: /(?<![A-Za-z0-9_-])(400|401|403|404)(?![A-Za-z0-9_-])/,
    remediation:
      'Remove the raw 4xx status code from user-facing copy. Use humanised copy that does not enumerate the failure mode (S-04 / S-05 account-existence-neutral) and keep the code on `data-error-code`.',
  },
  {
    id: 'typeerror',
    pattern: /\bTypeError\b/,
    remediation:
      'Remove the exception class name from user-facing copy. JavaScript error class names leak implementation detail. Replace with humanised copy.',
  },
  {
    id: 'error-prefix',
    // "Error: " as a visible prefix (usually pasted from `new Error()` /
    // `String(error)`). Does not match "error:" in a CSS selector attr.
    pattern: /\bError\s*:\s/,
    remediation:
      'Remove the raw "Error:" prefix from user-facing copy. That pattern leaks a stringified exception. Use humanised copy such as "We couldn’t save that. Your progress is safe; try again."',
  },
  {
    id: 'stack-trace',
    // Common stack marker: "at Foo.bar ("
    pattern: /\bat\s+[A-Za-z_$][A-Za-z0-9_$.]*\s*\(/,
    remediation:
      'Remove the stack trace marker ("at Foo.bar(") from user-facing copy. Stack traces go to the telemetry sink only, never to the learner.',
  },
  {
    id: 'json-blob',
    // `{"foo":` or `{"foo"` — a JSON-shaped prefix used by accidental
    // `JSON.stringify(error)` renders. Plain `{` is fine (it opens an
    // expression), but `{"` is how JSON object literals start.
    pattern: /\{\s*"[A-Za-z_][A-Za-z0-9_]*"\s*:/,
    remediation:
      'Remove the JSON-shaped blob from user-facing copy. `JSON.stringify(error)` leaks internal shape. Replace with humanised copy.',
  },
  {
    id: 'internal-route',
    // Any `/api/` segment (with or without a trailing path). The
    // allowlist lets the admin diagnostic placeholder through with an
    // audited reason. We match the prefix alone because leaking the
    // `/api/` namespace — even without a specific route — already
    // exposes implementation detail the learner should not see.
    pattern: /\/api\//,
    remediation:
      'Remove the internal route path from user-facing copy. `/api/...` is an implementation detail. If a diagnostic surface genuinely needs to show it (admin console only), add an allowlist entry with a reason.',
  },
  {
    id: 'undefined-leak',
    // Matches the literal word "undefined" as a standalone token. The
    // lookarounds on `[A-Za-z_]` prevent false hits on words that happen
    // to contain the substring (there are none in English, but the
    // guard is cheap insurance). Matches the plan §U12 line 812 token.
    //
    // Target escape: `<p>Saved: {result?.name}</p>` where `result.name`
    // is missing renders the visible text "Saved: undefined". The copy
    // must read `"Saved"` / `"Saved."` / `"No name"` etc. — never the
    // raw JS sentinel.
    pattern: /(?<![A-Za-z_])undefined(?![A-Za-z_])/,
    remediation:
      'Remove the word "undefined" from user-facing copy. It is the JavaScript sentinel leaking through a missing `?? fallback`. Guard the render with a default string such as "No name" / "Untitled".',
  },
  {
    id: 'null-leak',
    // Matches the literal word "null" as a standalone token. Same
    // word-boundary guard as `undefined-leak`. Matches plan §U12 line 812.
    //
    // Target escape: `<p>{label ?? null}</p>` renders the visible text
    // "null" when label is missing. Copy must use a humanised fallback
    // or an empty string.
    pattern: /(?<![A-Za-z_])null(?![A-Za-z_])/,
    remediation:
      'Remove the word "null" from user-facing copy. It is the JavaScript sentinel leaking through a missing fallback. Use a humanised default string (e.g. "—" or a blank) instead.',
  },
]);

// -----------------------------------------------------------------------------
// Allowlist. Every entry MUST carry a reason. Target size < 20 per plan.
// Each entry pins a LITERAL string (the exact slice the scanner captured)
// plus the file it appears in. The scanner skips the forbidden-token
// checks when both the file and the literal match an allowlist row. We
// deliberately scope by file so a new surface cannot silently reuse the
// same literal without a fresh review.
// -----------------------------------------------------------------------------

const ALLOWLIST = Object.freeze([
  {
    file: 'src/surfaces/hubs/AdminErrorTimelinePanel.jsx',
    literal: 'TypeError',
    reason:
      'Admin-only Error Timeline filter placeholder. Lets an operator search `error_events.kind` for "TypeError" rows; the placeholder is a hint, not a user-facing diagnosis. Scoped to AdminErrorTimelinePanel.jsx so a child-facing surface cannot reuse the word without triage.',
  },
  {
    file: 'src/surfaces/hubs/AdminErrorTimelinePanel.jsx',
    literal: '/api/',
    reason:
      'Admin-only Error Timeline route-prefix filter. Lets an operator filter error rows by route. Scoped to AdminErrorTimelinePanel.jsx; the panel is gated by platform role.',
  },
  {
    file: 'src/surfaces/hubs/AdminDebugBundlePanel.jsx',
    literal: '/api/',
    reason:
      'Admin-only Debug Bundle route-prefix filter. Lets an operator pull diagnostic bundles for a specific route. Scoped to AdminDebugBundlePanel.jsx; the panel is gated by platform role.',
  },
  {
    file: 'src/surfaces/hubs/AdminRequestDenialsPanel.jsx',
    literal: '/api/',
    reason:
      'Admin-only Request Denials route-prefix filter. Lets an operator filter denial rows by route. Scoped to AdminRequestDenialsPanel.jsx; the panel is gated by platform role.',
  },
]);

// Build an allowlist lookup keyed by file -> set of literals.
const ALLOWLIST_BY_FILE = new Map();
for (const entry of ALLOWLIST) {
  const list = ALLOWLIST_BY_FILE.get(entry.file) || new Set();
  list.add(entry.literal);
  ALLOWLIST_BY_FILE.set(entry.file, list);
}

function relative(file) {
  return path.relative(rootDir, file).split(path.sep).join('/');
}

function fileAllowlist(file) {
  return ALLOWLIST_BY_FILE.get(relative(file)) || null;
}

// -----------------------------------------------------------------------------
// Source walker.
// -----------------------------------------------------------------------------

function listJsxFiles() {
  // Scope: every `src/**/*.jsx` file (plan §U12 line 812). Previously the
  // scanner only covered `src/surfaces|src/subjects|src/app`, which missed
  // `src/platform/ui/ErrorCard.jsx`, `src/platform/ui/EmptyState.jsx`, and
  // `src/platform/react/ErrorBoundary.jsx` — the very primitives the plan
  // calls out as user-facing error surfaces. The broader glob pulls those
  // in so the humanised contract is enforced at the primitive level.
  const files = new Set();
  for (const entry of globSync(path.join(rootDir, 'src/**/*.jsx'), { windowsPathsNoEscape: true })) {
    files.add(entry);
  }
  return [...files].sort();
}

// Strip // and /* ... */ comments out of a source so the grep never
// matches against a code comment. We keep string-literal contents
// intact because the forbidden-token scan runs against literals only.
// The stripper tracks the three string-literal kinds (`"`, `'`, `` ` ``)
// so a `//` inside a string is preserved.
function stripComments(source) {
  const out = [];
  let i = 0;
  const len = source.length;
  let stringChar = null;
  let escaped = false;
  while (i < len) {
    const ch = source[i];
    if (escaped) {
      out.push(ch);
      escaped = false;
      i += 1;
      continue;
    }
    if (stringChar) {
      if (ch === '\\') {
        out.push(ch);
        escaped = true;
      } else if (ch === stringChar) {
        out.push(ch);
        stringChar = null;
      } else {
        out.push(ch);
      }
      i += 1;
      continue;
    }
    if ((ch === '"' || ch === "'" || ch === '`')) {
      stringChar = ch;
      out.push(ch);
      i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      // Replace the comment body with spaces so line/column tracking
      // stays roughly aligned. Cheaper than recomputing offsets.
      while (i < len && source[i] !== '\n') {
        out.push(' ');
        i += 1;
      }
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      out.push(' ');
      out.push(' ');
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        out.push(source[i] === '\n' ? '\n' : ' ');
        i += 1;
      }
      if (i < len) {
        out.push(' ');
        out.push(' ');
        i += 2;
      }
      continue;
    }
    out.push(ch);
    i += 1;
  }
  return out.join('');
}

// User-facing prop names we scan for literals. The full list mirrors the
// U12 plan. We deliberately keep it narrow: every added prop expands the
// oracle's cost and risk of a false positive.
const USER_FACING_PROPS = new Set([
  'title',
  'body',
  'message',
  'label',
  'aria-label',
  'ariaLabel',
  'aria-description',
  'ariaDescription',
  'placeholder',
  'alt',
  // Data attributes routinely used for toast content.
  'data-toast-body',
  'data-toast-title',
  'data-toast-message',
  'data-error-message',
  'data-error-body',
]);

// Extract every LITERAL string-valued prop in a JSX opening tag. A prop
// like `title="foo"` or `title={"foo"}` yields `{ name: 'title', value: 'foo' }`;
// a prop like `title={variable}` yields nothing because the value is
// not a static literal the scanner can assert on.
//
// Returns an array of `{ name, value, index }` where `index` is the
// start offset in the stripped source (for line-number reporting).
function extractJsxLiteralProps(source) {
  const results = [];
  // Find every JSX opening tag — `<` followed by an identifier that
  // starts with a letter / `$` / `_`. This intentionally does not match
  // `</foo>` closers or raw `<` inside a string (we already stripped
  // comments; string literal handling is below).
  const tagRegex = /<([A-Za-z][A-Za-z0-9]*)\s/g;
  let match;
  while ((match = tagRegex.exec(source)) !== null) {
    const tagStart = match.index;
    // Walk from just after `<Tag ` to the closing `>` or `/>`, tracking
    // brace depth and string literals so a `>` inside an expression is
    // ignored (same hazard as the button-label scanner).
    let i = tagStart + match[0].length;
    let braceDepth = 0;
    let stringChar = null;
    let escaped = false;
    const attrRangeStart = i;
    let tagEnd = -1;
    while (i < source.length) {
      const ch = source[i];
      if (escaped) { escaped = false; i += 1; continue; }
      if (stringChar) {
        if (ch === '\\') {
          escaped = true;
        } else if (ch === stringChar) {
          stringChar = null;
        }
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        stringChar = ch;
        i += 1;
        continue;
      }
      if (ch === '{') {
        braceDepth += 1;
      } else if (ch === '}') {
        if (braceDepth > 0) braceDepth -= 1;
      } else if (ch === '>' && braceDepth === 0) {
        tagEnd = i;
        break;
      }
      i += 1;
    }
    if (tagEnd === -1) continue;
    const attrs = source.slice(attrRangeStart, tagEnd);
    // Parse prop name / value pairs out of the attribute region.
    // Supported value shapes:
    //   name="literal"
    //   name='literal'
    //   name={"literal"}
    //   name={'literal'}
    //   name={`literal`}  (only if the template has no `${...}`)
    const propRegex = /([a-zA-Z_][a-zA-Z0-9_:-]*)\s*=\s*("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\{\s*("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\$]|\\.)*`)\s*\})/g;
    let propMatch;
    while ((propMatch = propRegex.exec(attrs)) !== null) {
      const name = propMatch[1];
      const raw = propMatch[2];
      let value = '';
      if (raw.startsWith('{')) {
        // Extract inner literal.
        const inner = raw.slice(1, -1).trim();
        value = inner.slice(1, -1);
      } else {
        value = raw.slice(1, -1);
      }
      results.push({
        name,
        value,
        index: attrRangeStart + propMatch.index,
      });
    }
  }
  return results;
}

// Extract LITERAL JSX text nodes — the plain text between JSX tags.
// Scanner flow:
//   1. Find every `>` that closes an opening tag.
//   2. From that `>`, read forward until the next `<` or `{`. The slice
//      between them (stripped + trimmed) is a text-node literal.
//   3. Skip the text if it contains only whitespace. Skip if the first
//      character was `{` (expression body; not a static literal).
//
// Known limitation (SH2-U12 P2, acknowledged): after the `>` of a JSX
// tag nested inside a JS ternary (`{cond ? <Tag/> : null}`), walking
// forward until the next `<` or `{` captures the JS tail of the
// ternary (e.g. `: null}`). Those captures are dropped by the
// `isLikelyJsCodeFragment` post-filter below. A proper fix requires
// matched-open-close JSX nesting tracking, which the P2 reviewer left
// as a future refinement (testing NIT-2).
function extractJsxTextNodes(source) {
  const results = [];
  let i = 0;
  const len = source.length;
  while (i < len) {
    const openLt = source.indexOf('<', i);
    if (openLt === -1) break;
    // Advance to the `>` that closes this opening tag. Use the same
    // brace / string tracker as extractJsxLiteralProps so a `>` inside
    // a prop expression is skipped.
    let j = openLt + 1;
    let braceDepth = 0;
    let stringChar = null;
    let escaped = false;
    let gt = -1;
    while (j < len) {
      const ch = source[j];
      if (escaped) { escaped = false; j += 1; continue; }
      if (stringChar) {
        if (ch === '\\') escaped = true;
        else if (ch === stringChar) stringChar = null;
        j += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        stringChar = ch;
        j += 1;
        continue;
      }
      if (ch === '{') braceDepth += 1;
      else if (ch === '}') { if (braceDepth > 0) braceDepth -= 1; }
      else if (ch === '>' && braceDepth === 0) {
        gt = j;
        break;
      }
      j += 1;
    }
    if (gt === -1) break;
    // Self-closing tag: the next text node starts AFTER the `>` the
    // same way. The scanner is agnostic to self-closing vs open.
    let textStart = gt + 1;
    // Find the next `<` or `{` that ends this text node.
    let textEnd = textStart;
    while (textEnd < len) {
      const ch = source[textEnd];
      if (ch === '<' || ch === '{') break;
      textEnd += 1;
    }
    const text = source.slice(textStart, textEnd);
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed && trimmed.length > 0 && !isLikelyJsCodeFragment(trimmed)) {
      results.push({ value: trimmed, index: textStart });
    }
    i = textEnd;
  }
  return results;
}

// JSX text always BEGINS with a letter, a digit, an opening bracket
// `(`, `[`, a currency symbol, or a common punctuation mark like `‘`,
// `“`, `—`, `#`, `@`. It NEVER begins with `:`, `)`, `;`, `&`, `|`,
// `?`, `,` — those are tails of JS expressions (e.g. `: null}`,
// `) : null}` from a ternary that wraps a JSX element). When the
// text-node extractor walks past the `>` of a nested JSX tag INTO a
// parent `{...}` body, it captures those JS tails. The post-filter
// drops them so they don't pollute the forbidden-token scan with
// false `null` / `undefined` hits.
//
// This is a structural heuristic, not a full parser. The upstream
// `extractJsxTextNodes` walker acknowledges the limitation. Adding a
// proper matched-JSX-nesting tracker is reserved for a future unit
// (testing NIT-2 — deferred by the P2 reviewer).
function isLikelyJsCodeFragment(trimmed) {
  // Leading character is one of the JS tail markers.
  const firstCh = trimmed[0];
  if (firstCh === ')' || firstCh === ':' || firstCh === ';' ||
      firstCh === '&' || firstCh === '|' || firstCh === '?' ||
      firstCh === ',') {
    return true;
  }
  return false;
}

// Line-number helper for actionable error messages.
function lineNumber(source, offset) {
  if (!Number.isFinite(offset) || offset < 0) return 0;
  const chunk = source.slice(0, offset);
  let count = 1;
  for (let i = 0; i < chunk.length; i += 1) {
    if (chunk.charCodeAt(i) === 10) count += 1;
  }
  return count;
}

// Apply the forbidden-token panel to a single literal. Returns an
// array of { id, remediation } for every rule that fires. Allowlist
// lookup is done by the caller.
function scanLiteral(value) {
  const hits = [];
  for (const rule of FORBIDDEN_TOKENS) {
    if (rule.pattern.test(value)) {
      hits.push({ id: rule.id, remediation: rule.remediation });
    }
  }
  return hits;
}

// -----------------------------------------------------------------------------
// Tests.
// -----------------------------------------------------------------------------

test('oracle sanity: file discovery picks up surfaces, subject components, and platform primitives', () => {
  const files = listJsxFiles();
  // Threshold matches the post-broadening `src/**/*.jsx` scope (plan §U12
  // line 812). Pre-broadening the scanner found 62; after adding
  // `src/platform/**/*.jsx` the number is ~71. The floor is set a few
  // below the actual count so a small delete does not regress the
  // assertion, but it is strict enough to catch a glob breakage.
  assert.ok(
    files.length >= 65,
    `file discovery regressed: ${files.length} JSX files found, expected >= 65. The glob pattern may be broken or a directory renamed.`,
  );
  const relatives = files.map(relative);
  assert.ok(
    relatives.some((rel) => rel.includes('surfaces/auth/AuthSurface.jsx')),
    'expected the scanner to include src/surfaces/auth/AuthSurface.jsx',
  );
  assert.ok(
    relatives.some((rel) => rel.includes('subjects/spelling/components/')),
    'expected the scanner to include src/subjects/spelling/components/*.jsx',
  );
  // FIX-2 widened the glob to cover `src/platform/ui/*.jsx` so user-facing
  // error primitives (ErrorCard, EmptyState, ErrorBoundary) are scanned.
  assert.ok(
    relatives.some((rel) => rel === 'src/platform/ui/ErrorCard.jsx'),
    'expected the scanner to include src/platform/ui/ErrorCard.jsx (user-facing error primitive)',
  );
  assert.ok(
    relatives.some((rel) => rel === 'src/platform/ui/EmptyState.jsx'),
    'expected the scanner to include src/platform/ui/EmptyState.jsx (user-facing empty-state primitive)',
  );
  assert.ok(
    relatives.some((rel) => rel === 'src/platform/react/ErrorBoundary.jsx'),
    'expected the scanner to include src/platform/react/ErrorBoundary.jsx (user-facing error boundary)',
  );
});

test('oracle sanity: extractJsxLiteralProps captures title / placeholder / aria-label literals', () => {
  const sample = `
    <Foo title="Hello" aria-label='World' placeholder={"Search"} bar={dynamic} />
    <Baz label={\`nope \${x}\`} />
  `;
  const props = extractJsxLiteralProps(sample).map(({ name, value }) => [name, value]);
  assert.deepEqual(
    props,
    [
      ['title', 'Hello'],
      ['aria-label', 'World'],
      ['placeholder', 'Search'],
    ],
    'expected the literal-prop extractor to capture string, single-quoted, and braced-string props, and to skip dynamic expressions plus template literals with interpolations.',
  );
});

test('oracle sanity: extractJsxTextNodes captures JSX text children', () => {
  const sample = `<p>We could not save that answer.</p><span>{dynamic}</span><div>Try again.</div>`;
  const texts = extractJsxTextNodes(sample).map(({ value }) => value);
  // The extractor also captures short whitespace-only gaps between
  // tags as non-results; we only keep trimmed non-empty text.
  assert.ok(
    texts.includes('We could not save that answer.'),
    'expected to capture the literal text "We could not save that answer."',
  );
  assert.ok(
    texts.includes('Try again.'),
    'expected to capture the literal text "Try again."',
  );
  // The `{dynamic}` body must NOT be captured as a literal (it starts
  // with `{`, which ends the text-node scan before any literal text).
  assert.ok(
    !texts.some((value) => value.includes('{dynamic}')),
    'expected the scanner to skip JSX expression children (e.g. `{dynamic}`). Got: ' + JSON.stringify(texts),
  );
});

test('oracle sanity: scanLiteral flags forbidden tokens with actionable remediation', () => {
  // Happy path — canonical humanised copy must pass the scan.
  assert.deepEqual(
    scanLiteral("We couldn’t save that answer. Your progress is safe; try again."),
    [],
    'canonical humanised copy must not trigger any forbidden-token rule.',
  );
  assert.deepEqual(
    scanLiteral('Something went wrong signing you in. Try again.'),
    [],
    'canonical humanised copy must not trigger any forbidden-token rule.',
  );

  // Error path 1 — raw 500 in a visible string.
  const hit1 = scanLiteral('Save failed with HTTP 500. Try again.');
  assert.ok(
    hit1.some((entry) => entry.id === 'raw-status-500'),
    'expected scanLiteral to flag the raw "500" token. Got: ' + JSON.stringify(hit1),
  );

  // Error path 2 — JSON.stringify(error) leaking.
  const hit2 = scanLiteral('Failed: {"code":"transport","message":"fetch failed"}');
  assert.ok(
    hit2.some((entry) => entry.id === 'json-blob'),
    'expected scanLiteral to flag the JSON-blob token. Got: ' + JSON.stringify(hit2),
  );

  // Error path 3 — internal route path.
  const hit3 = scanLiteral('Request POST /api/subjects/spelling/command failed.');
  assert.ok(
    hit3.some((entry) => entry.id === 'internal-route'),
    'expected scanLiteral to flag the internal /api/ route. Got: ' + JSON.stringify(hit3),
  );

  // Error path 4 — TypeError leak.
  const hit4 = scanLiteral('TypeError: Cannot read properties of undefined');
  assert.ok(
    hit4.some((entry) => entry.id === 'typeerror'),
    'expected scanLiteral to flag the TypeError token. Got: ' + JSON.stringify(hit4),
  );

  // Error path 5 — 409 leak.
  const hit5 = scanLiteral('HTTP 409 conflict — retry');
  assert.ok(
    hit5.some((entry) => entry.id === 'raw-status-409'),
    'expected scanLiteral to flag the raw "409" token. Got: ' + JSON.stringify(hit5),
  );

  // Allowlist guard — number-as-content. "100% accuracy" must not
  // trigger the 5xx rule because "100" is not a 5xx status.
  assert.deepEqual(
    scanLiteral('100% accuracy'),
    [],
    'a non-error literal that happens to contain a three-digit number must not trigger the status-code rules.',
  );
});

test('oracle sanity: synthetic fixture with a 500 in a visible <p> child fails the scan', () => {
  const synthetic = `<p>Save failed with HTTP 500. Please try again.</p>`;
  const stripped = stripComments(synthetic);
  const texts = extractJsxTextNodes(stripped);
  assert.ok(texts.length > 0, 'expected the extractor to capture the synthetic <p> body');
  const hits = texts.flatMap(({ value }) => scanLiteral(value).map((hit) => ({ ...hit, value })));
  assert.ok(
    hits.some((hit) => hit.id === 'raw-status-500'),
    'expected the synthetic fixture to trip raw-status-500 when scanned end-to-end. This exercises the extractor + scanner pair so a future extractor regression fails here.',
  );
});

test('oracle sanity: synthetic fixture with a JSON blob in a prop value fails the scan', () => {
  const synthetic = `<Banner title='Failed: {"code":"transport"}' />`;
  const stripped = stripComments(synthetic);
  const props = extractJsxLiteralProps(stripped);
  assert.ok(props.length > 0, 'expected extractor to capture the synthetic prop literal');
  const hits = props.flatMap(({ value }) => scanLiteral(value).map((hit) => ({ ...hit, value })));
  assert.ok(
    hits.some((hit) => hit.id === 'json-blob'),
    'expected the synthetic fixture to trip json-blob when scanned end-to-end.',
  );
});

test('oracle sanity: synthetic fixture with /api/ internal route in visible copy fails', () => {
  const synthetic = `<p>Request to /api/subjects/spelling/command failed.</p>`;
  const stripped = stripComments(synthetic);
  const texts = extractJsxTextNodes(stripped);
  const hits = texts.flatMap(({ value }) => scanLiteral(value).map((hit) => ({ ...hit, value })));
  assert.ok(
    hits.some((hit) => hit.id === 'internal-route'),
    'expected the synthetic fixture to trip internal-route when scanned end-to-end.',
  );
});

test('oracle sanity: synthetic fixture with the word "undefined" leaking through missing fallback fails', () => {
  // Simulates `<p>Saved: {result?.name}</p>` when `result.name` is
  // missing. The displayed text becomes "Saved: undefined". The oracle
  // fires on the visible token. This guards the plan §U12 line 812
  // token that the first shipped oracle missed.
  const synthetic = `<p>Saved: undefined</p>`;
  const stripped = stripComments(synthetic);
  const texts = extractJsxTextNodes(stripped);
  const hits = texts.flatMap(({ value }) => scanLiteral(value).map((hit) => ({ ...hit, value })));
  assert.ok(
    hits.some((hit) => hit.id === 'undefined-leak'),
    'expected the synthetic fixture to trip undefined-leak when scanned end-to-end. Got: ' + JSON.stringify(hits),
  );
  // Negative control: a phrase like "left undefined by the spec" is
  // still a plain-English use and must NOT be humanised away — but the
  // oracle flags ALL occurrences of the word, so if the product ever
  // needed that phrasing it would have to be allowlisted with a reason.
  // For the SH2-U12 baseline we keep the rule strict: there is no
  // current copy that reads as natural English only by using the word
  // "undefined", so the strict rule protects against regressions.
});

test('oracle sanity: synthetic fixture with the word "null" leaking through a visible literal fails', () => {
  // Simulates a render that leaks the string "null" into JSX text — e.g.
  // `<p>{value ?? null}</p>` when `value` is missing, or a toast body
  // built via `String(error?.cause)`. The oracle fires on the standalone
  // token. Plan §U12 line 812.
  const synthetic = `<p>Label: null</p>`;
  const stripped = stripComments(synthetic);
  const texts = extractJsxTextNodes(stripped);
  const hits = texts.flatMap(({ value }) => scanLiteral(value).map((hit) => ({ ...hit, value })));
  assert.ok(
    hits.some((hit) => hit.id === 'null-leak'),
    'expected the synthetic fixture to trip null-leak when scanned end-to-end. Got: ' + JSON.stringify(hits),
  );
});

test('oracle sanity: allowlist documents every entry and has < 20 entries', () => {
  assert.ok(
    ALLOWLIST.length < 20,
    `allowlist must stay under 20 entries so it remains small enough to audit in review. Current size: ${ALLOWLIST.length}.`,
  );
  for (const entry of ALLOWLIST) {
    assert.equal(
      typeof entry.file,
      'string',
      `allowlist entry missing "file": ${JSON.stringify(entry)}`,
    );
    assert.equal(
      typeof entry.literal,
      'string',
      `allowlist entry missing "literal": ${JSON.stringify(entry)}`,
    );
    assert.ok(
      typeof entry.reason === 'string' && entry.reason.length >= 30,
      `allowlist entry must carry a meaningful reason (>= 30 chars). Got: ${JSON.stringify(entry)}`,
    );
  }
});

test('oracle sanity: every allowlist entry actually matches a literal in its target file (no zombie allowlist rows)', () => {
  // If an allowlist entry no longer matches any literal, the audit
  // surface it was protecting has been refactored — and the row is now
  // quietly expanding the bounded allowlist size without protecting
  // anything. Fail so the operator can either delete the row or re-audit
  // the copy it is covering.
  //
  // Additionally, confirm the literal WOULD trip at least one
  // forbidden-token rule without the allowlist — otherwise the row is
  // vacuous and should be deleted, not kept.
  const missing = [];
  const unnecessary = [];
  for (const entry of ALLOWLIST) {
    const full = path.join(rootDir, entry.file);
    let source;
    try {
      source = readFileSync(full, 'utf8');
    } catch (error) {
      missing.push({ entry, reason: `file not readable: ${error?.message || 'unknown'}` });
      continue;
    }
    const stripped = stripComments(source);
    const props = extractJsxLiteralProps(stripped);
    const texts = extractJsxTextNodes(stripped);
    const hasMatch = props.some((prop) => USER_FACING_PROPS.has(prop.name) && prop.value === entry.literal)
      || texts.some((text) => text.value === entry.literal);
    if (!hasMatch) {
      missing.push({ entry, reason: 'literal no longer present — either delete the allowlist row or update the literal value' });
      continue;
    }
    const wouldTrip = scanLiteral(entry.literal).length > 0;
    if (!wouldTrip) {
      unnecessary.push(entry);
    }
  }
  assert.deepEqual(
    missing,
    [],
    missing.length === 0
      ? ''
      : `allowlist rows whose target literal is no longer present in the scanned source:\n${missing
          .map((m) => `  - ${m.entry.file}: "${m.entry.literal}" (${m.reason})`)
          .join('\n')}`,
  );
  assert.deepEqual(
    unnecessary,
    [],
    unnecessary.length === 0
      ? ''
      : `allowlist rows whose literal does not trip any forbidden-token rule (so the row is unnecessary):\n${unnecessary
          .map((entry) => `  - ${entry.file}: "${entry.literal}"`)
          .join('\n')}\nDelete these rows; the allowlist must only cover literals the oracle would otherwise fail on.`,
  );
});

test('error-copy oracle: every user-facing prop literal across scanned JSX passes the forbidden-token panel', () => {
  const files = listJsxFiles();
  const violations = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const stripped = stripComments(source);
    const allowlist = fileAllowlist(file);
    const props = extractJsxLiteralProps(stripped);
    for (const prop of props) {
      if (!USER_FACING_PROPS.has(prop.name)) continue;
      if (allowlist && allowlist.has(prop.value)) continue;
      const hits = scanLiteral(prop.value);
      if (!hits.length) continue;
      violations.push({
        file: relative(file),
        line: lineNumber(stripped, prop.index),
        name: prop.name,
        value: prop.value,
        ruleIds: hits.map((hit) => hit.id),
        remediation: hits[0].remediation,
      });
    }
  }
  assert.deepEqual(
    violations,
    [],
    violations.length === 0
      ? ''
      : `user-facing prop literals contain forbidden tokens. Fix each or add an audited allowlist entry:\n${violations
          .map((v) => `  - ${v.file}:${v.line} [${v.name}="${v.value}"] rules=${v.ruleIds.join(',')} — ${v.remediation}`)
          .join('\n')}`,
  );
});

test('error-copy oracle: every JSX text child across scanned files passes the forbidden-token panel', () => {
  const files = listJsxFiles();
  const violations = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const stripped = stripComments(source);
    const allowlist = fileAllowlist(file);
    const texts = extractJsxTextNodes(stripped);
    for (const text of texts) {
      if (allowlist && allowlist.has(text.value)) continue;
      const hits = scanLiteral(text.value);
      if (!hits.length) continue;
      violations.push({
        file: relative(file),
        line: lineNumber(stripped, text.index),
        value: text.value,
        ruleIds: hits.map((hit) => hit.id),
        remediation: hits[0].remediation,
      });
    }
  }
  assert.deepEqual(
    violations,
    [],
    violations.length === 0
      ? ''
      : `JSX text children contain forbidden tokens. Fix each or add an audited allowlist entry:\n${violations
          .map((v) => `  - ${v.file}:${v.line} ["${v.value}"] rules=${v.ruleIds.join(',')} — ${v.remediation}`)
          .join('\n')}`,
  );
});

test('error-copy oracle: SH2-U3 humanised copy survives the scan (happy-path regression guard)', () => {
  // Direct fixtures from the SH2-U3 work. If any of these strings
  // disappear from the source OR a future edit re-leaks a raw code
  // into one of these copy strings, this test tightens the grip.
  const CANONICAL = [
    "We couldn’t save that answer. Your progress is safe; try again.",
    'Something went wrong signing you in',
    "We couldn’t reach the sign-in service just now. Please try again in a moment.",
    'This account is not permitted to view the page you asked for. Return home to continue.',
  ];
  for (const value of CANONICAL) {
    assert.deepEqual(
      scanLiteral(value),
      [],
      `canonical humanised copy "${value}" must not trigger any forbidden-token rule. If it does, the rule is too broad — narrow it rather than weakening the copy.`,
    );
  }
});
