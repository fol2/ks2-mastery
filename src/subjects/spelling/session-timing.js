export const SPELLING_SESSION_HERO_MORPH_MS = 720;
export const SPELLING_SESSION_PROMPT_SLIDE_MS = 520;
export const SPELLING_SESSION_QUESTION_REVEAL_PAUSE_MS = 100;
export const SPELLING_SESSION_QUESTION_REVEAL_ANIMATION_MS = 320;

export const SPELLING_SESSION_QUESTION_REVEAL_MS =
  SPELLING_SESSION_HERO_MORPH_MS + SPELLING_SESSION_PROMPT_SLIDE_MS + SPELLING_SESSION_QUESTION_REVEAL_PAUSE_MS;

export const SPELLING_SESSION_ENTRY_AUDIO_DELAY_MS =
  SPELLING_SESSION_QUESTION_REVEAL_MS + SPELLING_SESSION_QUESTION_REVEAL_ANIMATION_MS;

export function shouldDelaySpellingSessionQuestionReveal({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null,
} = {}) {
  const flowTransitionActive = documentRef?.documentElement?.classList?.contains?.('spelling-flow-transition');
  if (!flowTransitionActive) return false;
  const reducedMotion = Boolean(windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  return !reducedMotion;
}
