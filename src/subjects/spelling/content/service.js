import { cloneSerialisable } from '../../../platform/core/repositories/helpers.js';
import {
  backfillSpellingWordExplanations,
  buildSpellingContentSummary,
  createPortableSpellingContentExport,
  extractPortableSpellingContent,
  normaliseSpellingContentBundle,
  publishSpellingContentBundle,
  resolveRuntimeSnapshot,
  validateSpellingContentBundle,
} from './model.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE, SEEDED_SPELLING_PUBLISHED_SNAPSHOT } from '../data/content-data.js';

export function createSpellingContentService({ repository, seededBundle = SEEDED_SPELLING_CONTENT_BUNDLE } = {}) {
  if (!repository || typeof repository.read !== 'function' || typeof repository.write !== 'function' || typeof repository.clear !== 'function') {
    throw new TypeError('Spelling content service requires a repository with read/write/clear methods.');
  }

  const seeded = normaliseSpellingContentBundle(seededBundle);

  function readBundle() {
    return backfillSpellingWordExplanations(repository.read() || seeded, seeded);
  }

  async function hydrate() {
    if (typeof repository.hydrate === 'function') {
      await repository.hydrate();
    }
    return readBundle();
  }

  async function writeBundle(rawBundle) {
    const bundle = backfillSpellingWordExplanations(rawBundle, seeded);
    const saved = await repository.write(bundle);
    return backfillSpellingWordExplanations(saved || bundle, seeded);
  }

  function validation() {
    return validateSpellingContentBundle(readBundle());
  }

  function getRuntimeSnapshot() {
    const current = readBundle();
    const published = resolveRuntimeSnapshot(current, { referenceBundle: seeded });
    if (published?.words?.length) return cloneSerialisable(published);
    return cloneSerialisable(SEEDED_SPELLING_PUBLISHED_SNAPSHOT);
  }

  return {
    hydrate,
    readBundle,
    writeBundle,
    validate() {
      return validation();
    },
    getSummary() {
      const current = readBundle();
      return buildSpellingContentSummary(current);
    },
    getRuntimeSnapshot,
    exportPortable() {
      return createPortableSpellingContentExport(readBundle());
    },
    async importPortable(rawPayload) {
      const bundle = backfillSpellingWordExplanations(extractPortableSpellingContent(rawPayload), seeded);
      const checked = validateSpellingContentBundle(bundle);
      if (!checked.ok) {
        const error = new Error(`Imported spelling content has ${checked.errors.length} validation error(s).`);
        error.validation = checked;
        throw error;
      }
      return writeBundle(checked.bundle);
    },
    async publishDraft({ notes = '', title = '' } = {}) {
      const next = publishSpellingContentBundle(readBundle(), { notes, title, publishedAt: Date.now() });
      return writeBundle(next);
    },
    async resetToSeeded() {
      const next = await repository.clear();
      return normaliseSpellingContentBundle(next || seeded);
    },
  };
}
