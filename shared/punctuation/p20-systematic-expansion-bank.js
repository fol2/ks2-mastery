// Punctuation QG P20 systematic expansion bank.
//
// This module is deliberately deterministic source content, not runtime
// randomisation. It adds six new generator families for each published KS2
// punctuation skill, and replaces the small P14 transfer-family banks with
// full-depth transfer banks. The templates are generated from closed,
// grammar-safe case tables so every runtime item has a stable learner surface,
// model answer, explanation, and negative-vector stem.

export const PUNCTUATION_P20_SYSTEMATIC_TARGET_DEPTH = 120;

const DETERMINISTIC_SEED_FIELDS = Object.freeze(['learnerId', 'sessionId', 'itemIndex']);
const P20_MODES = Object.freeze(['choose', 'insert', 'fix', 'combine', 'paragraph', 'transfer']);

const SKILL_CONFIG = Object.freeze({
  sentence_endings: Object.freeze({ rewardUnitId: 'sentence-endings-core', clusterId: 'endmarks', name: 'Capital letters and sentence endings' }),
  list_commas: Object.freeze({ rewardUnitId: 'list-commas-core', clusterId: 'comma_flow', name: 'Commas in lists' }),
  apostrophe_contractions: Object.freeze({ rewardUnitId: 'apostrophe-contractions-core', clusterId: 'apostrophe', name: 'Apostrophes for contraction' }),
  apostrophe_possession: Object.freeze({ rewardUnitId: 'apostrophe-possession-core', clusterId: 'apostrophe', name: 'Apostrophes for possession' }),
  speech: Object.freeze({ rewardUnitId: 'speech-core', clusterId: 'speech', name: 'Inverted commas and speech punctuation' }),
  fronted_adverbial: Object.freeze({ rewardUnitId: 'fronted-adverbials-core', clusterId: 'comma_flow', name: 'Commas after fronted adverbials' }),
  parenthesis: Object.freeze({ rewardUnitId: 'parenthesis-core', clusterId: 'structure', name: 'Parenthesis' }),
  comma_clarity: Object.freeze({ rewardUnitId: 'comma-clarity-core', clusterId: 'comma_flow', name: 'Commas for clarity' }),
  colon_list: Object.freeze({ rewardUnitId: 'colons-core', clusterId: 'structure', name: 'Colons before lists' }),
  semicolon: Object.freeze({ rewardUnitId: 'semicolons-core', clusterId: 'boundary', name: 'Semicolons between clauses' }),
  dash_clause: Object.freeze({ rewardUnitId: 'dash-clauses-core', clusterId: 'boundary', name: 'Dashes for extra clauses' }),
  semicolon_list: Object.freeze({ rewardUnitId: 'semicolon-lists-core', clusterId: 'structure', name: 'Semicolons in complex lists' }),
  bullet_points: Object.freeze({ rewardUnitId: 'bullet-points-core', clusterId: 'structure', name: 'Bullet-point punctuation' }),
  hyphen: Object.freeze({ rewardUnitId: 'hyphens-core', clusterId: 'boundary', name: 'Hyphens in compound modifiers' }),
});

const EXISTING_TRANSFER_FAMILIES = Object.freeze({
  gen_sentence_endings_transfer: 'sentence_endings',
  gen_list_commas_transfer: 'list_commas',
  gen_apostrophe_contractions_transfer: 'apostrophe_contractions',
  gen_apostrophe_possession_transfer: 'apostrophe_possession',
  gen_speech_transfer: 'speech',
  gen_fronted_adverbial_transfer: 'fronted_adverbial',
  gen_parenthesis_transfer: 'parenthesis',
  gen_comma_clarity_transfer: 'comma_clarity',
  gen_colon_list_transfer: 'colon_list',
  gen_semicolon_transfer: 'semicolon',
  gen_dash_clause_transfer: 'dash_clause',
  gen_semicolon_list_transfer: 'semicolon_list',
  gen_bullet_points_transfer: 'bullet_points',
  gen_hyphen_transfer: 'hyphen',
});

export const PUNCTUATION_P20_SYSTEMATIC_GENERATOR_FAMILIES = Object.freeze(
  Object.entries(SKILL_CONFIG).flatMap(([skillId, config]) => P20_MODES.map((mode) => Object.freeze({
    id: `gen_p20_${skillId}_${mode}`,
    skillId,
    rewardUnitId: config.rewardUnitId,
    published: true,
    mode,
    deterministicSeedFields: DETERMINISTIC_SEED_FIELDS,
    p20Systematic: true,
  }))),
);

const P20_FAMILY_DESCRIPTORS = Object.freeze(Object.fromEntries([
  ...PUNCTUATION_P20_SYSTEMATIC_GENERATOR_FAMILIES.map((family) => [family.id, family]),
  ...Object.entries(EXISTING_TRANSFER_FAMILIES).map(([familyId, skillId]) => [familyId, Object.freeze({
    id: familyId,
    skillId,
    rewardUnitId: SKILL_CONFIG[skillId].rewardUnitId,
    published: true,
    mode: 'transfer',
    deterministicSeedFields: DETERMINISTIC_SEED_FIELDS,
    p20Systematic: true,
  })]),
]));

const SETTINGS = Object.freeze([
  'library', 'science lab', 'sports hall', 'music room', 'garden', 'playground', 'museum', 'harbour', 'observatory', 'studio',
  'rehearsal room', 'workshop', 'computer suite', 'wildlife centre', 'theatre', 'castle courtyard', 'market stall', 'art room',
  'classroom', 'field centre', 'school office', 'reading corner', 'swimming pool', 'canteen', 'robotics club', 'drama studio',
  'history gallery', 'nature reserve', 'bike shed', 'media room', 'school kitchen', 'greenhouse', 'boat house', 'chess club',
  'debate room', 'design studio', 'fitness track', 'geography room', 'rain shelter', 'assembly hall',
]);
const ACTORS = Object.freeze(['Maya', 'Omar', 'Lina', 'Theo', 'Zara', 'Noah', 'Amira', 'Felix', 'Ivy', 'Ethan', 'Sofia', 'Leo', 'Nia', 'Jude', 'Asha', 'Kai', 'Ruby', 'Milo', 'Hana', 'Ben']);
const OBJECTS = Object.freeze(['map', 'folder', 'compass', 'tablet', 'torch', 'notebook', 'model', 'poster', 'ticket', 'badge', 'camera', 'sample tray', 'score sheet', 'script', 'toolbox', 'weather chart', 'seed packet', 'paint pot', 'guidebook', 'robot arm']);
const RECORDS = Object.freeze(['log book', 'display board', 'class blog', 'planning sheet', 'safety checklist', 'team diary', 'result table', 'notice', 'project file', 'training card']);
const ADJECTIVES = Object.freeze(['careful', 'brave', 'quiet', 'curious', 'patient', 'focused', 'creative', 'thoughtful', 'determined', 'cheerful', 'precise', 'steady']);
const FRONTED = Object.freeze(['After the bell rang', 'Before the gates opened', 'During the storm', 'At the end of the lesson', 'Inside the busy hall', 'Without any warning', 'Beside the old oak tree', 'When the timer beeped', 'As the crowd waited', 'Later that afternoon', 'Near the river bank', 'Once the lights dimmed']);
const QUOTES = Object.freeze(['Bring the spare key', 'Check the answer carefully', 'Where is the blue folder', 'We found the missing map', 'Please close the gate', 'What a clever idea', 'Can you hear the music', 'The model is ready', 'Move the tray slowly', 'This path is safe']);
const LIST_SETS = Object.freeze([
  ['torches', 'maps', 'water bottles'], ['brushes', 'aprons', 'paint pots'], ['beans', 'carrots', 'radishes'], ['scripts', 'props', 'costumes'],
  ['magnets', 'wires', 'switches'], ['shells', 'feathers', 'seed pods'], ['cones', 'hoops', 'beanbags'], ['notebooks', 'pencils', 'rulers'],
  ['tickets', 'badges', 'programmes'], ['lanterns', 'blankets', 'snacks'], ['cameras', 'tripods', 'memory cards'], ['spades', 'gloves', 'labels'],
  ['drums', 'flutes', 'tambourines'], ['batteries', 'cables', 'chargers'], ['clay tiles', 'rollers', 'cutters'], ['flags', 'ropes', 'pegs'],
]);
const COMPOUNDS = Object.freeze(['well-known', 'two-metre', 'long-term', 'half-finished', 'high-speed', 'carefully-planned', 'brightly-lit', 'ice-cold', 'last-minute', 'open-ended', 'up-to-date', 'full-size']);
const POSSESSORS = Object.freeze([
  ['girl', "girl's"], ['boy', "boy's"], ['teacher', "teacher's"], ['captain', "captain's"], ['artist', "artist's"], ['runner', "runner's"],
  ['children', "children's"], ['class', "class's"], ['team', "team's"], ['school', "school's"], ['friends', "friends'"], ['players', "players'"],
]);
const CONTRACTIONS = Object.freeze([
  ['didnt', "didn't"], ['couldnt', "couldn't"], ['wouldnt', "wouldn't"], ['shouldnt', "shouldn't"], ['havent', "haven't"], ['werent', "weren't"],
  ['isnt', "isn't"], ['arent', "aren't"], ['youre', "you're"], ['theyre', "they're"], ['were', "we're"], ['Ill', "I'll"], ['youll', "you'll"], ['well', "we'll"], ['theyll', "they'll"], ['Ive', "I've"],
]);
const CONTEXT_COLOURS = Object.freeze(['amber', 'birch', 'cedar', 'dawn', 'elm', 'fern', 'gold', 'harbour', 'ivy', 'juniper', 'kestrel', 'lime']);
const CONTEXT_MISSIONS = Object.freeze(['survey', 'trail', 'briefing', 'display', 'workshop', 'field note', 'rescue plan', 'garden task', 'museum card', 'team log']);
const ROLE_ROWS = Object.freeze([
  ['Maya', 'the captain'], ['Omar', 'the mapper'], ['Lina', 'the recorder'], ['Theo', 'the designer'], ['Zara', 'the presenter'], ['Noah', 'the timekeeper'], ['Amira', 'the researcher'], ['Felix', 'the builder'], ['Ivy', 'the artist'], ['Ethan', 'the reporter'],
]);

function hashString(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(rows, index, salt = 0) {
  return rows[(index + salt) % rows.length];
}

function sentenceCase(value) {
  const text = String(value ?? '').trim();
  return text.replace(/^([a-z])/, (match) => match.toUpperCase());
}

function withoutFinalPunctuation(value) {
  return String(value ?? '').replace(/[.!?]\s*$/, '');
}

function wrongLower(model) {
  const text = String(model ?? '');
  return text.replace(/^([A-Z])/, (match) => match.toLowerCase()).replace(/[.!?]\s*$/, '');
}

function pluralPossessiveDistractor(possessor) {
  const text = String(possessor ?? '').trim();
  if (!text) return "";
  if (/(?:s|x|z|ch|sh)$/i.test(text)) return `${text}es'`;
  return `${text}s'`;
}

function singularPossessiveDistractor(possessor) {
  const text = String(possessor ?? '').trim();
  if (!text) return "";
  if (/ies$/i.test(text)) return `${text.slice(0, -3)}y's`;
  if (/s$/i.test(text)) return `${text.slice(0, -1)}'s`;
  return `${text}'s`;
}

function freezeTemplates(rows) {
  return Object.freeze(rows.map((row) => Object.freeze({
    ...row,
    skillIds: Object.freeze(row.skillIds || []),
    misconceptionTags: Object.freeze(row.misconceptionTags || []),
    readiness: Object.freeze(row.readiness || []),
    ...(Array.isArray(row.options) ? { options: Object.freeze(row.options) } : {}),
    ...(Array.isArray(row.accepted) ? { accepted: Object.freeze(row.accepted) } : {}),
    ...(row.tests ? { tests: Object.freeze({
      ...(Array.isArray(row.tests.accept) ? { accept: Object.freeze(row.tests.accept) } : {}),
      ...(Array.isArray(row.tests.reject) ? { reject: Object.freeze(row.tests.reject) } : {}),
    }) } : {}),
  })));
}

function contextLabel(index, familyId) {
  const salt = hashString(familyId) % 997;
  const colour = pick(CONTEXT_COLOURS, index, salt);
  const mission = pick(CONTEXT_MISSIONS, Math.floor(index / CONTEXT_COLOURS.length), salt);
  return `${colour} ${mission}`;
}

function baseContext(index, familyId) {
  const salt = hashString(familyId) % 997;
  const actor = pick(ACTORS, index, salt);
  const secondActor = pick(ACTORS, index + 5, salt);
  const setting = pick(SETTINGS, index, salt);
  const object = pick(OBJECTS, index, salt);
  const record = pick(RECORDS, index, salt);
  const adjective = pick(ADJECTIVES, index, salt);
  const list = pick(LIST_SETS, index, salt);
  const fronted = pick(FRONTED, index, salt);
  const quote = pick(QUOTES, index, salt);
  const compound = pick(COMPOUNDS, index, salt);
  const [possessorBad, possessorGood] = pick(POSSESSORS, index, salt);
  const [contractionBad, contractionGood] = pick(CONTRACTIONS, index, salt);
  const roleA = pick(ROLE_ROWS, index, salt);
  const roleB = pick(ROLE_ROWS, index + 3, salt);
  const roleC = pick(ROLE_ROWS, index + 6, salt);
  const context = contextLabel(index, familyId);
  return { actor, secondActor, setting, object, record, adjective, list, fronted, quote, compound, possessorBad, possessorGood, contractionBad, contractionGood, roleA, roleB, roleC, context };
}

function coreForSkill(skillId, index, familyId) {
  const c = baseContext(index, familyId);
  const [a, b, d] = c.list;
  const questionStem = `${c.actor.toLowerCase()} found the ${c.object} in the ${c.setting}`;
  switch (skillId) {
    case 'sentence_endings': {
      const type = index % 3;
      const raw = type === 0
        ? `where did ${c.actor.toLowerCase()} put the ${c.object}`
        : type === 1
          ? `${c.actor.toLowerCase()} checked the ${c.record} in the ${c.setting}`
          : `what a ${c.adjective} rescue in the ${c.setting}`;
      const model = `${sentenceCase(raw)}${type === 0 ? '?' : type === 1 ? '.' : '!'}`;
      return {
        model,
        bad: raw,
        wrongOne: `${sentenceCase(raw)}${type === 0 ? '.' : '?'}`,
        wrongTwo: wrongLower(model),
        explanation: type === 0
          ? 'A direct question starts with a capital letter and ends with a question mark.'
          : type === 1
            ? 'A statement starts with a capital letter and ends with a full stop.'
            : 'An exclamation starts with a capital letter and ends with an exclamation mark.',
        explanationRuleId: type === 0 ? 'sentence.endmark-question' : type === 1 ? 'sentence.endmark-statement' : 'sentence.endmark-exclamation',
        misconceptionTags: ['sentence.capital_missing', 'sentence.endmark_missing'],
      };
    }
    case 'list_commas': {
      const opening = `${c.actor} packed`;
      const model = `${opening} ${a}, ${b} and ${d}.`;
      return {
        model,
        bad: `${opening} ${a} ${b} and ${d}.`,
        wrongOne: `${opening}, ${a}, ${b} and ${d}.`,
        wrongTwo: `${opening} ${a}, ${b}, and, ${d}.`,
        explanation: 'Commas separate the first items in a simple list; and joins the final item.',
        explanationRuleId: 'comma.list',
        misconceptionTags: ['commas.list_separator_missing', 'commas.list_boundary_extra'],
      };
    }
    case 'apostrophe_contractions': {
      const model = `${c.actor} ${c.contractionGood} believe ${c.secondActor} ${pick(CONTRACTIONS, index + 7, hashString(familyId))[1]} moved the ${c.object}.`;
      const bad = model.replace(/'/g, '');
      return {
        model,
        bad,
        wrongOne: model.replace(c.contractionGood, c.contractionBad),
        wrongTwo: bad.replace(/\.$/, ''),
        explanation: 'A contraction uses an apostrophe to show where letters have been left out.',
        explanationRuleId: 'apostrophe.contraction',
        misconceptionTags: ['apostrophe.contraction_missing'],
      };
    }
    case 'apostrophe_possession': {
      const model = `The ${c.possessorGood} ${c.object} was beside the ${c.record}.`;
      const bad = `The ${c.possessorBad} ${c.object} was beside the ${c.record}.`;
      return {
        model,
        bad,
        wrongOne: c.possessorGood.endsWith("'s")
          ? `The ${pluralPossessiveDistractor(c.possessorBad)} ${c.object} was beside the ${c.record}.`
          : `The ${singularPossessiveDistractor(c.possessorBad)} ${c.object} was beside the ${c.record}.`,
        wrongTwo: `The ${c.possessorBad} ${c.object} was beside the ${c.record}.`,
    explanation: 'An apostrophe shows that the thing belongs to the person or group named.',
        explanationRuleId: 'apostrophe.possession',
        misconceptionTags: ['apostrophe.possession_missing', 'apostrophe.plural_possession_confusion'],
      };
    }
    case 'speech': {
      const quote = c.quote;
      const isQuestion = /^(Where|What|Can|How|Why|When)\b/.test(quote);
      const spoken = `${quote}${isQuestion ? '?' : '.'}`;
      const model = `${c.actor} said, "${spoken}"`;
      return {
        model,
        bad: `${c.actor} said "${withoutFinalPunctuation(quote)}".`,
        wrongOne: `${c.actor} said, "${withoutFinalPunctuation(quote)}".`,
        wrongTwo: `${c.actor} said "${spoken}"`,
        explanation: 'Direct speech needs a reporting comma and punctuation inside the closing inverted comma.',
        explanationRuleId: 'speech.direct',
        misconceptionTags: ['speech.reporting_comma_missing', 'speech.terminal_inside_quotes_missing'],
      };
    }
    case 'fronted_adverbial': {
      const clause = `${c.actor.toLowerCase()} checked the ${c.record}`;
      const model = `${c.fronted}, ${clause}.`;
      return {
        model,
        bad: `${c.fronted} ${clause}.`,
        wrongOne: `${c.fronted} ${clause},`,
        wrongTwo: `${c.fronted}, ${clause}`,
        explanation: 'A comma follows a fronted adverbial before the main clause continues.',
        explanationRuleId: 'comma.fronted-adverbial',
        misconceptionTags: ['comma.fronted_adverbial_missing'],
      };
    }
    case 'parenthesis': {
      const model = `${c.actor} (${c.adjective} and focused) updated the ${c.record}.`;
      return {
        model,
        bad: `${c.actor} ${c.adjective} and focused updated the ${c.record}.`,
        wrongOne: `${c.actor} (${c.adjective} and focused updated the ${c.record}.`,
        wrongTwo: `${c.actor}) ${c.adjective} and focused (updated the ${c.record}.`,
        explanation: 'Parentheses add extra information that can be removed without breaking the main sentence.',
        explanationRuleId: 'parenthesis.brackets',
        misconceptionTags: ['parenthesis.boundary_missing', 'parenthesis.unbalanced'],
      };
    }
    case 'comma_clarity': {
      const model = `After checking the ${c.object}, ${c.actor} updated the ${c.record}.`;
      return {
        model,
        bad: `After checking the ${c.object} ${c.actor} updated the ${c.record}.`,
        wrongOne: `After checking, the ${c.object} ${c.actor} updated the ${c.record}.`,
        wrongTwo: `After checking the ${c.object} ${c.actor}, updated the ${c.record}.`,
        explanation: 'The comma marks the end of the opening phrase so the sentence is easy to read.',
        explanationRuleId: 'comma.clarity',
        misconceptionTags: ['comma.clarity_missing', 'comma.clarity_wrong_place'],
      };
    }
    case 'colon_list': {
      const model = `${c.actor} needed three things: ${a}, ${b} and ${d}.`;
      return {
        model,
        bad: `${c.actor} needed three things ${a}, ${b} and ${d}.`,
        wrongOne: `${c.actor} needed three things; ${a}, ${b} and ${d}.`,
        wrongTwo: `${c.actor} needed: three things, ${a}, ${b} and ${d}.`,
        explanation: 'A colon can introduce a list after a complete clause.',
        explanationRuleId: 'colon.list',
        misconceptionTags: ['colon.list_missing', 'colon.not_after_fragment'],
      };
    }
    case 'semicolon': {
      const model = `${c.actor} checked the ${c.object}; ${c.secondActor} updated the ${c.record}.`;
      return {
        model,
        bad: `${c.actor} checked the ${c.object}, ${c.secondActor} updated the ${c.record}.`,
        wrongOne: `${c.actor} checked the ${c.object};`,
        wrongTwo: `${c.actor} checked the ${c.object}; because ${c.secondActor} updated the ${c.record}.`,
        explanation: 'A semicolon can link two closely related independent clauses.',
        explanationRuleId: 'semicolon.clause-link',
        misconceptionTags: ['semicolon.comma_splice', 'semicolon.fragment', 'boundary.comma_splice', 'boundary.semicolon_missing'],
      };
    }
    case 'dash_clause': {
      const model = `${c.actor} opened the ${c.object} - the room fell silent - and read the note.`;
      return {
        model,
        bad: `${c.actor} opened the ${c.object} the room fell silent and read the note.`,
        wrongOne: `${c.actor} opened the ${c.object} - the room fell silent and read the note.`,
        wrongTwo: `${c.actor} opened - the ${c.object} the room fell silent - and read the note.`,
        explanation: 'A pair of dashes can mark an extra clause inserted into the sentence.',
        explanationRuleId: 'dash.extra-clause',
        misconceptionTags: ['dash.boundary_missing', 'dash.boundary_unbalanced'],
      };
    }
    case 'semicolon_list': {
      const [n1, r1] = c.roleA;
      const [n2, r2] = c.roleB;
      const [n3, r3] = c.roleC;
      const model = `The team included ${n1}, ${r1}; ${n2}, ${r2}; and ${n3}, ${r3}.`;
      return {
        model,
        bad: `The team included ${n1}, ${r1}, ${n2}, ${r2}, and ${n3}, ${r3}.`,
        wrongOne: `The team included ${n1}; ${r1}; ${n2}; ${r2}; and ${n3}; ${r3}.`,
        wrongTwo: `The team included ${n1}, ${r1}; ${n2}, ${r2}, and ${n3}, ${r3}.`,
        explanation: 'Semicolons separate longer list items when each item already contains a comma.',
        explanationRuleId: 'semicolon.complex-list',
        misconceptionTags: ['semicolon.list_separator_missing', 'semicolon.list_item_internal_comma'],
      };
    }
    case 'bullet_points': {
      const model = `Remember:\n- ${sentenceCase(a)}\n- ${sentenceCase(b)}\n- ${sentenceCase(d)}`;
      return {
        model,
        bad: `Remember ${a}, ${b}, ${d}`,
        wrongOne: `Remember:\n${sentenceCase(a)}\n${sentenceCase(b)}\n${sentenceCase(d)}`,
        wrongTwo: `Remember:\n- ${sentenceCase(a)}.\n- ${sentenceCase(b)},\n- ${sentenceCase(d)};`,
        explanation: 'A bullet list should use a consistent marker and consistent punctuation style.',
        explanationRuleId: 'bullet.consistency',
        misconceptionTags: ['bullet.marker_missing', 'bullet.inconsistent_punctuation'],
      };
    }
    case 'hyphen': {
      const model = `${c.actor} chose a ${c.compound} design for the ${c.setting}.`;
      return {
        model,
        bad: `${c.actor} chose a ${c.compound.replace(/-/g, ' ')} design for the ${c.setting}.`,
        wrongOne: `${c.actor} chose a ${c.compound.replace(/-/g, ' ')}-design for the ${c.setting}.`,
        wrongTwo: `${c.actor} chose a ${c.compound}design for the ${c.setting}.`,
        explanation: 'A hyphen can join words that work together before a noun.',
        explanationRuleId: 'hyphen.compound-modifier',
        misconceptionTags: ['hyphen.compound_missing', 'hyphen.wrong_boundary'],
      };
    }
    default: {
      const model = `${sentenceCase(questionStem)}.`;
      return {
        model,
        bad: questionStem,
        wrongOne: wrongLower(model),
        wrongTwo: withoutFinalPunctuation(model),
        explanation: 'This item practises the published punctuation skill.',
        explanationRuleId: 'punctuation.generic',
        misconceptionTags: ['punctuation.missing'],
      };
    }
  }
}

function readinessForMode(mode) {
  if (mode === 'choose') return ['retrieve_discriminate', 'misconception', 'negative_test'];
  if (mode === 'transfer') return ['constrained_transfer', 'proofreading', 'negative_test'];
  if (mode === 'paragraph') return ['proofreading', 'constrained_transfer', 'negative_test'];
  if (mode === 'combine') return ['insertion', 'constrained_transfer', 'negative_test'];
  if (mode === 'fix') return ['proofreading', 'misconception', 'negative_test'];
  return ['insertion', 'negative_test'];
}

function templatePrompt(skillId, mode) {
  const name = SKILL_CONFIG[skillId]?.name || 'punctuation';
  if (mode === 'choose') return `Choose the correct ${name.toLowerCase()} version.`;
  if (mode === 'insert') return `Add the missing punctuation for ${name.toLowerCase()}.`;
  if (mode === 'fix') return `Fix the punctuation error for ${name.toLowerCase()}.`;
  if (mode === 'combine') return `Rewrite the sentence so ${name.toLowerCase()} is used correctly.`;
  if (mode === 'paragraph') return `Punctuate the short paragraph using ${name.toLowerCase()}.`;
  return `Apply ${name.toLowerCase()} in this transfer sentence.`;
}

function templateStem({ skillId, mode, index, familyId, core }) {
  const label = pick(['school notice', 'field note', 'team update', 'project card', 'class message', 'museum label'], index, hashString(familyId));
  const context = contextLabel(index, familyId);
  const band = familyId.startsWith('gen_p20_') ? 'extension bank' : 'transfer bank';
  if (mode === 'choose') return `For the ${context} ${band}, choose the best punctuation for this ${label}: ${core.bad}`;
  if (mode === 'insert') return `For the ${context} ${band}, insert the missing punctuation in this ${label}: ${core.bad}`;
  if (mode === 'fix') return `For the ${context} ${band}, correct this ${label}: ${core.wrongOne}`;
  if (mode === 'combine') return `For the ${context} ${band}, rewrite this ${label} clearly: ${core.bad}`;
  if (mode === 'paragraph') {
    const second = coreForSkill(skillId, index + 17, `${familyId}:paragraph`);
    return `For the ${context} ${band}, punctuate this short paragraph: ${core.bad} ${second.bad}`;
  }
  return `For the ${context} ${band}, transfer the rule to this new ${label}: ${core.bad}`;
}

function templateModel({ skillId, mode, index, familyId, core }) {
  if (mode === 'paragraph') {
    const second = coreForSkill(skillId, index + 17, `${familyId}:paragraph`);
    return `${core.model} ${second.model}`;
  }
  return core.model;
}

function createTemplate({ familyId, skillId, mode, index }) {
  const config = SKILL_CONFIG[skillId];
  const core = coreForSkill(skillId, index, familyId);
  const model = templateModel({ skillId, mode, index, familyId, core });
  const stem = templateStem({ skillId, mode, index, familyId, core });
  const prompt = templatePrompt(skillId, mode);
  const template = {
    templateId: `p20_${familyId}_${String(index + 1).padStart(3, '0')}`,
    prompt,
    stem,
    model,
    skillIds: [skillId],
    clusterId: config.clusterId,
    misconceptionTags: core.misconceptionTags,
    readiness: readinessForMode(mode),
    explanation: core.explanation,
    explanationRuleId: core.explanationRuleId,
    accepted: [model],
    reviewStatus: 'approved',
    tests: {
      accept: [model],
      reject: [stem, core.bad, core.wrongOne, core.wrongTwo].filter(Boolean),
    },
  };
  if (mode === 'choose') {
    template.options = [core.wrongOne, model, core.wrongTwo, core.bad]
      .filter((value, optionIndex, rows) => value && rows.indexOf(value) === optionIndex);
    if (template.options.length < 4) {
      template.options.push(withoutFinalPunctuation(model));
    }
    template.correctIndex = template.options.indexOf(model);
    if (template.correctIndex < 0) {
      template.options.unshift(model);
      template.correctIndex = 0;
    }
  }
  return template;
}

function templatesForFamilyDescriptor(family) {
  return freezeTemplates(Array.from({ length: PUNCTUATION_P20_SYSTEMATIC_TARGET_DEPTH }, (_unused, index) => createTemplate({
    familyId: family.id,
    skillId: family.skillId,
    mode: family.mode,
    index,
  })));
}

export function p20SystematicTemplatesForFamily(familyId) {
  const family = P20_FAMILY_DESCRIPTORS[familyId];
  if (!family) return Object.freeze([]);
  return templatesForFamilyDescriptor(family);
}

export const PUNCTUATION_P20_SYSTEMATIC_TEMPLATE_BANK = Object.freeze(Object.fromEntries(
  Object.keys(P20_FAMILY_DESCRIPTORS).map((familyId) => [familyId, p20SystematicTemplatesForFamily(familyId)]),
));

export const PUNCTUATION_P20_SYSTEMATIC_SKILL_CONFIG = SKILL_CONFIG;
