import { mapToSubjectPayload as spellingAdapter } from './spelling.js';
import { mapToSubjectPayload as grammarAdapter } from './grammar.js';
import { mapToSubjectPayload as punctuationAdapter } from './punctuation.js';

const ADAPTER_MAP = Object.freeze({
  spelling: spellingAdapter,
  grammar: grammarAdapter,
  punctuation: punctuationAdapter,
});

export function mapHeroEnvelopeToSubjectPayload(taskEnvelope) {
  const subjectId = taskEnvelope?.subjectId;
  const adapter = ADAPTER_MAP[subjectId];
  if (!adapter) {
    return { launchable: false, reason: 'subject-adapter-not-found' };
  }
  return adapter(taskEnvelope);
}
