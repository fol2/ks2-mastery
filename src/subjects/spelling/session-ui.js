function isLearningSession(session) {
  return Boolean(session) && session.type !== 'test';
}

// Boss Dictation session helper branches.
// U5 defines these Boss strings so U9's `submitBossAnswer` tests can assert
// against them before the Boss service path lands. The guardrail is that a
// Boss session (`session.mode === 'boss'`) is `type: 'test'`-shaped yet must
// NEVER leak SATs copy like "SATs one-shot" or "SATs mode uses audio only"
// — those belong to the statutory SATs Test surface, not Boss.
function isBossSession(session) {
  return Boolean(session) && session.mode === 'boss';
}

function isGuardianSession(session) {
  return Boolean(session) && session.mode === 'guardian';
}

export function spellingSessionSubmitLabel(session, awaitingAdvance = false) {
  if (!session) return 'Submit';
  if (awaitingAdvance) return 'Saved';
  if (isBossSession(session)) return 'Lock it in';
  if (session.type === 'test') return 'Save and next';
  if (session.phase === 'retry') return 'Try again';
  if (session.phase === 'correction') return 'Lock it in';
  return 'Submit';
}

export function spellingSessionInputPlaceholder(session) {
  if (!session) return 'Type the spelling here';
  if (isBossSession(session)) return 'Type the Mega word';
  if (session.type === 'test') return 'Type the spelling and move on';
  if (session.phase === 'retry') return 'Try once more from memory';
  if (session.phase === 'correction') return 'Type the correct spelling once';
  return 'Type the spelling here';
}

export function spellingSessionContextNote(session) {
  if (!session) return 'Family hidden during live recall.';
  if (isBossSession(session)) return 'Boss round. Mega words only.';
  if (isGuardianSession(session)) return 'Spell the word from memory. One clean attempt.';
  if (session.type === 'test') return 'SATs mode uses audio only. Press Replay to hear the dictation again.';
  return 'Family hidden during live recall.';
}

export function spellingSessionFooterNote(session) {
  if (!session) return '';
  if (isBossSession(session)) {
    // Boss Dictation is `type: 'test'`-shaped but NEVER demotes Mega, so the
    // SATs footer ("Wrong answers are marked due again for this learner after
    // the test") is incorrect for Boss. This branch lives before the generic
    // `session.type === 'test'` check so a Boss session can never leak SATs
    // demotion copy.
    return 'Boss Dictation: one clean attempt per Mega word. Your Mega count never drops here. Esc replays, and Shift+Esc replays slowly.';
  }
  if (session.type === 'test') {
    return 'The audio follows the KS2 pattern: the word, then the sentence, then the word again. Wrong answers are marked due again for this learner after the test. Esc replays, and Shift+Esc replays slowly.';
  }
  if (session.practiceOnly) {
    return 'Practice-only drill: answers here do not change correct counts, stages, due dates, or secure-word progress. Esc replays, Shift+Esc replays slowly, Alt+S skips, and Alt+K focuses the answer box.';
  }
  return 'New words need two clean recalls in one round. A missed word gets one blind retry; if it is still wrong, the answer appears, then the word returns once later for a clean check. Esc replays, Shift+Esc replays slowly, Alt+S skips, and Alt+K focuses the answer box.';
}

export function spellingSessionProgressLabel(session) {
  if (!session) return '';
  if (isBossSession(session)) return 'Boss round';
  if (session.type === 'test') return 'SATs one-shot';
  if (session.practiceOnly) return 'Practice only';
  return `Phase: ${session.phase}`;
}

export function spellingSessionInfoChips(session) {
  if (!session) return [];
  const chips = [];
  if (session.currentCard?.word?.yearLabel) chips.push(session.currentCard.word.yearLabel);
  if (session.practiceOnly) chips.push('Practice only');
  if (isGuardianSession(session)) chips.push('Guardian');
  if (isBossSession(session)) chips.push('Boss');
  return chips;
}

export function spellingSessionVoiceNote() {
  return 'AI-generated dictation voice';
}

/**
 * Skip-button label. Guardian Mission sessions use "I don't know" to signal
 * that the click routes through the Guardian wobble path (not the legacy
 * enqueue-later skip). Non-Guardian sessions keep the legacy "Skip for now".
 * See U4 in docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md.
 */
export function spellingSessionSkipLabel(session) {
  if (session && session.mode === 'guardian') return "I don't know";
  return 'Skip for now';
}
