// Fixture orchestrator that mirrors the exact control flow of
// scripts/build-bundles.mjs: awaited dynamic imports inside a try/catch
// that calls process.exit(1) on rejection. The sibling import points at
// a missing module, so running this fixture must exit with a non-zero
// status. tests/build-bundles-failfast.test.js locks this in so a future
// cleanup pass cannot silently revert the fail-fast pattern.
try {
  await import('./missing-module-does-not-exist.mjs');
} catch (error) {
  console.error(error);
  process.exit(1);
}
