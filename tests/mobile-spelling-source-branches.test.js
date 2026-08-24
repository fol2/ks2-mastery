import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CONFIG_URL = new URL('../config/mobile-spelling-source-branches.json', import.meta.url);

const EXPECTED_CONFIG = {
  schemaVersion: 1,
  sourceCommit: '8da3218a5077be24cabaf82031ade17d0389a958',
  branches: [
    {
      ref: 'origin/codex/11-plus-secure-vocabulary',
      observedCommit: '64420f62c6ada54c699b4511b8d218977c61e698',
      disposition: 'future-secure-pack-source',
      decision:
        'Preserve content and evidence for a separately quality-gated secure-vocabulary product; do not merge the branch or include it in v1 Full KS2.',
    },
    {
      ref: 'origin/codex/secure-vocabulary-sentences',
      observedCommit: '73dcd5771da4fc381f29aa024011ab5f9d1c1f1c',
      disposition: 'future-secure-content-with-a1-code-review',
      decision:
        'Preserve semantic sentence and meaning assets for the future secure pack; review the named pool-taxonomy and complete-Word-Bank commits selectively during A1.',
    },
    {
      ref: 'origin/codex/spelling-503-hotfix-20260606',
      observedCommit: '381e8942556bdc3ecf539281045391bf8490e1a2',
      disposition: 'worker-only-excluded-from-mobile-extraction',
      decision:
        'The unique change is a Worker sync CPU hot-path fix. Keep it in the web production lane and do not import Worker authority into the local mobile kernel.',
    },
    {
      ref: 'origin/codex/spelling-command-503-fallback',
      observedCommit: '5f72a081a16fba40bd3cdd53f850e5387f000a85',
      disposition: 'already-contained-in-source',
      decision:
        'The branch tip is an ancestor of the approved donor commit; no separate extraction action is required.',
    },
    {
      ref: 'origin/codex/spelling-package-b3w-completion',
      observedCommit: '16480c56c14e88262bd42b8a94ba61c910f1eef3',
      disposition: 'already-contained-in-source',
      decision:
        'The branch tip is an ancestor of the approved donor commit; no separate extraction action is required.',
    },
    {
      ref: 'origin/codex/spelling-wordbank-extra-sync',
      observedCommit: '5c2e56ad720cae2ddbd6b832e1f3242ca1cf8033',
      disposition: 'a1-selective-port-review',
      decision:
        'Do not merge this old branch wholesale. Compare its pure pool-taxonomy and complete Word Bank rows against the A1 portable boundary before moving the service.',
    },
  ],
  a1SelectiveReviewCommits: [
    {
      commit: '1faa55ba',
      purpose: 'Review the spelling pool taxonomy as a possible portable leaf module.',
    },
    {
      commit: '5c2e56ad',
      purpose: 'Review complete Word Bank row loading for retained local parity.',
    },
  ],
};

function readConfig() {
  return JSON.parse(readFileSync(CONFIG_URL, 'utf8'));
}

test('mobile source register classifies every reviewed spelling branch', () => {
  const config = readConfig();
  const branches = new Map(config.branches.map((entry) => [entry.ref, entry]));

  assert.deepEqual(config, EXPECTED_CONFIG);
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.sourceCommit, '8da3218a5077be24cabaf82031ade17d0389a958');
  assert.equal(config.branches.length, 6);
  assert.equal(branches.size, config.branches.length);
  assert.deepEqual([...branches.keys()].sort(), [
    'origin/codex/11-plus-secure-vocabulary',
    'origin/codex/secure-vocabulary-sentences',
    'origin/codex/spelling-503-hotfix-20260606',
    'origin/codex/spelling-command-503-fallback',
    'origin/codex/spelling-package-b3w-completion',
    'origin/codex/spelling-wordbank-extra-sync',
  ]);

  assert.equal(
    branches.get('origin/codex/11-plus-secure-vocabulary').disposition,
    'future-secure-pack-source',
  );
  assert.equal(
    branches.get('origin/codex/secure-vocabulary-sentences').disposition,
    'future-secure-content-with-a1-code-review',
  );
  assert.equal(
    branches.get('origin/codex/spelling-503-hotfix-20260606').disposition,
    'worker-only-excluded-from-mobile-extraction',
  );
  assert.equal(
    branches.get('origin/codex/spelling-command-503-fallback').disposition,
    'already-contained-in-source',
  );
  assert.equal(
    branches.get('origin/codex/spelling-package-b3w-completion').disposition,
    'already-contained-in-source',
  );
  assert.equal(
    branches.get('origin/codex/spelling-wordbank-extra-sync').disposition,
    'a1-selective-port-review',
  );

  for (const entry of branches.values()) {
    assert.match(entry.observedCommit, /^[0-9a-f]{40}$/);
    assert.ok(entry.decision.length >= 20);
  }
});

test('A1 selective review names exact candidate commits', () => {
  const config = readConfig();
  const candidates = new Set(config.a1SelectiveReviewCommits.map((entry) => entry.commit));

  assert.equal(config.a1SelectiveReviewCommits.length, 2);
  assert.equal(candidates.size, config.a1SelectiveReviewCommits.length);
  assert.deepEqual(candidates, new Set(['1faa55ba', '5c2e56ad']));
});
