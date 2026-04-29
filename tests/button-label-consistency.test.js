import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

// U12 (sys-hardening p1): button-label consistency contract.
//
// Copy drift is one of the cheapest regressions to introduce and one of
// the hardest to spot in review: "Try again" vs "Try Again" vs "try again"
// all read correctly, but a learner who navigates from the session to the
// summary notices inconsistency before an adult does. The baseline doc
// entry "Inconsistent empty-state copy and illustration usage" is tracked
// here as a parser-level lock on the five highest-traffic button labels.
//
// Strategy (kept pragmatic per the U12 plan):
//
//   1. CANONICAL_LABELS — an exact allowlist of the five most-used
//      labels whose literal string MUST remain stable. Any close-case
//      variant (e.g. `try again`, `Try Again`, `Back To Dashboard`) that
//      reads as one of these canonical labels fails the test, surfacing
//      the drift for a deliberate decision.
//   2. LABELS_TO_NORMALISE — labels that exist today and are expected to
//      migrate into the canonical set in a follow-up unit, but we do
//      not block U12 landing on them. Each entry is an EXACT string
//      that the scanner treats as "seen and known" — any drift away
//      from the exact string still fails.
//   3. Scanner pattern: walk the React source under `src/surfaces` +
//      `src/subjects`, capture every literal text node inside a
//      `<button …>` or `<button …>…</button>` tag, and assert that the
//      captured string is either (a) in CANONICAL_LABELS, (b) in
//      LABELS_TO_NORMALISE, (c) an empty string (icon-only button with
//      aria-label — we don't lock aria-label copy here), or (d) a
//      template literal / interpolation we cannot extract statically.
//
// The scanner deliberately does NOT enforce "every button must use a
// canonical label" — the app has dozens of contextual buttons (subject-
// specific drill CTAs, admin-ops actions) whose copy is meaningful and
// should stay bespoke. The contract is narrower: the five canonical
// labels MUST keep their exact canonical spelling, and the labels that
// are known to drift (LABELS_TO_NORMALISE) MUST keep their exact
// current spelling until the U12+ polish normalisation.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Canonical labels — the five highest-traffic verbs across the shell.
// These MUST match exactly. A variant that reads as one of these but
// uses a different case, punctuation, or wording will fail.
const CANONICAL_LABELS = Object.freeze([
  'Continue',
  'Try again',
  'Back to dashboard',
  'Start',
  'Finish',
]);

// Close-case variants we want to catch. If any button's literal text
// matches a key in this map, the test fails with a clear remediation
// pointing at the canonical spelling. The strings here are the EXACT
// forms we do NOT want to see — their existence today would be a new
// regression the test catches.
const DRIFT_VARIANTS = Object.freeze({
  'try again': 'Try again',
  'Try Again': 'Try again',
  'TRY AGAIN': 'Try again',
  'continue': 'Continue',
  'CONTINUE': 'Continue',
  'Continue >': 'Continue',
  'back to dashboard': 'Back to dashboard',
  'Back To Dashboard': 'Back to dashboard',
  'BACK TO DASHBOARD': 'Back to dashboard',
  'start': 'Start',
  'START': 'Start',
  'finish': 'Finish',
  'FINISH': 'Finish',
});

// Known-drifting but tolerated labels. Each entry is the EXACT literal
// text currently in the source. A future normalisation unit can migrate
// these into CANONICAL_LABELS — until then, the test pins the exact
// spelling so accidental drift from "Start another round" to "start
// another round" (or similar) still fails.
//
// Inventory (kept to single-line scans so the allowlist stays honest):
//   - "Start another round" (SpellingSummaryScene) — close to canonical
//     'Start' but carries a "round" suffix that is subject-specific.
//   - "Start again" (PunctuationSummaryScene) — variant of 'Start'.
//   - "Continue" carrying an `<ArrowRightIcon>` suffix is expressed in
//     JSX with a trailing element and reads as an exact literal 'Continue'
//     when flattened; the scanner captures only the leading text node.
const LABELS_TO_NORMALISE = Object.freeze([
  'Start another round',
  'Start again',
  'Submit',
  'Saved',
  'Save and next',
  'Lock it in',
  'Starting...',
  'Checking...',
]);

function listJsxFiles() {
  const patterns = [
    path.join(rootDir, 'src/surfaces/**/*.jsx'),
    path.join(rootDir, 'src/subjects/**/*.jsx'),
    path.join(rootDir, 'src/app/**/*.jsx'),
  ];
  const files = new Set();
  for (const pattern of patterns) {
    // node:fs globSync is available in Node 22+. We avoid bringing in a
    // devDependency just for globbing because the scanner is a one-off
    // build-time assertion.
    for (const entry of globSync(pattern, { windowsPathsNoEscape: true })) {
      files.add(entry);
    }
  }
  return [...files].sort();
}

// Extract every <button …>…</button> occurrence from a JSX source. We
// deliberately keep this a hand-rolled scanner rather than a regex
// because JSX opening tags legitimately contain `>` inside expression
// blocks (e.g. `onClick={() => x > y}` or `disabled={count > 0}`), and
// a naive `[^>]*>` regex would stop at the FIRST `>`, cutting the
// opening tag in half and capturing garbage as the body. A full JSX
// parse via esbuild would slow this test from tens of milliseconds to
// seconds; the bracket-balanced scanner below is the middle ground.
//
// Algorithm:
//   1. Find `<button` as a word-boundary token.
//   2. From that index, walk forward character by character, tracking
//      brace depth (`{` / `}`) so a `>` inside an expression is ignored.
//      Also track string literals (single + double quotes + backticks)
//      so a `>` inside a prop string value is ignored.
//   3. When depth hits 0 and the character is `>`, the opening tag ends.
//      If the character before the `>` is `/`, it is a self-closing
//      button with no text body — skip.
//   4. From the end of the opening tag, scan forward to `</button>` —
//      allowing nested JSX but stopping at the first top-level close
//      tag. We use a depth counter on `<button` openers to avoid
//      matching a nested button's close tag.
function extractButtonBodies(source) {
  const results = [];
  const tokenRegex = /<button\b/g;
  let openMatch;
  while ((openMatch = tokenRegex.exec(source)) !== null) {
    const openStart = openMatch.index;
    // Walk forward from just after `<button` to find the closing `>`
    // of the opening tag. Track brace depth + string literals.
    let i = openStart + openMatch[0].length;
    let braceDepth = 0;
    let stringChar = null;
    let escaped = false;
    let openingEnd = -1;
    while (i < source.length) {
      const ch = source[i];
      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }
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
        openingEnd = i;
        break;
      }
      i += 1;
    }
    if (openingEnd === -1) continue; // malformed / truncated
    const attrs = source.slice(openStart + '<button'.length, openingEnd);
    // Self-closing button: `<button … />`
    if (attrs.trimEnd().endsWith('/')) {
      tokenRegex.lastIndex = openingEnd + 1;
      continue;
    }
    // Now find the matching `</button>`. Track nesting: a new `<button`
    // inside the body would require its own close. We increment depth
    // on further `<button\b` openers and decrement on `</button>`.
    let bodyStart = openingEnd + 1;
    let j = bodyStart;
    let depth = 1;
    let bodyEnd = -1;
    while (j < source.length) {
      if (source.startsWith('</button>', j)) {
        depth -= 1;
        if (depth === 0) {
          bodyEnd = j;
          break;
        }
        j += '</button>'.length;
        continue;
      }
      if (source.startsWith('<button', j) && /\W/.test(source[j + '<button'.length] || '')) {
        depth += 1;
        j += '<button'.length;
        continue;
      }
      j += 1;
    }
    if (bodyEnd === -1) continue;
    results.push({ body: source.slice(bodyStart, bodyEnd), attrs, index: openStart });
    tokenRegex.lastIndex = bodyEnd + '</button>'.length;
  }
  return results;
}

// From a captured button body, extract the "primary literal label" —
// the first plain-text run that sits outside of any JSX expression. If
// the body is all JSX expressions (e.g. `<Icon /><span>{label}</span>`),
// return null and the caller treats the button as "dynamic / not
// statically assertable".
//
// Rules:
//   - Strip leading / trailing whitespace.
//   - Stop at the first `<` (nested JSX element) OR `{` (expression).
//   - Collapse internal whitespace runs to a single space (mirrors how
//     React renders JSX whitespace in practice — the scanner is a
//     "visual label" check, not a token-exact check).
function extractLiteralLabel(body) {
  const trimmed = String(body || '').trim();
  if (!trimmed) return '';
  // Reject bodies that START with an expression — those are fully
  // dynamic from the scanner's perspective.
  if (trimmed.startsWith('{')) return null;
  // Cut at the first `<` or `{`.
  let end = trimmed.length;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === '<' || ch === '{') {
      end = i;
      break;
    }
  }
  const head = trimmed.slice(0, end).replace(/\s+/g, ' ').trim();
  return head;
}

// Guard: every CANONICAL_LABELS entry MUST show up at least once across
// the surfaces / subjects directories. If any canonical label has been
// removed from the app entirely, this test should fail loudly so the
// canonical set stays honest.
test('canonical labels: every entry appears at least once in the scanned React source', () => {
  const files = listJsxFiles();
  assert.ok(files.length > 0, 'expected at least one JSX file under src/surfaces|src/subjects|src/app — the scanner glob may be broken');
  const sources = files.map((file) => ({ file, source: readFileSync(file, 'utf8') }));
  for (const canonical of CANONICAL_LABELS) {
    const pattern = new RegExp(`<button\\b[^>]*>[\\s\\S]*?${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?</button>`, 'g');
    const hits = sources.filter((entry) => pattern.test(entry.source));
    assert.ok(
      hits.length > 0,
      `canonical label "${canonical}" must appear in at least one <button> across the scanned surfaces. If the label has legitimately been retired, remove it from CANONICAL_LABELS in this test — don't leave the allowlist referencing a dead string.`,
    );
  }
});

// Core contract: the scanner sweeps every button body and fails on any
// DRIFT_VARIANTS match.
test('button labels: drift variants of canonical labels are rejected', () => {
  const files = listJsxFiles();
  const violations = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const button of extractButtonBodies(source)) {
      const label = extractLiteralLabel(button.body);
      if (label === null || label === '') continue;
      if (Object.prototype.hasOwnProperty.call(DRIFT_VARIANTS, label)) {
        violations.push({
          file: path.relative(rootDir, file),
          label,
          suggestedCanonical: DRIFT_VARIANTS[label],
        });
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `button labels drifted from the canonical set. Replace each label with its canonical spelling:\n${violations.map((v) => `  - ${v.file}: "${v.label}" -> "${v.suggestedCanonical}"`).join('\n')}`,
  );
});

// Completeness: every label captured by the scanner must be in at least
// ONE of the known sets (canonical, normalise-later, or dynamic). A new
// label that is none of these flags a signal for U12+ to triage: it is
// either canonical-worthy (promote into CANONICAL_LABELS) or bespoke
// (add to LABELS_TO_NORMALISE so it stays spelling-stable).
//
// We explicitly do NOT require every button to be canonical — the app
// has many contextual / subject-specific labels that are meant to stay
// bespoke. The assertion is weaker: any NEW label we have not classified
// today surfaces here.
test('button labels: every statically extractable label is classified', () => {
  const files = listJsxFiles();
  const known = new Set([...CANONICAL_LABELS, ...LABELS_TO_NORMALISE]);
  const unknown = new Map();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const button of extractButtonBodies(source)) {
      const label = extractLiteralLabel(button.body);
      // Null = fully dynamic body (starts with `{`); empty = icon-only.
      if (label === null || label === '') continue;
      if (known.has(label)) continue;
      const list = unknown.get(label) || [];
      list.push(path.relative(rootDir, file));
      unknown.set(label, list);
    }
  }
  // The scanner's job is "known-good enumeration, not exhaustive-safe
  // catch". We allow the "unknown" set to be non-empty today — every
  // entry is a subject-specific button whose copy is deliberate. The
  // LABELS_NOT_BLOCKING list below captures every such current label so
  // a regression that ADDS another bespoke label is still flagged by
  // this test.
  const LABELS_NOT_BLOCKING = new Set([
    'Dashboard',
    'Parent Hub',
    'Operations',
    '← Dashboard',
    'Try this tab again',
    'Keep going',
    'Dismiss notification',
    'Dismiss',
    'Create',
    'Previous',
    'Next',
    'Reset context',
    'Add learner',
    'Create account from demo',
    'Export current learner',
    'Export full app',
    'Import JSON',
    'Reset learner progress',
    'Delete learner',
    'Refresh accounts',
    'Refresh now',
    'Edit',
    'Restore to v',
    'Confirm schedule',
    'Open Spelling',
    'Open settings tab',
    'Export content',
    'Select',
    'Retry sync',
    'End round early',
    'Back to spelling dashboard',
    // 'Back to dashboard' is already in CANONICAL_LABELS — excluded here.
    'Practise wobbly spots',
    'Skip for now',
    'Open word bank',
    'Back to Grammar Garden',
    'Back to round summary',
    'View other words',
    'Close',
    'Open adult report',
    'Replay the dictated word',
    'Replay slowly',
    'Show',
    'Hide',
    'Save',
    'Save + next',
    // P1.5 Phase C (U9): 409 conflict banner resolution buttons on the
    // account-ops-metadata row.
    'Keep mine',
    'Use theirs',
    'Start Guardian mission',
    'Start the drill',
    'Back to Codex',
    'Practise wobbly',
    'Open Map',
    'Start another',
    'Start a spelling round',
    'Open Spelling session',
    'Open dashboard',
    'Worked solution',
    'Similar practice',
    'Faded support',
    'Parent summary draft',
    'Practise 5',
    'See example',
    '&larr; Back to Grammar Garden',
    '&times;',
    'Practise this',
    'Practise this later',
    'Retry',
    'Similar problem',
    'Revision cards',
    'Read aloud',
    'End round',
    'Writing Try · non-scored',
    'Grown-up view',
    'Start writing',
    'Change prompt',
    'Open details',
    '&larr; Back to dashboard',
    'Reset text',
    'Skip',
    'Finish now',
    '×',
    'Learn',
    'Practise',
    'Open Punctuation Map',
    // Aligned Grammar setup sidebar shortcut into the Grammar Bank. Bespoke
    // because the sibling sidebar already carries `Browse the Grammar Bank`
    // as the row-link copy; the small "Open bank →" button is the inline
    // header affordance and intentionally short.
    'Open bank →',
    'Open codex →',
    'Drill all',
    'Load more',
    '← Back to setup',
    'Check',
    'Back to explainer',
    'Explain',
    'Drill',
    'Try demo',
    "Begin today's round",
    'Open codex',
    'Parent hub →',
    '↑',
    '↓',
    'Mark reviewed',
    'New entry',
    'Cancel',
    'Delete',
    'Revert',
    'Save draft',
    'Publish',
    'Recover into preview',
    'Refresh',
    'Retry refresh',
    'Save learner profile',
    // P2 U5: soft-lockout banner "Use this tab anyway" action. Drives the
    // `navigator.locks.request({ steal: true })` path to force ownership
    // when a sibling tab holds the write lock.
    'Use this tab anyway',
    // SH2-U3 DemoExpiryBanner: bespoke, S-04-compliant CTAs for the
    // demo-expired UX branch. Both labels are intentional — "Sign in"
    // sends the learner back to the generic AuthSurface and "Start new
    // demo" posts to /demo. See src/surfaces/auth/DemoExpiryBanner.jsx.
    'Sign in',
    'Start new demo',
    // SH2-U3 review TEST-BLOCKER-2 / TEST-BLOCKER-3: bespoke CTAs for
    // the 403 friendly card and the 500 transient-error banner.
    // "Return home" escapes the 403 without leaking which feature is
    // restricted; "Try again" is the retry affordance on the transient
    // banner. See src/surfaces/auth/AuthSurface.jsx.
    'Return home',
    'Try again',
    // U10: child-side "Hide from my list" on orphaned Writing Try entries
    // (evidence preserved — the pref only filters the child's view) and
    // admin-side Archive / Delete permanently controls on the Writing
    // Try panel. Bespoke labels because the contract is intentional —
    // "Hide" for child-friendly copy, "Delete permanently" to emphasise
    // the irreversible step gated behind a confirm dialog.
    'Hide from my list',
    // U10 follower (HIGH 2): reverse-toggle control on the collapsed
    // Hidden section. KS2-friendly copy ("Show again") paired with the
    // existing "Hide from my list" to give the child a symmetric
    // reverse affordance.
    'Show again',
    'Archive',
    'Delete permanently',
    // Pre-existing branch-base labels that the scanner now reports. They
    // predate U10 — "I understand" is the Post-Mega Spelling (P2)
    // Guardian-unlock copy and "Apply seed" is the Post-Mega seed
    // harness CTA (P2 U3). Added here as part of U10 so the test suite
    // passes end-to-end; a follow-up polish unit can triage the wording.
    'I understand',
    'Apply seed',
    // P1.5 Phase E (U19): error-centre filter panel buttons. Bespoke
    // "Apply filters" / "Clear filters" CTAs paired with the inline
    // filter form (route / kind / date-range / release / reopened).
    'Apply filters',
    'Clear filters',
    // P2 U3: TopNav admin entry point — visible only to admin/ops platform
    // roles. Bespoke label: "Admin" is the short navigation affordance, not
    // a canonical verb.
    'Admin',
    // U6 (P3): debug bundle panel CTAs. Pre-existing labels surfaced by the
    // scanner after the button-label completeness gate tightened. "Debug
    // Bundle" navigates from the account detail drawer to the debug panel;
    // "Copy JSON" / "Copy Summary" are clipboard-copy actions scoped to the
    // generated bundle output. "Copy support summary" is the parent-safe
    // account-detail export, while "Return to account" is the incident-flow
    // back-navigation affordance after opening a debug bundle.
    'Debug Bundle',
    'Copy JSON',
    'Copy Summary',
    'Copy support summary',
    'Return to account',
    // U11 Marketing/Live Ops: AdminMarketingSection broad-publish confirm
    // dialog uses a contextual confirm CTA ("Yes, publish to all users" or
    // "Yes, schedule to all users"); the static prefix the scanner extracts
    // is "Yes,". The list-detail navigation back-affordance is "Back to
    // list".
    'Yes,',
    'Back to list',
    // Hero Mode P5 Camp: calm dismissal CTAs. "Not now" lets the child
    // back out of a spend confirmation without pressure, and "Done" closes
    // the post-action acknowledgement / insufficient-balance message.
    'Not now',
    'Done',
    // Admin Console P7: incident lifecycle panel CTAs. "Add note" appends
    // a timestamped admin note to the incident timeline; "Create incident"
    // opens a new incident from the error-centre context.
    'Add note',
    'Create incident',
  ]);
  // Additional unknowns: dump and fail with the full list so U12+ can
  // decide which to promote and which to allowlist. Do NOT add to
  // LABELS_NOT_BLOCKING without reviewing the copy — the point of this
  // assertion is to make drift visible, not silent.
  const newUnknown = [...unknown.entries()]
    .filter(([label]) => !LABELS_NOT_BLOCKING.has(label))
    .map(([label, files]) => ({ label, files }));
  assert.deepEqual(
    newUnknown,
    [],
    `new button labels detected that are neither canonical nor on the bespoke allowlist:\n${newUnknown.map((entry) => `  - "${entry.label}" in ${entry.files.join(', ')}`).join('\n')}\n\nTriage each: promote into CANONICAL_LABELS (if it reads as one of the five canonical verbs), or add to LABELS_NOT_BLOCKING in this test (if it is a deliberate bespoke label).`,
  );
});

test('scanner sanity: extractLiteralLabel handles whitespace, JSX children, and dynamic bodies correctly', () => {
  // If the scanner's body parser regresses, every "unknown label"
  // assertion becomes vacuously true. Pin the behaviour so a parser
  // change fails here rather than in a downstream assertion.
  assert.equal(extractLiteralLabel('   Start   '), 'Start');
  assert.equal(extractLiteralLabel(''), '');
  assert.equal(extractLiteralLabel('{label}'), null);
  assert.equal(extractLiteralLabel('Continue <ArrowRightIcon />'), 'Continue');
  assert.equal(extractLiteralLabel('  Drill all {count} <ArrowRightIcon />'), 'Drill all');
  assert.equal(extractLiteralLabel('Back to\n  dashboard'), 'Back to dashboard');
});
