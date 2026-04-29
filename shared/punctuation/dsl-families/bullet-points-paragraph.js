import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * DSL definitions for gen_bullet_points_paragraph family.
 * Templates 0-3: legacy parity (must match existing bank).
 * Templates 4-7: capacity expansion (new for P4-U10).
 */

const EXPLANATION = 'A colon introduces the list after a complete opening, and each bullet follows a consistent punctuation pattern.';
const EXPLANATION_RULE_ID = 'bullet.colon-and-consistency';

const TEMPLATES = [
  // ─── Legacy parity (indices 0-3) ─────────────────────────────────────────────
  {
    prompt: 'Repair the bullet-list punctuation.',
    stem: 'Pack\n- pencils\n- rulers.\n- glue sticks',
    model: 'Pack:\n- pencils\n- rulers\n- glue sticks',
    accepted: [
      'Pack:\n- pencils.\n- rulers.\n- glue sticks.',
    ],
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresBulletStemAndItems',
          stem: 'Pack',
          items: ['pencils', 'rulers', 'glue sticks'],    explanation: EXPLANATION,

          misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the bullet-list punctuation.',
    stem: 'Bring\n- a coat.\n- a torch\n- a notebook.',
    model: 'Bring:\n- a coat\n- a torch\n- a notebook',
    accepted: [
      'Bring:\n- a coat.\n- a torch.\n- a notebook.',
    ],
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresBulletStemAndItems',
          stem: 'Bring',
          items: ['a coat', 'a torch', 'a notebook'],    explanation: EXPLANATION,

          misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the bullet-list punctuation.',
    stem: 'Take\n- water\n- snacks.\n- a hat',
    model: 'Take:\n- water\n- snacks\n- a hat',
    accepted: [
      'Take:\n- water.\n- snacks.\n- a hat.',
    ],
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresBulletStemAndItems',
          stem: 'Take',
          items: ['water', 'snacks', 'a hat'],    explanation: EXPLANATION,

          misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the bullet-list punctuation.',
    stem: 'Check\n- doors.\n- windows\n- lights.',
    model: 'Check:\n- doors.\n- windows.\n- lights.',
    accepted: [
      'Check:\n- doors\n- windows\n- lights',
    ],
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresBulletStemAndItems',
          stem: 'Check',
          items: ['doors', 'windows', 'lights'],    explanation: EXPLANATION,

          misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  // ─── Capacity expansion (indices 4-7) ────────────────────────────────────────
  {
    prompt: 'Repair the bullet-list punctuation.',
    stem: 'Collect\n- shells.\n- feathers\n- pebbles.',
    model: 'Collect:\n- shells.\n- feathers.\n- pebbles.',
    accepted: [
      'Collect:\n- shells\n- feathers\n- pebbles',
    ],
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresBulletStemAndItems',
          stem: 'Collect',
          items: ['shells', 'feathers', 'pebbles'],    explanation: EXPLANATION,

          misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the bullet-list punctuation.',
    stem: 'Prepare\n- flour\n- butter.\n- sugar',
    model: 'Prepare:\n- flour\n- butter\n- sugar',
    accepted: [
      'Prepare:\n- flour.\n- butter.\n- sugar.',
    ],
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresBulletStemAndItems',
          stem: 'Prepare',
          items: ['flour', 'butter', 'sugar'],    explanation: EXPLANATION,

          misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the bullet-list punctuation.',
    stem: 'Remember\n- keys.\n- phone\n- wallet.',
    model: 'Remember:\n- keys.\n- phone.\n- wallet.',
    accepted: [
      'Remember:\n- keys\n- phone\n- wallet',
    ],
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresBulletStemAndItems',
          stem: 'Remember',
          items: ['keys', 'phone', 'wallet'],    explanation: EXPLANATION,

          misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
  {
    prompt: 'Repair the bullet-list punctuation.',
    stem: 'Buy\n- milk\n- bread.\n- eggs',
    model: 'Buy:\n- milk\n- bread\n- eggs',
    accepted: [
      'Buy:\n- milk.\n- bread.\n- eggs.',
    ],
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresBulletStemAndItems',
          stem: 'Buy',
          items: ['milk', 'bread', 'eggs'],    explanation: EXPLANATION,

          misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
        },
      ],
    },
    explanation: EXPLANATION,

    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
    readiness: ['constrained_transfer', 'transfer', 'misconception', 'negative_test'],
  },
];

export const bulletPointsParagraphDsl = TEMPLATES.map((t, i) =>
  definePunctuationTemplate({
    id: `dsl_bullet_points_paragraph_v${i}`,
    familyId: 'gen_bullet_points_paragraph',
    mode: 'paragraph',
    skillIds: t.skillIds,
    clusterId: t.clusterId,
    rewardUnitId: 'bullet-points-core',
    misconceptionTags: t.misconceptionTags,
    readiness: t.readiness,
    slots: { variant: [i] },
    build: () => ({
      prompt: t.prompt,
      stem: t.stem,
      model: t.model,
      accepted: t.accepted,
      skillIds: t.skillIds,
      clusterId: t.clusterId,
      validator: t.validator,
      explanation: t.explanation,
      explanationRuleId: EXPLANATION_RULE_ID,
      misconceptionTags: t.misconceptionTags,
      readiness: t.readiness,
    }),
    tests: {
      accept: [
        // Model answer
        t.model,
        // Alternative consistent style also acceptable
        ...(t.accepted || []),
      ],
      reject: [
        // Original stem (missing colon, inconsistent punctuation)
        t.stem,
        // Has colon but missing bullet markers
        `${t.validator.checks[0].stem}:\n${t.validator.checks[0].items.join('\n')}`,
        // Missing colon after stem word
        `${t.validator.checks[0].stem}\n${t.validator.checks[0].items.map(item => `- ${item}`).join('\n')}`,
      ],
    },
  }),
);
