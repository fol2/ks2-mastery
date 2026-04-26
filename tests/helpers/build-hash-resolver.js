// Test helper for U16 build-hash-injection. Mirrors the `resolveBuildHash`
// logic in `scripts/build-client.mjs` so tests can exercise the three
// control paths (clean / dirty / missing-git) without depending on the
// host's actual git state. The scripts/build-client.mjs helper is not
// directly importable because the module has an unconditional side-effect
// (top-level `await runBuildClient()`) gated only on an env flag; this
// mirror keeps the test hermetic without forcing an esbuild run.
//
// The behaviour is deliberately identical to the production helper:
//   1. `git rev-parse --short HEAD` → if it throws, return null.
//   2. Validate against `/^[a-f0-9]{6,40}$/` — non-match returns null.
//   3. `git status --porcelain` → any non-empty output returns null.
//   4. Otherwise return the rev-parse output trimmed.
//
// Keep this helper and `scripts/build-client.mjs::resolveBuildHash` in
// sync. The test covers the same branches against both.

function resolveWithStubs({
  revParseOutput = '',
  statusOutput = '',
  throwOnRevParse = false,
  throwOnStatus = false,
} = {}) {
  try {
    if (throwOnRevParse) {
      throw new Error('simulated execSync failure (.git missing)');
    }
    const hash = String(revParseOutput || '').trim();
    if (!/^[a-f0-9]{6,40}$/.test(hash)) return null;
    if (throwOnStatus) {
      throw new Error('simulated execSync failure (status)');
    }
    const dirty = String(statusOutput || '').trim();
    return dirty ? null : hash;
  } catch {
    return null;
  }
}

export default resolveWithStubs;
