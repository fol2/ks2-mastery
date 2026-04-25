import { GRAMMAR_SUBJECT_ID, normaliseGrammarReadModel } from './metadata.js';

function isTypingElement(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tagName = String(target.tagName || '').toUpperCase();
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function isMiniTestSession(session) {
  return session && typeof session === 'object' && session.type === 'mini-set';
}

export function resolveGrammarShortcut(event, appState) {
  const subjectId = appState?.route?.subjectId || null;
  const tab = appState?.route?.tab || 'practice';
  if (subjectId !== GRAMMAR_SUBJECT_ID || tab !== 'practice') return null;

  if (event?.key !== 'Enter') return null;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (event.repeat) return null;

  if (isTypingElement(event?.target)) return null;

  const grammar = normaliseGrammarReadModel(
    appState?.subjectUi?.[GRAMMAR_SUBJECT_ID],
    appState?.learners?.selectedId || '',
  );

  if (grammar.phase !== 'feedback' && !grammar.awaitingAdvance) return null;
  if (isMiniTestSession(grammar.session)) return null;
  if (grammar.pendingCommand) return null;

  return { action: 'grammar-continue', preventDefault: true };
}
