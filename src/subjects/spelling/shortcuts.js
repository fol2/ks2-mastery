import { BOSS_DEFAULT_ROUND_LENGTH } from './service-contract.js';

function isTypingElement(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tagName = String(target.tagName || '').toUpperCase();
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function isAnswerInput(target) {
  return String(target?.name || '') === 'typed';
}

export function resolveSpellingShortcut(event, appState) {
  const subjectId = appState?.route?.subjectId || null;
  const tab = appState?.route?.tab || 'practice';
  if (subjectId !== 'spelling' || tab !== 'practice') return null;

  const spellingUi = appState?.subjectUi?.spelling || null;
  const target = event?.target || null;
  const typing = isTypingElement(target);
  const answerInput = isAnswerInput(target);

  if (event?.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    /* Word bank > word detail modal: Escape closes the modal first. If no
       modal is open, Escape returns from the word-bank scene to the setup
       dashboard so the key always has a sensible "go back" meaning. */
    if (spellingUi?.phase === 'word-bank') {
      if (appState?.transientUi?.spellingWordDetailSlug) {
        return { action: 'spelling-word-detail-close', preventDefault: true };
      }
      return { action: 'spelling-close-word-bank', preventDefault: true };
    }
    if (spellingUi?.phase !== 'session') return null;
    if (typing && !answerInput) return null;
    return {
      action: event.shiftKey ? 'spelling-replay-slow' : 'spelling-replay',
      preventDefault: true,
    };
  }

  if (!(event?.altKey && !event.ctrlKey && !event.metaKey)) return null;
  if (typing && !answerInput) return null;

  const key = String(event.key || '').toLowerCase();
  if (key === '1') {
    return { action: 'spelling-shortcut-start', data: { mode: 'smart' }, preventDefault: true };
  }
  if (key === '2') {
    return { action: 'spelling-shortcut-start', data: { mode: 'trouble' }, preventDefault: true };
  }
  if (key === '3') {
    return { action: 'spelling-shortcut-start', data: { mode: 'test' }, preventDefault: true };
  }
  // Alt+4 — Guardian Mission quick-start. The keybinding is additive; the
  // allWordsMega gate lives in `module.js::spelling-shortcut-start` so a
  // learner who hasn't graduated yet gets a silent no-op instead of a stale
  // Smart Review round. Alt+1/2/3 mappings are preserved verbatim.
  if (key === '4') {
    return { action: 'spelling-shortcut-start', data: { mode: 'guardian' }, preventDefault: true };
  }
  // Alt+5 — Boss Dictation quick-start (U10). Symmetric with Alt+4: the
  // resolver stays dumb (no runtime inspection of `postMastery.allWordsMega`)
  // and the gate lives downstream in `module.js::spelling-shortcut-start` /
  // `remote-actions.js::spelling-shortcut-start`. A non-graduated learner
  // therefore sees the same silent no-op as Alt+4 rather than a stale Smart
  // Review fallback.
  // The payload MUST carry `length: BOSS_DEFAULT_ROUND_LENGTH` so Alt+5 and
  // the Begin button produce the same 10-card round. Without it, the module
  // handler falls back to `prefs.roundLength` (default '20' for a fresh
  // learner, or any SATs-set value) and the Boss service clamps it down to
  // `BOSS_MAX_ROUND_LENGTH = 12` — a 12-card round instead of the
  // spec-mandated 10. Guardian's Alt+4 does not supply a length because
  // Guardian has no fixed plan-mandated length (it respects `prefs.roundLength`
  // via the service clamp), so the two shortcuts diverge intentionally.
  // Plan reference:
  // docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md (U10).
  if (key === '5') {
    return {
      action: 'spelling-shortcut-start',
      data: { mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH },
      preventDefault: true,
    };
  }
  if (key === 's') {
    if (spellingUi?.phase === 'session' && spellingUi.session?.type !== 'test' && spellingUi.session?.phase === 'question' && !spellingUi.awaitingAdvance) {
      return { action: 'spelling-skip', preventDefault: true };
    }
    return null;
  }
  if (key === 'k') {
    return { focusSelector: 'input[name="typed"]', preventDefault: true };
  }

  return null;
}
