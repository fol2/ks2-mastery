import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildSpellingContentSummary,
  extractPortableSpellingContent,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';
import { PATTERN_LAUNCH_THRESHOLD, SPELLING_PATTERN_IDS } from '../src/subjects/spelling/content/patterns.js';

const inputFile = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), 'content', 'spelling.seed.json');
const raw = JSON.parse(await readFile(inputFile, 'utf8'));
const bundle = extractPortableSpellingContent(raw);
const validation = validateSpellingContentBundle(bundle);
const summary = buildSpellingContentSummary(bundle);

// P2 U10: surface per-pattern tag counts so content editors (and CI) can see
// at a glance which patterns cleared the launch threshold (≥4 tagged core
// words) and which are deferred. Counting here (not in the model validator)
// keeps the validator's shape unchanged while giving the CLI a readable
// diagnostic. Patterns with zero tagged words still appear so the list is
// stable across migrations.
const patternCounts = Object.fromEntries(SPELLING_PATTERN_IDS.map((id) => [id, 0]));
for (const word of bundle.draft.words) {
  if (word.spellingPool !== 'core') continue;
  for (const patternId of word.patternIds || []) {
    if (Object.prototype.hasOwnProperty.call(patternCounts, patternId)) {
      patternCounts[patternId] += 1;
    }
  }
}
const launchedPatternIds = SPELLING_PATTERN_IDS.filter((id) => patternCounts[id] >= PATTERN_LAUNCH_THRESHOLD);

console.log(JSON.stringify({
  ok: validation.ok,
  summary,
  patternCounts,
  launchedPatternIds,
  launchThreshold: PATTERN_LAUNCH_THRESHOLD,
  errors: validation.errors,
  warnings: validation.warnings,
}, null, 2));

// Exit non-zero on hard errors; warnings (including pattern_below_launch_threshold)
// stay non-fatal so CI continues to pass while a content editor fills gaps.
if (!validation.ok) process.exitCode = 1;
