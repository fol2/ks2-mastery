try {
  await import('./generate-monster-visual-manifest.mjs');
  await import('./build-client.mjs');
} catch (error) {
  console.error(error);
  process.exit(1);
}
