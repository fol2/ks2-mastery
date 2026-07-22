import {
  buildPublishedSnapshotFromDraft,
  buildSpellingContentSummary,
  validateSpellingContentBundle,
} from './model.js';
import { coverageTierCounts } from './taxonomy.js';

export const SPELLING_RUNTIME_RELEASE_PROJECTION_VERSION = 1;

function runtimeSentenceCount(snapshot) {
  return snapshot?.words?.reduce((total, word) => {
    const baseCount = Array.isArray(word.sentences) ? word.sentences.length : 0;
    const variantCount = (Array.isArray(word.variants) ? word.variants : [])
      .reduce((sum, variant) => sum + (Array.isArray(variant.sentences) ? variant.sentences.length : 0), 0);
    return total + baseCount + variantCount;
  }, 0) || 0;
}

export function buildSpellingRuntimeReleaseProjection(rawBundle, {
  releaseId = '',
  publishedAt = Date.now(),
} = {}) {
  const validation = validateSpellingContentBundle(rawBundle);
  if (!validation.ok) {
    throw new Error(`Cannot compile an invalid Spelling content release (${validation.errors.length} error(s)).`);
  }

  const content = validation.bundle;
  const snapshot = buildPublishedSnapshotFromDraft(content.draft, {
    generatedAt: publishedAt,
    includeDeferredVisibility: true,
  });
  const baseSummary = buildSpellingContentSummary(content);
  const tierCounts = coverageTierCounts(snapshot.words || []);
  const summary = {
    ...baseSummary,
    publishedReleaseId: releaseId || baseSummary.publishedReleaseId || '',
    publishedAt: Number(publishedAt) || baseSummary.publishedAt || 0,
    runtimeWordCount: snapshot.words?.length || 0,
    runtimeSentenceCount: runtimeSentenceCount(snapshot),
    statutoryCoreCount: tierCounts.statutoryCore,
    secureExtensionCount: tierCounts.secureExtension,
    enrichmentExtraCount: tierCounts.enrichmentExtra,
    currentDraftId: content.draft.id,
    currentDraftVersion: content.draft.version,
    currentDraftState: content.draft.state,
    draftUpdatedAt: content.draft.updatedAt,
    importedAt: content.draft.provenance?.importedAt || 0,
    source: content.draft.provenance?.source || '',
    errors: validation.errors.slice(0, 5),
    warnings: validation.warnings.slice(0, 5),
  };

  return {
    version: SPELLING_RUNTIME_RELEASE_PROJECTION_VERSION,
    subjectId: 'spelling',
    releaseId: summary.publishedReleaseId,
    snapshot,
    summary,
  };
}

export function isSpellingRuntimeReleaseProjection(value, { releaseId = '' } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.version !== SPELLING_RUNTIME_RELEASE_PROJECTION_VERSION) return false;
  if (value.subjectId !== 'spelling') return false;
  if (releaseId && value.releaseId !== releaseId) return false;
  if (!value.snapshot || typeof value.snapshot !== 'object' || Array.isArray(value.snapshot)) return false;
  if (!Array.isArray(value.snapshot.words) || !value.snapshot.wordBySlug) return false;
  return Boolean(value.summary && typeof value.summary === 'object' && !Array.isArray(value.summary));
}
