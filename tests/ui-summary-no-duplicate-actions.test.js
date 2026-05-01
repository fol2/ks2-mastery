// UI Refactor P4 U4: subject summaries must use SessionSummaryFrame as the
// primary summary frame, not append it below legacy headline/action clusters.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('P4 U4 summary scenes do not render legacy and shared action clusters together', () => {
  const scenes = [
    {
      name: 'Spelling',
      path: 'src/subjects/spelling/components/SpellingSummaryScene.jsx',
      forbidden: [
        'className="summary-actions"',
        'className="summary-bank-link"',
        'alongside the existing visual shell',
      ],
    },
    {
      name: 'Grammar',
      path: 'src/subjects/grammar/components/GrammarSummaryScene.jsx',
      forbidden: [
        'grammar-summary-primary-actions',
        'grammar-summary-secondary-actions',
        'grammar-summary-ribbon',
        'alongside the existing visual shell',
      ],
    },
    {
      name: 'Punctuation',
      path: 'src/subjects/punctuation/components/PunctuationSummaryScene.jsx',
      forbidden: [
        'function NextActionRow',
        'punctuation-summary-actions',
        'alongside the existing visual shell',
      ],
    },
  ];

  for (const scene of scenes) {
    const text = source(scene.path);
    assert.match(
      text,
      /<SessionSummaryFrame[\s\S]*nextPrimaryAction=\{nextPrimaryAction\}[\s\S]*secondaryActions=\{secondaryActions\}/,
      `${scene.name} summary must route its primary and secondary next actions through SessionSummaryFrame`,
    );
    for (const marker of scene.forbidden) {
      assert.doesNotMatch(
        text,
        new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${scene.name} summary still contains legacy duplicate marker: ${marker}`,
      );
    }
  }
});
