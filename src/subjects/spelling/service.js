import { createSpellingService as createSharedSpellingService } from '../../../shared/spelling/service.js';
import { WORDS, WORD_BY_SLUG } from './data/word-data.js';

export function createSpellingService(options = {}) {
  const {
    contentSnapshot = {
      words: WORDS,
      wordBySlug: WORD_BY_SLUG,
    },
    ...serviceOptions
  } = options;

  return createSharedSpellingService({
    ...serviceOptions,
    contentSnapshot,
  });
}
