import { definePunctuationTemplate } from '../template-dsl.js';

/**
 * Transfer DSL bank — P14 Gate 4 (transfer / open-production depth).
 *
 * 14 transfer-mode generator families (one per published skill), 18 scenarios
 * each, total 252 runtime transfer items at the per-family production cap.
 *
 * Each family declares mode='transfer'; learners write their own sentence
 * matching the prompt. Validators come from shared/punctuation/marking.js so
 * the marking surface is identical to existing fixed transfer items.
 */

const READINESS = Object.freeze(['constrained_transfer', 'misconception', 'negative_test']);

function buildTransferFamily({
  familyId,
  skillId,
  clusterId,
  rewardUnitId,
  explanation,
  explanationRuleId,
  misconceptionTags,
  scenarios,
  validatorFor,
  rubricFor = null,
}) {
  return scenarios.map((scenario, index) => definePunctuationTemplate({
    id: `dsl_${familyId}_v${index}`,
    familyId,
    mode: 'transfer',
    skillIds: [skillId],
    clusterId,
    rewardUnitId,
    misconceptionTags,
    readiness: READINESS,
    slots: { variant: [index] },
    build: () => {
      const validator = validatorFor(scenario);
      const rubric = rubricFor ? rubricFor(scenario) : undefined;
      return {
        prompt: scenario.prompt,
        stem: scenario.stem || '',
        model: scenario.model,
        accepted: [scenario.model, ...(scenario.accepted || [])],
        validator,
        ...(rubric ? { rubric } : {}),
        explanation: scenario.explanation || explanation,
        explanationRuleId,
        misconceptionTags,
        readiness: READINESS,
      };
    },
    tests: {
      accept: [scenario.model, ...(scenario.accepted || [])],
      reject: scenario.reject || [
        // Auto-generated baseline rejects so every transfer template carries
        // at least 4 total test cases (vacuous-truth guard requires it).
        // All three are fragment-only inputs that the P14 token-only guard
        // (markTransfer) and validator-specific shape checks reject.
        'yes',
        'maybe',
        'ok then',
      ],
    },
  }));
}

// ── 1. sentence_endings (cluster: endmarks) ──────────────────────────

export const sentenceEndingsTransferDsl = buildTransferFamily({
  familyId: 'gen_sentence_endings_transfer',
  skillId: 'sentence_endings',
  clusterId: 'endmarks',
  rewardUnitId: 'sentence-endings-core',
  explanation: 'A question begins with a capital letter and ends with a question mark.',
  explanationRuleId: 'sentence-ending.terminal-mark',
  misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
  validatorFor: (s) => ({ type: 'startsWithWordQuestion', word: s.starter }),
  scenarios: [
    { starter: 'Why', prompt: "Write a question that begins with 'Why' about a school trip.", model: 'Why did the bus leave so early?' },
    { starter: 'Why', prompt: "Write a 'Why' question about something the class noticed.", model: 'Why are the lights still on?' },
    { starter: 'Where', prompt: "Write a question that begins with 'Where' about a missing object.", model: 'Where did you put the lunch register?' },
    { starter: 'Where', prompt: "Write a 'Where' question about the playground.", model: 'Where should the new bench go?' },
    { starter: 'When', prompt: "Write a question that begins with 'When' about an event.", model: 'When does the rehearsal begin?' },
    { starter: 'When', prompt: "Write a 'When' question about returning library books.", model: 'When are the library books due back?' },
    { starter: 'How', prompt: "Write a question that begins with 'How' about the science experiment.", model: 'How will the team measure the wind?' },
    { starter: 'How', prompt: "Write a 'How' question about the cooking lesson.", model: 'How long should the bread bake?' },
    { starter: 'Which', prompt: "Write a question that begins with 'Which' about choosing a route.", model: 'Which path leads to the river?' },
    { starter: 'Which', prompt: "Write a 'Which' question about classroom resources.", model: 'Which drawer holds the rulers?' },
    { starter: 'Who', prompt: "Write a question that begins with 'Who' about an unknown helper.", model: 'Who left the umbrella in the cloakroom?' },
    { starter: 'Who', prompt: "Write a 'Who' question about a new pupil.", model: 'Who is starting in our class today?' },
    { starter: 'What', prompt: "Write a question that begins with 'What' about a sound the class heard.", model: 'What made that loud noise?' },
    { starter: 'What', prompt: "Write a 'What' question about a missing piece of equipment.", model: 'What happened to the tape measure?' },
    { starter: 'Did', prompt: "Write a yes/no question that begins with 'Did' about the weekend.", model: 'Did the team win the match?' },
    { starter: 'Did', prompt: "Write a 'Did' question about homework being handed in.", model: 'Did everyone hand in the spelling list?' },
    { starter: 'Can', prompt: "Write a polite question that begins with 'Can' asking permission.", model: 'Can we start the painting now?' },
    { starter: 'Can', prompt: "Write a 'Can' question about borrowing equipment.", model: 'Can I borrow your dictionary?' },
  ],
});

// ── 2. list_commas (cluster: comma_flow) ─────────────────────────────

export const listCommasTransferDsl = buildTransferFamily({
  familyId: 'gen_list_commas_transfer',
  skillId: 'list_commas',
  clusterId: 'comma_flow',
  rewardUnitId: 'list-commas-core',
  explanation: 'List items are separated by commas, and the final two items are joined with "and" or "or".',
  explanationRuleId: 'list.comma-separation',
  misconceptionTags: ['comma.list_separator_missing'],
  validatorFor: (s) => ({ type: 'requiresListCommas', opening: s.opening, items: s.items, allowFinalComma: false }),
  scenarios: [
    { opening: 'We packed', items: ['sandwiches', 'apples', 'water'], prompt: "Write a sentence beginning 'We packed' that lists three things for a picnic.", model: 'We packed sandwiches, apples and water.' },
    { opening: 'The class needed', items: ['scissors', 'glue', 'paper'], prompt: "Write a sentence beginning 'The class needed' listing three art supplies.", model: 'The class needed scissors, glue and paper.' },
    { opening: 'Mum bought', items: ['bread', 'cheese', 'tomatoes', 'olives'], prompt: "Write a sentence beginning 'Mum bought' listing four shopping items.", model: 'Mum bought bread, cheese, tomatoes and olives.' },
    { opening: 'The team trained on', items: ['Monday', 'Wednesday', 'Friday'], prompt: "Write a sentence beginning 'The team trained on' listing three days.", model: 'The team trained on Monday, Wednesday and Friday.' },
    { opening: 'Our garden has', items: ['roses', 'tulips', 'daisies', 'lavender'], prompt: "Write a sentence beginning 'Our garden has' listing four flowers.", model: 'Our garden has roses, tulips, daisies and lavender.' },
    { opening: 'I packed my bag with', items: ['books', 'a pencil case', 'a water bottle'], prompt: "Write a sentence beginning 'I packed my bag with' listing three school items.", model: 'I packed my bag with books, a pencil case and a water bottle.' },
    { opening: 'The recipe needs', items: ['flour', 'sugar', 'butter', 'eggs'], prompt: "Write a sentence beginning 'The recipe needs' listing four baking ingredients.", model: 'The recipe needs flour, sugar, butter and eggs.' },
    { opening: 'We saw', items: ['lions', 'zebras', 'giraffes'], prompt: "Write a sentence beginning 'We saw' listing three animals at the zoo.", model: 'We saw lions, zebras and giraffes.' },
    { opening: 'The library stocks', items: ['novels', 'comics', 'atlases', 'biographies'], prompt: "Write a sentence beginning 'The library stocks' listing four kinds of book.", model: 'The library stocks novels, comics, atlases and biographies.' },
    { opening: 'Pack', items: ['a hat', 'sunscreen', 'a water bottle'], prompt: "Write a command beginning 'Pack' listing three things for a sunny trip.", model: 'Pack a hat, sunscreen and a water bottle.' },
    { opening: 'The football kit includes', items: ['shorts', 'socks', 'a shirt', 'boots'], prompt: "Write a sentence beginning 'The football kit includes' listing four kit items.", model: 'The football kit includes shorts, socks, a shirt and boots.' },
    { opening: 'On the menu were', items: ['soup', 'pasta', 'salad'], prompt: "Write a sentence beginning 'On the menu were' listing three dishes.", model: 'On the menu were soup, pasta and salad.' },
    { opening: 'The artist used', items: ['charcoal', 'ink', 'paint', 'pastel'], prompt: "Write a sentence beginning 'The artist used' listing four media.", model: 'The artist used charcoal, ink, paint and pastel.' },
    { opening: 'Bring', items: ['a torch', 'a map', 'a whistle'], prompt: "Write a command beginning 'Bring' listing three things for a hike.", model: 'Bring a torch, a map and a whistle.' },
    { opening: 'The orchestra has', items: ['violins', 'flutes', 'drums', 'trumpets'], prompt: "Write a sentence beginning 'The orchestra has' listing four instruments.", model: 'The orchestra has violins, flutes, drums and trumpets.' },
    { opening: 'Our flag features', items: ['red', 'white', 'blue'], prompt: "Write a sentence beginning 'Our flag features' listing three colours.", model: 'Our flag features red, white and blue.' },
    { opening: 'The chef prepared', items: ['starters', 'mains', 'desserts'], prompt: "Write a sentence beginning 'The chef prepared' listing three courses.", model: 'The chef prepared starters, mains and desserts.' },
    { opening: 'My weekend plans are', items: ['cycling', 'reading', 'baking'], prompt: "Write a sentence beginning 'My weekend plans are' listing three activities.", model: 'My weekend plans are cycling, reading and baking.' },
  ],
});

// ── 3. apostrophe_contractions (cluster: apostrophe) ─────────────────

export const apostropheContractionsTransferDsl = buildTransferFamily({
  familyId: 'gen_apostrophe_contractions_transfer',
  skillId: 'apostrophe_contractions',
  clusterId: 'apostrophe',
  rewardUnitId: 'apostrophe-contractions-core',
  explanation: 'A contraction uses an apostrophe in place of the missing letter or letters.',
  explanationRuleId: 'apostrophe.contraction',
  misconceptionTags: ['apostrophe.contraction_missing'],
  validatorFor: (s) => ({ type: 'requiresTokens', tokens: s.tokens, minimumWordCount: 6, minMeaningfulWords: 0 }),
  scenarios: [
    { tokens: ["can't"], prompt: "Write a sentence about a closed door using the contraction 'can't'.", model: "We can't open the gate without the key." },
    { tokens: ["don't"], prompt: "Write a sentence advising the class using the contraction 'don't'.", model: "Don't forget to label the science books." },
    { tokens: ["isn't"], prompt: "Write a sentence describing weather using the contraction 'isn't'.", model: "The sky isn't as cloudy as yesterday." },
    { tokens: ["won't"], prompt: "Write a sentence about a stubborn cat using the contraction 'won't'.", model: "Our cat won't come down from the shelf." },
    { tokens: ["didn't"], prompt: "Write a sentence about a missed bus using the contraction 'didn't'.", model: "We didn't catch the bus this morning." },
    { tokens: ["weren't"], prompt: "Write a sentence about a delayed parcel using the contraction 'weren't'.", model: "The parcels weren't delivered on time." },
    { tokens: ["wasn't"], prompt: "Write a sentence about an empty room using the contraction 'wasn't'.", model: "There wasn't a single chair in the hall." },
    { tokens: ["he's"], prompt: "Write a sentence about a friend using the contraction 'he's'.", model: "He's the fastest runner in our class." },
    { tokens: ["she's"], prompt: "Write a sentence about a teacher using the contraction 'she's'.", model: "She's planning a trip to the museum." },
    { tokens: ["they've"], prompt: "Write a sentence about a team using the contraction 'they've'.", model: "They've finished the science project early." },
    { tokens: ["we're"], prompt: "Write a sentence about preparing for a play using the contraction 'we're'.", model: "We're rehearsing the final scene now." },
    { tokens: ["you're"], prompt: "Write a sentence to a friend using the contraction 'you're'.", model: "You're invited to the party on Saturday." },
    { tokens: ["I'm"], prompt: "Write a sentence about your weekend using the contraction 'I'm'.", model: "I'm going to the library tomorrow morning." },
    { tokens: ["it's"], prompt: "Write a sentence about a pet using the contraction 'it's'.", model: "It's been raining since early morning." },
    { tokens: ["that's"], prompt: "Write a sentence pointing something out using the contraction 'that's'.", model: "That's the tallest tree in the park." },
    { tokens: ["there's"], prompt: "Write a sentence about a queue using the contraction 'there's'.", model: "There's a long line at the canteen." },
    { tokens: ["could've"], prompt: "Write a sentence about a missed chance using the contraction 'could've'.", model: "We could've won the match with one more goal." },
    { tokens: ["should've"], prompt: "Write a sentence about an idea using the contraction 'should've'.", model: "I should've packed an umbrella today." },
  ],
});

// ── 4. apostrophe_possession (cluster: apostrophe) ───────────────────

export const apostrophePossessionTransferDsl = buildTransferFamily({
  familyId: 'gen_apostrophe_possession_transfer',
  skillId: 'apostrophe_possession',
  clusterId: 'apostrophe',
  rewardUnitId: 'apostrophe-possession-core',
  explanation: 'A possessive apostrophe shows that something belongs to a noun (singular: \'s; plural ending in s: just \').',
  explanationRuleId: 'apostrophe.possession',
  misconceptionTags: ['apostrophe.possession_missing'],
  validatorFor: (s) => ({ type: 'requiresTokens', tokens: s.tokens, minimumWordCount: 5, minMeaningfulWords: 0 }),
  scenarios: [
    { tokens: ["dog's"], prompt: "Write a sentence about something belonging to one dog using 'dog's'.", model: "The dog's lead was tangled in the bush." },
    { tokens: ["dogs'"], prompt: "Write a sentence about something belonging to several dogs using 'dogs'’.", model: "The dogs' bowls were lined up by the door." },
    { tokens: ["girl's"], prompt: "Write a sentence about a single girl's possession using 'girl's'.", model: "The girl's coat was hanging on the peg." },
    { tokens: ["girls'"], prompt: "Write a sentence about something belonging to multiple girls using 'girls’'.", model: "The girls' bags were stacked in the corner." },
    { tokens: ["children's"], prompt: "Write a sentence about something belonging to children using 'children's'.", model: "The children's library opens at ten o'clock." },
    { tokens: ["teacher's"], prompt: "Write a sentence about a teacher's belonging using 'teacher's'.", model: "The teacher's marker rolled under the desk." },
    { tokens: ["coach's"], prompt: "Write a sentence about the coach using 'coach's'.", model: "The coach's whistle echoed across the field." },
    { tokens: ["boy's"], prompt: "Write a sentence about one boy using 'boy's'.", model: "The boy's helmet was almost new." },
    { tokens: ["boys'"], prompt: "Write a sentence about several boys using 'boys’'.", model: "The boys' kit was waiting by the lockers." },
    { tokens: ["father's"], prompt: "Write a sentence about something belonging to a father using 'father's'.", model: "My father's keys are on the hall table." },
    { tokens: ["mother's"], prompt: "Write a sentence about something belonging to a mother using 'mother's'.", model: "My mother's recipe is the best cake I know." },
    { tokens: ["sister's"], prompt: "Write a sentence about a single sister's belonging using 'sister's'.", model: "My sister's bicycle has a basket on the front." },
    { tokens: ["brother's"], prompt: "Write a sentence about a brother using 'brother's'.", model: "My brother's gloves were soaked in the rain." },
    { tokens: ["women's"], prompt: "Write a sentence about something belonging to women using 'women's'.", model: "The women's choir performed in the main hall." },
    { tokens: ["men's"], prompt: "Write a sentence about something belonging to men using 'men's'.", model: "The men's team won the relay by a second." },
    { tokens: ["pupils'"], prompt: "Write a sentence about something belonging to several pupils using 'pupils’'.", model: "The pupils' artwork covered the corridor walls." },
    { tokens: ["captain's"], prompt: "Write a sentence about a captain using 'captain's'.", model: "The captain's voice carried across the deck." },
    { tokens: ["artist's"], prompt: "Write a sentence about an artist using 'artist's'.", model: "The artist's brush left a single bold streak." },
  ],
});

// ── 5. speech (cluster: speech) ──────────────────────────────────────

export const speechTransferDsl = buildTransferFamily({
  familyId: 'gen_speech_transfer',
  skillId: 'speech',
  clusterId: 'speech',
  rewardUnitId: 'speech-core',
  explanation: 'Direct speech goes inside inverted commas, with the reporting clause separated by a comma.',
  explanationRuleId: 'speech.direct-quotation',
  misconceptionTags: ['speech.inverted_commas_missing', 'speech.reporting_comma_missing'],
  validatorFor: (s) => ({ type: 'speechWithWords', words: s.words, requiredTerminal: s.terminal || '.', reportingPosition: 'any' }),
  rubricFor: (s) => ({ type: 'speech', spokenWords: s.words, requiredTerminal: s.terminal || '.', reportingPosition: 'any' }),
  scenarios: [
    { words: 'meet me by the gate', terminal: '.', prompt: "Write a sentence with direct speech where someone says 'Meet me by the gate.'", model: 'Sam said, "Meet me by the gate."' },
    { words: 'where are the markers', terminal: '?', prompt: "Write a sentence where the teacher asks 'Where are the markers?'", model: 'The teacher asked, "Where are the markers?"' },
    { words: 'watch out', terminal: '!', prompt: "Write a sentence where someone shouts 'Watch out!'", model: 'Jamie shouted, "Watch out!"' },
    { words: 'i finished my homework', terminal: '.', prompt: "Write a sentence where a pupil says 'I finished my homework.'", model: 'Priya said, "I finished my homework."' },
    { words: 'is the bus coming', terminal: '?', prompt: "Write a sentence where a passenger asks 'Is the bus coming?'", model: 'The passenger asked, "Is the bus coming?"' },
    { words: 'we won the match', terminal: '!', prompt: "Write a sentence where a player exclaims 'We won the match!'", model: 'The player cried, "We won the match!"' },
    { words: 'please pass the salt', terminal: '.', prompt: "Write a sentence where a guest says 'Please pass the salt.'", model: 'The guest said, "Please pass the salt."' },
    { words: 'when does it open', terminal: '?', prompt: "Write a sentence where a visitor asks 'When does it open?'", model: 'The visitor asked, "When does it open?"' },
    { words: 'mind the step', terminal: '!', prompt: "Write a sentence where a guide warns 'Mind the step!'", model: 'The guide warned, "Mind the step!"' },
    { words: 'the show was wonderful', terminal: '.', prompt: "Write a sentence where Mum says 'The show was wonderful.'", model: 'Mum said, "The show was wonderful."' },
    { words: 'who left the door open', terminal: '?', prompt: "Write a sentence where the head asks 'Who left the door open?'", model: 'The head asked, "Who left the door open?"' },
    { words: 'come and look at this', terminal: '!', prompt: "Write a sentence where Jess calls 'Come and look at this!'", model: 'Jess called, "Come and look at this!"' },
    { words: 'i have lost my pencil', terminal: '.', prompt: "Write a sentence where Owen says 'I have lost my pencil.'", model: 'Owen said, "I have lost my pencil."' },
    { words: 'are the lights on', terminal: '?', prompt: "Write a sentence where the caretaker asks 'Are the lights on?'", model: 'The caretaker asked, "Are the lights on?"' },
    { words: 'be careful with that vase', terminal: '!', prompt: "Write a sentence where Gran warns 'Be careful with that vase!'", model: 'Gran warned, "Be careful with that vase!"' },
    { words: 'the train is delayed', terminal: '.', prompt: "Write a sentence where the announcer says 'The train is delayed.'", model: 'The announcer said, "The train is delayed."' },
    { words: 'have you seen my book', terminal: '?', prompt: "Write a sentence where Tia asks 'Have you seen my book?'", model: 'Tia asked, "Have you seen my book?"' },
    { words: 'what a brilliant idea', terminal: '!', prompt: "Write a sentence where the coach exclaims 'What a brilliant idea!'", model: 'The coach exclaimed, "What a brilliant idea!"' },
  ],
});

// ── 6. fronted_adverbial (cluster: comma_flow) ───────────────────────

export const frontedAdverbialTransferDsl = buildTransferFamily({
  familyId: 'gen_fronted_adverbial_transfer',
  skillId: 'fronted_adverbial',
  clusterId: 'comma_flow',
  rewardUnitId: 'fronted-adverbials-core',
  explanation: 'A fronted adverbial sits before the main clause and is followed by a comma.',
  explanationRuleId: 'fronted-adverbial.comma-after-opener',
  misconceptionTags: ['comma.fronted_adverbial_missing', 'comma.capitalisation_missing'],
  validatorFor: (s) => ({ type: 'startsWithPhraseComma', phrase: s.phrase }),
  scenarios: [
    { phrase: 'After lunch', prompt: "Write a sentence beginning with 'After lunch,'", model: 'After lunch, the class returned to the field.' },
    { phrase: 'In the morning', prompt: "Write a sentence beginning with 'In the morning,'", model: 'In the morning, the path was thick with fog.' },
    { phrase: 'Without warning', prompt: "Write a sentence beginning with 'Without warning,'", model: 'Without warning, the lights flickered off.' },
    { phrase: 'Before the bell', prompt: "Write a sentence beginning with 'Before the bell,'", model: 'Before the bell, we packed the equipment away.' },
    { phrase: 'With great care', prompt: "Write a sentence beginning with 'With great care,'", model: 'With great care, the curator lifted the vase.' },
    { phrase: 'On Tuesday', prompt: "Write a sentence beginning with 'On Tuesday,'", model: 'On Tuesday, the team travelled to the city.' },
    { phrase: 'At the weekend', prompt: "Write a sentence beginning with 'At the weekend,'", model: 'At the weekend, our family visits the market.' },
    { phrase: 'During the storm', prompt: "Write a sentence beginning with 'During the storm,'", model: 'During the storm, the windows rattled loudly.' },
    { phrase: 'After the assembly', prompt: "Write a sentence beginning with 'After the assembly,'", model: 'After the assembly, we returned to our classes.' },
    { phrase: 'Suddenly', prompt: "Write a sentence beginning with 'Suddenly,'", model: 'Suddenly, the dog leapt over the fence.' },
    { phrase: 'Later that afternoon', prompt: "Write a sentence beginning with 'Later that afternoon,'", model: 'Later that afternoon, the rain finally stopped.' },
    { phrase: 'In the distance', prompt: "Write a sentence beginning with 'In the distance,'", model: 'In the distance, a steeple rose above the trees.' },
    { phrase: 'By midday', prompt: "Write a sentence beginning with 'By midday,'", model: 'By midday, the queue stretched around the building.' },
    { phrase: 'As the sun set', prompt: "Write a sentence beginning with 'As the sun set,'", model: 'As the sun set, the harbour lights blinked on.' },
    { phrase: 'Outside the gate', prompt: "Write a sentence beginning with 'Outside the gate,'", model: 'Outside the gate, a small crowd had gathered.' },
    { phrase: 'In a quiet voice', prompt: "Write a sentence beginning with 'In a quiet voice,'", model: 'In a quiet voice, the headteacher began the announcement.' },
    { phrase: 'Across the playground', prompt: "Write a sentence beginning with 'Across the playground,'", model: 'Across the playground, the children chased the ball.' },
    { phrase: 'Once the gate opened', prompt: "Write a sentence beginning with 'Once the gate opened,'", model: 'Once the gate opened, the visitors filed inside.' },
  ],
});

// ── 7. parenthesis (cluster: structure) ──────────────────────────────

export const parenthesisTransferDsl = buildTransferFamily({
  familyId: 'gen_parenthesis_transfer',
  skillId: 'parenthesis',
  clusterId: 'structure',
  rewardUnitId: 'parenthesis-core',
  explanation: 'A parenthetical phrase is marked off with matching commas, brackets or dashes on both sides.',
  explanationRuleId: 'parenthesis.additional-information',
  misconceptionTags: ['structure.parenthesis_missing'],
  validatorFor: (s) => ({ type: 'requiresParentheticalPhrase', before: s.before, phrase: s.phrase, after: s.after }),
  scenarios: [
    { before: 'The museum', phrase: 'a former station', after: 'was busy', prompt: "Write a sentence with 'a former station' inserted as parenthesis after 'The museum'.", model: 'The museum, a former station, was busy.' },
    { before: 'Our captain', phrase: 'who is left-handed', after: 'led the team out', prompt: "Insert 'who is left-handed' as parenthesis after 'Our captain'.", model: 'Our captain (who is left-handed) led the team out.' },
    { before: 'The lighthouse', phrase: 'painted bright red', after: 'guided the ships home', prompt: "Insert 'painted bright red' as parenthesis after 'The lighthouse'.", model: 'The lighthouse — painted bright red — guided the ships home.' },
    { before: 'The library', phrase: 'a Victorian building', after: 'was finally reopened', prompt: "Insert 'a Victorian building' as parenthesis after 'The library'.", model: 'The library, a Victorian building, was finally reopened.' },
    { before: 'My grandfather', phrase: 'a retired sailor', after: 'told us a story', prompt: "Insert 'a retired sailor' as parenthesis after 'My grandfather'.", model: 'My grandfather (a retired sailor) told us a story.' },
    { before: 'The chef', phrase: 'who trained in Paris', after: 'served a fine soup', prompt: "Insert 'who trained in Paris' as parenthesis after 'The chef'.", model: 'The chef — who trained in Paris — served a fine soup.' },
    { before: 'The cathedral', phrase: 'over a thousand years old', after: 'sits beside the river', prompt: "Insert 'over a thousand years old' as parenthesis after 'The cathedral'.", model: 'The cathedral, over a thousand years old, sits beside the river.' },
    { before: 'Our coach', phrase: 'a former champion', after: 'demands hard work', prompt: "Insert 'a former champion' as parenthesis after 'Our coach'.", model: 'Our coach (a former champion) demands hard work.' },
    { before: 'The prize', phrase: 'a silver shield', after: 'sat on the high shelf', prompt: "Insert 'a silver shield' as parenthesis after 'The prize'.", model: 'The prize — a silver shield — sat on the high shelf.' },
    { before: 'The author', phrase: 'an old friend of ours', after: 'signed every book', prompt: "Insert 'an old friend of ours' as parenthesis after 'The author'.", model: 'The author, an old friend of ours, signed every book.' },
    { before: 'The orchard', phrase: 'planted a century ago', after: 'still bears fruit', prompt: "Insert 'planted a century ago' as parenthesis after 'The orchard'.", model: 'The orchard (planted a century ago) still bears fruit.' },
    { before: 'The ferry', phrase: 'painted in bright stripes', after: 'crossed the bay slowly', prompt: "Insert 'painted in bright stripes' as parenthesis after 'The ferry'.", model: 'The ferry — painted in bright stripes — crossed the bay slowly.' },
    { before: 'The choir', phrase: 'a group of forty pupils', after: 'sang the anthem', prompt: "Insert 'a group of forty pupils' as parenthesis after 'The choir'.", model: 'The choir, a group of forty pupils, sang the anthem.' },
    { before: 'My aunt', phrase: 'who works as a vet', after: 'looked after our pup', prompt: "Insert 'who works as a vet' as parenthesis after 'My aunt'.", model: 'My aunt (who works as a vet) looked after our pup.' },
    { before: 'The map', phrase: 'badly faded in places', after: 'showed the lost path', prompt: "Insert 'badly faded in places' as parenthesis after 'The map'.", model: 'The map — badly faded in places — showed the lost path.' },
    { before: 'The school hall', phrase: 'newly painted', after: 'was ready for the play', prompt: "Insert 'newly painted' as parenthesis after 'The school hall'.", model: 'The school hall, newly painted, was ready for the play.' },
    { before: 'The bakery', phrase: 'a family business', after: 'opened at dawn', prompt: "Insert 'a family business' as parenthesis after 'The bakery'.", model: 'The bakery (a family business) opened at dawn.' },
    { before: 'The river', phrase: 'normally calm', after: 'had risen overnight', prompt: "Insert 'normally calm' as parenthesis after 'The river'.", model: 'The river — normally calm — had risen overnight.' },
  ],
});

// ── 8. comma_clarity (cluster: comma_flow) ───────────────────────────

export const commaClarityTransferDsl = buildTransferFamily({
  familyId: 'gen_comma_clarity_transfer',
  skillId: 'comma_clarity',
  clusterId: 'comma_flow',
  rewardUnitId: 'comma-clarity-core',
  explanation: 'A comma after the opening phrase keeps the meaning clear and prevents misreading the main clause.',
  explanationRuleId: 'comma.clarity-disambiguation',
  misconceptionTags: ['comma.clarity_missing'],
  validatorFor: (s) => ({ type: 'requiresTokens', tokens: s.tokens, minimumWordCount: 5, minMeaningfulWords: 0 }),
  scenarios: [
    { tokens: ['eating,', 'we'], prompt: "Write a sentence beginning 'After eating,' that makes the meaning clear.", model: 'After eating, we cleared the picnic table.' },
    { tokens: ['parents,'], prompt: "Write a sentence using 'my parents,' as a parenthetical aside.", model: 'My parents, who came along, took photographs.' },
    { tokens: ['cooking,'], prompt: "Write a sentence beginning 'Before cooking,' that uses a comma for clarity.", model: 'Before cooking, the chef washed every utensil.' },
    { tokens: ['Inside,'], prompt: "Write a sentence beginning 'Inside,' to make a clear pause.", model: 'Inside, the visitors removed their wet coats.' },
    { tokens: ['Outside,'], prompt: "Write a sentence beginning 'Outside,' for clarity.", model: 'Outside, the wind shook the loose sign.' },
    { tokens: ['Quickly,'], prompt: "Write a sentence beginning 'Quickly,' that uses a comma after the adverb.", model: 'Quickly, the medic moved the patient inside.' },
    { tokens: ['Suddenly,'], prompt: "Write a sentence beginning 'Suddenly,' to mark the pause.", model: 'Suddenly, the alarm started ringing.' },
    { tokens: ['indeed,'], prompt: "Write a sentence with 'indeed,' as an inserted aside.", model: 'The lecture was, indeed, very interesting.' },
    { tokens: ['however,'], prompt: "Write a sentence with 'however,' as an inserted connector.", model: 'The plan was, however, far too risky.' },
    { tokens: ['therefore,'], prompt: "Write a sentence beginning 'Therefore,' that links a conclusion.", model: 'Therefore, the team chose a safer route.' },
    { tokens: ['Mum,'], prompt: "Write a sentence using 'Mum,' as direct address.", model: 'Mum, can we leave the picnic now?' },
    { tokens: ['friends,'], prompt: "Write a sentence using 'my friends,' as a parenthetical aside.", model: 'My friends, both from school, joined us.' },
    { tokens: ['Surprisingly,'], prompt: "Write a sentence beginning 'Surprisingly,' for clarity.", model: 'Surprisingly, the older players won easily.' },
    { tokens: ['fortunately,'], prompt: "Write a sentence with 'fortunately,' inside.", model: 'The forecast was, fortunately, completely wrong.' },
    { tokens: ['Meanwhile,'], prompt: "Write a sentence beginning 'Meanwhile,' that connects two scenes.", model: 'Meanwhile, the bakers cooled the cakes carefully.' },
    { tokens: ['Eventually,'], prompt: "Write a sentence beginning 'Eventually,' showing time passing.", model: 'Eventually, the storm moved out to sea.' },
    { tokens: ['Frankly,'], prompt: "Write a sentence beginning 'Frankly,' that signals an honest aside.", model: 'Frankly, the new menu surprised everyone.' },
    { tokens: ['Naturally,'], prompt: "Write a sentence beginning 'Naturally,' for clear cause.", model: 'Naturally, the youngest pupil read the poem first.' },
  ],
});

// ── 9. colon_list (cluster: structure) ───────────────────────────────

export const colonListTransferDsl = buildTransferFamily({
  familyId: 'gen_colon_list_transfer',
  skillId: 'colon_list',
  clusterId: 'structure',
  rewardUnitId: 'colons-core',
  explanation: 'A colon introduces a list after a complete opening clause.',
  explanationRuleId: 'colon.complete-introduction',
  misconceptionTags: ['structure.colon_missing'],
  validatorFor: (s) => ({ type: 'requiresColonBeforeList', opening: s.opening, items: s.items, allowFinalComma: false }),
  scenarios: [
    { opening: 'We needed three things', items: ['a torch', 'a map', 'a whistle'], prompt: "Write a sentence beginning 'We needed three things' followed by a colon and the listed items.", model: 'We needed three things: a torch, a map and a whistle.' },
    { opening: 'The recipe calls for four staples', items: ['flour', 'sugar', 'butter', 'eggs'], prompt: "Write a sentence introducing the four ingredients with a colon.", model: 'The recipe calls for four staples: flour, sugar, butter and eggs.' },
    { opening: 'Three pupils led the project', items: ['Asha', 'Marcus', 'Lin'], prompt: "Write a sentence introducing three pupils with a colon.", model: 'Three pupils led the project: Asha, Marcus and Lin.' },
    { opening: 'The trip will visit three cities', items: ['Bath', 'Bristol', 'Cardiff'], prompt: "Write a sentence introducing three cities with a colon.", model: 'The trip will visit three cities: Bath, Bristol and Cardiff.' },
    { opening: 'Bring four useful items', items: ['paper', 'a pencil', 'a ruler', 'a rubber'], prompt: "Write a command introducing four items with a colon.", model: 'Bring four useful items: paper, a pencil, a ruler and a rubber.' },
    { opening: 'My favourite seasons are clear', items: ['spring', 'autumn'], prompt: "Write a sentence introducing two seasons with a colon.", model: 'My favourite seasons are clear: spring and autumn.' },
    { opening: 'The garden grows three vegetables', items: ['carrots', 'beans', 'potatoes'], prompt: "Write a sentence introducing three vegetables with a colon.", model: 'The garden grows three vegetables: carrots, beans and potatoes.' },
    { opening: 'The team picked three colours', items: ['red', 'blue', 'gold'], prompt: "Write a sentence introducing three colours with a colon.", model: 'The team picked three colours: red, blue and gold.' },
    { opening: 'Pack three layers for winter', items: ['a thermal top', 'a fleece', 'a waterproof'], prompt: "Write a command introducing three winter layers with a colon.", model: 'Pack three layers for winter: a thermal top, a fleece and a waterproof.' },
    { opening: 'The choir performs three pieces', items: ['a hymn', 'a folk song', 'a finale'], prompt: "Write a sentence introducing three pieces with a colon.", model: 'The choir performs three pieces: a hymn, a folk song and a finale.' },
    { opening: 'The guidebook lists four sites', items: ['the abbey', 'the harbour', 'the tower', 'the museum'], prompt: "Write a sentence introducing four sites with a colon.", model: 'The guidebook lists four sites: the abbey, the harbour, the tower and the museum.' },
    { opening: 'Our pantry holds three jars', items: ['honey', 'jam', 'marmalade'], prompt: "Write a sentence introducing three jars with a colon.", model: 'Our pantry holds three jars: honey, jam and marmalade.' },
    { opening: 'The poet wrote about three themes', items: ['love', 'loss', 'hope'], prompt: "Write a sentence introducing three themes with a colon.", model: 'The poet wrote about three themes: love, loss and hope.' },
    { opening: 'The shelves hold three groups', items: ['novels', 'atlases', 'biographies'], prompt: "Write a sentence introducing three book groups with a colon.", model: 'The shelves hold three groups: novels, atlases and biographies.' },
    { opening: 'The chef prepared three courses', items: ['soup', 'pasta', 'tart'], prompt: "Write a sentence introducing three courses with a colon.", model: 'The chef prepared three courses: soup, pasta and tart.' },
    { opening: 'Three captains were chosen', items: ['Niall', 'Esme', 'Tariq'], prompt: "Write a sentence introducing three captains with a colon.", model: 'Three captains were chosen: Niall, Esme and Tariq.' },
    { opening: 'The crate held three tools', items: ['a hammer', 'a wrench', 'a screwdriver'], prompt: "Write a sentence introducing three tools with a colon.", model: 'The crate held three tools: a hammer, a wrench and a screwdriver.' },
    { opening: 'The festival featured three acts', items: ['a magician', 'a juggler', 'a singer'], prompt: "Write a sentence introducing three festival acts with a colon.", model: 'The festival featured three acts: a magician, a juggler and a singer.' },
  ],
});

// ── 10. semicolon (cluster: boundary) ────────────────────────────────

export const semicolonTransferDsl = buildTransferFamily({
  familyId: 'gen_semicolon_transfer',
  skillId: 'semicolon',
  clusterId: 'boundary',
  rewardUnitId: 'semicolons-core',
  explanation: 'A semi-colon links two complete, closely related clauses without a conjunction.',
  explanationRuleId: 'semicolon.related-clauses',
  misconceptionTags: ['boundary.semicolon_missing', 'boundary.comma_splice'],
  validatorFor: (s) => ({ type: 'requiresBoundaryBetweenClauses', mark: ';', left: s.left, right: s.right }),
  scenarios: [
    { left: 'The rain had stopped', right: 'the pitch was still slippery', prompt: "Link 'The rain had stopped' and 'the pitch was still slippery' with a semi-colon.", model: 'The rain had stopped; the pitch was still slippery.' },
    { left: 'The wind dropped', right: 'the kites lay still on the grass', prompt: "Link 'The wind dropped' and 'the kites lay still on the grass' with a semi-colon.", model: 'The wind dropped; the kites lay still on the grass.' },
    { left: 'The lights flickered twice', right: 'the room fell silent', prompt: "Link 'The lights flickered twice' and 'the room fell silent' with a semi-colon.", model: 'The lights flickered twice; the room fell silent.' },
    { left: 'The bell rang sharply', right: 'the corridor emptied at once', prompt: "Link 'The bell rang sharply' and 'the corridor emptied at once' with a semi-colon.", model: 'The bell rang sharply; the corridor emptied at once.' },
    { left: 'The fog lifted slowly', right: 'the bay came into view', prompt: "Link 'The fog lifted slowly' and 'the bay came into view' with a semi-colon.", model: 'The fog lifted slowly; the bay came into view.' },
    { left: 'The path was steep', right: 'the view was worth the climb', prompt: "Link 'The path was steep' and 'the view was worth the climb' with a semi-colon.", model: 'The path was steep; the view was worth the climb.' },
    { left: 'The crowd cheered loudly', right: 'the captain raised the trophy', prompt: "Link the cheering and the trophy raising with a semi-colon.", model: 'The crowd cheered loudly; the captain raised the trophy.' },
    { left: 'The tide came in fast', right: 'the children gathered their buckets', prompt: "Link the rising tide and the children with a semi-colon.", model: 'The tide came in fast; the children gathered their buckets.' },
    { left: 'The kettle whistled', right: 'the tea was ready at last', prompt: "Link the kettle and the tea with a semi-colon.", model: 'The kettle whistled; the tea was ready at last.' },
    { left: 'The orchestra paused', right: 'the conductor lifted his baton', prompt: "Link the orchestra pause and the baton lift with a semi-colon.", model: 'The orchestra paused; the conductor lifted his baton.' },
    { left: 'The chef plated the dish', right: 'the diners watched in silence', prompt: "Link plating and watching with a semi-colon.", model: 'The chef plated the dish; the diners watched in silence.' },
    { left: 'The film began', right: 'the audience settled into their seats', prompt: "Link the film start and the audience with a semi-colon.", model: 'The film began; the audience settled into their seats.' },
    { left: 'The athlete crossed the line', right: 'the timer stopped at last', prompt: "Link the finish line and the timer with a semi-colon.", model: 'The athlete crossed the line; the timer stopped at last.' },
    { left: 'The gardener watered the seeds', right: 'the rain followed soon afterwards', prompt: "Link watering and rain with a semi-colon.", model: 'The gardener watered the seeds; the rain followed soon afterwards.' },
    { left: 'The librarian closed the doors', right: 'the readers filed quietly out', prompt: "Link the librarian and the readers with a semi-colon.", model: 'The librarian closed the doors; the readers filed quietly out.' },
    { left: 'The sky darkened', right: 'a cool breeze swept across the garden', prompt: "Link sky and breeze with a semi-colon.", model: 'The sky darkened; a cool breeze swept across the garden.' },
    { left: 'The driver pulled up sharply', right: 'the passengers steadied themselves', prompt: "Link braking and steadying with a semi-colon.", model: 'The driver pulled up sharply; the passengers steadied themselves.' },
    { left: 'The musicians took a bow', right: 'the applause grew louder', prompt: "Link the bow and the applause with a semi-colon.", model: 'The musicians took a bow; the applause grew louder.' },
  ],
});

// ── 11. dash_clause (cluster: boundary) ──────────────────────────────

export const dashClauseTransferDsl = buildTransferFamily({
  familyId: 'gen_dash_clause_transfer',
  skillId: 'dash_clause',
  clusterId: 'boundary',
  rewardUnitId: 'dash-clauses-core',
  explanation: 'A dash links two related clauses with a stronger pause than a comma.',
  explanationRuleId: 'dash.related-clauses',
  misconceptionTags: ['boundary.dash_missing'],
  validatorFor: (s) => ({ type: 'requiresBoundaryBetweenClauses', mark: '–', left: s.left, right: s.right }),
  scenarios: [
    { left: 'The signal failed', right: 'the team waited in silence', prompt: "Link 'The signal failed' and 'the team waited in silence' with a dash.", model: 'The signal failed – the team waited in silence.' },
    { left: 'The path was flooded', right: 'we took the longer route home', prompt: "Link 'The path was flooded' and 'we took the longer route home' with a dash.", model: 'The path was flooded – we took the longer route home.' },
    { left: 'The alarm rang', right: 'everyone lined up at the gate', prompt: "Link 'The alarm rang' and 'everyone lined up at the gate' with a dash.", model: 'The alarm rang – everyone lined up at the gate.' },
    { left: 'The door creaked open', right: 'we froze where we stood', prompt: "Link the creaking door and freezing with a dash.", model: 'The door creaked open – we froze where we stood.' },
    { left: 'The tide turned', right: 'the boats began drifting outward', prompt: "Link the tide turning and drifting boats with a dash.", model: 'The tide turned – the boats began drifting outward.' },
    { left: 'The kettle boiled', right: 'a warm scent filled the room', prompt: "Link kettle and scent with a dash.", model: 'The kettle boiled – a warm scent filled the room.' },
    { left: 'The crowd cheered', right: 'the goal was finally announced', prompt: "Link cheering and goal with a dash.", model: 'The crowd cheered – the goal was finally announced.' },
    { left: 'The lights dimmed', right: 'the audience held their breath', prompt: "Link the dimming lights and audience with a dash.", model: 'The lights dimmed – the audience held their breath.' },
    { left: 'The captain shouted', right: 'the players hurried into position', prompt: "Link shouting and players with a dash.", model: 'The captain shouted – the players hurried into position.' },
    { left: 'The clock chimed twelve', right: 'the festival officially began', prompt: "Link the chime and festival with a dash.", model: 'The clock chimed twelve – the festival officially began.' },
    { left: 'The fox slipped through the hedge', right: 'the dog leapt up barking', prompt: "Link fox and dog with a dash.", model: 'The fox slipped through the hedge – the dog leapt up barking.' },
    { left: 'The first runner appeared', right: 'the crowd rose to their feet', prompt: "Link runner and crowd with a dash.", model: 'The first runner appeared – the crowd rose to their feet.' },
    { left: 'The river rose overnight', right: 'the lower fields were already flooded', prompt: "Link river rise and flooded fields with a dash.", model: 'The river rose overnight – the lower fields were already flooded.' },
    { left: 'The phone rang twice', right: 'no one answered the second time', prompt: "Link phone rings and no answer with a dash.", model: 'The phone rang twice – no one answered the second time.' },
    { left: 'The library was silent', right: 'every reader was deep in their book', prompt: "Link silence and readers with a dash.", model: 'The library was silent – every reader was deep in their book.' },
    { left: 'The pitcher wound up', right: 'the batter braced themselves', prompt: "Link wind up and batter with a dash.", model: 'The pitcher wound up – the batter braced themselves.' },
    { left: 'The music stopped abruptly', right: 'the dancers held their poses', prompt: "Link the music stop and dancers with a dash.", model: 'The music stopped abruptly – the dancers held their poses.' },
    { left: 'The conductor raised his baton', right: 'the orchestra began as one', prompt: "Link conductor and orchestra with a dash.", model: 'The conductor raised his baton – the orchestra began as one.' },
  ],
});

// ── 12. semicolon_list (cluster: structure) ──────────────────────────

export const semicolonListTransferDsl = buildTransferFamily({
  familyId: 'gen_semicolon_list_transfer',
  skillId: 'semicolon_list',
  clusterId: 'structure',
  rewardUnitId: 'semicolon-lists-core',
  explanation: 'Semi-colons separate complex list items that already contain commas.',
  explanationRuleId: 'semicolon.complex-list',
  misconceptionTags: ['structure.semicolon_list_missing'],
  validatorFor: (s) => ({ type: 'requiresSemicolonList', items: s.items }),
  scenarios: [
    { items: ['York, England', 'Cardiff, Wales', 'Belfast, Northern Ireland'], prompt: "Write a sentence listing three cities with their countries, separated by semi-colons.", model: 'The tour visits York, England; Cardiff, Wales; and Belfast, Northern Ireland.' },
    { items: ['apples, crisp and sweet', 'pears, soft and juicy', 'plums, dark and tart'], prompt: "Write a sentence listing three fruits with descriptions, separated by semi-colons.", model: 'The orchard grows apples, crisp and sweet; pears, soft and juicy; and plums, dark and tart.' },
    { items: ['Ms Patel, the head', 'Mr Lim, the deputy', 'Mrs Reid, the bursar'], prompt: "Write a sentence listing three school staff with their roles, separated by semi-colons.", model: 'The team includes Ms Patel, the head; Mr Lim, the deputy; and Mrs Reid, the bursar.' },
    { items: ['Paris, France', 'Rome, Italy', 'Madrid, Spain'], prompt: "Write a sentence listing three capitals with their countries, separated by semi-colons.", model: 'We will see Paris, France; Rome, Italy; and Madrid, Spain.' },
    { items: ['oats, rolled and toasted', 'almonds, roughly chopped', 'raisins, plump and dark'], prompt: "Write a sentence listing three baking ingredients with descriptions.", model: 'The granola contains oats, rolled and toasted; almonds, roughly chopped; and raisins, plump and dark.' },
    { items: ['violins, polished to a shine', 'cellos, deep and round', 'flutes, bright and clear'], prompt: "Write a sentence listing three orchestra instruments with descriptions.", model: 'The orchestra has violins, polished to a shine; cellos, deep and round; and flutes, bright and clear.' },
    { items: ['Captain Vance, the navigator', 'Officer Stone, the engineer', 'Cadet Yu, the cook'], prompt: "Write a sentence listing three crew members with roles.", model: 'The crew includes Captain Vance, the navigator; Officer Stone, the engineer; and Cadet Yu, the cook.' },
    { items: ['Tokyo, Japan', 'Seoul, South Korea', 'Beijing, China'], prompt: "Write a sentence listing three Asian capitals.", model: 'The trip covers Tokyo, Japan; Seoul, South Korea; and Beijing, China.' },
    { items: ['daisies, freshly picked', 'roses, deep red', 'lilies, white and tall'], prompt: "Write a sentence listing three flowers with descriptions.", model: 'The bouquet held daisies, freshly picked; roses, deep red; and lilies, white and tall.' },
    { items: ['Ben, the goalkeeper', 'Sara, the defender', 'Mo, the striker'], prompt: "Write a sentence listing three football positions.", model: 'The squad includes Ben, the goalkeeper; Sara, the defender; and Mo, the striker.' },
    { items: ['baguettes, golden and crisp', 'rolls, soft and warm', 'loaves, dense and dark'], prompt: "Write a sentence listing three breads with descriptions.", model: 'The bakery makes baguettes, golden and crisp; rolls, soft and warm; and loaves, dense and dark.' },
    { items: ['oak, broad and shady', 'birch, slim and silver', 'pine, tall and straight'], prompt: "Write a sentence listing three trees with descriptions.", model: 'The wood holds oak, broad and shady; birch, slim and silver; and pine, tall and straight.' },
    { items: ['Hannah, the conductor', 'Ravi, the pianist', 'Jude, the soloist'], prompt: "Write a sentence listing three musicians with roles.", model: 'The concert features Hannah, the conductor; Ravi, the pianist; and Jude, the soloist.' },
    { items: ['Athens, Greece', 'Lisbon, Portugal', 'Vienna, Austria'], prompt: "Write a sentence listing three European capitals.", model: 'The itinerary lists Athens, Greece; Lisbon, Portugal; and Vienna, Austria.' },
    { items: ['mango, ripe and golden', 'kiwi, sharp and green', 'lychee, pale and sweet'], prompt: "Write a sentence listing three exotic fruits with descriptions.", model: 'The platter offered mango, ripe and golden; kiwi, sharp and green; and lychee, pale and sweet.' },
    { items: ['Jay, the captain', 'Ade, the vice-captain', 'Pip, the keeper'], prompt: "Write a sentence listing three cricket roles.", model: 'The line-up has Jay, the captain; Ade, the vice-captain; and Pip, the keeper.' },
    { items: ['scones, warm and crumbly', 'tarts, glossy and sweet', 'biscuits, light and buttery'], prompt: "Write a sentence listing three baked goods with descriptions.", model: 'The afternoon tea featured scones, warm and crumbly; tarts, glossy and sweet; and biscuits, light and buttery.' },
    { items: ['Helsinki, Finland', 'Oslo, Norway', 'Copenhagen, Denmark'], prompt: "Write a sentence listing three Nordic capitals.", model: 'The cruise calls at Helsinki, Finland; Oslo, Norway; and Copenhagen, Denmark.' },
  ],
});

// ── 13. bullet_points (cluster: structure) ───────────────────────────

export const bulletPointsTransferDsl = buildTransferFamily({
  familyId: 'gen_bullet_points_transfer',
  skillId: 'bullet_points',
  clusterId: 'structure',
  rewardUnitId: 'bullet-points-core',
  explanation: 'A bullet list opens with a stem ending in a colon and lists each item on its own line with consistent punctuation.',
  explanationRuleId: 'bullet.colon-and-consistency',
  misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing'],
  validatorFor: (s) => ({ type: 'requiresBulletStemAndItems', stem: s.stem, items: s.items }),
  scenarios: [
    { stem: 'Bring', items: ['a hat', 'sunscreen', 'a water bottle'], prompt: "Write a bullet list with stem 'Bring' and three items for a sunny trip.", model: 'Bring:\n- a hat\n- sunscreen\n- a water bottle' },
    { stem: 'Pack', items: ['a torch', 'a map', 'a whistle'], prompt: "Write a bullet list with stem 'Pack' and three hiking items.", model: 'Pack:\n- a torch\n- a map\n- a whistle' },
    { stem: 'Remember to bring', items: ['a pencil', 'a ruler', 'a rubber'], prompt: "Write a bullet list with stem 'Remember to bring' and three classroom items.", model: 'Remember to bring:\n- a pencil\n- a ruler\n- a rubber' },
    { stem: 'You will need', items: ['scissors', 'glue', 'card'], prompt: "Write a bullet list with stem 'You will need' for an art lesson.", model: 'You will need:\n- scissors\n- glue\n- card' },
    { stem: 'The kit includes', items: ['shorts', 'socks', 'a shirt'], prompt: "Write a bullet list with stem 'The kit includes' for football.", model: 'The kit includes:\n- shorts\n- socks\n- a shirt' },
    { stem: 'Wear', items: ['walking shoes', 'a coat', 'gloves'], prompt: "Write a bullet list with stem 'Wear' for cold weather.", model: 'Wear:\n- walking shoes\n- a coat\n- gloves' },
    { stem: 'Collect', items: ['leaves', 'twigs', 'small stones'], prompt: "Write a bullet list with stem 'Collect' for a nature walk.", model: 'Collect:\n- leaves\n- twigs\n- small stones' },
    { stem: 'The shopping list reads', items: ['bread', 'cheese', 'apples'], prompt: "Write a bullet list with stem 'The shopping list reads'.", model: 'The shopping list reads:\n- bread\n- cheese\n- apples' },
    { stem: 'Take', items: ['your library card', 'your reading book', 'a notebook'], prompt: "Write a bullet list with stem 'Take' for a library visit.", model: 'Take:\n- your library card\n- your reading book\n- a notebook' },
    { stem: 'The recipe needs', items: ['flour', 'sugar', 'butter'], prompt: "Write a bullet list with stem 'The recipe needs'.", model: 'The recipe needs:\n- flour\n- sugar\n- butter' },
    { stem: 'Each runner brings', items: ['a number', 'a bottle', 'a snack'], prompt: "Write a bullet list with stem 'Each runner brings'.", model: 'Each runner brings:\n- a number\n- a bottle\n- a snack' },
    { stem: 'The workshop offers', items: ['printing', 'painting', 'sculpting'], prompt: "Write a bullet list with stem 'The workshop offers'.", model: 'The workshop offers:\n- printing\n- painting\n- sculpting' },
    { stem: 'Tidy up by', items: ['stacking the chairs', 'closing the windows', 'switching off the lights'], prompt: "Write a bullet list with stem 'Tidy up by'.", model: 'Tidy up by:\n- stacking the chairs\n- closing the windows\n- switching off the lights' },
    { stem: 'The tour visits', items: ['the abbey', 'the harbour', 'the museum'], prompt: "Write a bullet list with stem 'The tour visits'.", model: 'The tour visits:\n- the abbey\n- the harbour\n- the museum' },
    { stem: 'Practice each day by', items: ['reading aloud', 'writing notes', 'spelling words'], prompt: "Write a bullet list with stem 'Practice each day by'.", model: 'Practice each day by:\n- reading aloud\n- writing notes\n- spelling words' },
    { stem: 'The garden grows', items: ['carrots', 'beans', 'potatoes'], prompt: "Write a bullet list with stem 'The garden grows'.", model: 'The garden grows:\n- carrots\n- beans\n- potatoes' },
    { stem: 'Bring on the trip', items: ['a sun hat', 'sun cream', 'a refillable bottle'], prompt: "Write a bullet list with stem 'Bring on the trip'.", model: 'Bring on the trip:\n- a sun hat\n- sun cream\n- a refillable bottle' },
    { stem: 'The starter kit holds', items: ['a sketchbook', 'pencils', 'an eraser'], prompt: "Write a bullet list with stem 'The starter kit holds'.", model: 'The starter kit holds:\n- a sketchbook\n- pencils\n- an eraser' },
  ],
});

// ── 14. hyphen (cluster: boundary) ───────────────────────────────────

export const hyphenTransferDsl = buildTransferFamily({
  familyId: 'gen_hyphen_transfer',
  skillId: 'hyphen',
  clusterId: 'boundary',
  rewardUnitId: 'hyphens-core',
  explanation: 'A hyphen joins compound modifiers so the meaning is unambiguous.',
  explanationRuleId: 'hyphen.compound-modifier',
  misconceptionTags: ['boundary.hyphen_missing'],
  validatorFor: (s) => ({ type: 'requiresHyphenatedPhrase', phrase: s.phrase, minimumWordCount: 6 }),
  scenarios: [
    { phrase: 'well-known author', prompt: "Write a sentence using the hyphenated phrase 'well-known author'.", model: 'The well-known author visited our class today.' },
    { phrase: 'man-eating shark', prompt: "Write a sentence using the hyphenated phrase 'man-eating shark'.", model: 'The divers spotted a man-eating shark near the reef.' },
    { phrase: 'long-running show', prompt: "Write a sentence using the hyphenated phrase 'long-running show'.", model: 'The long-running show finally closed last weekend.' },
    { phrase: 'high-quality paper', prompt: "Write a sentence using the hyphenated phrase 'high-quality paper'.", model: 'The artist always uses high-quality paper for prints.' },
    { phrase: 'old-fashioned bicycle', prompt: "Write a sentence using the hyphenated phrase 'old-fashioned bicycle'.", model: 'My grandfather rode an old-fashioned bicycle to work.' },
    { phrase: 'last-minute change', prompt: "Write a sentence using the hyphenated phrase 'last-minute change'.", model: 'The director announced a last-minute change to the cast.' },
    { phrase: 'self-portrait sketch', prompt: "Write a sentence using the hyphenated phrase 'self-portrait sketch'.", model: 'The artist completed a striking self-portrait sketch this week.' },
    { phrase: 'fast-flowing river', prompt: "Write a sentence using the hyphenated phrase 'fast-flowing river'.", model: 'The hikers crossed a fast-flowing river on the wooden bridge.' },
    { phrase: 'open-ended question', prompt: "Write a sentence using the hyphenated phrase 'open-ended question'.", model: 'The teacher posed an open-ended question to the class.' },
    { phrase: 'state-of-the-art lab', prompt: "Write a sentence using the hyphenated phrase 'state-of-the-art lab'.", model: 'The university opened a state-of-the-art lab last month.' },
    { phrase: 'cold-water swim', prompt: "Write a sentence using the hyphenated phrase 'cold-water swim'.", model: 'The team finished the cold-water swim in record time.' },
    { phrase: 'short-term plan', prompt: "Write a sentence using the hyphenated phrase 'short-term plan'.", model: 'The council agreed on a short-term plan for the road.' },
    { phrase: 'quick-thinking pupil', prompt: "Write a sentence using the hyphenated phrase 'quick-thinking pupil'.", model: 'A quick-thinking pupil pulled the alarm immediately.' },
    { phrase: 'low-fat yogurt', prompt: "Write a sentence using the hyphenated phrase 'low-fat yogurt'.", model: 'The canteen now stocks low-fat yogurt every Monday.' },
    { phrase: 'wind-blown sand', prompt: "Write a sentence using the hyphenated phrase 'wind-blown sand'.", model: 'The wind-blown sand stung our cheeks on the beach.' },
    { phrase: 'rain-soaked coat', prompt: "Write a sentence using the hyphenated phrase 'rain-soaked coat'.", model: 'She hung her rain-soaked coat over the radiator.' },
    { phrase: 'family-run shop', prompt: "Write a sentence using the hyphenated phrase 'family-run shop'.", model: 'The family-run shop has stood here for decades.' },
    { phrase: 'six-year-old boy', prompt: "Write a sentence using the hyphenated phrase 'six-year-old boy'.", model: 'A six-year-old boy gave the brilliant speech.' },
  ],
});
