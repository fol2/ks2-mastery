#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = path.join(
  ROOT_DIR,
  'docs',
  'plans',
  'james',
  'grammar',
  'questions-generator',
  'archive',
  'p14',
  'exp4',
  'grammar-qg-p18-manual-expansion-400-families.json',
);
const DEFAULT_OUT = path.join(ROOT_DIR, 'worker', 'src', 'subjects', 'grammar', 'manual-expansion.generated.js');

const EXPECTED_FAMILY_COUNT = 400;
const EXPECTED_CASE_COUNT = 4800;
const EXPECTED_CASES_PER_FAMILY = 12;
const RELEASE_ID = 'grammar-qg-p19-2026-05-04';
const SCHEDULER_READY_STATUS = 'certified_scheduler_ready';

// P19 Contract A — open-response marking fairness.
// A family is converted to manualReviewOnly when ANY of its cases combines
// (a) a free-text input type, (b) an open prompt verb, and (c) insufficient
// accepted-answer coverage to mark fairly. Mixing scored and non-scored cases
// inside a single family would create silent per-case rules, so the conversion
// is promoted to family scope. See docs/plans/.../grammar-p19-follow-up-contracts.md.
//
// Predicate broadened post-review (P19 commit 2): also catches "Write the …",
// "Write an expanded …", bare "Build" / "Rewrite" / "Describe" / "Complete the
// sentence" / standalone "transfer". The contract A.1 says "or similar open
// task" — narrow keyword matching let 18+ misconception_repair / build_np
// templates score open text against a single golden answer.
//
// P19a hotfix (post-second-adversarial-pass): added Combine/Correct/Copy/
// Insert/Edit/Fix/Punctuate/Expand/Change/Type/Repair/Reorder verbs after
// 29 templates were enumerated whose prompts started with these verbs and
// were silently exempted. Bare add/move/join replace add\s+the/move\s+the/
// join\s+the so "Add a hyphen", "Add commas for parenthesis" also match.
const OPEN_PROMPT_RE = /\b(explain|transfer|write\s+(?:the|an?|one|a\s+sentence)|rewrite|build|mixed\s+check|add|move|join|describe|complete\s+the\s+sentence|continue|extend|combine|correct|copy|insert|edit|fix|punctuate|expand|change|type|repair|reorder)\b/i;
const SELECTED_RESPONSE_CONVERSION_TEMPLATES = new Set();

function caseTriggersFairnessFix(sourceCase) {
  const inputType = cleanText(sourceCase?.inputType);
  if (inputType !== 'text' && inputType !== 'textarea') return false;
  const promptText = cleanText(sourceCase?.promptText);
  if (!OPEN_PROMPT_RE.test(promptText)) return false;
  const accepted = cleanArray(sourceCase?.acceptedAnswers);
  const nearMiss = cleanArray(sourceCase?.nearMisses);
  if (accepted.length >= 3 && nearMiss.length >= 1) return false;
  if (sourceCase?.manualReviewOnly === true) return false;
  if (sourceCase?.nonScored === true) return false;
  return true;
}

function familyFairnessConversion(rawCases) {
  for (const sourceCase of rawCases) {
    if (caseTriggersFairnessFix(sourceCase)) return 'manualReviewOnly';
  }
  return null;
}

function correctionRow(key, label, correctAnswer, rationale = '') {
  return { key, label, correctAnswer, rationale };
}

function correctionOption(value, rationale = '') {
  return { value, label: value, rationale };
}

function pickAllOptions(correct, nearMissA, nearMissB, nearMissC) {
  return [
    correctionOption(correct, 'Correctly includes every target word.'),
    correctionOption(nearMissA, 'Misses at least one target word.'),
    correctionOption(nearMissB, 'Includes words from the wrong class.'),
    correctionOption(nearMissC, 'Mixes target words with non-target words.'),
  ];
}

const SOURCE_CASE_CORRECTIONS = Object.freeze({
  // P19 Contract C — sister-family misconception_repair contradictions.
  // Case 04 says "It clearly refers to the ball" without a contrast marker,
  // tripping the pronoun-cohesion-contradiction regression audit. Adding
  // "because <reason>" preserves the pedagogic message and satisfies the
  // audit's required contrast/explanation token.
  'grammar-qg-p17-manual-expansion-delta-100-families:pronouns_cohesion:misconception_repair:04': {
    correctAnswer: 'clear. It clearly refers to the ball because only the ball can roll under the car.',
    expectedAnswerSummary: 'clear. It clearly refers to the ball because only the ball can roll under the car.',
    feedbackLong: 'Correct answer: clear. It clearly refers to the ball because only the ball can roll under the car (the dog cannot roll there).',
    acceptedAnswers: ['clear. It clearly refers to the ball because only the ball can roll under the car.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:01': {
    correctAnswer: 'It is unclear because the pronouns do not point to sensible nouns: a map cannot fold a person.',
    expectedAnswerSummary: 'It is unclear because the pronouns do not point to sensible nouns: a map cannot fold a person.',
    feedbackLong: 'The pronouns are unclear because “it” appears to refer to the map, but a map cannot fold “she”. The sentence needs clearer nouns or correct pronouns.',
    acceptedAnswers: ['It is unclear because the pronouns do not point to sensible nouns: a map cannot fold a person.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:02': {
    correctAnswer: 'It is unclear because he and him could refer to Ben or Lucas.',
    expectedAnswerSummary: 'It is unclear because he and him could refer to Ben or Lucas.',
    feedbackLong: 'The pronouns are ambiguous: “he” and “him” could refer to either Ben or Lucas, so the sentence should repeat a noun or use clearer wording.',
    acceptedAnswers: ['It is unclear because he and him could refer to Ben or Lucas.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:03': {
    correctAnswer: 'It is unclear because it could refer to the dog or the ball, but only the dog can bark.',
    expectedAnswerSummary: 'It is unclear because it could refer to the dog or the ball, but only the dog can bark.',
    feedbackLong: 'The pronoun “it” is unclear because it could point to the dog or the ball. The action “barked” shows the dog is meant.',
    acceptedAnswers: ['It is unclear because it could refer to the dog or the ball, but only the dog can bark.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:04': {
    correctAnswer: 'It is unclear because she and hers could refer to Maya or Priya.',
    expectedAnswerSummary: 'It is unclear because she and hers could refer to Maya or Priya.',
    feedbackLong: 'The pronouns are ambiguous because both Maya and Priya are possible referents. Repeating the intended name would make the meaning clear.',
    acceptedAnswers: ['It is unclear because she and hers could refer to Maya or Priya.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:05': {
    correctAnswer: 'It is unclear because a museum cannot welcome the class; a person such as a guide probably did.',
    expectedAnswerSummary: 'It is unclear because a museum cannot welcome the class; a person such as a guide probably did.',
    feedbackLong: 'The pronoun “it” points to the museum, but the action “welcomed” probably belongs to a guide or member of staff. The noun should be clearer.',
    acceptedAnswers: ['It is unclear because a museum cannot welcome the class; a person such as a guide probably did.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:06': {
    correctAnswer: 'It is unclear because the plate or cake cannot carry Tom.',
    expectedAnswerSummary: 'It is unclear because the plate or cake cannot carry Tom.',
    feedbackLong: 'The pronoun “it” creates a nonsense role: the plate or cake appears to carry Tom. Clearer nouns or corrected pronouns are needed.',
    acceptedAnswers: ['It is unclear because the plate or cake cannot carry Tom.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:07': {
    correctAnswer: 'It is unclear because the key cannot give Sara to the teacher.',
    expectedAnswerSummary: 'It is unclear because the key cannot give Sara to the teacher.',
    feedbackLong: 'The pronouns swap the roles. Sara can give the key to the teacher, but the key cannot give Sara.',
    acceptedAnswers: ['It is unclear because the key cannot give Sara to the teacher.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:08': {
    correctAnswer: 'It is unclear because the object pronoun should be them, not they.',
    expectedAnswerSummary: 'It is unclear because the object pronoun should be them, not they.',
    feedbackLong: 'The sentence needs the object pronoun “them”: “They left them by the door.” Using “they” there is non-standard and unclear.',
    acceptedAnswers: ['It is unclear because the object pronoun should be them, not they.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:09': {
    correctAnswer: 'It is unclear because the bike appears to test Omar, but Omar is the person doing the testing.',
    expectedAnswerSummary: 'It is unclear because the bike appears to test Omar, but Omar is the person doing the testing.',
    feedbackLong: 'The pronoun “it” makes the bike seem to do the testing. The sentence should make Omar the doer and the bike the thing tested.',
    acceptedAnswers: ['It is unclear because the bike appears to test Omar, but Omar is the person doing the testing.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:10': {
    correctAnswer: 'It is unclear because the feeder appears to perch, but birds perch.',
    expectedAnswerSummary: 'It is unclear because the feeder appears to perch, but birds perch.',
    feedbackLong: 'The pronoun “it” points to the feeder, but the action “perched” should refer to the birds. The noun reference is unclear.',
    acceptedAnswers: ['It is unclear because the feeder appears to perch, but birds perch.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:11': {
    correctAnswer: 'It is unclear because the cabinet appears to lock Nina, not the trophy or cabinet.',
    expectedAnswerSummary: 'It is unclear because the cabinet appears to lock Nina, not the trophy or cabinet.',
    feedbackLong: 'The pronoun “it” makes the role unclear. The sentence should say who locked the cabinet or what was locked.',
    acceptedAnswers: ['It is unclear because the cabinet appears to lock Nina, not the trophy or cabinet.'],
  },
  'grammar-qg-p18-manual-expansion-delta-100-families:pronouns_cohesion:application_transfer:12': {
    correctAnswer: 'It is unclear because the cups appear to dry Dad, but Dad dried the cups.',
    expectedAnswerSummary: 'It is unclear because the cups appear to dry Dad, but Dad dried the cups.',
    feedbackLong: 'The pronoun “they” points to the cups, but the action makes the roles backwards. Dad should be the doer and the cups the object.',
    acceptedAnswers: ['It is unclear because the cups appear to dry Dad, but Dad dried the cups.'],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:relative_clauses:relative_or_time_clause:07': {
    promptText: 'Classify the clause type in this sentence: Since the alarm rang, the team left the hall.',
    correctAnswer: 'reason clause',
    expectedAnswerSummary: 'reason clause',
    feedbackLong: 'Since the alarm rang gives the reason for the team leaving, so it is a reason clause.',
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:relative_clauses:relative_or_time_clause:08': {
    promptText: 'Classify the clause type in this sentence: The artist whose sketch won the prize smiled.',
    correctAnswer: 'relative clause',
    expectedAnswerSummary: 'relative clause',
    feedbackLong: 'Whose sketch won the prize adds information about the artist, so it is a relative clause.',
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:relative_clauses:relative_or_time_clause:09': {
    promptText: 'Classify the clause type in this sentence: Before the match began, the coach checked the pitch.',
    correctAnswer: 'time clause',
    expectedAnswerSummary: 'time clause',
    feedbackLong: 'Before the match began tells when the coach checked the pitch, so it is a time clause.',
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:relative_clauses:relative_or_time_clause:10': {
    promptText: 'Classify the clause type in this sentence: The river that flooded last winter is calm now.',
    correctAnswer: 'relative clause',
    expectedAnswerSummary: 'relative clause',
    feedbackLong: 'That flooded last winter adds information about the river, so it is a relative clause.',
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:relative_clauses:relative_or_time_clause:11': {
    promptText: 'Classify the clause type in this sentence: As the path was icy, we walked slowly.',
    correctAnswer: 'reason clause',
    expectedAnswerSummary: 'reason clause',
    feedbackLong: 'As the path was icy gives the reason for walking slowly, so it is a reason clause.',
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:relative_clauses:relative_or_time_clause:12': {
    promptText: 'Classify the clause type in this sentence: The runner who trained daily finished first.',
    correctAnswer: 'relative clause',
    expectedAnswerSummary: 'relative clause',
    feedbackLong: 'Who trained daily adds information about the runner, so it is a relative clause.',
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:sentence_functions:punctuation_vs_function_table:07': {
    rows: [
      correctionRow('row1', 'Should we pack the coats', 'question', 'Should we pack the coats asks something.'),
      correctionRow('row2', 'Pack the coats now', 'command', 'Pack the coats now gives an instruction.'),
      correctionRow('row3', 'The coats are in the cupboard', 'statement', 'The coats are in the cupboard tells the reader something.'),
      correctionRow('row4', 'What a chilly morning this is', 'exclamation', 'What a chilly morning this is begins with What a and expresses strong feeling.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:sentence_functions:punctuation_vs_function_table:08': {
    rows: [
      correctionRow('row1', 'Who left the gate open', 'question', 'Who left the gate open asks something.'),
      correctionRow('row2', 'Close the gate carefully', 'command', 'Close the gate carefully gives an instruction.'),
      correctionRow('row3', 'The gate creaked in the wind', 'statement', 'The gate creaked in the wind tells the reader something.'),
      correctionRow('row4', 'How loudly the gate rattled', 'exclamation', 'How loudly the gate rattled begins with How and expresses strong feeling.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:sentence_functions:punctuation_vs_function_table:09': {
    rows: [
      correctionRow('row1', 'Did the choir rehearse today', 'question', 'Did the choir rehearse today asks something.'),
      correctionRow('row2', 'Rehearse the chorus again', 'command', 'Rehearse the chorus again gives an instruction.'),
      correctionRow('row3', 'The choir sang after lunch', 'statement', 'The choir sang after lunch tells the reader something.'),
      correctionRow('row4', 'What a clear note that was', 'exclamation', 'What a clear note that was begins with What a and expresses strong feeling.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:sentence_functions:punctuation_vs_function_table:10': {
    rows: [
      correctionRow('row1', 'Can Priya check the map', 'question', 'Can Priya check the map asks something.'),
      correctionRow('row2', 'Check the map before we leave', 'command', 'Check the map before we leave gives an instruction.'),
      correctionRow('row3', 'Priya checked the map', 'statement', 'Priya checked the map tells the reader something.'),
      correctionRow('row4', 'How confusing the route became', 'exclamation', 'How confusing the route became begins with How and expresses strong feeling.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:sentence_functions:punctuation_vs_function_table:11': {
    rows: [
      correctionRow('row1', 'Will the bus arrive soon', 'question', 'Will the bus arrive soon asks something.'),
      correctionRow('row2', 'Wait by the bus stop', 'command', 'Wait by the bus stop gives an instruction.'),
      correctionRow('row3', 'The bus arrived at noon', 'statement', 'The bus arrived at noon tells the reader something.'),
      correctionRow('row4', 'What a busy stop this is', 'exclamation', 'What a busy stop this is begins with What a and expresses strong feeling.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:sentence_functions:punctuation_vs_function_table:12': {
    rows: [
      correctionRow('row1', 'Is the soup ready', 'question', 'Is the soup ready asks something.'),
      correctionRow('row2', 'Stir the soup gently', 'command', 'Stir the soup gently gives an instruction.'),
      correctionRow('row3', 'The soup simmered quietly', 'statement', 'The soup simmered quietly tells the reader something.'),
      correctionRow('row4', 'How delicious the soup smells', 'exclamation', 'How delicious the soup smells begins with How and expresses strong feeling.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:multi_token_classify_table:07': {
    rows: [
      correctionRow('row1', 'quickly in "Aisha quickly solved the puzzle."', 'adverb', 'Quickly describes how Aisha solved the puzzle.'),
      correctionRow('row2', 'before in "We rested before dinner."', 'preposition', 'Before links the resting to dinner.'),
      correctionRow('row3', 'these in "These pencils need sharpening."', 'determiner', 'These introduces the noun pencils.'),
      correctionRow('row4', 'while in "Mum waited while the kettle boiled."', 'conjunction', 'While joins the two ideas.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:multi_token_classify_table:08': {
    rows: [
      correctionRow('row1', 'bright in "The bright lantern lit the path."', 'adjective', 'Bright describes the lantern.'),
      correctionRow('row2', 'laughed in "The children laughed loudly."', 'verb', 'Laughed names the action.'),
      correctionRow('row3', 'garden in "The garden smelled fresh after rain."', 'noun', 'Garden names a place.'),
      correctionRow('row4', 'they in "They carried the boxes inside."', 'pronoun', 'They stands in for people.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:multi_token_classify_table:09': {
    rows: [
      correctionRow('row1', 'under in "The boots were under the stairs."', 'preposition', 'Under links the boots to the stairs.'),
      correctionRow('row2', 'slowly in "The boat moved slowly across the lake."', 'adverb', 'Slowly describes how the boat moved.'),
      correctionRow('row3', 'because in "I smiled because the sun appeared."', 'conjunction', 'Because joins the reason to the main idea.'),
      correctionRow('row4', 'that in "That noise startled everyone."', 'determiner', 'That introduces the noun noise.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:multi_token_classify_table:10': {
    rows: [
      correctionRow('row1', 'whispered in "Jon whispered during assembly."', 'verb', 'Whispered names the action.'),
      correctionRow('row2', 'teacher in "The teacher marked the books."', 'noun', 'Teacher names a person.'),
      correctionRow('row3', 'herself in "Maya reminded herself to practise."', 'pronoun', 'Herself refers back to Maya.'),
      correctionRow('row4', 'golden in "The golden coin shone."', 'adjective', 'Golden describes the coin.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:multi_token_classify_table:11': {
    rows: [
      correctionRow('row1', 'near in "The station is near the park."', 'preposition', 'Near links the station to the park.'),
      correctionRow('row2', 'some in "Some visitors arrived early."', 'determiner', 'Some introduces the noun visitors.'),
      correctionRow('row3', 'although in "Although it rained, we played."', 'conjunction', 'Although joins the two ideas.'),
      correctionRow('row4', 'carefully in "Leo carefully packed the camera."', 'adverb', 'Carefully describes how Leo packed.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:multi_token_classify_table:12': {
    rows: [
      correctionRow('row1', 'captain in "The captain raised the flag."', 'noun', 'Captain names a person.'),
      correctionRow('row2', 'sprinted in "The athlete sprinted towards the line."', 'verb', 'Sprinted names the action.'),
      correctionRow('row3', 'we in "We waited outside the museum."', 'pronoun', 'We stands in for people.'),
      correctionRow('row4', 'ancient in "The ancient wall still stood."', 'adjective', 'Ancient describes the wall.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:pick_all_target_class:05': {
    promptText: 'Which set contains all the prepositions in this sentence? The cat slept under the table beside the window.',
    correctAnswer: 'under, beside',
    acceptedAnswers: ['under, beside'],
    expectedAnswerSummary: 'under, beside',
    feedbackLong: 'Under and beside are the prepositions because they link nouns to positions.',
    options: pickAllOptions('under, beside', 'under only', 'table, window', 'slept, table'),
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:pick_all_target_class:06': {
    promptText: 'Which set contains all the adjectives in this sentence? The tiny blue shell felt smooth.',
    correctAnswer: 'tiny, blue, smooth',
    acceptedAnswers: ['tiny, blue, smooth'],
    expectedAnswerSummary: 'tiny, blue, smooth',
    feedbackLong: 'Tiny, blue and smooth are adjectives because they describe the shell.',
    options: pickAllOptions('tiny, blue, smooth', 'tiny, blue', 'shell, smooth', 'felt, smooth'),
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:pick_all_target_class:07': {
    promptText: 'Which set contains all the verbs in this sentence? Ravi mixed the paint and cleaned the brushes.',
    correctAnswer: 'mixed, cleaned',
    acceptedAnswers: ['mixed, cleaned'],
    expectedAnswerSummary: 'mixed, cleaned',
    feedbackLong: 'Mixed and cleaned are the verbs because they name actions.',
    options: pickAllOptions('mixed, cleaned', 'mixed only', 'paint, brushes', 'Ravi, paint'),
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:pick_all_target_class:08': {
    promptText: 'Which set contains all the nouns in this sentence? The farmer loaded apples into the cart.',
    correctAnswer: 'farmer, apples, cart',
    acceptedAnswers: ['farmer, apples, cart'],
    expectedAnswerSummary: 'farmer, apples, cart',
    feedbackLong: 'Farmer, apples and cart are the nouns because they name people or things.',
    options: pickAllOptions('farmer, apples, cart', 'farmer, apples', 'loaded, cart', 'the, into'),
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:pick_all_target_class:09': {
    promptText: 'Which set contains all the determiners in this sentence? Each pupil carried an umbrella through the rain.',
    correctAnswer: 'Each, an, the',
    acceptedAnswers: ['Each, an, the'],
    expectedAnswerSummary: 'Each, an, the',
    feedbackLong: 'Each, an and the are determiners because they introduce nouns.',
    options: pickAllOptions('Each, an, the', 'Each, an', 'pupil, umbrella, rain', 'carried, through'),
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:pick_all_target_class:10': {
    promptText: 'Which set contains all the pronouns in this sentence? We gave her the note because she asked for it.',
    correctAnswer: 'We, her, she, it',
    acceptedAnswers: ['We, her, she, it'],
    expectedAnswerSummary: 'We, her, she, it',
    feedbackLong: 'We, her, she and it are pronouns because they stand in for nouns.',
    options: pickAllOptions('We, her, she, it', 'We, her, she', 'note, asked', 'because, for'),
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:pick_all_target_class:11': {
    promptText: 'Which set contains all the conjunctions in this sentence? I stayed inside because it rained and the path flooded.',
    correctAnswer: 'because, and',
    acceptedAnswers: ['because, and'],
    expectedAnswerSummary: 'because, and',
    feedbackLong: 'The words because and and are conjunctions because they join ideas or words.',
    options: pickAllOptions('because, and', 'because only', 'inside, path', 'stayed, flooded'),
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:word_classes:pick_all_target_class:12': {
    promptText: 'Which set contains all the adverbs in this sentence? The runner moved very quickly and quite gracefully.',
    correctAnswer: 'very, quickly, quite, gracefully',
    acceptedAnswers: ['very, quickly, quite, gracefully'],
    expectedAnswerSummary: 'very, quickly, quite, gracefully',
    feedbackLong: 'Very, quickly, quite and gracefully are adverbs because they modify how or to what extent the runner moved.',
    options: pickAllOptions('very, quickly, quite, gracefully', 'quickly, gracefully', 'runner, moved', 'very, runner'),
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:hyphen_ambiguity:hyphen_or_no_hyphen_table:02': {
    rows: [
      correctionRow('good', 'sugar-free biscuit', 'hyphen needed', 'The hyphen makes sugar-free work as a compound modifier before biscuit.'),
      correctionRow('bad', 'sugar free biscuit', 'no hyphen needed', 'This contrasts with the hyphenated compound form.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:hyphen_ambiguity:hyphen_or_no_hyphen_table:04': {
    rows: [
      correctionRow('good', 'well-lit room', 'hyphen needed', 'The hyphen makes well-lit work as a compound modifier before room.'),
      correctionRow('bad', 'well lit room', 'no hyphen needed', 'This contrasts with the hyphenated compound form.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:hyphen_ambiguity:hyphen_or_no_hyphen_table:10': {
    rows: [
      correctionRow('good', 'full-time job', 'hyphen needed', 'The hyphen makes full-time work as a compound modifier before job.'),
      correctionRow('bad', 'full time job', 'no hyphen needed', 'This contrasts with the hyphenated compound form.'),
    ],
  },
  'grammar-qg-p16-manual-expansion-delta-110-families:hyphen_ambiguity:hyphen_or_no_hyphen_table:12': {
    rows: [
      correctionRow('good', 'high-speed train', 'hyphen needed', 'The hyphen makes high-speed work as a compound modifier before train.'),
      correctionRow('bad', 'high speed train', 'no hyphen needed', 'This contrasts with the hyphenated compound form.'),
    ],
  },
});

function normaliseGrammarArticles(value) {
  return String(value ?? '')
    .replace(/\ba (adverb|adjective|exclamation)\b/gi, (_match, word) => `an ${word}`);
}

function cleanText(value) {
  return normaliseGrammarArticles(value).replace(/\s+/g, ' ').trim();
}

function cleanArray(values) {
  return Array.isArray(values) ? values.map(cleanText).filter(Boolean) : [];
}

function compactOptions(options) {
  if (!Array.isArray(options)) return null;
  const seen = new Set();
  const out = [];
  for (const option of options) {
    const value = cleanText(option?.value ?? option?.label);
    if (!value) continue;
    const normalised = value.toLowerCase();
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    out.push({
      value,
      label: cleanText(option?.label ?? value) || value,
      rationale: cleanText(option?.rationale),
    });
  }
  return out.length ? out : null;
}

function compactRows(rows) {
  if (!Array.isArray(rows)) return null;
  const out = rows.map((row, index) => ({
    key: cleanText(row?.key) || `row${index}`,
    label: cleanText(row?.label),
    options: cleanArray(row?.options),
    correctAnswer: cleanText(row?.correctAnswer),
    rationale: cleanText(row?.rationale),
  })).filter((row) => row.label);
  return out.length ? out : null;
}

function compactCorrectAnswer(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      const cleanKey = cleanText(key);
      const cleanEntry = cleanText(entry);
      if (cleanKey && cleanEntry) out[cleanKey] = cleanEntry;
    }
    return Object.keys(out).length ? out : null;
  }
  const text = cleanText(value);
  return text || null;
}

function compactCase(rawCase) {
  const sourceCase = {
    ...rawCase,
    ...(SOURCE_CASE_CORRECTIONS[cleanText(rawCase?.caseId)] || {}),
  };
  return {
    id: cleanText(sourceCase.caseId),
    sourcePack: cleanText(sourceCase.sourcePack),
    seedCase: Number(sourceCase.seedCase) || 0,
    inputType: cleanText(sourceCase.inputType),
    questionType: cleanText(sourceCase.questionType),
    depthTier: cleanText(sourceCase.depthTier),
    promptText: cleanText(sourceCase.promptText),
    expectedAnswerSummary: cleanText(sourceCase.expectedAnswerSummary),
    feedbackLong: cleanText(sourceCase.feedbackLong),
    correctAnswer: compactCorrectAnswer(sourceCase.correctAnswer),
    acceptedAnswers: cleanArray(sourceCase.acceptedAnswers),
    nearMisses: cleanArray(sourceCase.nearMisses),
    options: compactOptions(sourceCase.options),
    rows: compactRows(sourceCase.rows),
    columns: cleanArray(sourceCase.columns),
  };
}

function buildFamilies(pack) {
  if (!Array.isArray(pack.cases)) {
    throw new Error('Manual expansion pack must contain a cases[] array.');
  }

  const grouped = new Map();
  for (const rawCase of pack.cases) {
    const familyId = cleanText(rawCase.templateFamilyId);
    if (!familyId) throw new Error(`Case is missing templateFamilyId: ${rawCase.caseId || 'unknown'}`);
    if (!grouped.has(familyId)) grouped.set(familyId, []);
    grouped.get(familyId).push(rawCase);
  }

  const families = [];
  for (const [familyId, rawCases] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    rawCases.sort((a, b) => (Number(a.seedCase) || 0) - (Number(b.seedCase) || 0) || cleanText(a.caseId).localeCompare(cleanText(b.caseId)));
    if (rawCases.length !== EXPECTED_CASES_PER_FAMILY) {
      throw new Error(`${familyId} has ${rawCases.length} cases; expected ${EXPECTED_CASES_PER_FAMILY}.`);
    }
    const first = rawCases[0];
    const conceptIds = [...new Set(rawCases.flatMap((entry) => cleanArray(entry.conceptIds)))].sort();
    const sourcePacks = [...new Set(rawCases.map((entry) => cleanText(entry.sourcePack)).filter(Boolean))].sort();
    const questionTypes = [...new Set(rawCases.map((entry) => cleanText(entry.questionType)).filter(Boolean))].sort();
    const inputTypes = [...new Set(rawCases.map((entry) => cleanText(entry.inputType)).filter(Boolean))].sort();
    const depthTiers = [...new Set(rawCases.map((entry) => cleanText(entry.depthTier)).filter(Boolean))].sort();
    const compactedCases = rawCases.map(compactCase);
    const fairnessConversion = SELECTED_RESPONSE_CONVERSION_TEMPLATES.has(familyId)
      ? 'selectedResponse'
      : familyFairnessConversion(compactedCases);
    families.push({
      id: familyId,
      conceptIds,
      sourcePacks,
      questionType: questionTypes.length === 1 ? questionTypes[0] : cleanText(first.questionType),
      inputType: inputTypes.length === 1 ? inputTypes[0] : cleanText(first.inputType),
      depthTiers,
      cases: compactedCases,
      ...(fairnessConversion ? { fairnessConversion, fairnessConversionReason: 'p19-open-response-fairness' } : {}),
    });
  }

  if (families.length !== EXPECTED_FAMILY_COUNT) {
    throw new Error(`Expected ${EXPECTED_FAMILY_COUNT} template families, got ${families.length}.`);
  }
  const caseCount = families.reduce((sum, family) => sum + family.cases.length, 0);
  if (caseCount !== EXPECTED_CASE_COUNT) {
    throw new Error(`Expected ${EXPECTED_CASE_COUNT} cases, got ${caseCount}.`);
  }

  return families;
}

function assertSchedulerReady(pack) {
  const status = cleanText(pack.status);
  if (status !== SCHEDULER_READY_STATUS) {
    throw new Error(
      `Manual expansion source status is "${status || 'missing'}"; expected "${SCHEDULER_READY_STATUS}" before runtime generation.`,
    );
  }
}

function buildSummary(pack, families) {
  const cases = families.flatMap((family) => family.cases);
  const convertedFamilies = families.filter((family) => family.fairnessConversion === 'manualReviewOnly');
  const selectedResponseFamilies = families.filter((family) => family.fairnessConversion === 'selectedResponse');
  const convertedCaseCount = convertedFamilies.reduce((sum, family) => sum + family.cases.length, 0);
  return {
    releaseId: RELEASE_ID,
    sourcePackId: cleanText(pack.packId),
    sourceStatus: cleanText(pack.status),
    generatedAt: cleanText(pack.certifiedAt || pack.createdAt),
    familyCount: families.length,
    caseCount: cases.length,
    minCasesPerFamily: Math.min(...families.map((family) => family.cases.length)),
    maxCasesPerFamily: Math.max(...families.map((family) => family.cases.length)),
    conceptCount: new Set(families.flatMap((family) => family.conceptIds)).size,
    inputTypeCounts: cases.reduce((counts, entry) => {
      counts[entry.inputType] = (counts[entry.inputType] || 0) + 1;
      return counts;
    }, {}),
    questionTypeCounts: cases.reduce((counts, entry) => {
      counts[entry.questionType] = (counts[entry.questionType] || 0) + 1;
      return counts;
    }, {}),
    sourcePacks: [...new Set(families.flatMap((family) => family.sourcePacks))].sort(),
    p19ConversionStats: {
      convertedToManualReview: convertedFamilies.length,
      convertedCaseCount,
      convertedFamilyIds: convertedFamilies.map((family) => family.id),
      selectedResponseFamilies: selectedResponseFamilies.length,
      keptScored: families.length - convertedFamilies.length - selectedResponseFamilies.length,
      reason: 'p19-open-response-fairness',
    },
  };
}

function buildGeneratedSource({ sourcePath, summary, families }) {
  return `// Generated by scripts/generate-grammar-manual-expansion.mjs from ${path.relative(ROOT_DIR, sourcePath)}
// Do not edit manually.

export const GRAMMAR_MANUAL_EXPANSION_RELEASE_ID = ${JSON.stringify(RELEASE_ID)};
export const GRAMMAR_MANUAL_EXPANSION_SUMMARY = ${JSON.stringify(summary)};
export const GRAMMAR_MANUAL_EXPANSION_FAMILIES = ${JSON.stringify(families)};
`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string', default: DEFAULT_SOURCE },
      out: { type: 'string', default: DEFAULT_OUT },
      check: { type: 'boolean', default: false },
    },
    strict: false,
  });

  const sourcePath = path.resolve(values.source);
  const outPath = path.resolve(values.out);
  const pack = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
  assertSchedulerReady(pack);
  const families = buildFamilies(pack);
  const summary = buildSummary(pack, families);
  const source = buildGeneratedSource({ sourcePath, summary, families });

  if (values.check) {
    let current = '';
    try {
      current = await fs.readFile(outPath, 'utf8');
    } catch (err) {
      throw new Error(`Generated manual expansion file is missing: ${outPath}`);
    }
    if (current !== source) {
      throw new Error(
        `Generated manual expansion file is stale. Run: node scripts/generate-grammar-manual-expansion.mjs`,
      );
    }
    console.log(`Grammar manual expansion is up to date: ${path.relative(ROOT_DIR, outPath)}`);
    return;
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, source, 'utf8');

  console.log('Grammar manual expansion generated:');
  console.log(`  Release: ${summary.releaseId}`);
  console.log(`  Families: ${summary.familyCount}`);
  console.log(`  Cases: ${summary.caseCount}`);
  console.log(`  Output: ${outPath}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
