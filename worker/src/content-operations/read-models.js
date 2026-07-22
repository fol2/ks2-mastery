import {
  buildSpellingContentBrowseModel,
  buildSpellingContentSentenceDetail,
  buildSpellingContentWordDetail,
} from '../../../src/subjects/spelling/content/editor-read-model.js';
import {
  CONTENT_OPERATION_SUBJECT_ID,
} from '../../../src/subjects/spelling/content/operations-model.js';
import {
  readSeededSpellingContentBundle,
} from '../spelling-content-seed-loader.js';

function normaliseString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function readSpellingContentSources({
  repository,
  subjectId = CONTENT_OPERATION_SUBJECT_ID,
  packageId = '',
} = {}) {
  const latestRelease = await repository.readLatestContentOperationRelease(subjectId, {
    includeSnapshot: true,
  });
  const publishedContent = latestRelease?.snapshot || await readSeededSpellingContentBundle();
  const packageRecord = packageId
    ? await repository.readContentOperationPackage(packageId, { includeOperations: false })
    : null;
  const packageCandidate = packageId
    ? await repository.readLatestContentOperationCandidate(packageId, {
      includeSnapshot: true,
      requireCurrent: true,
    })
    : null;
  return {
    publishedContent,
    packageContent: packageCandidate?.isCurrent === false ? null : packageCandidate?.candidate || null,
    packageCandidate,
    packageRecord,
    packageId,
    releaseInfo: {
      releaseId: latestRelease?.releaseId || '',
      snapshotHash: latestRelease?.snapshotHash || '',
      publishedAt: latestRelease?.publishedAt || 0,
      source: latestRelease ? 'latest_release' : 'seeded_fallback',
    },
  };
}

export async function readSpellingContentBrowseModel({
  repository,
  subjectId = CONTENT_OPERATION_SUBJECT_ID,
  packageId = '',
  filters = {},
} = {}) {
  const sources = await readSpellingContentSources({
    repository,
    subjectId,
    packageId: normaliseString(packageId),
  });
  return buildSpellingContentBrowseModel({
    ...sources,
    filters,
  });
}

export async function readSpellingContentWordDetailModel({
  repository,
  subjectId = CONTENT_OPERATION_SUBJECT_ID,
  packageId = '',
  slug = '',
} = {}) {
  const sources = await readSpellingContentSources({
    repository,
    subjectId,
    packageId: normaliseString(packageId),
  });
  return buildSpellingContentWordDetail({
    ...sources,
    slug,
  });
}

export async function readSpellingContentSentenceDetailModel({
  repository,
  subjectId = CONTENT_OPERATION_SUBJECT_ID,
  packageId = '',
  sentenceId = '',
} = {}) {
  const sources = await readSpellingContentSources({
    repository,
    subjectId,
    packageId: normaliseString(packageId),
  });
  return buildSpellingContentSentenceDetail({
    ...sources,
    sentenceId,
  });
}
