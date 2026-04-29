import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_bullet_points_fix family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U10).
 */

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Make the bullet punctuation consistent.',
    stem: 'Bring:\n- a coat.\n- a torch\n- a notebook.',
    model: 'Bring:\n- a coat.\n- a torch.\n- a notebook.',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Bring',
      items: ['a coat', 'a torch', 'a notebook'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Make the bullet punctuation consistent.',
    stem: 'Pack:\n- pencils\n- rulers.\n- glue sticks',
    model: 'Pack:\n- pencils\n- rulers\n- glue sticks',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Pack',
      items: ['pencils', 'rulers', 'glue sticks'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Make the bullet punctuation consistent.',
    stem: 'Take:\n- water\n- snacks.\n- a hat',
    model: 'Take:\n- water\n- snacks\n- a hat',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Take',
      items: ['water', 'snacks', 'a hat'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Make the bullet punctuation consistent.',
    stem: 'Check:\n- doors.\n- windows\n- lights.',
    model: 'Check:\n- doors.\n- windows.\n- lights.',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Check',
      items: ['doors', 'windows', 'lights'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Make the bullet punctuation consistent.',
    stem: 'Collect:\n- shells.\n- feathers\n- pebbles.',
    model: 'Collect:\n- shells.\n- feathers.\n- pebbles.',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Collect',
      items: ['shells', 'feathers', 'pebbles'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Make the bullet punctuation consistent.',
    stem: 'Prepare:\n- flour\n- butter.\n- sugar',
    model: 'Prepare:\n- flour\n- butter\n- sugar',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Prepare',
      items: ['flour', 'butter', 'sugar'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Fix the inconsistent bullet punctuation.',
    stem: 'Remember:\n- keys.\n- phone\n- wallet.',
    model: 'Remember:\n- keys.\n- phone.\n- wallet.',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Remember',
      items: ['keys', 'phone', 'wallet'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Make the bullet punctuation consistent.',
    stem: 'Buy:\n- milk\n- bread.\n- eggs',
    model: 'Buy:\n- milk\n- bread\n- eggs',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Buy',
      items: ['milk', 'bread', 'eggs'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
    readiness: ['proofreading', 'transfer', 'misconception', 'negative_test'],
  },
];

export const bulletPointsFixDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_bullet_points_fix_v${i}`,
    familyId: 'gen_bullet_points_fix',
    mode: 'fix',
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    rewardUnitId: 'bullet-points-core',
    misconceptionTags: t.misconceptionTags,
    readiness: t.readiness,
    slots: { variant: [i] },
    build: () => ({
      prompt: t.prompt,
      stem: t.stem,
      model: t.model,
      validator: t.validator,
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [
        // Model answer
        t.model,
        // Also acceptable: all items without terminal punctuation (consistent no-stop)
        `${t.validator.stem}:\n${t.validator.items.map(item => `- ${item}`).join('\n')}`,
      ],
      reject: [
        // Original stem (inconsistent punctuation)
        t.stem,
        // Missing colon after stem
        t.model.replace(':\n', '\n'),
        // Missing bullet markers
        `${t.validator.stem}:\n${t.validator.items.join('\n')}`,
      ],
    },
  }),
);
