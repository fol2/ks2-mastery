let seedModulePromise = null;

function loadSeedModule() {
  if (!seedModulePromise) {
    seedModulePromise = import('./generated-spelling-content-seed.js');
  }
  return seedModulePromise;
}

export async function readSeededSpellingContentBundle() {
  const seedModule = await loadSeedModule();
  return seedModule.readSeededSpellingContentBundle();
}

export async function readSeededSpellingPublishedSnapshot() {
  const seedModule = await loadSeedModule();
  return seedModule.readSeededSpellingPublishedSnapshot();
}

export async function readSeededSpellingContentSummary() {
  const seedModule = await loadSeedModule();
  return seedModule.SEEDED_SPELLING_CONTENT_SUMMARY;
}
