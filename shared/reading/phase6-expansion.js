// Deterministic Reading Phase 6 scale expansion.
// Worker/shared content only: contains answer keys and marking checks.
// This wave moves Reading beyond 4K questions while preserving original
// passages, evidence snippets, answer-safe metadata and strict paper totals.

const PHASE6_FICTION_PLACES = [
  "tidal archive",
  "moorland tram stop",
  "floating classroom",
  "castle bakery",
  "forest rope bridge",
  "canal lock house",
  "observatory garden",
  "market tunnel",
  "snowbound library",
  "clifftop rescue hut",
  "festival workshop",
  "mill pond path",
  "glass corridor",
  "harbour map room",
  "railway signal hut",
  "orchard pump house",
  "island ferry shed",
  "city rooftop farm",
  "underground spring",
  "community repair cafe",
  "windmill platform",
  "river museum deck",
  "hillside weather station",
  "quarry classroom",
  "lantern courtyard",
  "marsh boardwalk",
  "school radio room",
  "bee garden gate",
  "lighthouse store",
  "greenway cycle hub",
  "old theatre loft",
  "rain garden square",
  "frost fair stall",
  "bird-ringing hide",
  "clock museum stair",
  "wildflower seed shed",
  "tram depot office",
  "seaweed drying shed",
  "planetarium side door",
  "bell tower landing",
  "recycling yard office",
  "hedgerow survey post",
  "music hall balcony",
  "fern house path",
  "bridge inspection hut",
  "paper mill store",
  "meadow pond shelter",
  "town hall archive",
  "sailing club pontoon",
  "walled garden arch",
  "school kitchen garden",
  "cave visitor hut",
  "winter ferry slip",
  "heritage bus garage",
  "chalk stream bridge",
  "solar classroom roof",
  "puppet theatre wings",
  "hill fort gate",
  "canopy walkway",
  "tidal pool steps",
  "old kiln yard",
  "foggy station platform",
  "museum conservation bench",
  "community orchard shed",
  "river measuring post",
  "park ranger kiosk",
  "stargazing campsite",
  "lifeboat practice pier"
];

const PHASE6_NON_FICTION_TOPICS = [
  "rain gardens",
  "community seed banks",
  "wildlife bridges",
  "urban tree maps",
  "school compost systems",
  "floating reed beds",
  "repair cafes",
  "beach clean surveys",
  "dark sky parks",
  "accessible playground design",
  "canal lock restoration",
  "school radio stations",
  "beaver wetlands",
  "hedgerow corridors",
  "coastal erosion maps",
  "low-waste lunches",
  "library catalogues",
  "electric bus routes",
  "community orchards",
  "pond dipping surveys",
  "solar shade lessons",
  "tidal energy models",
  "museum conservation",
  "bird migration tracking",
  "river level monitoring",
  "green roofs",
  "bike-share systems",
  "weather station records",
  "water-saving taps",
  "habitat hotels",
  "quiet zones in schools",
  "printing presses",
  "glass recycling loops",
  "chalk stream care",
  "market food miles",
  "lifeboat training",
  "astronomy clubs",
  "old railway paths",
  "peatland restoration",
  "mobile libraries",
  "school kitchen gardens",
  "bee-friendly planting",
  "flood warning boards",
  "wind turbine models",
  "archaeology digs",
  "public art trails",
  "paper recycling",
  "soil testing",
  "sustainable fishing",
  "compass navigation",
  "noise mapping",
  "moth surveys",
  "microclimate gardens",
  "heritage signs",
  "community fridges",
  "bus priority lanes",
  "tree-ring science",
  "river meanders",
  "storytelling festivals",
  "wetland boardwalks",
  "light pollution surveys",
  "tool libraries",
  "community theatres",
  "cave safety guides",
  "wildflower verges",
  "electric cargo bikes",
  "water fountains",
  "citizen science notebooks"
];

const PHASE6_POETRY_SETTINGS = [
  "under the railway arch",
  "beside the winter pond",
  "inside the print room",
  "at the edge of the allotment",
  "below the bell tower",
  "on the ferry steps",
  "along the chalk stream",
  "in the closed museum",
  "beneath the market awning",
  "inside the glasshouse",
  "by the listening post",
  "above the tidal pool",
  "at the school gate",
  "behind the theatre curtain",
  "near the old kiln",
  "beside the rain garden",
  "on the quiet bus",
  "under the planetarium dome",
  "among the orchard rows",
  "inside the radio booth",
  "beside the river gauge",
  "at the cycle stand",
  "under the bee hotel",
  "near the lifeboat shed",
  "along the greenway",
  "inside the seed library",
  "on the quarry path",
  "below the lighthouse lamp",
  "beside the compost bay",
  "inside the map drawer",
  "at the festival bridge",
  "among the reed beds",
  "inside the repair cafe",
  "on the rooftop farm",
  "near the puppet stage",
  "beside the wind turbine",
  "under the willow arch",
  "inside the heritage bus",
  "at the cave mouth",
  "beside the wildflower verge",
  "on the observation deck",
  "inside the conservation room",
  "under the moonlit lock",
  "beside the paper vat",
  "at the weather mast",
  "near the bridge sensor",
  "inside the story tent",
  "on the boardwalk",
  "beside the water fountain",
  "under the dark-sky sign",
  "among the fern shadows",
  "near the tram shelter",
  "inside the food-share room",
  "by the orchard grafts",
  "at the stone circle",
  "beneath the school canopy",
  "beside the stream tray",
  "inside the tool library",
  "near the harbour chain",
  "under the solar dial",
  "beside the seedling bench",
  "inside the clock case",
  "on the lifeboat pier",
  "by the pond shelter",
  "inside the mural yard",
  "near the hedge gap",
  "under the stargazing tarp",
  "at the town archive"
];

const NAMES = ['Arun', 'Bella', 'Callum', 'Dina', 'Evan', 'Freya', 'Gita', 'Hugo', 'Iona', 'Jasper', 'Kaya', 'Luca', 'Mina', 'Nico', 'Orla', 'Pavel', 'Quinn'];
const OBJECTS = ['brass field lens', 'folded route card', 'waterproof notebook', 'green safety tag', 'star-patterned mat', 'chalk arrow slate', 'blue index card', 'paper lantern plan', 'reed measuring stick', 'red signal flag', 'salt-stained ledger', 'ranger radio clip', 'seed-drying tray', 'river level ruler', 'cotton conservation mask', 'lifeboat practice whistle', 'map drawer label'];
const CLUE_NOUNS = ['salt mark', 'fresh wheel print', 'dry clip', 'frayed fibre', 'chalk dust', 'bent corner', 'thumbprint', 'seed husk', 'oil mark', 'split twig', 'shadow line', 'loose stitch', 'muddy foam', 'static patch', 'tight kink', 'feather barb', 'clean rectangle'];
const HELPERS = ['Warden Vale', 'Mrs Kettle', 'Ranger Ash', 'Dr Patel', 'Librarian Osei', 'Engineer Hobb', 'Curator Finch', 'Pilot Mara', 'Bee-keeper Rani', 'Gardener Lio', 'Keeper Orin', 'Mechanic Tess', 'Archivist Penn', 'Coach Ren', 'Teacher Ellis', 'Conservator Lark', 'Guide Brin'];
const IMAGES = ['morning light silvered the wet ground', 'mist flattened the distance into a pale map', 'rain tapped like patient fingers', 'lanterns made commas of light', 'snow pressed silence against the windows', 'water spread like glass over the stones', 'the corridor held the day in blurred panels', 'rails glittered under a hard frost', 'reeds shifted like quiet pages', 'clouds dragged blue shadows over the hill', 'the star chart gleamed under a red torch', 'the river lifted and dropped the rope'];
const THEMES = ['careful observation protects shared places', 'quiet evidence can solve a public problem', 'responsibility begins with noticing small details', 'safety sometimes means slowing down', 'communities rely on clear routes', 'warnings need exact placement', 'wildlife records need patient accuracy', 'evidence can be hidden by a bad angle', 'measurements need repeated checking', 'practice builds readiness', 'history relies on correct labels', 'nature surveys need full samples'];

const PROCESS_PATTERNS = ['collecting evidence over time', 'using a simple map or record', 'checking changes before acting', 'matching observations to a clear purpose', 'balancing practical needs with care for nature', 'recording small details accurately', 'comparing old information with new measurements', 'making a shared system easier to use'];
const BENEFIT_PATTERNS = ['helps people make better decisions', 'protects places that are easy to damage', 'makes hidden patterns visible', 'supports wildlife while helping communities', 'turns scattered observations into useful evidence', 'reduces waste by planning carefully', 'makes a public space easier to share', 'keeps important information available'];
const RISK_PATTERNS = ['can fail if records are guessed rather than checked', 'needs maintenance after the first exciting launch', 'may confuse people if signs are unclear', 'does not solve every problem on its own', 'can damage trust if measurements are not honest', 'needs people to notice quiet warning signs', 'can be harder during bad weather or busy days', 'must include people who use the space differently'];
const CASE_ANCHORS = [
  'amber record window',
  'copper planning board',
  'blue evidence route',
  'green checking cycle',
  'silver survey marker',
  'red maintenance ledger',
  'quiet pattern map',
  'shared access chart',
  'winter signal panel',
  'summer observation strip',
  'careful route card',
  'daily measure board',
  'public notice frame',
  'water level strip',
  'wildlife count grid',
  'library index tray',
  'travel timetable pane',
  'orchard care register',
  'pond sample slate',
  'solar shade diagram',
  'tide model board',
  'archive handling card',
  'migration marker line',
  'river gauge strip',
  'roof planting grid',
  'cycle station ledger',
  'weather reading pane',
  'tap inspection tag',
  'habitat shelter map',
  'quiet zone register',
  'press plate record',
  'glass sorting chart',
  'stream care marker',
  'market journey ledger',
  'lifeboat drill card',
  'stargazing light map',
  'rail path notice',
  'peat sample board',
  'library route slip',
  'kitchen bed record',
  'pollinator count strip',
  'flood board marker',
  'turbine test card',
  'dig layer plan',
  'art trail index',
  'paper loop register',
  'soil sample tray',
  'harbour catch ledger',
  'compass bearing card',
  'sound level chart',
  'moth trap record',
  'garden climate marker',
  'heritage label strip',
  'fridge stock board',
  'bus lane timing sheet',
  'tree ring chart',
  'meander sketch panel',
  'festival story ledger',
  'boardwalk safety tag',
  'dark sky reading card',
  'tool loan register',
  'stage access map',
  'cave route marker',
  'verge seed record',
  'cargo bike log',
  'fountain flow card',
  'citizen notebook index',
  'workshop lending slate'
];

const POEM_OBJECTS = ['bottle cap', 'first frog call', 'stack of paper', 'row of bean poles', 'bell rope', 'ferry chain', 'mayfly wing', 'helmet in glass', 'loose apple crate', 'fern frond', 'radio aerial', 'limpet shell', 'painted gate', 'velvet mask', 'warm brick', 'puddle edge', 'ticket strip'];
const MOODS = ['quiet', 'watchful', 'bright', 'thoughtful', 'patient', 'hopeful', 'restless', 'gentle'];
const PUNCTUATION_SKILLS = ['P1', 'P2', 'P3', 'P4'];
const SETTING_PREFIX_RE = /^(under|beside|inside|at|below|on|along|in|beneath|among|near|by)\s+(the\s+)?/i;

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function titleCase(value) {
  return String(value || '').split(/\s+/).map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(' ');
}

function sentenceCase(value) {
  const text = String(value || '').trim();
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1)}` : text;
}

function objectForPoemSetting(setting, index) {
  const settingCore = String(setting || '').replace(SETTING_PREFIX_RE, '').trim();
  return `${settingCore} ${POEM_OBJECTS[index % POEM_OBJECTS.length]}`;
}

function words(value, limit = 4) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, limit);
}

function topicCaseLabel(topic, index) {
  const initials = String(topic || '')
    .split(/\s+/)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase();
  return `${initials} field note ${index + 1}`;
}

function topicCaseAnchor(index) {
  return CASE_ANCHORS[index % CASE_ANCHORS.length];
}

function makeFictionPunctuationQuestion(id, spec, skill) {
  const adviceSentence = sentenceCase(spec.advice);
  const bySkill = {
    P1: {
      stem: `In ${spec.title}, what does the comma after "For a while" help to show during ${spec.challenge}?`,
      options: ['It separates an opening time phrase from the main idea.', 'It introduces exact spoken words.', 'It marks the end of a question.', 'It lists unrelated objects.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the comma marks an opening time phrase before the sentence explains the confusing problem.`,
      explanation: 'The comma after the opening phrase creates a pause before the main idea of the sentence.',
      hint: 'Look at the words before and after the comma.'
    },
    P2: {
      stem: `When ${spec.helper} says "${adviceSentence}.", what do the speech marks show in ${spec.title}?`,
      options: [`They show the exact words spoken by ${spec.helper}.`, 'They mark the title of the story.', 'They separate an opening time phrase.', 'They introduce a list of clues.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the speech marks show the exact words spoken by ${spec.helper}.`,
      explanation: 'Speech marks signal direct speech and help the reader hear the character voice.',
      hint: 'Think about who is speaking.'
    },
    P3: {
      stem: `What do the dashes around "almost ordinary" add to the description of ${spec.clue} in ${spec.title}?`,
      options: ['They add extra information about how the clue first seemed.', 'They show a new speaker starting to talk.', 'They mark the sentence as a question.', 'They remove the detail from the passage.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the dashes add extra information about how ${spec.clue} first seemed almost ordinary.`,
      explanation: 'The dashes hold an inserted detail that comments on the clue without stopping the main sentence.',
      hint: 'Look at the words between the dashes.'
    },
    P4: {
      stem: `In ${spec.title}, what does the semicolon in "The first mark seemed tiny; the next choice depended on it" help to show during ${spec.challenge}?`,
      options: ['It links two closely connected ideas.', 'It introduces direct speech.', 'It shows a question is being asked.', 'It separates items in a simple list only.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the semicolon links the tiny first mark to the choice that depends on it.`,
      explanation: 'The first clause says the mark seemed tiny; the second explains why it still mattered.',
      hint: 'Look at the ideas on both sides of the semicolon.'
    },
  };
  return { id, type: 'mcq', skill, marks: 2, ...bySkill[skill] };
}

function makeNonFictionPunctuationQuestion(id, spec, skill) {
  const bySkill = {
    P1: {
      stem: `When the ${spec.caseAnchor} explanation says "However", what does the comma help the reader notice in ${spec.title}?`,
      options: ['The explanation is turning from benefit to caution.', 'A speaker is giving exact words.', 'A definition is being put in brackets.', 'A list of separate tools is beginning.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the comma after "However" helps signal that the ${spec.caseAnchor} explanation is turning from benefit to caution.`,
      explanation: 'The comma marks a pause after the linking word before the balanced warning begins.',
      hint: 'Think about the change after the word "However".'
    },
    P2: {
      stem: `In the ${spec.caseAnchor} example, what do the speech marks around "What changed this week?" show?`,
      options: ['They show the exact words the team asks.', 'They mark the name of the project.', 'They add extra information in brackets.', 'They introduce a sequence of steps.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the speech marks show the exact question the team asks.`,
      explanation: 'Speech marks show direct speech, so the reader can hear the question being asked.',
      hint: 'Look for the words a team member says.'
    },
    P3: {
      stem: `What do the parentheses around "a short field record" add after ${spec.caseLabel} in the ${spec.caseAnchor} evidence?`,
      options: ['They add a brief explanation of the label.', 'They show the start of direct speech.', 'They mark a question for the reader.', 'They separate two unrelated sections.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the parentheses add a brief explanation of what ${spec.caseLabel} means in the ${spec.caseAnchor} evidence.`,
      explanation: 'Parentheses can hold extra information inside a sentence.',
      hint: 'Look at the words inside the parentheses.'
    },
    P4: {
      stem: `When the writer links checks to the ${spec.caseAnchor}, what does the semicolon in "They check, adjust and explain; the evidence is small" help to do?`,
      options: ['It links two closely connected ideas about careful work.', 'It introduces a question.', 'It shows a speaker has begun talking.', 'It separates a title from a subtitle.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the semicolon links careful checking to the small evidence that supports decisions.`,
      explanation: 'Both parts describe how the project uses evidence.',
      hint: 'Look at the ideas on both sides of the semicolon.'
    },
  };
  return { id, type: 'mcq', skill, marks: 2, ...bySkill[skill] };
}

function makePoetryPunctuationQuestion(id, spec, skill) {
  const bySkill = {
    P1: {
      stem: `In ${spec.title}, what does the comma after "At ${spec.setting}" help to do before the image of the ${spec.object}?`,
      options: ['It separates the opening place phrase from the image that follows.', 'It shows the exact words spoken by a passer-by.', 'It adds extra information between dashes.', 'It links two closely connected clauses.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the comma separates the opening place phrase from the image of the ${spec.object}.`,
      explanation: 'The comma creates a pause after the setting before the poem focuses on the image.',
      hint: 'Look at the opening line.'
    },
    P2: {
      stem: `What do the speech marks around "Stay bright," show near the ${spec.object} in ${spec.title}?`,
      options: ['They show the exact words whispered by the passer-by.', 'They mark an opening place phrase.', 'They add extra information about the place.', 'They introduce a list of objects.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the speech marks show the exact words whispered near the ${spec.object}.`,
      explanation: 'Speech marks show direct speech and make the quiet voice part of the poem.',
      hint: 'Think about who is whispering.'
    },
    P3: {
      stem: `What do the dashes around "usually passed without thought" add about the ${spec.object} in ${spec.title}?`,
      options: ['They add extra information about how people normally treat the place.', 'They show a new speaker beginning.', 'They mark the line as a question.', 'They separate two items in a list.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the dashes add extra information about how the place around the ${spec.object} is usually passed without thought.`,
      explanation: 'The dashes hold an inserted comment before the poem returns to the main idea.',
      hint: 'Look at the words between the dashes.'
    },
    P4: {
      stem: `In ${spec.title}, what does the semicolon in "Small sounds move like careful footsteps; shadows lean and listen close" help to do near the ${spec.object}?`,
      options: ['It links two closely connected images.', 'It introduces direct speech.', 'It marks a question.', 'It separates an author from a title.'],
      correct: 0,
      modelAnswer: `In ${spec.title}, the semicolon links two closely connected images.`,
      explanation: 'Both clauses describe the quiet, watchful atmosphere.',
      hint: 'Look at the images on both sides of the semicolon.'
    },
  };
  return { id, type: 'mcq', skill, marks: 1, ...bySkill[skill] };
}

function fictionSpec(place, index) {
  const name = NAMES[index % NAMES.length];
  const object = OBJECTS[index % OBJECTS.length];
  const clue = `${CLUE_NOUNS[index % CLUE_NOUNS.length]} near the ${place}`;
  const challenge = `${place} puzzle number ${index + 1}`;
  const evidence = `the ${clue} matched the hidden marker`;
  const outcome = `${name} solved the ${challenge} before the group moved on`;
  return {
    id: slug(place),
    title: titleCase(place),
    name,
    place,
    object,
    challenge,
    clue,
    helper: HELPERS[index % HELPERS.length],
    advice: `${THEMES[index % THEMES.length]}`,
    image: IMAGES[index % IMAGES.length],
    evidence,
    outcome,
    theme: THEMES[(index + 5) % THEMES.length],
  };
}

function makeFictionPassage(place, index) {
  const spec = fictionSpec(place, index);
  const prefix = `phase6_fiction_${spec.id}`;
  const q = (n) => `${prefix}_q${n}`;
  const punctSkill = PUNCTUATION_SKILLS[index % PUNCTUATION_SKILLS.length];
  const adviceSentence = sentenceCase(spec.advice);
  return {
    id: prefix,
    title: spec.title,
    genre: 'fiction',
    difficulty: 4 + (index % 2),
    isLong: true,
    blocks: [
      `${spec.name} reached ${spec.place} while the morning was still unsettled, carrying a ${spec.object} and trying to understand ${spec.challenge}. ${spec.image}.`,
      `The first clue was ${spec.clue}. ${spec.helper} warned, "${adviceSentence}." Even so, ${spec.name} had to decide which sign mattered most.`,
      `For a while, every obvious answer made ${spec.challenge} more confusing. The clue looked small - almost ordinary - but the decision it led to mattered. The first mark seemed tiny; the next choice depended on it. ${spec.name} slowed down, compared the marks, and checked the ${spec.object} again.`,
      `${spec.evidence}. That evidence changed the problem from a guess into a plan, and ${spec.name} finally understood how to act without rushing.`,
      `By the end, ${spec.outcome}. The day left ${spec.name} with the thought that ${spec.theme}.`
    ],
    questions: [
      { id: q(1), type: 'short', skill: '2b', marks: 1, stem: `Which object does ${spec.name} carry while investigating ${spec.challenge} at ${spec.place}?`, check: { keywordAny: [words(spec.object), [words(spec.object)[0]]] }, modelAnswer: `In ${spec.title}, ${spec.name} carries a ${spec.object}.`, explanation: `The opening sentence names the ${spec.object} as the object ${spec.name} carries.`, hint: 'Look at the opening sentence.' },
      { id: q(2), type: 'mcq', skill: '2a', marks: 1, stem: `In ${spec.title}, what does ${spec.helper} mean by saying "${spec.advice}" after noticing ${spec.clue}?`, options: ['Ignore the small details and hurry.', 'Look carefully at small evidence before deciding.', 'Let somebody else solve the problem.', 'Guess the answer without checking.'], correct: 1, modelAnswer: `In ${spec.title}, the advice means ${spec.name} should look carefully at small evidence before deciding.`, explanation: `The advice tells ${spec.name} to use careful observation instead of rushing.`, hint: 'Think about why the clue matters.' },
      { id: q(3), type: 'evidenceShort', skill: '2d', marks: 2, stem: `How does ${spec.name} turn ${spec.challenge} into a plan? Use a short quotation or phrase from the text as evidence.`, answerCheck: { keywordAny: [words(spec.evidence, 5), words(spec.outcome, 5), words(spec.challenge, 5), ['evidence', 'plan']] }, evidenceCheck: { containsAny: [spec.evidence, 'changed the problem from a guess into a plan', spec.outcome] }, answerMarks: 1, evidenceMarks: 1, modelAnswer: `${spec.name} uses the evidence instead of guessing, so ${spec.challenge} becomes a plan. Evidence could include "${spec.evidence}".`, explanation: 'The key change is that the character slows down and uses proof from the scene.', hint: 'Explain the change, then quote the proof.' },
      { id: q(4), type: 'mcq', skill: '2c', marks: 2, stem: `Which option best summarises how ${spec.challenge} is solved in ${spec.title}?`, options: [`${spec.name} ignores ${spec.clue} and waits for an adult to fix everything.`, `${spec.name} notices ${spec.clue}, checks the ${spec.object}, and uses evidence to solve the problem.`, `${spec.helper} removes the problem before ${spec.name} understands it.`, `${spec.name} gives up because the first answer is confusing.`], correct: 1, modelAnswer: `${spec.name} notices ${spec.clue}, checks the ${spec.object}, and uses evidence to solve the problem.`, explanation: 'The summary needs the problem, the clue and the careful solution.', hint: 'Choose the option that includes problem, clue and solution.' },
      { id: q(5), type: 'open', skill: '2g', marks: 2, stem: `Why is the image "${spec.image}" effective while ${spec.name} is solving ${spec.challenge} in ${spec.title}?`, rubric: [{ label: 'Uses image detail', check: { keywordAny: [words(spec.image, 5)] } }, { label: 'Explains effect', check: { keywordAny: [['vivid'], ['picture'], ['mood'], ['reader'], ['atmosphere'], ['setting']] } }], modelAnswer: `In ${spec.title}, the image "${spec.image}" creates a vivid picture of the setting and helps the reader feel the mood before the problem is solved.`, explanation: 'A strong answer links the quoted image to its effect on the reader.', hint: 'Say what the picture is and what it makes the reader feel.' },
      { id: q(6), type: 'open', skill: '2f', marks: 2, stem: `How does the structure of ${spec.title} move from ${spec.challenge} to the idea that ${spec.theme}?`, rubric: [{ label: 'Tracks problem to clue', check: { keywordAny: [words(spec.challenge, 4), words(spec.clue, 4), ['problem', 'clue']] } }, { label: 'Tracks outcome or theme', check: { keywordAny: [words(spec.outcome, 5), words(spec.theme, 5), ['ending'], ['theme'], ['outcome']] } }], modelAnswer: `The story begins with ${spec.challenge}, then ${spec.name} follows ${spec.clue} and uses evidence. By the ending, ${spec.outcome}, showing that ${spec.theme}.`, explanation: 'The answer should follow the order of the story, not just name one event.', hint: 'Follow the beginning, middle and ending.' },
      { id: q(7), type: 'match', skill: '2h', marks: 2, stem: `Match each detail from ${spec.title} to its role in solving ${spec.challenge}.`, prompts: [spec.object, spec.clue, spec.advice], options: ['the carried tool or object', 'the first important clue', 'the guidance about how to think'], correctMap: { 0: '0', 1: '1', 2: '2' }, modelAnswer: `${spec.object} is the carried object; ${spec.clue} is the first important clue; "${spec.advice}" is the guidance.`, explanation: 'Each detail has a different job in the solution.', hint: 'Decide whether each detail is object, clue or advice.' },
      { id: q(8), type: 'order', skill: '2f', marks: 2, stem: `Put the main events of ${spec.challenge} in order.`, items: [`${spec.name} arrives at ${spec.place} with a ${spec.object}.`, `${spec.name} notices ${spec.clue}.`, `${spec.evidence}.`, `${spec.outcome}.`], correctPositions: [1, 2, 3, 4], modelAnswer: `In ${spec.title}, the order is arrival with the ${spec.object}, clue, evidence, then outcome.`, explanation: 'The order follows the passage from beginning to end.', hint: 'Track what happens first, next and last.' },
      { id: q(9), type: 'multiSelect', skill: '2d', marks: 1, stem: `Which two details best show that ${spec.name} solves ${spec.challenge} carefully?`, options: [spec.clue, spec.evidence, 'guessing without checking', 'forgetting the object completely'], correctSet: [0, 1], modelAnswer: `${spec.clue} and "${spec.evidence}" show careful problem-solving.`, explanation: 'Both correct choices are pieces of evidence from the passage.', hint: 'Choose details that are in the passage and show care.' },
      makeFictionPunctuationQuestion(q(10), spec, punctSkill)
    ]
  };
}

function nonFictionSpec(topic, index) {
  const process = PROCESS_PATTERNS[index % PROCESS_PATTERNS.length];
  const benefit = BENEFIT_PATTERNS[index % BENEFIT_PATTERNS.length];
  const risk = RISK_PATTERNS[index % RISK_PATTERNS.length];
  return {
    id: slug(topic),
    title: `${titleCase(topic)} in Practice`,
    topic,
    process,
    benefit,
    risk,
    caseLabel: topicCaseLabel(topic, index),
    caseAnchor: topicCaseAnchor(index),
    example: `a class team records ${topic} evidence on a shared board`,
    detail: `small weekly checks make ${topic} easier to improve`,
    contrast: `quick guesses can miss the slow pattern in ${topic}`,
    image: `the record turns scattered notes about ${topic} into a clear pattern`,
  };
}

function makeNonFictionPassage(topic, index) {
  const spec = nonFictionSpec(topic, index);
  const prefix = `phase6_nonfiction_${spec.id}`;
  const q = (n) => `${prefix}_q${n}`;
  const punctSkill = PUNCTUATION_SKILLS[(index + 1) % PUNCTUATION_SKILLS.length];
  return {
    id: prefix,
    title: spec.title,
    genre: 'non-fiction',
    difficulty: 4 + (index % 2),
    isLong: true,
    blocks: [
      `A careful explanation of ${spec.topic} begins with ${spec.process}. The idea is not to collect facts for display, but to use evidence so that a real place or routine works better.`,
      `One practical example is that ${spec.example}. The team asks, "What changed this week?" The project labels this ${spec.caseLabel} (a short field record) and checks the ${spec.caseAnchor}, which makes the work visible because ${spec.detail}.`,
      `${spec.image}. In that way, ${spec.topic} can help because it ${spec.benefit}.`,
      `However, the text must stay balanced: ${spec.topic} ${spec.risk}. ${spec.contrast}.`,
      `The best projects treat ${spec.topic} as a continuing habit. They check, adjust and explain; the evidence is small, but the decisions it supports can be important.`
    ],
    questions: [
      { id: q(1), type: 'short', skill: '2b', marks: 1, stem: `According to ${spec.title}'s ${spec.caseLabel}, what does the ${spec.caseAnchor} show ${spec.topic} begins with?`, check: { keywordAny: [words(spec.process, 5), ['evidence'], ['record']] }, modelAnswer: `${spec.title} says ${spec.topic} begins with ${spec.process}.`, explanation: 'The first paragraph gives this directly.', hint: 'Check the first sentence.' },
      { id: q(2), type: 'mcq', skill: '2a', marks: 1, stem: `In the ${spec.caseLabel} explanation, why does the ${spec.caseAnchor} support a "continuing habit" for ${spec.topic}?`, options: ['It is completed once and never checked again.', 'It needs regular checking and adjustment.', 'It is only a game with no purpose.', 'It should be hidden from the community.'], correct: 1, modelAnswer: `In ${spec.title}, it means ${spec.topic} needs regular checking and adjustment.`, explanation: 'The final paragraph explains that good projects check, adjust and explain.', hint: 'Use the final paragraph.' },
      { id: q(3), type: 'evidenceShort', skill: '2d', marks: 2, stem: `How does the ${spec.caseAnchor} in ${spec.caseLabel} show ${spec.topic} helping a community or place? Use evidence.`, answerCheck: { keywordAny: [words(spec.benefit, 6), ['help'], ['evidence'], words(spec.topic, 3)] }, evidenceCheck: { containsAny: [spec.benefit, spec.image, spec.detail] }, answerMarks: 1, evidenceMarks: 1, modelAnswer: `${spec.topic} can help because it ${spec.benefit}. Evidence could include "${spec.benefit}".`, explanation: 'The passage explains a practical benefit and gives evidence for it.', hint: 'State the benefit, then quote the phrase that supports it.' },
      { id: q(4), type: 'mcq', skill: '2c', marks: 2, stem: `Which option best summarises the balanced message built around the ${spec.caseAnchor} in ${spec.title}?`, options: [`${spec.topic} always works perfectly without maintenance.`, `${spec.topic} can be useful when evidence is checked, but it has limits and risks.`, `${spec.topic} is mainly a story about one person winning a prize.`, `${spec.topic} should avoid records, checks and explanations.`], correct: 1, modelAnswer: `${spec.topic} can be useful when evidence is checked, but it has limits and risks.`, explanation: 'The passage gives benefits but also warns about limits.', hint: 'Choose the answer that includes benefit and caution.' },
      { id: q(5), type: 'open', skill: '2f', marks: 2, stem: `How does paragraph 4 change what the ${spec.caseAnchor} has already suggested after paragraph 3?`, rubric: [{ label: 'Mentions benefit first', check: { keywordAny: [words(spec.benefit, 6), ['benefit'], ['help']] } }, { label: 'Mentions caution or limit', check: { keywordAny: [words(spec.risk, 6), ['risk'], ['limit'], ['balanced'], ['problem']] } }], modelAnswer: `Paragraph 3 shows that ${spec.topic} can help because it ${spec.benefit}. Paragraph 4 makes the explanation more balanced by warning that it ${spec.risk}; this is a risk and limit the reader should notice.`, explanation: 'The structure moves from benefit to caution.', hint: 'Explain what the later paragraph adds.' },
      { id: q(6), type: 'open', skill: '2g', marks: 2, stem: `Why does the phrase "the evidence is small, but the decisions it supports can be important" fit the ${spec.caseAnchor} in ${spec.title}?`, rubric: [{ label: 'Contrasts small and important', check: { keywordAny: [['small'], ['important'], ['contrast'], ['decision']] } }, { label: 'Links evidence to action', check: { keywordAny: [['evidence'], ['support'], ['action'], ['choice'], ['decision']] } }], modelAnswer: `The phrase contrasts small evidence with important decisions. It shows that tiny records or checks in ${spec.topic} can support larger choices.`, explanation: 'The effect comes from the contrast between small evidence and important decisions.', hint: 'Look at the two sides of the contrast.' },
      { id: q(7), type: 'match', skill: '2h', marks: 2, stem: `Match each detail from the ${spec.caseAnchor} example to its role in explaining ${spec.topic}.`, prompts: [spec.process, spec.example, spec.risk], options: ['how the work starts', 'a practical example', 'a caution or limitation'], correctMap: { 0: '0', 1: '1', 2: '2' }, modelAnswer: `${spec.process} is how the work starts; ${spec.example} is a practical example; "${spec.risk}" is a caution.`, explanation: 'This compares the jobs of three details.', hint: 'Decide whether each detail is start, example or caution.' },
      { id: q(8), type: 'order', skill: '2f', marks: 2, stem: `Put the ${spec.caseAnchor} explanation of ${spec.topic} in order.`, items: [`The passage introduces ${spec.process}.`, `It gives the example: ${spec.example}.`, `It explains that ${spec.topic} ${spec.benefit}.`, `It warns that ${spec.topic} ${spec.risk}.`], correctPositions: [1, 2, 3, 4], modelAnswer: `In ${spec.title}, the explanation moves from process, to example, to benefit, to caution.`, explanation: 'This is the structure of the non-fiction passage.', hint: 'Follow the paragraph order.' },
      { id: q(9), type: 'multiSelect', skill: '2d', marks: 1, stem: `Which two statements does the ${spec.caseAnchor} evidence support in ${spec.title}?`, options: [`${spec.topic} ${spec.benefit}.`, `${spec.topic} ${spec.risk}.`, `${spec.topic} never needs checking.`, 'The passage says evidence is useless.'], correctSet: [0, 1], modelAnswer: `The text supports both the benefit and the caution about ${spec.topic}.`, explanation: 'The correct answers match the balanced explanation.', hint: 'Pick one benefit and one caution.' },
      makeNonFictionPunctuationQuestion(q(10), spec, punctSkill)
    ]
  };
}

function poetrySpec(setting, index) {
  const object = objectForPoemSetting(setting, index);
  return {
    id: slug(setting),
    title: titleCase(setting),
    setting,
    object,
    image: `light gathers around the ${object} in a careful line`,
    personified: `the ${object} keeps a small watch over the day`,
    contrast: 'above it the busy world hurries past',
    theme: THEMES[index % THEMES.length],
    mood: MOODS[index % MOODS.length],
  };
}

function makePoetryPassage(setting, index) {
  const spec = poetrySpec(setting, index);
  const prefix = `phase6_poetry_${spec.id}`;
  const q = (n) => `${prefix}_q${n}`;
  const punctSkill = PUNCTUATION_SKILLS[(index + 2) % PUNCTUATION_SKILLS.length];
  return {
    id: prefix,
    title: spec.title,
    genre: 'poetry',
    difficulty: 4 + (index % 2),
    isLong: true,
    blocks: [
      `At ${spec.setting},\n${spec.image}.\nThe air is ${spec.mood},\nand every small thing waits.`,
      `${spec.personified}.\nA passer-by whispers, "Stay bright,"\nthen moves on.\n${spec.contrast},\nbut here, the quiet detail\nkeeps its careful shape.`,
      `Small sounds move like careful footsteps; shadows lean and listen close.\nThe ordinary place - usually passed without thought - seems larger\nbecause ${spec.theme}.`
    ],
    questions: [
      { id: q(1), type: 'mcq', skill: '2a', marks: 1, stem: `In ${spec.title}, what does "careful shape" suggest about the ${spec.object} at ${spec.setting}?`, options: ['It seems precise and worth noticing.', 'It has disappeared completely.', 'It is noisy and careless.', 'It is unimportant to the poem.'], correct: 0, modelAnswer: `In ${spec.title}, the ${spec.object} seems precise and worth noticing.`, explanation: 'The phrase makes the quiet detail seem deliberate and important.', hint: 'Think about the word careful.' },
      { id: q(2), type: 'short', skill: '2b', marks: 1, stem: `Which object is personified in ${spec.title} by the line "${spec.personified}"?`, check: { keywordAny: [words(spec.object, 4)] }, modelAnswer: `The personified object in ${spec.title} is the ${spec.object}.`, explanation: `The line gives the ${spec.object} a human-like action.`, hint: 'Look at what is given a human action.' },
      { id: q(3), type: 'evidenceShort', skill: '2d', marks: 2, stem: `How does the poem use the ${spec.object} to make ${spec.setting} feel more meaningful? Use a short quotation as evidence.`, answerCheck: { keywordAny: [['meaningful'], ['important'], ['larger'], ['detail'], ['alive'], words(spec.theme, 4)] }, evidenceCheck: { containsAny: ['The ordinary place - usually passed without thought - seems larger', spec.personified, spec.image] }, answerMarks: 1, evidenceMarks: 1, modelAnswer: `The poem makes ${spec.setting} feel important because ordinary details seem alive and meaningful. Evidence could include "The ordinary place - usually passed without thought - seems larger".`, explanation: 'The poem turns a small place into something worth noticing.', hint: 'Use one short line as proof.' },
      { id: q(4), type: 'mcq', skill: '2c', marks: 2, stem: `Which option best summarises the mood around the ${spec.object} in ${spec.title}?`, options: ['quiet, watchful and thoughtful', 'angry and violent throughout', 'only silly and comic', 'empty with no details'], correct: 0, modelAnswer: `${spec.title} has a quiet, watchful and thoughtful mood.`, explanation: 'The poem is calm but gives ordinary details significance.', hint: 'Choose the option that matches quietness and meaning.' },
      { id: q(5), type: 'open', skill: '2g', marks: 2, stem: `Why is the image "${spec.image}" effective in ${spec.title}?`, rubric: [{ label: 'Uses image words', check: { keywordAny: [words(spec.image, 5)] } }, { label: 'Explains effect or atmosphere', check: { keywordAny: [['image'], ['picture'], ['mood'], ['atmosphere'], ['reader'], ['vivid']] } }], modelAnswer: `The image "${spec.image}" gives the reader a vivid picture and creates a ${spec.mood} atmosphere at ${spec.setting}.`, explanation: 'A strong answer links the image to the feeling it creates.', hint: 'Say what picture the words create.' },
      { id: q(6), type: 'open', skill: '2f', marks: 2, stem: `How does ${spec.title} move from the ${spec.object} at ${spec.setting} to the idea that ${spec.theme}?`, rubric: [{ label: 'Tracks place or object', check: { keywordAny: [words(spec.setting, 4), words(spec.object, 4), ['place'], ['object']] } }, { label: 'Tracks final idea', check: { keywordAny: [words(spec.theme, 6), ['idea'], ['ending'], ['theme']] } }], modelAnswer: `The poem starts at ${spec.setting}, then focuses on the ${spec.object} as if it is alive. By the final lines, it leaves the idea that ${spec.theme}.`, explanation: 'The structure moves from setting, to image, to meaning.', hint: 'Follow the stanzas in order.' },
      { id: q(7), type: 'match', skill: '2h', marks: 2, stem: `Match each quotation about the ${spec.object} from ${spec.title} to its main effect.`, prompts: [spec.image, spec.personified, spec.contrast], options: ['creates a visual image', 'personifies an object', 'shows a contrast with the busy world'], correctMap: { 0: '0', 1: '1', 2: '2' }, modelAnswer: `In ${spec.title}, "${spec.image}" creates a visual image; "${spec.personified}" personifies the ${spec.object}; "${spec.contrast}" shows contrast.`, explanation: 'Each quotation has a different effect.', hint: 'Decide whether each quotation mainly creates a picture, personifies, or contrasts.' },
      { id: q(8), type: 'order', skill: '2f', marks: 2, stem: `Put the movement around the ${spec.object} in ${spec.title} in order.`, items: [`The poem opens at ${spec.setting}.`, `The poem focuses on the ${spec.object}.`, 'The poem contrasts the quiet detail with a busy world.', `The poem ends with the idea that ${spec.theme}.`], correctPositions: [1, 2, 3, 4], modelAnswer: `In ${spec.title}, the poem moves from setting, to object, to contrast, to the final idea that ${spec.theme}.`, explanation: 'The order follows the poem from first stanza to final line.', hint: 'Follow the poem line by line.' },
      { id: q(9), type: 'multiSelect', skill: '2g', marks: 2, stem: `Which two choices explain the language effect around the ${spec.object} in ${spec.title}?`, options: [`It makes the ${spec.object} seem almost alive.`, `It uses the image "${spec.image}" to create atmosphere.`, 'It removes all imagery from the poem.', 'It says the setting is meaningless.'], correctSet: [0, 1], modelAnswer: `In ${spec.title}, the language personifies the ${spec.object} and uses "${spec.image}" to create atmosphere.`, explanation: 'Both correct choices describe real effects of the language.', hint: 'Choose effects that are actually created by the poem.' },
      makePoetryPunctuationQuestion(q(10), spec, punctSkill)
    ]
  };
}

export function buildReadingPhase6Passages() {
  const fiction = PHASE6_FICTION_PLACES.map(makeFictionPassage);
  const nonFiction = PHASE6_NON_FICTION_TOPICS.map(makeNonFictionPassage);
  const poetry = PHASE6_POETRY_SETTINGS.map(makePoetryPassage);
  return fiction.flatMap((passage, index) => [passage, nonFiction[index], poetry[index]]);
}

export const READING_PHASE6_PASSAGES = deepFreeze(buildReadingPhase6Passages());

export const READING_PHASE6_TEST_PAPERS = deepFreeze(PHASE6_FICTION_PLACES.map((_, index) => {
  const n = String(index + 1).padStart(2, '0');
  const fiction = READING_PHASE6_PASSAGES[index * 3];
  const nonFiction = READING_PHASE6_PASSAGES[index * 3 + 1];
  const poetry = READING_PHASE6_PASSAGES[index * 3 + 2];
  return {
    id: `paper_phase6_${n}`,
    title: `Reading Expansion Phase 6 Paper ${n}`,
    timeLimitMin: 60,
    totalMarks: 50,
    sections: [
      { passageId: fiction.id, questionIds: fiction.questions.map((question) => question.id) },
      { passageId: nonFiction.id, questionIds: nonFiction.questions.map((question) => question.id) },
      { passageId: poetry.id, questionIds: poetry.questions.slice(0, 9).map((question) => question.id) },
    ],
  };
}));
