import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import {
  buildGrammarMiniPack,
  buildGrammarPracticeQueue,
} from '../worker/src/subjects/grammar/selection.js';
import {
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';
import {
  isTemplateBlocked,
  CERTIFICATION_STATUS_MAP,
  _testBlockOverride,
} from '../worker/src/subjects/grammar/certification-status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const STATUS_MAP_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p9-certification-status-map.json');
const INVENTORY_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p9-question-inventory.json');

const statusMapJson = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));
const inventoryJson = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
const P9_TEMPLATE_IDS = Array.from(new Set(inventoryJson.items.map((item) => item.templateId))).sort();

describe('P9 Blocklist: blocked template exclusion in practiceQueue', () => {
  const blockedId = GRAMMAR_TEMPLATE_METADATA.find((t) => t.satsFriendly)?.id || GRAMMAR_TEMPLATE_METADATA[0].id;

  it('blocked template never appears in practice queue across many seeds', () => {
    _testBlockOverride.add(blockedId);
    try {
      for (let s = 1; s <= 50; s++) {
        const queue = buildGrammarPracticeQueue({ seed: s, size: 5 });
        const ids = queue.map((e) => e.templateId);
        assert.ok(!ids.includes(blockedId), `Blocked template ${blockedId} appeared in practice queue with seed ${s}`);
      }
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });

  it('blocked template CAN appear in practice queue with includeBlocked: true', () => {
    _testBlockOverride.add(blockedId);
    try {
      let appeared = false;
      for (let s = 1; s <= 200; s++) {
        const queue = buildGrammarPracticeQueue({ seed: s, size: 5, includeBlocked: true });
        if (queue.some((e) => e.templateId === blockedId)) {
          appeared = true;
          break;
        }
      }
      assert.ok(appeared, `Blocked template ${blockedId} never appeared even with includeBlocked: true`);
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });
});
