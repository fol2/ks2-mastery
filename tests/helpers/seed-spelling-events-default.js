// Side-effect import: seeds the module-scoped `wordMeta` fallback on
// `src/subjects/spelling/events.js` so event factories can resolve slugs
// without every caller threading `wordMeta: WORD_BY_SLUG`. Node's `--test`
// runs each test file in its own subprocess, so this seed is per-file and
// does not leak across tests.
import { WORD_BY_SLUG } from '../../src/subjects/spelling/data/word-data.js';
import { __setDefaultSpellingWordBySlug } from '../../src/subjects/spelling/events.js';

__setDefaultSpellingWordBySlug(WORD_BY_SLUG);
