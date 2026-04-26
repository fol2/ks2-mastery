// Seed the module-scoped default `wordMeta` for the spelling event factories.
//
// Background: `src/subjects/spelling/events.js` no longer statically imports
// `WORD_BY_SLUG` from the content dataset, because doing so dragged the full
// 200k-line content dataset into the production client bundle via
// `achievements.js` -> `events.js` and failed `audit:client`. Production
// server callers in `shared/spelling/service.js` always pass `wordMeta`
// explicitly, so they are unaffected by the removal.
//
// The node test suite has ~50 call sites that previously relied on the
// implicit default. Rather than thread `wordMeta: WORD_BY_SLUG` through
// every call, importing this helper once at the top of a test file seeds the
// module-scoped default. Node's `--test` runner executes each test file in a
// child process, so the seed is scoped to the file — there is no inter-file
// state leakage.
import { WORD_BY_SLUG } from '../../src/subjects/spelling/data/word-data.js';
import { __setDefaultSpellingWordBySlug } from '../../src/subjects/spelling/events.js';

__setDefaultSpellingWordBySlug(WORD_BY_SLUG);
