// Awaited dynamic imports + process.exit(1) are deliberate: static top-level
// imports can let an async rejection in a chained script (e.g. esbuild
// failing inside build-client.mjs) settle after this entry's sync body
// finishes, leaving Node to exit 0 and hiding the failure from CI. The
// explicit await/catch guarantees a non-zero exit on any step failure.
try {
  await import('./generate-monster-visual-manifest.mjs');
  await import('./build-client.mjs');
} catch (error) {
  console.error(error);
  process.exit(1);
}
