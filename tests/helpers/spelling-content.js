import { cloneSerialisable } from '../../src/platform/core/repositories/helpers.js';

export function coreOnlyVersionOneContent(bundle) {
  const next = cloneSerialisable(bundle);
  const coreWords = next.draft.words.filter((word) => word.spellingPool !== 'extra');
  const coreSlugs = new Set(coreWords.map((word) => word.slug));
  const coreListIds = new Set(coreWords.map((word) => word.listId));
  next.modelVersion = 1;
  next.draft.wordLists = next.draft.wordLists
    .filter((list) => coreListIds.has(list.id))
    .map(({ spellingPool: _spellingPool, ...list }) => list);
  next.draft.words = coreWords.map(({ spellingPool: _spellingPool, ...word }) => word);
  next.draft.sentences = next.draft.sentences.filter((sentence) => coreSlugs.has(sentence.wordSlug));

  const release = cloneSerialisable(next.releases.find((entry) => entry.version === 1) || next.releases[0]);
  const releaseWords = release.snapshot.words
    .filter((word) => word.spellingPool !== 'extra')
    .map(({ spellingPool: _spellingPool, ...word }) => word);
  release.snapshot.words = releaseWords;
  release.snapshot.wordBySlug = Object.fromEntries(releaseWords.map((word) => [word.slug, word]));
  next.releases = [release];
  next.publication = {
    currentReleaseId: release.id,
    publishedVersion: release.version,
    updatedAt: release.publishedAt,
  };
  return next;
}
