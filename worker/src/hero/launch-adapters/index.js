import { mapToSubjectPayload as arithmeticAdapter } from './arithmetic.js';
import { mapToSubjectPayload as spellingAdapter } from './spelling.js';
import { mapToSubjectPayload as grammarAdapter } from './grammar.js';
import { mapToSubjectPayload as punctuationAdapter } from './punctuation.js';
import { mapToSubjectPayload as readingAdapter } from './reading.js';
import { mapToSubjectPayload as reasoningAdapter } from './reasoning.js';

const ADAPTER_MAP = Object.freeze({
  arithmetic: arithmeticAdapter,
  spelling: spellingAdapter,
  grammar: grammarAdapter,
  punctuation: punctuationAdapter,
  reading: readingAdapter,
  reasoning: reasoningAdapter,
});

export function mapHeroEnvelopeToSubjectPayload(taskEnvelope) {
  const subjectId = taskEnvelope?.subjectId;
  const adapter = ADAPTER_MAP[subjectId];
  if (!adapter) {
    return { launchable: false, reason: 'subject-adapter-not-found' };
  }
  return adapter(taskEnvelope);
}
