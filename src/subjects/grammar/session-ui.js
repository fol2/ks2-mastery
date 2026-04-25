// Pure session label/visibility selectors for the Grammar surface. Mirrors
// the shape of `src/subjects/spelling/session-ui.js` so every JSX unit
// imports from one source of truth rather than restating branches inline.
//
// No React. No SSR. No import from `./components/*`. These helpers are
// pure functions on the Worker-projected `session` shape plus the
// `grammar.phase` string. They are safe to call in any test.

function isMiniTestSession(session) {
  return Boolean(session) && session.type === 'mini-set';
}

function miniTestQuestions(session) {
  return Array.isArray(session?.miniTest?.questions) ? session.miniTest.questions : [];
}

function miniTestIsFinished(session) {
  return Boolean(session?.miniTest?.finished);
}

/**
 * Label for the primary session submit button. The branches mirror the
 * Spelling helper: mini-test uses `Save and next`, retry uses `Try again`,
 * feedback locks in a saved answer, otherwise we default to `Submit`.
 *
 * Returns one of: `Submit | Saved | Try again | Save and next | Finish mini-set`.
 */
export function grammarSessionSubmitLabel(session, awaitingAdvance = false) {
  if (!session) return 'Submit';
  if (awaitingAdvance) return 'Saved';
  if (isMiniTestSession(session)) {
    if (miniTestIsFinished(session)) return 'Finish mini-set';
    return 'Save and next';
  }
  if (session.phase === 'retry') return 'Try again';
  return 'Submit';
}

/**
 * Single truth table for help/support visibility during the session and
 * feedback phases. Every JSX unit that decides whether to render an AI
 * action, worked solution, faded-support button, or similar-problem
 * button must call this helper once and thread the returned flags down.
 *
 * Rules:
 * - Mini-test (before finish): every flag is `false`. No feedback, no AI,
 *   no support, no worked solution, no similar problem.
 * - Independent practice, pre-answer (`grammarPhase === 'session'`):
 *   every help flag is `false`. The learner sees one prompt + one input +
 *   Submit. AI, worked, similar-problem are gated behind marking.
 * - Independent practice, feedback (`grammarPhase === 'feedback'`):
 *   AI actions, repair actions (retry / worked / similar), worked solution
 *   preview and similar-problem button are all visible. Faded support is
 *   visible only when `session.supportLevel === 0` (the learner has not
 *   already opted into a support mode).
 */
export function grammarSessionHelpVisibility(session, grammarPhase) {
  const noHelp = {
    showAiActions: false,
    showRepairActions: false,
    showWorkedSolution: false,
    showSimilarProblem: false,
    showFadedSupport: false,
  };
  if (!session) return noHelp;
  if (isMiniTestSession(session) && !miniTestIsFinished(session)) return noHelp;
  if (grammarPhase !== 'feedback') return noHelp;

  const supportLevel = Number.isFinite(Number(session.supportLevel))
    ? Math.max(0, Number(session.supportLevel))
    : 0;

  return {
    showAiActions: true,
    showRepairActions: true,
    showWorkedSolution: true,
    showSimilarProblem: true,
    showFadedSupport: supportLevel === 0,
  };
}

/**
 * Child-facing progress label. Mini-test uses `Mini Test — Question X of N`
 * to match the test copy in plan §U8 `grammarSessionProgressLabel` scenario.
 * Independent practice uses `Question X of N` based on `currentIndex` and
 * `targetCount`. The label is never `Phase: retry` — child copy stays
 * mastery-friendly and does not expose engine phase names.
 */
export function grammarSessionProgressLabel(session) {
  if (!session) return '';
  if (isMiniTestSession(session)) {
    const questions = miniTestQuestions(session);
    const total = Math.max(1, Number(session.miniTest?.setSize) || questions.length || 1);
    const index = Math.max(0, Number(session.miniTest?.currentIndex) || 0);
    const questionNumber = Math.min(total, index + 1);
    return `Mini Test — Question ${questionNumber} of ${total}`;
  }
  const rawTotal = Number(session.targetCount);
  const total = Number.isFinite(rawTotal) && rawTotal > 0 ? Math.floor(rawTotal) : 1;
  const rawIndex = Number(session.currentIndex);
  const safeIndex = Number.isFinite(rawIndex) && rawIndex >= 0 ? Math.floor(rawIndex) : 0;
  const questionNumber = Math.min(total, safeIndex + 1);
  return `Question ${questionNumber} of ${total}`;
}

/**
 * Small set of chips for the session-prompt header. Child mode removes
 * `Worker authority`, adult `domain`, and internal `questionType` labels.
 * Only two child-friendly chips are surfaced today:
 *   - `Mini Test` when the session is a mini-set.
 *   - The concept display name, if the current item carries one.
 * Returns an array of strings so JSX consumers just `.map()`.
 */
export function grammarSessionInfoChips(session) {
  if (!session) return [];
  const chips = [];
  if (isMiniTestSession(session)) chips.push('Mini Test');
  const conceptName = session.currentItem?.conceptName
    || (Array.isArray(session.currentItem?.concepts) ? session.currentItem.concepts[0]?.name : '')
    || '';
  if (typeof conceptName === 'string' && conceptName.trim()) {
    chips.push(conceptName.trim());
  }
  return chips;
}

/**
 * Child-friendly footer note for the session surface. Never mentions
 * `Worker`, `evidence`, `projection`, or reward routes. Mini-test and
 * practice get different reminders. This is the full visible note; U3
 * drops it in place of the previous adult-diagnostic copy.
 */
export function grammarSessionFooterNote(session) {
  if (!session) return '';
  if (isMiniTestSession(session)) {
    return 'Mini Test keeps marks hidden until the end. Save your answer and move on.';
  }
  return 'Answer the question. You will see feedback after you submit.';
}

/**
 * Tone mapping for the feedback panel. Correct answers read as `good`;
 * incorrect answers read as `bad`; anything else (e.g., pending, cancelled)
 * reads as `neutral`. Consumers render this through an existing CSS chip
 * class.
 */
export function grammarFeedbackTone(result) {
  if (!result || typeof result !== 'object') return 'neutral';
  if (result.correct === true) return 'good';
  if (result.correct === false) return 'bad';
  return 'neutral';
}
