// Pure session label/visibility/shape selectors for the Punctuation surface.
// Mirrors `src/subjects/grammar/session-ui.js` and
// `src/subjects/spelling/session-ui.js` so every Phase 3 JSX unit imports
// from one source of truth rather than restating branches inline.
//
// No React. No SSR. No import from `./components/*`. These helpers are pure
// functions on the Worker-projected `session` shape plus the Punctuation
// `phase` string. They are safe to call in any test.

const TEXT_PREFILL_STEM_MODES = Object.freeze(new Set(['insert', 'fix', 'paragraph']));
const TEXT_PREFILL_BLANK_MODES = Object.freeze(new Set(['combine', 'transfer']));

/**
 * Label for the primary session submit button. GPS mode keeps answers
 * locked in until the end of the round, so its submit reads as "Save
 * answer" rather than "Check". Every other mode — including the six
 * cluster-focus modes that stay reachable via direct dispatch — reads as
 * "Check". Null / unknown session falls back to "Check" so the control
 * never flashes an empty label during the first render.
 */
export function punctuationSessionSubmitLabel(session) {
  if (session && typeof session === 'object' && !Array.isArray(session) && session.mode === 'gps') {
    return 'Save answer';
  }
  return 'Check';
}

/**
 * Describes the text-input shape for a given item mode. Used by U3's Session
 * scene to decide between "prefill with the stem" (insert / fix / paragraph)
 * and "blank textarea with source block above" (combine / transfer). Radio-
 * choice items short-circuit to `{ prefill: 'none' }` — the scene then
 * renders the existing `ChoiceItem` radio group. Unknown modes fall back to
 * `{ prefill: 'none' }` so a rogue payload cannot accidentally prefill the
 * learner's input with the source sentence.
 *
 * Returns one of:
 *   - `{ prefill: 'stem' }`                         — insert / fix / paragraph
 *   - `{ prefill: 'blank', showSource: true }`      — combine / transfer
 *   - `{ prefill: 'none' }`                         — choose / unknown
 */
export function punctuationSessionInputShape(itemMode) {
  if (typeof itemMode !== 'string' || !itemMode) return { prefill: 'none' };
  if (TEXT_PREFILL_STEM_MODES.has(itemMode)) return { prefill: 'stem' };
  if (TEXT_PREFILL_BLANK_MODES.has(itemMode)) return { prefill: 'blank', showSource: true };
  return { prefill: 'none' };
}

/**
 * Child-facing progress label. Reads as `Question X of N`. Handles the
 * boundary case where `session.length` is zero (fresh session, no items
 * queued yet) by falling back to `Question 1` — still child-readable and
 * stable across first-render. Negative / non-finite values clamp to zero.
 */
export function punctuationSessionProgressLabel(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) return 'Question 1';
  const rawLength = Number(session.length);
  const total = Number.isFinite(rawLength) && rawLength > 0 ? Math.floor(rawLength) : 0;
  const rawAnswered = Number(session.answeredCount);
  const safeAnswered = Number.isFinite(rawAnswered) && rawAnswered >= 0 ? Math.floor(rawAnswered) : 0;
  const questionNumber = Math.min(Math.max(total, 1), safeAnswered + 1);
  if (total <= 0) return `Question ${questionNumber}`;
  return `Question ${questionNumber} of ${total}`;
}

/**
 * Single truth table for help / support visibility during the active-item
 * and feedback phases. Every JSX unit that decides whether to render a
 * teach box, feedback panel, or GPS delayed-feedback chip row calls this
 * helper once and threads the flags down.
 *
 * Rules:
 * - GPS mode (any phase): `showFeedback` stays `false` until `phase ===
 *   'summary'`. GPS keeps its delayed-feedback contract — the learner
 *   never sees per-item feedback until the round ends. Teach box is
 *   hidden across every GPS phase.
 * - Guided mode (active-item or feedback): `showTeachBox` is `true`
 *   (collapsed to a rule reminder by U3's Session scene) and
 *   `showFeedback` follows the phase.
 * - Other modes (Smart / Wobbly / cluster-focus): `showTeachBox` is
 *   `false`; `showFeedback` follows the phase.
 *
 * Returns `{ showTeachBox: boolean, showFeedback: boolean }`.
 */
export function punctuationSessionHelpVisibility(session, phase) {
  const safeSession = session && typeof session === 'object' && !Array.isArray(session) ? session : null;
  const mode = safeSession && typeof safeSession.mode === 'string' ? safeSession.mode : null;
  const isGps = mode === 'gps';
  const isGuided = mode === 'guided';

  if (isGps) {
    return {
      showTeachBox: false,
      showFeedback: phase === 'summary',
    };
  }

  return {
    showTeachBox: isGuided && (phase === 'active-item' || phase === 'feedback'),
    showFeedback: phase === 'feedback' || phase === 'summary',
  };
}

/**
 * Child-friendly placeholder copy for the text input area. Mode-specific so
 * combine / transfer prompts the learner to start typing their own answer,
 * while insert / fix / paragraph modes (where the stem prefills the input)
 * suggest editing-in-place. Unknown modes fall back to a generic prompt.
 */
export function punctuationSessionInputPlaceholder(itemMode) {
  if (typeof itemMode !== 'string' || !itemMode) return 'Type your answer here';
  switch (itemMode) {
    case 'insert': return 'Add the missing punctuation';
    case 'fix': return 'Fix the punctuation';
    case 'paragraph': return 'Repair the whole passage';
    case 'combine': return 'Combine the parts into one sentence';
    case 'transfer': return 'Write one accurate sentence';
    case 'choose': return '';
    default: return 'Type your answer here';
  }
}
