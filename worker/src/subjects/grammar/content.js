// Generated from the reviewed KS2 Grammar legacy engine.
// Regenerate with: node scripts/extract-grammar-legacy-oracle.mjs --source <legacy-html>
import { markByAnswerSpec } from './answer-spec.js';

const MISCONCEPTIONS = {
  sentence_function_confusion: "Mixed up sentence functions or punctuation cues",
  word_class_confusion: "Confused one word class with another",
  noun_phrase_confusion: "Did not build or spot a full noun phrase",
  fronted_adverbial_confusion: "Missed the fronted adverbial or its comma",
  subordinate_clause_confusion: "Confused main and subordinate clauses",
  relative_clause_confusion: "Missed how a relative clause links to a noun",
  tense_confusion: "Chose the wrong tense or aspect",
  standard_english_confusion: "Used a non-standard spoken form instead of Standard English",
  pronoun_cohesion_confusion: "Used a pronoun or noun choice that reduced clarity",
  formality_confusion: "Chose language at the wrong level of formality",
  active_passive_confusion: "Mixed up active and passive voice",
  subject_object_confusion: "Confused the subject and the object",
  modal_verb_confusion: "Missed the degree of certainty or possibility",
  parenthesis_confusion: "Missed how parenthesis or commas work",
  speech_punctuation_confusion: "Placed speech punctuation incorrectly",
  apostrophe_possession_confusion: "Confused singular and plural possession",
  punctuation_precision: "Grammar idea mostly right, but punctuation or exact form was off",
  misread_question: "Answered a different question from the one asked",
  boundary_punctuation_confusion: "Chose the wrong punctuation to mark a clause boundary or introduce a list",
  hyphen_ambiguity_confusion: "Missed how a hyphen changes the meaning"
};

const MINIMAL_HINTS = {
  sentence_function_confusion: "Ask what the sentence is doing: telling, asking, ordering, or exclaiming.",
  word_class_confusion: "Look at the word’s job in the sentence, not just what it seems to mean on its own.",
  noun_phrase_confusion: "A noun phrase must centre on a noun. Check which words belong with that noun.",
  fronted_adverbial_confusion: "If the sentence opens with when, where or how information, check whether it needs a comma after it.",
  subordinate_clause_confusion: "A subordinate clause usually depends on the main clause. Ask whether it can stand alone here.",
  relative_clause_confusion: "A relative clause adds extra information about a noun. Find the noun it is attached to.",
  tense_confusion: "Check when the action happened and whether the sentence needs a simple, progressive, perfect, or past perfect form.",
  standard_english_confusion: "Choose the form you would expect in formal writing, not the spoken form you might hear.",
  pronoun_cohesion_confusion: "A pronoun should make the sentence smoother without making the meaning unclear.",
  formality_confusion: "Match the language to a formal setting, not everyday chat.",
  active_passive_confusion: "In active voice, the doer comes first. In passive voice, the thing affected comes first.",
  subject_object_confusion: "The subject does the action; the object receives it.",
  modal_verb_confusion: "Compare how certain each modal verb sounds.",
  parenthesis_confusion: "Parenthesis adds extra information that could be lifted out.",
  speech_punctuation_confusion: "Check where the spoken words end and where the reporting clause begins.",
  apostrophe_possession_confusion: "Ask who owns the noun, and whether the owner is singular or plural.",
  punctuation_precision: "The grammar idea is close. Check the exact punctuation and wording.",
  misread_question: "Read the instruction again. Are you identifying, fixing, rewriting, or explaining?",
  boundary_punctuation_confusion: "Ask whether the first part is a complete clause and whether the second part explains it, adds a list, or stands as another clause.",
  hyphen_ambiguity_confusion: "Say the phrase both ways in your head. Which version makes the meaning clear?"
};

const QUESTION_TYPES = {
  identify: "Identify the feature",
  choose: "Choose the correct sentence",
  fix: "Fix the sentence",
  rewrite: "Rewrite the sentence",
  build: "Build / transform a sentence",
  explain: "Explain why",
  classify: "Classify",
  fill: "Complete the sentence"
};

const SKILLS = {
  sentence_functions: {
    domain: "Sentence function",
    name: "Sentence functions",
    summary: "Statements tell, questions ask, commands instruct, and exclamations show strong feeling.",
    notices: [
      "Look at the whole sentence, not just the final punctuation.",
      "Questions ask something. Commands tell someone to do something.",
      "A sentence can sound excited without being a grammatical exclamation."
    ],
    worked: {
      prompt: "Which sentence is a command?",
      answer: "Close the gate before the dog escapes.",
      why: "It tells someone to do something."
    },
    contrast: {
      good: "Where is the red scarf?",
      nearMiss: "I wonder where the red scarf is.",
      why: "The first is a question. The second is a statement about wondering."
    }
  },
  word_classes: {
    domain: "Word classes",
    name: "Word classes",
    summary: "Spot the job a word is doing in a sentence: noun, verb, adjective, adverb, determiner, pronoun, conjunction or preposition.",
    notices: [
      "The same kind of meaning is not enough; focus on the word’s job.",
      "Determiners often come before nouns. Adverbs often modify verbs, adjectives or whole clauses.",
      "Conjunctions join clauses or ideas. Prepositions usually show place, time or cause relationships."
    ],
    worked: {
      prompt: "In ‘Ben often walks home’, what is ‘often’?",
      answer: "An adverb.",
      why: "It modifies the verb ‘walks’ by telling us how often."
    },
    contrast: {
      good: "after lunch",
      nearMiss: "afterwards",
      why: "‘After’ in ‘after lunch’ is a preposition. ‘Afterwards’ is an adverb."
    }
  },
  noun_phrases: {
    domain: "Phrases",
    name: "Expanded noun phrases",
    summary: "A noun phrase has a noun at its heart and can be expanded with adjectives, nouns or preposition phrases.",
    notices: [
      "The noun is the key word in the phrase.",
      "Extra words should belong with the noun and help describe or specify it.",
      "A whole clause is not the same thing as a noun phrase."
    ],
    worked: {
      prompt: "Build a noun phrase to complete: ___ opened the door.",
      answer: "The nervous young goalkeeper",
      why: "It is a group of words centred on the noun ‘goalkeeper’."
    },
    contrast: {
      good: "the tiny silver key",
      nearMiss: "quickly opened the door",
      why: "The first is a noun phrase. The second is part of a clause, not a noun phrase."
    }
  },
  adverbials: {
    domain: "Adverbials",
    name: "Adverbials and fronted adverbials",
    summary: "Adverbials often show when, where or how. Fronted adverbials come first and usually take a comma in KS2 contexts.",
    notices: [
      "A fronted adverbial is moved to the start for effect or clarity.",
      "In KS2 GPS questions, a comma is commonly required after the fronted adverbial.",
      "Not every opening word group is an adverbial: check what it adds."
    ],
    worked: {
      prompt: "Add the comma: After lunch the choir practised.",
      answer: "After lunch, the choir practised.",
      why: "‘After lunch’ is a fronted adverbial telling us when."
    },
    contrast: {
      good: "Before sunrise, the campers packed up.",
      nearMiss: "The campers before sunrise packed up.",
      why: "The first uses a clear fronted adverbial. The second is clumsy and does not place it properly."
    }
  },
  clauses: {
    domain: "Clauses",
    name: "Subordinate clauses and conjunctions",
    summary: "A subordinate clause adds extra information and usually depends on a main clause. Conjunctions often help introduce it.",
    notices: [
      "Look for conjunctions like because, when, if and although.",
      "A subordinate clause cannot usually stand alone as a full sentence in the intended meaning.",
      "Joining clauses is about meaning as well as grammar."
    ],
    worked: {
      prompt: "Combine: Mia was tired. Mia finished the race. Use ‘although’.",
      answer: "Although Mia was tired, she finished the race.",
      why: "The subordinate clause adds contrast before the main clause."
    },
    contrast: {
      good: "Because it was raining, we stayed inside.",
      nearMiss: "Because it was raining.",
      why: "The second is only a subordinate clause; it needs a main clause."
    }
  },
  relative_clauses: {
    domain: "Clauses",
    name: "Relative clauses",
    summary: "A relative clause adds extra information about a noun, often using who, which, that, where, when or whose.",
    notices: [
      "Find the noun being explained.",
      "The clause can often be lifted out and the main sentence still works.",
      "Be careful not to confuse relative clauses with other subordinate clauses."
    ],
    worked: {
      prompt: "Add a relative clause: The boy waved. (who had lost his hat)",
      answer: "The boy, who had lost his hat, waved.",
      why: "The clause gives extra information about ‘the boy’."
    },
    contrast: {
      good: "The book that I borrowed was excellent.",
      nearMiss: "When I borrowed the book, it was excellent.",
      why: "The first contains a relative clause linked to ‘book’. The second is a time clause."
    }
  },
  tense_aspect: {
    domain: "Verb forms",
    name: "Tense and aspect",
    summary: "KS2 grammar includes past and present tense, progressive forms, present perfect and past perfect.",
    notices: [
      "Present perfect links past action to now: ‘has finished’.",
      "Progressive forms show an action in progress: ‘was running’.",
      "Past perfect shows an earlier past action before another past action: ‘had left’."
    ],
    worked: {
      prompt: "Complete with present perfect: She ___ her homework.",
      answer: "has finished",
      why: "It links a completed action to the present."
    },
    contrast: {
      good: "He has gone out.",
      nearMiss: "He went out just now.",
      why: "The first is present perfect. The second is simple past with a finished time."
    }
  },
  standard_english: {
    domain: "Standard English",
    name: "Standard English forms",
    summary: "KS2 GPS expects standard written forms such as ‘we were’ rather than local spoken forms like ‘we was’.",
    notices: [
      "Choose the form you would expect in formal writing.",
      "Standard English is about accepted written grammar, not about sounding posh.",
      "Many errors come from everyday speech patterns."
    ],
    worked: {
      prompt: "Choose the standard form: We was / were late.",
      answer: "were",
      why: "‘We were’ is the standard written form."
    },
    contrast: {
      good: "I did it yesterday.",
      nearMiss: "I done it yesterday.",
      why: "The first is Standard English; the second is a non-standard spoken form."
    }
  },
  pronouns_cohesion: {
    domain: "Cohesion",
    name: "Pronouns and cohesion",
    summary: "Pronouns help avoid repetition, but the reader must still know clearly who or what each pronoun refers to.",
    notices: [
      "Replacing every noun with a pronoun can make meaning unclear.",
      "Good cohesion means smooth writing without confusion.",
      "Sometimes repeating the noun is clearer than using a pronoun."
    ],
    worked: {
      prompt: "Choose the clearer sentence in a short passage.",
      answer: "The clearer version keeps the referent obvious.",
      why: "Cohesion is about flow and clarity together."
    },
    contrast: {
      good: "Amira picked up the map. She folded it carefully.",
      nearMiss: "Amira picked up the map. It folded it carefully.",
      why: "The pronouns in the second sentence do not point clearly to the right things."
    }
  },
  formality: {
    domain: "Register",
    name: "Formal and informal language",
    summary: "KS2 tests both formal vocabulary and formal sentence structures, such as avoiding chatty expressions in formal writing.",
    notices: [
      "Formal writing often chooses more precise vocabulary.",
      "Formal structures avoid casual tags and slangy expressions.",
      "Match the register to the situation."
    ],
    worked: {
      prompt: "Choose the more formal option: ask for / request",
      answer: "request",
      why: "It is the more formal vocabulary choice."
    },
    contrast: {
      good: "The club was established last year.",
      nearMiss: "The club got set up last year.",
      why: "The first is more formal."
    }
  },
  active_passive: {
    domain: "Sentence structure",
    name: "Active and passive voice",
    summary: "Active voice foregrounds the doer. Passive voice foregrounds the thing affected or hides the doer.",
    notices: [
      "Look for a form of ‘be’ plus a past participle in passive constructions.",
      "Active and passive change emphasis, not basic meaning.",
      "Keep the tense steady when transforming a sentence."
    ],
    worked: {
      prompt: "Rewrite in the active: The gate was opened by Sam.",
      answer: "Sam opened the gate.",
      why: "The doer becomes the subject in the active sentence."
    },
    contrast: {
      good: "The council maintains the park.",
      nearMiss: "The park maintains the council.",
      why: "The active version keeps the doer and the thing affected in the right places."
    }
  },
  subject_object: {
    domain: "Sentence structure",
    name: "Subject and object",
    summary: "The subject usually does the action; the object usually receives it.",
    notices: [
      "In a simple active sentence, ask ‘who or what is doing the action?’",
      "Then ask ‘who or what is receiving the action?’",
      "Be careful when a sentence starts with an adverbial or a long noun phrase."
    ],
    worked: {
      prompt: "In ‘The dog chased the ball’, what is the subject?",
      answer: "The dog",
      why: "It performs the action of chasing."
    },
    contrast: {
      good: "The chef tasted the soup.",
      nearMiss: "The soup tasted the chef.",
      why: "Switching subject and object changes the meaning completely."
    }
  },
  modal_verbs: {
    domain: "Verb forms",
    name: "Modal verbs and possibility",
    summary: "Modal verbs such as might, should, will and must show different degrees of possibility, certainty, obligation or advice.",
    notices: [
      "Compare how strong each modal verb sounds.",
      "The best choice depends on the meaning, not just the grammar.",
      "Adverbs like perhaps can also signal possibility, but modal verbs are the main KS2 focus here."
    ],
    worked: {
      prompt: "Which sounds most certain: might, will or must?",
      answer: "must",
      why: "It gives the strongest sense of certainty or obligation in common KS2 contrasts."
    },
    contrast: {
      good: "It might rain later.",
      nearMiss: "It must rain later.",
      why: "The second sounds much more certain than the first."
    }
  },
  parenthesis_commas: {
    domain: "Punctuation for grammar",
    name: "Parenthesis and commas",
    summary: "Brackets, dashes and paired commas can mark extra information. Commas can also clarify meaning and separate fronted adverbials.",
    notices: [
      "Parenthesis adds extra information that the main sentence can survive without.",
      "Paired commas must come in a pair if they are marking parenthesis in the middle of a sentence.",
      "Commas can support grammar understanding, not just decoration."
    ],
    worked: {
      prompt: "Add parenthesis: Our class visited York the oldest city on our route first.",
      answer: "Our class visited York, the oldest city on our route, first.",
      why: "The extra information is parenthesis."
    },
    contrast: {
      good: "Luca, who was first in line, opened the door.",
      nearMiss: "Luca who was first in line opened the door.",
      why: "The commas show the parenthesis clearly."
    }
  },
  speech_punctuation: {
    domain: "Punctuation for grammar",
    name: "Direct speech punctuation",
    summary: "Direct speech punctuation depends on where the spoken words end and where the reporting clause begins.",
    notices: [
      "Speech marks go around the spoken words.",
      "A comma often separates a reporting clause from direct speech.",
      "Question marks and exclamation marks belong inside the speech marks when they are part of the spoken words."
    ],
    worked: {
      prompt: "Punctuate: “Where are you going” asked Mum.",
      answer: "“Where are you going?” asked Mum.",
      why: "The spoken words are a question, so the question mark sits inside the speech marks."
    },
    contrast: {
      good: "“Sit down!” shouted the coach.",
      nearMiss: "“Sit down”! shouted the coach.",
      why: "The end punctuation belongs inside the speech marks."
    }
  },
  apostrophes_possession: {
    domain: "Punctuation for grammar",
    name: "Possession with apostrophes",
    summary: "KS2 grammar expects pupils to distinguish singular possession from plural possession.",
    notices: [
      "Ask who owns the noun.",
      "For a regular plural ending in s, the apostrophe usually comes after the s.",
      "This is different from apostrophes used for omission in contractions."
    ],
    worked: {
      prompt: "Choose the correct phrase for one dog and its bowl.",
      answer: "the dog’s bowl",
      why: "One dog owns the bowl, so the apostrophe comes before the s."
    },
    contrast: {
      good: "the girls’ boots",
      nearMiss: "the girl’s boots",
      why: "The first means boots belonging to more than one girl; the second belongs to one girl."
    }
  },
  boundary_punctuation: {
    domain: "Punctuation for grammar",
    name: "Colons, semi-colons and dashes",
    summary: "These marks can show clear boundaries between ideas. In KS2, a colon can introduce an explanation or a list, a semi-colon can join closely related clauses, and a dash can create a strong break.",
    notices: [
      "A semi-colon joins two closely related main clauses.",
      "A colon often comes after a complete clause and introduces an explanation or a list.",
      "A dash creates a strong break and can mark a boundary between linked ideas."
    ],
    worked: {
      prompt: "Choose the best punctuation: I needed only one thing ___ a torch.",
      answer: "A colon.",
      why: "The first part is a complete clause and the second part explains exactly what the one thing was."
    },
    contrast: {
      good: "The sky darkened; the gulls flew inland.",
      nearMiss: "The sky darkened, the gulls flew inland.",
      why: "A comma is too weak for two full clauses here."
    }
  },
  hyphen_ambiguity: {
    domain: "Punctuation for grammar",
    name: "Hyphens to avoid ambiguity",
    summary: "A hyphen can join words so the reader sees the intended meaning clearly.",
    notices: [
      "A hyphen can show that two words work together as one idea.",
      "Without a hyphen, the meaning can change.",
      "Read both versions aloud and ask which one matches the meaning."
    ],
    worked: {
      prompt: "Which means a shark that eats people: man eating shark or man-eating shark?",
      answer: "man-eating shark",
      why: "The hyphen shows that the shark is the man-eating kind."
    },
    contrast: {
      good: "man-eating shark",
      nearMiss: "man eating shark",
      why: "The first describes the shark. The second sounds like a man is eating a shark."
    }
  }
};

const FUNCTION_SENTENCES = {
  statement: [
    "The lantern swung in the wind.",
    "Our coach arrives at half past nine.",
    "Mia tucked the map into her coat pocket.",
    "The river flowed past the old bridge."
  ],
  question: [
    "Where did you put the compass?",
    "Have the tickets arrived yet?",
    "Can we finish the poster tomorrow?",
    "Why is the gate still open?"
  ],
  command: [
    "Close the gate before the dog escapes.",
    "Bring your reading record tomorrow.",
    "Wait by the hall doors.",
    "Please fold the letter neatly."
  ],
  exclamation: [
    "What a huge shadow that tree casts!",
    "How quickly the rabbit ran!",
    "What an icy wind this is!",
    "How loudly the drums were beating!"
  ]
};

const WORD_CLASS_ITEMS = [
  {
    sentence: "On sunny days, Ben often plays outside before dinner.",
    underlined: "often",
    correct: "adverb",
    options: [
      "adverb",
      "conjunction",
      "adjective",
      "determiner"
    ]
  },
  {
    sentence: "After the storm, the children followed the muddy path.",
    underlined: "After",
    correct: "preposition",
    options: [
      "preposition",
      "adverb",
      "verb",
      "noun"
    ]
  },
  {
    sentence: "Those bright stars lit the whole beach.",
    underlined: "Those",
    correct: "determiner",
    options: [
      "pronoun",
      "determiner",
      "adjective",
      "conjunction"
    ]
  },
  {
    sentence: "Luca whispered because the baby was asleep.",
    underlined: "because",
    correct: "conjunction",
    options: [
      "preposition",
      "adverb",
      "conjunction",
      "verb"
    ]
  },
  {
    sentence: "The silver trophy gleamed on the shelf.",
    underlined: "silver",
    correct: "adjective",
    options: [
      "adjective",
      "noun",
      "adverb",
      "verb"
    ]
  },
  {
    sentence: "Nadia lent it to me yesterday.",
    underlined: "it",
    correct: "pronoun",
    options: [
      "pronoun",
      "determiner",
      "adjective",
      "preposition"
    ]
  },
  {
    sentence: "The old oak tree shaded the playground.",
    underlined: "tree",
    correct: "noun",
    options: [
      "noun",
      "verb",
      "adverb",
      "conjunction"
    ]
  },
  {
    sentence: "We scrambled carefully over the rocks.",
    underlined: "scrambled",
    correct: "verb",
    options: [
      "verb",
      "adjective",
      "noun",
      "preposition"
    ]
  }
];

const TOKEN_CLASS_ITEMS = [
  {
    targetLabel: "conjunctions",
    className: "Conjunctions",
    sentence: "Luca laughed because Maya slipped and nearly dropped the map.",
    correct: [
      "because",
      "and"
    ],
    misconception: "word_class_confusion"
  },
  {
    targetLabel: "determiners",
    className: "Determiners",
    sentence: "Those small birds built a nest in the tree.",
    correct: [
      "Those",
      "a",
      "the"
    ],
    misconception: "word_class_confusion"
  },
  {
    targetLabel: "adverbs",
    className: "Adverbs",
    sentence: "Nina carefully and quietly packed the glass vase.",
    correct: [
      "carefully",
      "quietly"
    ],
    misconception: "word_class_confusion"
  },
  {
    targetLabel: "pronouns",
    className: "Pronouns",
    sentence: "She handed it to them before they left.",
    correct: [
      "She",
      "it",
      "them",
      "they"
    ],
    misconception: "word_class_confusion"
  }
];

const NOUN_PHRASE_OPTIONS = [
  {
    prompt: "Which option is an expanded noun phrase?",
    options: [
      "the tall boy with muddy boots",
      "ran across the yard",
      "after the storm",
      "very quickly"
    ],
    correct: "the tall boy with muddy boots"
  },
  {
    prompt: "Which option is an expanded noun phrase?",
    options: [
      "the silver key under the mat",
      "jumped over the wall",
      "before sunrise",
      "quite suddenly"
    ],
    correct: "the silver key under the mat"
  },
  {
    prompt: "Which sentence contains an expanded noun phrase?",
    options: [
      "The tired explorers climbed the hill.",
      "Across the field, the dog barked.",
      "Because it was late, we hurried.",
      "Please close the shutters."
    ],
    correct: "The tired explorers climbed the hill."
  }
];

const FRONTED_OPTIONS = [
  {
    options: [
      "She is feeling tired, so Kal is going to her room.",
      "After dinner, Kal is going to her room.",
      "Arun told me that Kal is going to her room.",
      "I wonder when Kal is going to her room."
    ],
    correct: "After dinner, Kal is going to her room."
  },
  {
    options: [
      "In the morning, the market opens early.",
      "The market opens early in the morning.",
      "Could the market open early?",
      "The market opens and traders hurry in."
    ],
    correct: "In the morning, the market opens early."
  }
];

const FRONTED_FIX_ITEMS = [
  {
    prompt: "Copy the sentence and add the comma after the fronted adverbial.",
    raw: "Before sunrise the campers packed their bags.",
    answer: "Before sunrise, the campers packed their bags.",
    skillId: "adverbials"
  },
  {
    prompt: "Copy the sentence and add the comma after the fronted adverbial.",
    raw: "After the concert the audience cheered loudly.",
    answer: "After the concert, the audience cheered loudly.",
    skillId: "adverbials"
  },
  {
    prompt: "Copy the sentence and add the comma after the fronted adverbial.",
    raw: "Later that afternoon our team finally scored.",
    answer: "Later that afternoon, our team finally scored.",
    skillId: "adverbials"
  }
];

const SUBORDINATE_ITEMS = [
  {
    sentence: "Although the wind was strong, the boat reached the shore.",
    options: [
      "Although the wind was strong",
      "the boat reached",
      "the shore",
      "strong the boat"
    ],
    correct: "Although the wind was strong"
  },
  {
    sentence: "When the bell rang, the pupils lined up quietly.",
    options: [
      "the pupils lined up quietly",
      "When the bell rang",
      "lined up quietly",
      "the bell"
    ],
    correct: "When the bell rang"
  },
  {
    sentence: "If the path is icy, wear your boots.",
    options: [
      "wear your boots",
      "If the path is icy",
      "the path is icy boots",
      "icy wear"
    ],
    correct: "If the path is icy"
  }
];

const CLAUSE_COMBINE_ITEMS = [
  {
    instruction: "Combine the ideas into one sentence using <strong>although</strong>.",
    parts: [
      "Mia was tired.",
      "She finished the race."
    ],
    accepted: [
      "Although Mia was tired, she finished the race.",
      "Mia finished the race although she was tired."
    ],
    solution: [
      "Use ‘although’ to introduce the contrasting subordinate clause.",
      "Keep both original ideas.",
      "A strong answer is: Although Mia was tired, she finished the race."
    ]
  },
  {
    instruction: "Combine the ideas into one sentence using <strong>because</strong>.",
    parts: [
      "Sam wore gloves.",
      "It was cold."
    ],
    accepted: [
      "Sam wore gloves because it was cold.",
      "Because it was cold, Sam wore gloves."
    ],
    solution: [
      "Use ‘because’ to show cause.",
      "Either order can work if the punctuation is correct.",
      "A strong answer is: Sam wore gloves because it was cold."
    ]
  },
  {
    instruction: "Combine the ideas into one sentence using <strong>when</strong>.",
    parts: [
      "The bell rang.",
      "The pupils lined up."
    ],
    accepted: [
      "When the bell rang, the pupils lined up.",
      "The pupils lined up when the bell rang."
    ],
    solution: [
      "Use ‘when’ to turn one idea into a subordinate clause of time.",
      "If the ‘when’ clause comes first, add a comma after it.",
      "A strong answer is: When the bell rang, the pupils lined up."
    ]
  }
];

const RELATIVE_SENTENCE_OPTIONS = [
  {
    options: [
      "The boy who dropped his hat waved to us.",
      "When the boy dropped his hat, he waved to us.",
      "The boy dropped his hat and waved to us.",
      "Waving to us, the boy dropped his hat."
    ],
    correct: "The boy who dropped his hat waved to us."
  },
  {
    options: [
      "The book that I borrowed was brilliant.",
      "After I borrowed the book, it was brilliant.",
      "I borrowed the book and it was brilliant.",
      "Borrowing the book, I found it brilliant."
    ],
    correct: "The book that I borrowed was brilliant."
  },
  {
    options: [
      "The village, which sits by the sea, is very quiet.",
      "Because the village sits by the sea, it is quiet.",
      "The village sits by the sea and is quiet.",
      "Beside the sea, the village is quiet."
    ],
    correct: "The village, which sits by the sea, is very quiet."
  }
];

const RELATIVE_COMPLETE_ITEMS = [
  {
    stem: "Complete the sentence with the best relative clause.",
    sentenceStart: "The bicycle",
    sentenceEnd: "belonged to Zara.",
    options: [
      "that was locked outside",
      "because it was outside",
      "and it was outside",
      "after school outside"
    ],
    correct: "that was locked outside"
  },
  {
    stem: "Complete the sentence with the best relative clause.",
    sentenceStart: "The teacher",
    sentenceEnd: "helped us with the project.",
    options: [
      "who had visited Egypt",
      "because she visited Egypt",
      "after visiting Egypt",
      "and visited Egypt"
    ],
    correct: "who had visited Egypt"
  }
];

const TENSE_FORM_ITEMS = [
  {
    prompt: "Choose the best verb form to complete the sentence.",
    sentence: "By the time we arrived, the play ___ already ___.",
    options: [
      "had / started",
      "has / started",
      "was / starting",
      "start / had"
    ],
    correct: "had / started",
    answerText: "had / started"
  },
  {
    prompt: "Choose the best verb form to complete the sentence.",
    sentence: "While we ___ to our friend, his phone started ringing.",
    options: [
      "talked",
      "have talked",
      "were talking",
      "had talked"
    ],
    correct: "were talking",
    answerText: "were talking"
  },
  {
    prompt: "Choose the best verb form to complete the sentence.",
    sentence: "She cannot play today because she ___ her ankle.",
    options: [
      "has twisted",
      "twisted yesterday",
      "was twisting",
      "had twisted before"
    ],
    correct: "has twisted",
    answerText: "has twisted"
  }
];

const TENSE_REWRITE_ITEMS = [
  {
    instruction: "Rewrite the sentence in the <strong>past progressive</strong>.",
    raw: "The dog chases the cat.",
    accepted: [
      "The dog was chasing the cat."
    ],
    solution: [
      "Change the simple present verb into the past progressive form.",
      "Use ‘was’ with ‘chasing’.",
      "The correct sentence is: The dog was chasing the cat."
    ]
  },
  {
    instruction: "Rewrite the sentence in the <strong>present perfect</strong>.",
    raw: "I finish my homework.",
    accepted: [
      "I have finished my homework."
    ],
    solution: [
      "Use ‘have’ plus the past participle.",
      "The past participle of ‘finish’ is ‘finished’.",
      "The correct sentence is: I have finished my homework."
    ]
  },
  {
    instruction: "Rewrite the sentence in the <strong>past perfect</strong>.",
    raw: "She packs her bag before the trip.",
    accepted: [
      "She had packed her bag before the trip."
    ],
    solution: [
      "Use ‘had’ plus the past participle.",
      "The past participle of ‘pack’ is ‘packed’.",
      "The correct sentence is: She had packed her bag before the trip."
    ]
  }
];

const STANDARD_ENGLISH_ITEMS = [
  {
    rows: [
      {
        label: "We was / were going on a school trip.",
        correct: "were",
        options: [
          "was",
          "were"
        ]
      },
      {
        label: "The musicians did / done a sound check.",
        correct: "did",
        options: [
          "did",
          "done"
        ]
      }
    ]
  },
  {
    rows: [
      {
        label: "She seen / saw the poster yesterday.",
        correct: "saw",
        options: [
          "seen",
          "saw"
        ]
      },
      {
        label: "I did / done my homework before tea.",
        correct: "did",
        options: [
          "did",
          "done"
        ]
      }
    ]
  }
];

const PRONOUN_COHESION_ITEMS = [
  {
    prompt: "Which version is clearest and avoids awkward repetition without becoming confusing?",
    options: [
      "Mila put Mila's coat on the chair before Mila zipped Mila's bag.",
      "Mila put her coat on the chair before she zipped her bag.",
      "Mila put her coat on the chair before it zipped her bag.",
      "She put it on the chair before she zipped it."
    ],
    correct: "Mila put her coat on the chair before she zipped her bag."
  },
  {
    prompt: "Which version is clearest and avoids awkward repetition without becoming confusing?",
    options: [
      "Arjun gave Arjun's book to Arjun's sister because Arjun had finished Arjun's book.",
      "Arjun gave his book to his sister because he had finished it.",
      "Arjun gave his book to his sister because it had finished him.",
      "He gave it to her because he had finished her."
    ],
    correct: "Arjun gave his book to his sister because he had finished it."
  }
];

const FORMALITY_ITEMS = [
  {
    rows: [
      {
        label: "The basketball club was set up / established last year.",
        correct: "established",
        options: [
          "set up",
          "established"
        ]
      },
      {
        label: "They asked for / requested new equipment.",
        correct: "requested",
        options: [
          "asked for",
          "requested"
        ]
      },
      {
        label: "Now they play / compete in a local league.",
        correct: "compete",
        options: [
          "play",
          "compete"
        ]
      }
    ]
  },
  {
    rows: [
      {
        label: "Please find out / discover whether the hall is open.",
        correct: "discover",
        options: [
          "find out",
          "discover"
        ]
      },
      {
        label: "Could you go in / enter quietly?",
        correct: "enter",
        options: [
          "go in",
          "enter"
        ]
      },
      {
        label: "We need to ask for / request more time.",
        correct: "request",
        options: [
          "ask for",
          "request"
        ]
      }
    ]
  }
];

const ACTIVE_PASSIVE_ITEMS = [
  {
    instruction: "Rewrite the sentence in the <strong>active</strong>.",
    raw: "The local park is maintained by the council.",
    accepted: [
      "The council maintains the local park.",
      "The council maintains the park."
    ],
    solution: [
      "Find the doer in the ‘by ...’ phrase.",
      "Make the doer the subject of the new sentence.",
      "A correct answer is: The council maintains the local park."
    ]
  },
  {
    instruction: "Rewrite the sentence in the <strong>passive</strong>. Keep the same tense.",
    raw: "The chef baked the bread.",
    accepted: [
      "The bread was baked by the chef."
    ],
    solution: [
      "Move the object to the front.",
      "Use the correct form of ‘be’ plus the past participle.",
      "A correct answer is: The bread was baked by the chef."
    ]
  },
  {
    instruction: "Rewrite the sentence in the <strong>passive</strong>. Keep the same tense.",
    raw: "The team will collect the trophy.",
    accepted: [
      "The trophy will be collected by the team."
    ],
    solution: [
      "Keep the future tense by using ‘will be’.",
      "Then add the past participle ‘collected’.",
      "A correct answer is: The trophy will be collected by the team."
    ]
  }
];

const SUBJECT_OBJECT_ITEMS = [
  {
    ask: "subject",
    sentence: "After lunch, the tired goalkeeper caught the ball.",
    options: [
      "After lunch",
      "the tired goalkeeper",
      "caught",
      "the ball"
    ],
    correct: "the tired goalkeeper"
  },
  {
    ask: "object",
    sentence: "The noisy gull stole the sandwich from Max.",
    options: [
      "The noisy gull",
      "stole",
      "the sandwich",
      "from Max"
    ],
    correct: "the sandwich"
  },
  {
    ask: "subject",
    sentence: "On Friday morning, our science club visited the museum.",
    options: [
      "On Friday morning",
      "our science club",
      "visited",
      "the museum"
    ],
    correct: "our science club"
  }
];

const MODAL_ITEMS = [
  {
    prompt: "Which sentence shows the <strong>least certainty</strong> that the team will win?",
    options: [
      "The team must win.",
      "The team will win.",
      "The team should win.",
      "The team might win."
    ],
    correct: "The team might win."
  },
  {
    prompt: "Which modal verb best completes the sentence to show strong advice? <strong>You ___ wear a helmet on this trail.</strong>",
    options: [
      "might",
      "could",
      "should",
      "will"
    ],
    correct: "should"
  },
  {
    prompt: "Which sentence sounds <strong>most certain</strong>?",
    options: [
      "It might snow tonight.",
      "It should snow tonight.",
      "It will snow tonight.",
      "It could snow tonight."
    ],
    correct: "It will snow tonight."
  }
];

const PARENTHESIS_REPLACE_ITEMS = [
  {
    sentence: "Tokyo (the capital of Japan) is one of the largest cities in the world.",
    options: [
      "hyphens",
      "colons",
      "semi-colons",
      "dashes"
    ],
    correct: "dashes"
  },
  {
    sentence: "The guide (who had visited before) led us through the cave.",
    options: [
      "semi-colons",
      "dashes",
      "colons",
      "question marks"
    ],
    correct: "dashes"
  }
];

const PARENTHESIS_FIX_ITEMS = [
  {
    prompt: "Insert a pair of brackets in the correct place.",
    raw: "Our class visited a castle the oldest in the county to help with our history project.",
    accepted: [
      "Our class visited a castle (the oldest in the county) to help with our history project."
    ],
    solution: [
      "Find the extra information that could be lifted out.",
      "Place the brackets around that extra information.",
      "The correct sentence is: Our class visited a castle (the oldest in the county) to help with our history project."
    ]
  },
  {
    prompt: "Insert a pair of brackets in the correct place.",
    raw: "My cousin the youngest in the family won the chess trophy.",
    accepted: [
      "My cousin (the youngest in the family) won the chess trophy."
    ],
    solution: [
      "The bracketed words add extra information about ‘my cousin’.",
      "The main sentence still works without them.",
      "The correct sentence is: My cousin (the youngest in the family) won the chess trophy."
    ]
  }
];

const SPEECH_FIX_ITEMS = [
  {
    prompt: "Punctuate the direct speech correctly.",
    raw: "“Where are you going” asked Mum.",
    accepted: [
      "“Where are you going?” asked Mum.",
      "\"Where are you going?\" asked Mum."
    ],
    solution: [
      "The spoken words are a question.",
      "The question mark belongs inside the speech marks.",
      "A correct answer is: “Where are you going?” asked Mum."
    ]
  },
  {
    prompt: "Punctuate the direct speech correctly.",
    raw: "Dad shouted “Run inside!”",
    accepted: [
      "Dad shouted, “Run inside!”",
      "Dad shouted, \"Run inside!\""
    ],
    solution: [
      "A comma is needed before the direct speech after the reporting clause.",
      "The exclamation mark stays inside the speech marks.",
      "A correct answer is: Dad shouted, “Run inside!”"
    ]
  },
  {
    prompt: "Punctuate the direct speech correctly.",
    raw: "“Sit down!” said the coach.",
    accepted: [
      "“Sit down!” said the coach.",
      "\"Sit down!\" said the coach."
    ],
    solution: [
      "The spoken words already end with an exclamation mark.",
      "That punctuation stays inside the speech marks.",
      "A correct answer is: “Sit down!” said the coach."
    ]
  }
];

const APOSTROPHE_ITEMS = [
  {
    stem: "Choose the correct phrase to complete the sentence: The ___ playground was closed after the storm.",
    options: [
      "girls",
      "girl's",
      "girls'",
      "girls's"
    ],
    correct: "girls'"
  },
  {
    stem: "Choose the correct phrase to complete the sentence: We found the ___ bowl behind the sofa.",
    options: [
      "dogs",
      "dog's",
      "dogs'",
      "dogs's"
    ],
    correct: "dog's"
  },
  {
    stem: "Choose the correct phrase to complete the sentence: The ___ coats were hanging by the door.",
    options: [
      "children's",
      "childrens'",
      "childrens",
      "child's"
    ],
    correct: "children's"
  }
];

const EXPLAIN_ITEMS = [
  {
    stem: "Why is there a comma after the opening words in this sentence?<br><strong>Before sunrise, the campers packed their bags.</strong>",
    options: [
      "Because the opening words are a fronted adverbial.",
      "Because every long sentence needs a comma near the start.",
      "Because ‘sunrise’ is a noun.",
      "Because the sentence is in the past tense."
    ],
    correct: "Because the opening words are a fronted adverbial.",
    skillIds: [
      "adverbials"
    ]
  },
  {
    stem: "Why is <strong>‘I done my homework’</strong> wrong in Standard English?",
    options: [
      "Because Standard English uses ‘did’, not ‘done’, in that sentence.",
      "Because ‘homework’ cannot be the object.",
      "Because the sentence should be passive.",
      "Because all past tense verbs end in -ed."
    ],
    correct: "Because Standard English uses ‘did’, not ‘done’, in that sentence.",
    skillIds: [
      "standard_english"
    ]
  }
];

const STANDARD_FIX_ITEMS = [
  {
    instruction: "Rewrite the sentence in Standard English.",
    raw: "We was walking to school.",
    accepted: [
      "We were walking to school."
    ],
    solution: [
      "Replace the non-standard verb form with the Standard English form.",
      "‘We were’ is correct in Standard English.",
      "The correct sentence is: We were walking to school."
    ]
  },
  {
    instruction: "Rewrite the sentence in Standard English.",
    raw: "I done my homework before tea.",
    accepted: [
      "I did my homework before tea."
    ],
    solution: [
      "Replace the non-standard spoken form.",
      "Standard English uses ‘did’ here.",
      "The correct sentence is: I did my homework before tea."
    ]
  }
];

const PUNCTUATION_SKILL_IDS = [
  "sentence_functions",
  "adverbials",
  "parenthesis_commas",
  "speech_punctuation",
  "apostrophes_possession",
  "boundary_punctuation",
  "hyphen_ambiguity"
];

const EXTRA_LEXICON = {
  names: [
    "Ava",
    "Ben",
    "Mia",
    "Noah",
    "Elsie",
    "Zac",
    "Luca",
    "Amira",
    "Jay",
    "Nora",
    "Sam",
    "Ruby"
  ],
  pluralOwners: [
    "girls",
    "boys",
    "players",
    "teachers",
    "visitors",
    "farmers"
  ],
  irregularPluralOwners: [
    "children",
    "people",
    "men",
    "women"
  ],
  ownedItems: [
    "boots",
    "books",
    "bikes",
    "bags",
    "coats",
    "tickets",
    "lunchboxes"
  ],
  objects: [
    "the lantern",
    "the gate",
    "the map",
    "the trophy",
    "the window",
    "the rucksack",
    "the picnic basket",
    "the sketchbook"
  ],
  fronted: [
    "Before sunrise",
    "After lunch",
    "Later that day",
    "At the edge of the field",
    "Without warning",
    "With great care",
    "On Friday morning",
    "After the final whistle"
  ],
  clausePairs: [
    [
      "The rain stopped",
      "the playground began to fill"
    ],
    [
      "The lights went out",
      "the hall fell silent"
    ],
    [
      "The bell rang",
      "the pupils hurried inside"
    ],
    [
      "The wind strengthened",
      "the tent flapped wildly"
    ],
    [
      "The bus arrived",
      "everyone grabbed their bags"
    ]
  ],
  colonLists: [
    {
      intro: "For the picnic we packed three things",
      items: [
        "bread",
        "fruit",
        "juice"
      ]
    },
    {
      intro: "The museum displayed four objects",
      items: [
        "a helmet",
        "a shield",
        "a sword",
        "a coin"
      ]
    },
    {
      intro: "We still needed two items for camp",
      items: [
        "a torch",
        "a sleeping bag"
      ]
    },
    {
      intro: "The club offered three prizes",
      items: [
        "a medal",
        "a certificate",
        "a book token"
      ]
    }
  ],
  dashBoundaries: [
    [
      "I had one worry",
      "the batteries were flat"
    ],
    [
      "The plan was simple",
      "follow the red arrows"
    ],
    [
      "There was only one answer",
      "turn back at once"
    ],
    [
      "One thought filled my mind",
      "where had the key gone"
    ]
  ],
  speechQuestions: [
    "Where is the spare key",
    "Why are your boots muddy",
    "Have you packed the torch",
    "When does the match begin"
  ],
  speechCommands: [
    "Bring the torch with you",
    "Wait by the hall doors",
    "Shut the gate behind you",
    "Hold the ladder steady"
  ],
  speechExclaims: [
    "What a huge wave that was",
    "Look out for the puddle",
    "That was a close finish"
  ],
  speakers: [
    "Mum",
    "Dad",
    "the coach",
    "Miss Patel",
    "Ben",
    "Ava",
    "the guide"
  ],
  reportingVerbs: [
    "said",
    "asked",
    "shouted",
    "whispered",
    "called"
  ],
  hyphenPrompts: [
    {
      ask: "Which sentence means the shark eats people?",
      options: [
        "We saw a man-eating shark near the rocks.",
        "We saw a man eating shark near the rocks.",
        "We saw a hungry shark near the rocks.",
        "We saw a shark near a man on the rocks."
      ],
      correct: "We saw a man-eating shark near the rocks.",
      why: "The hyphen makes ‘man-eating’ work as one describing idea."
    },
    {
      ask: "Which sentence means the hospital treats small animals?",
      options: [
        "We visited the small-animal hospital after lunch.",
        "We visited the small animal hospital after lunch.",
        "We visited the hospital after lunch with small animals.",
        "We visited a small hospital for lunch animals."
      ],
      correct: "We visited the small-animal hospital after lunch.",
      why: "The hyphen shows that ‘small-animal’ is one combined idea describing the hospital."
    }
  ],
  verbsRich: [
    {
      base: "open",
      past: "opened",
      part: "opened",
      ing: "opening",
      s: "opens"
    },
    {
      base: "pack",
      past: "packed",
      part: "packed",
      ing: "packing",
      s: "packs"
    },
    {
      base: "carry",
      past: "carried",
      part: "carried",
      ing: "carrying",
      s: "carries"
    },
    {
      base: "lift",
      past: "lifted",
      part: "lifted",
      ing: "lifting",
      s: "lifts"
    },
    {
      base: "paint",
      past: "painted",
      part: "painted",
      ing: "painting",
      s: "paints"
    },
    {
      base: "clean",
      past: "cleaned",
      part: "cleaned",
      ing: "cleaning",
      s: "cleans"
    },
    {
      base: "finish",
      past: "finished",
      part: "finished",
      ing: "finishing",
      s: "finishes"
    },
    {
      base: "start",
      past: "started",
      part: "started",
      ing: "starting",
      s: "starts"
    },
    {
      base: "wash",
      past: "washed",
      part: "washed",
      ing: "washing",
      s: "washes"
    },
    {
      base: "visit",
      past: "visited",
      part: "visited",
      ing: "visiting",
      s: "visits"
    }
  ],
  relativeCommonNouns: [
    "boy",
    "girl",
    "teacher",
    "runner",
    "dog",
    "cat",
    "book",
    "bag",
    "coat",
    "tent"
  ],
  relativeDetails: [
    "who had lost a glove",
    "who was first in line",
    "who wore a blue cap",
    "which was covered in mud",
    "which stood by the window",
    "that everyone wanted to borrow",
    "that belonged to the club",
    "which Ben had packed carefully"
  ],
  formalFrames: [
    {
      prompt: "Which sentence would be most suitable for a formal letter to the headteacher?",
      correct: "I am writing to request two extra chairs for the hall.",
      distractors: [
        "Can we get a couple more chairs for the hall?",
        "We really need some more chairs for the hall, please.",
        "I just wanted to ask if we could maybe have extra chairs."
      ],
      why: "The formal sentence uses precise vocabulary and avoids chatty phrasing."
    },
    {
      prompt: "Which sentence sounds most formal?",
      correct: "The club was established last year.",
      distractors: [
        "The club got set up last year.",
        "The club was started up last year, really.",
        "Last year was when the club got going."
      ],
      why: "Formal register avoids casual expressions such as ‘got set up’."
    },
    {
      prompt: "Choose the sentence that best fits a formal report.",
      correct: "Several pupils were absent from the visit.",
      distractors: [
        "A few pupils were off for the visit.",
        "Some pupils didn't come on the trip.",
        "Quite a few pupils were missing from it."
      ],
      why: "Formal writing often chooses more precise vocabulary and sentence structure."
    }
  ],
  modalFrames: [
    {
      prompt: "Choose the modal verb that best fits the meaning: This is a rule on the climbing wall. You ___ wear a helmet.",
      correct: "must",
      distractors: [
        "might",
        "could",
        "should"
      ],
      why: "‘Must’ shows strongest obligation."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: The clouds are dark, but the rain has not started. It ___ rain later.",
      correct: "might",
      distractors: [
        "must",
        "should",
        "will"
      ],
      why: "‘Might’ shows possibility, not certainty."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: You are giving advice to a friend. You ___ begin with the easier question.",
      correct: "should",
      distractors: [
        "must",
        "might",
        "will"
      ],
      why: "‘Should’ is the modal of advice here."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: The timetable is fixed. The coach ___ leave at 9 o'clock.",
      correct: "will",
      distractors: [
        "might",
        "should",
        "must"
      ],
      why: "‘Will’ fits a definite future event here."
    }
  ]
};

const TEMPLATES = [
  {
    id: "sentence_type_table",
    label: "Classify sentence functions",
    domain: "Sentence function",
    questionType: "classify",
    difficulty: 1,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "sentence_functions"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const cats = ["statement","question","command","exclamation"];
          const rows = shuffle(rng, cats).map(cat => ({ text: pick(rng, FUNCTION_SENTENCES[cat]), answer: cat }));
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Tick one box in each row to show the sentence function.</p>`,
            inputSpec:{ type:"table_choice", columns:["statement","question","command","exclamation"], rows: rows.map((r,i)=>({ key:`row${i}`, label:r.text })) },
            solutionLines:[
              "A statement tells, a question asks, a command instructs, and an exclamation shows strong feeling.",
              "Judge each whole sentence, not only the punctuation at the end."
            ],
            contrastHtml:`<div class="contrast-card"><strong>Useful contrast</strong><p style="margin:8px 0 4px;">Where is the red scarf?</p><p style="margin:0 0 4px;">I wonder where the red scarf is.</p><p style="margin:0;">Only the first is a question.</p></div>`,
            evaluate:(resp)=>{
              let correctRows = 0;
              rows.forEach((row, i) => { if ((resp[`row${i}`] || "") === row.answer) correctRows += 1; });
              const score = correctRows === 4 ? 2 : correctRows >= 2 ? 1 : 0;
              const answerText = rows.map(r => `${r.text} → ${r.answer}`).join(" | ");
              return mkResult({
                correct: correctRows === 4,
                score,
                maxScore:2,
                misconception: correctRows === 4 ? null : "sentence_function_confusion",
                feedbackShort: correctRows === 4 ? "Correct." : (score ? "Some are right, but not all." : "Not quite."),
                feedbackLong: answerText,
                answerText
              });
            }
          });
        }
  },
  {
    id: "question_mark_select",
    label: "Find the real questions",
    domain: "Sentence function",
    questionType: "identify",
    difficulty: 1,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "sentence_functions",
      "speech_punctuation"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const sets = [
            [
              "How good it would be if Jay could come",
              "Is Jay going to come on Tuesday",
              "Jay asked if we could meet him on Tuesday",
              "Do you know if Jay is coming on Tuesday"
            ],
            [
              "What a long journey this has been",
              "Can you help me carry the boxes",
              "Mum wondered whether the parcel had arrived",
              "Did the coach leave on time"
            ]
          ];
          const options = pick(rng, sets);
          const correct = options.filter(x => /^(Is|Do|Did|Can)/.test(x));
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>Tick all the sentences that must end with a question mark.</p>`,
            inputSpec:{ type:"checkbox_list", label:"Sentences", options: options.map(x => ({ value:x, label:x })) },
            solutionLines:[
              "A direct question asks for an answer.",
              "An indirect question like ‘Mum wondered whether...’ is still a statement."
            ],
            contrastHtml:`<div class="contrast-card"><strong>Useful contrast</strong><p style="margin:8px 0 4px;">Can you hear the thunder?</p><p style="margin:0 0 4px;">I wonder whether you can hear the thunder.</p><p style="margin:0;">Only the first must end with a question mark.</p></div>`,
            evaluate:(resp)=>{
              const picked = resp.selected || [];
              const exact = setEq(picked, correct);
              return mkResult({
                correct: exact,
                score: exact ? 1 : 0,
                maxScore:1,
                misconception: exact ? null : "sentence_function_confusion",
                feedbackShort: exact ? "Correct." : "Not quite.",
                feedbackLong:`The sentences needing question marks are: ${correct.join("; ")}.`,
                answerText: correct.join("; ")
              });
            }
          });
        }
  },
  {
    id: "word_class_underlined_choice",
    label: "Identify the word class",
    domain: "Word classes",
    questionType: "identify",
    difficulty: 1,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "word_classes"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = pick(rng, WORD_CLASS_ITEMS);
          const sentenceHtml = escapeHtml(item.sentence).replace(item.underlined, `<u>${escapeHtml(item.underlined)}</u>`);
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>Which word class is the underlined word in the sentence below?</p><p><strong>${sentenceHtml}</strong></p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:`${x}` })) },
            solutionLines:[
              "Work out the underlined word’s job in the sentence.",
              `Here, ‘${item.underlined}’ is ${item.correct === "adverb" ? "modifying the verb or whole clause" : "working as a " + item.correct}.`
            ],
            evaluate:(resp)=>{
              const ans = resp.answer || "";
              return mkResult({
                correct: ans === item.correct,
                score: ans === item.correct ? 1 : 0,
                maxScore:1,
                misconception: ans === item.correct ? null : "word_class_confusion",
                feedbackShort: ans === item.correct ? "Correct." : "Not quite.",
                feedbackLong:`The underlined word is ${item.correct}.`,
                answerText: item.correct
              });
            }
          });
        }
  },
  {
    id: "identify_words_in_sentence",
    label: "Select words with the target job",
    domain: "Word classes",
    questionType: "identify",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "word_classes"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = pick(rng, TOKEN_CLASS_ITEMS);
          const tokens = item.sentence.replace(/([.,!?;:])/g, ' $1').split(/\s+/).filter(Boolean).filter(t => !/[.,!?;:]/.test(t));
          const unique = [...new Set(tokens)];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>Select all the <strong>${item.targetLabel}</strong> in the sentence below.</p><p><strong>${escapeHtml(item.sentence)}</strong></p>`,
            inputSpec:{ type:"checkbox_list", label:item.className, asTokens:true, options: unique.map(x => ({ value:x, label:x })) },
            solutionLines:[
              `Find the words that are working as ${item.targetLabel}.`,
              `Correct selection: ${item.correct.join(", ")}.`
            ],
            evaluate:(resp)=>{
              const picked = resp.selected || [];
              const exact = setEq(picked, item.correct);
              return mkResult({
                correct: exact,
                score: exact ? 1 : 0,
                maxScore:1,
                misconception: exact ? null : item.misconception,
                feedbackShort: exact ? "Correct." : "Not quite.",
                feedbackLong:`The correct words are: ${item.correct.join(", ")}.`,
                answerText: item.correct.join(", ")
              });
            }
          });
        }
  },
  {
    id: "expanded_noun_phrase_choice",
    label: "Spot the expanded noun phrase",
    domain: "Phrases",
    questionType: "choose",
    difficulty: 1,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "noun_phrases"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = pick(rng, NOUN_PHRASE_OPTIONS);
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${item.prompt}</p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "A noun phrase must centre on a noun.",
              "Expanded noun phrases add detail with extra words attached to that noun."
            ],
            contrastHtml:`<div class="contrast-card"><strong>Useful contrast</strong><p style="margin:8px 0 4px;">the small lantern on the step</p><p style="margin:0 0 4px;">ran down the path</p><p style="margin:0;">Only the first is a noun phrase.</p></div>`,
            evaluate:(resp)=>{
              const ans = resp.answer || "";
              return mkResult({
                correct: ans === item.correct,
                score: ans === item.correct ? 1 : 0,
                maxScore:1,
                misconception: ans === item.correct ? null : "noun_phrase_confusion",
                feedbackShort: ans === item.correct ? "Correct." : "Not quite.",
                feedbackLong:`The correct answer is: ${item.correct}.`,
                answerText:item.correct
              });
            }
          });
        }
  },
  {
    id: "build_noun_phrase",
    label: "Build a noun phrase",
    domain: "Phrases",
    questionType: "build",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    tags: [
      "builder"
    ],
    skillIds: [
      "noun_phrases"
    ],
    generator(seed) {
          const variants = [
            {
              sentence:"___ opened the door.",
              fields:[
                { key:"part1", label:"Part 1", kind:"select", options:[["","Choose"],["The tall","The tall"],["Quickly","Quickly"],["Because","Because"]] },
                { key:"part2", label:"Part 2", kind:"select", options:[["","Choose"],["captain","captain"],["shouted","shouted"],["after","after"]] },
                { key:"part3", label:"Part 3", kind:"select", options:[["","Choose"],["with curly hair","with curly hair"],["very loudly","very loudly"],["and waved","and waved"]] }
              ],
              answerParts:["The tall","captain","with curly hair"],
              final:"The tall captain with curly hair"
            },
            {
              sentence:"___ found the silver key.",
              fields:[
                { key:"part1", label:"Part 1", kind:"select", options:[["","Choose"],["The nervous young","The nervous young"],["Suddenly","Suddenly"],["If","If"]] },
                { key:"part2", label:"Part 2", kind:"select", options:[["","Choose"],["explorer","explorer"],["ran","ran"],["under","under"]] },
                { key:"part3", label:"Part 3", kind:"select", options:[["","Choose"],["from our class","from our class"],["very carefully","very carefully"],["because of the rain","because of the rain"]] }
              ],
              answerParts:["The nervous young","explorer","from our class"],
              final:"The nervous young explorer from our class"
            }
          ];
          const item = variants[seed % variants.length];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Build a noun phrase of at least three words to complete the sentence below.</p><p><strong>${escapeHtml(item.sentence)}</strong></p>`,
            inputSpec:{ type:"multi", fields:item.fields },
            solutionLines:[
              "Choose a sensible determiner/adjective opening, then a noun, then extra detail attached to that noun.",
              `A strong answer is: ${item.final}.`
            ],
            evaluate:(resp)=>{
              const got = [resp.part1 || "", resp.part2 || "", resp.part3 || ""];
              const correctBits = got.filter((x,i)=>x===item.answerParts[i]).length;
              const score = correctBits === 3 ? 2 : correctBits >= 2 ? 1 : 0;
              return mkResult({
                correct: correctBits === 3,
                score,
                maxScore:2,
                misconception: correctBits === 3 ? null : "noun_phrase_confusion",
                feedbackShort: correctBits === 3 ? "Correct." : (score ? "Close, but not all the parts build a full noun phrase." : "Not quite."),
                feedbackLong:`A strong answer is: ${item.final}.`,
                answerText:item.final
              });
            }
          });
        }
  },
  {
    id: "fronted_adverbial_choose",
    label: "Spot the fronted adverbial",
    domain: "Adverbials",
    questionType: "choose",
    difficulty: 1,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "adverbials"
    ],
    generator(seed) {
          const item = FRONTED_OPTIONS[seed % FRONTED_OPTIONS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>Which sentence starts with a fronted adverbial?</p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "A fronted adverbial gives when, where or how information at the start of the sentence.",
              "In KS2 contexts it is commonly followed by a comma."
            ],
            evaluate:(resp)=> mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : "fronted_adverbial_confusion",
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The correct answer is: ${item.correct}`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "fix_fronted_adverbial",
    label: "Add the comma after a fronted adverbial",
    domain: "Adverbials",
    questionType: "fix",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    tags: [
      "surgery"
    ],
    skillIds: [
      "adverbials"
    ],
    generator(seed) {
          const item = FRONTED_FIX_ITEMS[seed % FRONTED_FIX_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>${item.prompt}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Type the corrected sentence here." },
            solutionLines:[
              "Spot the opening adverbial telling us when.",
              "Add a comma after that opening phrase.",
              `Correct answer: ${item.answer}`
            ],
            evaluate:(resp)=>markStringAnswer(resp.answer||"", [item.answer], {
              maxScore:2,
              misconception:"fronted_adverbial_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`The correct sentence is: ${item.answer}`
            })
          });
        }
  },
  {
    id: "subordinate_clause_choice",
    label: "Identify the subordinate clause",
    domain: "Clauses",
    questionType: "identify",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "clauses"
    ],
    generator(seed) {
          const item = SUBORDINATE_ITEMS[seed % SUBORDINATE_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>Which option is the subordinate clause in the sentence below?</p><p><strong>${escapeHtml(item.sentence)}</strong></p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "A subordinate clause often begins with a conjunction such as because, when, if or although.",
              "It depends on the main clause to complete the full meaning."
            ],
            contrastHtml:`<div class="contrast-card"><strong>Useful contrast</strong><p style="margin:8px 0 4px;">Because it was cold, we went inside.</p><p style="margin:0 0 4px;">Because it was cold.</p><p style="margin:0;">The second is only a subordinate clause and cannot stand alone here.</p></div>`,
            evaluate:(resp)=> mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : "subordinate_clause_confusion",
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The subordinate clause is: ${item.correct}.`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "combine_clauses_rewrite",
    label: "Combine ideas into one sentence",
    domain: "Clauses",
    questionType: "rewrite",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: false,
    tags: [
      "builder",
      "surgery"
    ],
    skillIds: [
      "clauses"
    ],
    generator(seed) {
          const item = CLAUSE_COMBINE_ITEMS[seed % CLAUSE_COMBINE_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>${item.instruction}</p><p><strong>${item.parts[0]}</strong><br><strong>${item.parts[1]}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Combined sentence", placeholder:"Write one complete sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markStringAnswer(resp.answer||"", item.accepted, {
              maxScore:2,
              misconception:"subordinate_clause_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${item.accepted[0]}`
            })
          });
        }
  },
  {
    id: "relative_clause_identify",
    label: "Spot the relative clause",
    domain: "Clauses",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "relative_clauses"
    ],
    generator(seed) {
          const item = RELATIVE_SENTENCE_OPTIONS[seed % RELATIVE_SENTENCE_OPTIONS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>Which sentence contains a relative clause?</p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "A relative clause gives extra information about a noun.",
              "It often begins with who, which, that, where, when or whose."
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : "relative_clause_confusion",
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The correct sentence is: ${item.correct}`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "relative_clause_complete",
    label: "Complete with a relative clause",
    domain: "Clauses",
    questionType: "build",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "builder"
    ],
    skillIds: [
      "relative_clauses"
    ],
    generator(seed) {
          const item = RELATIVE_COMPLETE_ITEMS[seed % RELATIVE_COMPLETE_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${item.stem}</p><p><strong>${item.sentenceStart} ___ ${item.sentenceEnd}</strong></p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "Choose the clause that adds extra information about the noun and fits the sentence smoothly.",
              `Correct answer: ${item.correct}`
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : "relative_clause_confusion",
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The best completion is: ${item.correct}.`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "tense_form_choice",
    label: "Choose the correct verb form",
    domain: "Verb forms",
    questionType: "fill",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "tense_aspect"
    ],
    generator(seed) {
          const item = TENSE_FORM_ITEMS[seed % TENSE_FORM_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${item.prompt}</p><p><strong>${escapeHtml(item.sentence)}</strong></p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "Use the time clues in the sentence.",
              "Check whether the meaning needs simple, progressive, present perfect or past perfect."
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : "tense_confusion",
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The correct form is: ${item.answerText}.`,
              answerText:item.answerText
            })
          });
        }
  },
  {
    id: "tense_rewrite",
    label: "Rewrite in a different tense",
    domain: "Verb forms",
    questionType: "rewrite",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: false,
    tags: [
      "surgery",
      "builder"
    ],
    skillIds: [
      "tense_aspect"
    ],
    generator(seed) {
          const item = TENSE_REWRITE_ITEMS[seed % TENSE_REWRITE_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>${item.instruction}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Rewritten sentence", placeholder:"Write the full sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markStringAnswer(resp.answer||"", item.accepted, {
              maxScore:2,
              misconception:"tense_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${item.accepted[0]}`
            })
          });
        }
  },
  {
    id: "standard_english_pairs",
    label: "Choose the Standard English forms",
    domain: "Standard English",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "standard_english"
    ],
    generator(seed) {
          const item = STANDARD_ENGLISH_ITEMS[seed % STANDARD_ENGLISH_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Choose the correct verb form in each pair to complete the sentences using Standard English.</p>`,
            inputSpec:{ type:"multi", fields:item.rows.map((r,i)=>({ key:`row${i}`, label:r.label, kind:"radio", options:r.options.map(x=>[x,x]) })) },
            solutionLines:[
              "Standard English uses the accepted written verb forms.",
              "Be careful not to copy a spoken local form into formal writing."
            ],
            evaluate:(resp)=>{
              let correctRows = 0;
              item.rows.forEach((r,i)=>{ if ((resp[`row${i}`]||"")===r.correct) correctRows += 1; });
              const score = correctRows === item.rows.length ? 2 : correctRows > 0 ? 1 : 0;
              const answerText = item.rows.map(r=>r.correct).join("; ");
              return mkResult({
                correct: correctRows === item.rows.length,
                score,
                maxScore:2,
                misconception: correctRows === item.rows.length ? null : "standard_english_confusion",
                feedbackShort: correctRows === item.rows.length ? "Correct." : (score ? "One part is right." : "Not quite."),
                feedbackLong:`Correct choices: ${answerText}.`,
                answerText
              });
            }
          });
        }
  },
  {
    id: "pronoun_cohesion_choice",
    label: "Choose the clearest cohesive version",
    domain: "Cohesion",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "pronouns_cohesion"
    ],
    generator(seed) {
          const item = PRONOUN_COHESION_ITEMS[seed % PRONOUN_COHESION_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${item.prompt}</p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "Good cohesion reduces repetition without making the meaning unclear.",
              "A pronoun must clearly point to the right noun."
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : "pronoun_cohesion_confusion",
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The clearest version is: ${item.correct}`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "formality_pairs",
    label: "Choose the more formal option",
    domain: "Register",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "formality"
    ],
    generator(seed) {
          const item = FORMALITY_ITEMS[seed % FORMALITY_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Circle the most formal option in each underlined pair below to complete the passage.</p>`,
            inputSpec:{ type:"multi", fields:item.rows.map((r,i)=>({ key:`row${i}`, label:r.label, kind:"radio", options:r.options.map(x=>[x,x]) })) },
            solutionLines:[
              "Formal language usually uses more precise or less chatty vocabulary.",
              "The best option depends on the setting and purpose."
            ],
            evaluate:(resp)=>{
              let correctRows = 0;
              item.rows.forEach((r,i)=>{ if ((resp[`row${i}`]||"")===r.correct) correctRows += 1; });
              const score = correctRows === item.rows.length ? 2 : correctRows >= 2 ? 1 : 0;
              const answerText = item.rows.map(r=>r.correct).join("; ");
              return mkResult({
                correct: correctRows === item.rows.length,
                score,
                maxScore:2,
                misconception: correctRows === item.rows.length ? null : "formality_confusion",
                feedbackShort: correctRows === item.rows.length ? "Correct." : (score ? "Some of the formal choices are right." : "Not quite."),
                feedbackLong:`Correct formal choices: ${answerText}.`,
                answerText
              });
            }
          });
        }
  },
  {
    id: "active_passive_rewrite",
    label: "Transform active and passive voice",
    domain: "Sentence structure",
    questionType: "rewrite",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: false,
    tags: [
      "builder",
      "surgery"
    ],
    skillIds: [
      "active_passive"
    ],
    generator(seed) {
          const item = ACTIVE_PASSIVE_ITEMS[seed % ACTIVE_PASSIVE_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>${item.instruction}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Rewritten sentence", placeholder:"Write the full transformed sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markStringAnswer(resp.answer||"", item.accepted, {
              maxScore:2,
              misconception:"active_passive_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${item.accepted[0]}`
            })
          });
        }
  },
  {
    id: "subject_object_choice",
    label: "Identify subject or object",
    domain: "Sentence structure",
    questionType: "identify",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "subject_object"
    ],
    generator(seed) {
          const item = SUBJECT_OBJECT_ITEMS[seed % SUBJECT_OBJECT_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>In the sentence below, what is the <strong>${item.ask}</strong>?</p><p><strong>${escapeHtml(item.sentence)}</strong></p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "The subject usually does the action; the object usually receives it.",
              "Ignore opening adverbials when finding the subject or object."
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : "subject_object_confusion",
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The ${item.ask} is: ${item.correct}.`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "modal_verb_choice",
    label: "Choose the best modal meaning",
    domain: "Verb forms",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "modal_verbs"
    ],
    generator(seed) {
          const item = MODAL_ITEMS[seed % MODAL_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${item.prompt}</p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "Compare how certain, likely or strong each modal verb sounds.",
              "The best answer depends on the meaning, not just the grammar label."
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : "modal_verb_confusion",
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The correct answer is: ${item.correct}.`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "parenthesis_replace_choice",
    label: "Choose punctuation for parenthesis",
    domain: "Punctuation for grammar",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "parenthesis_commas"
    ],
    generator(seed) {
          const item = PARENTHESIS_REPLACE_ITEMS[seed % PARENTHESIS_REPLACE_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>What punctuation could be used instead of brackets in the sentence below?</p><p><strong>${escapeHtml(item.sentence)}</strong></p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "Brackets, dashes and paired commas can all mark parenthesis in many KS2 contexts.",
              "Here the best replacement from the options is dashes."
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : "parenthesis_confusion",
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The correct answer is: ${item.correct}.`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "parenthesis_fix_sentence",
    label: "Insert brackets for parenthesis",
    domain: "Punctuation for grammar",
    questionType: "fix",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: false,
    tags: [
      "surgery"
    ],
    skillIds: [
      "parenthesis_commas"
    ],
    generator(seed) {
          const item = PARENTHESIS_FIX_ITEMS[seed % PARENTHESIS_FIX_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>${item.prompt}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Type the corrected sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markStringAnswer(resp.answer||"", item.accepted, {
              maxScore:2,
              misconception:"parenthesis_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${item.accepted[0]}`
            })
          });
        }
  },
  {
    id: "speech_punctuation_fix",
    label: "Punctuate direct speech",
    domain: "Punctuation for grammar",
    questionType: "fix",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: false,
    tags: [
      "surgery"
    ],
    skillIds: [
      "speech_punctuation"
    ],
    generator(seed) {
          const item = SPEECH_FIX_ITEMS[seed % SPEECH_FIX_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>${item.prompt}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Correctly punctuated sentence", placeholder:"Type the corrected sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markStringAnswer(resp.answer||"", item.accepted, {
              maxScore:2,
              misconception:"speech_punctuation_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${item.accepted[0]}`
            })
          });
        }
  },
  {
    id: "apostrophe_possession_choice",
    label: "Choose the correct possessive apostrophe",
    domain: "Punctuation for grammar",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "apostrophes_possession"
    ],
    generator(seed) {
          const item = APOSTROPHE_ITEMS[seed % APOSTROPHE_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${item.stem}</p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "Work out who owns the noun.",
              "Then decide whether the owner is singular or plural."
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : "apostrophe_possession_confusion",
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The correct answer is: ${item.correct}.`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "explain_reason_choice",
    label: "Explain why",
    domain: "Explanation",
    questionType: "explain",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: true,
    tags: [
      "explain"
    ],
    skillIds: [
      "adverbials",
      "standard_english"
    ],
    generator(seed) {
          const item = EXPLAIN_ITEMS[seed % EXPLAIN_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${item.stem}</p>`,
            inputSpec:{ type:"single_choice", options:item.options.map(x=>({ value:x, label:x })) },
            solutionLines:[
              "Focus on the grammar reason, not just a vague comment that it ‘sounds better’.",
              "The best explanation names the right feature and why it matters."
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer||"")===item.correct,
              score:(resp.answer||"")===item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer||"")===item.correct ? null : (item.skillIds[0]==="adverbials" ? "fronted_adverbial_confusion" : "standard_english_confusion"),
              feedbackShort:(resp.answer||"")===item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The best explanation is: ${item.correct}.`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "standard_fix_sentence",
    label: "Rewrite in Standard English",
    domain: "Standard English",
    questionType: "fix",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    tags: [
      "surgery"
    ],
    skillIds: [
      "standard_english"
    ],
    generator(seed) {
          const item = STANDARD_FIX_ITEMS[seed % STANDARD_FIX_ITEMS.length];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>${item.instruction}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Write the corrected sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markStringAnswer(resp.answer||"", item.accepted, {
              maxScore:2,
              misconception:"standard_english_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${item.accepted[0]}`
            })
          });
        }
  },
  {
    id: "proc_fronted_adverbial_fix",
    label: "Fix comma after fronted adverbial",
    domain: "Adverbials",
    questionType: "fix",
    difficulty: 1,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    tags: [
      "surgery"
    ],
    skillIds: [
      "adverbials"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const adv = pick(rng, EXTRA_LEXICON.fronted);
          const clause = proceduralSubjectObject(rng).clause;
          const raw = ensureSentenceEnd(`${adv} ${clause}`);
          const accepted = [ensureSentenceEnd(`${adv}, ${clause}`)];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Rewrite the sentence with the punctuation corrected.</p><p><strong>${escapeHtml(raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Write the corrected sentence." },
            solutionLines:[
              "Spot the opening time, place or manner phrase.",
              "Because the fronted adverbial comes first, place a comma after it.",
              `A correct answer is: ${accepted[0]}`
            ],
            contrastHtml:`<div class="contrast-card"><strong>Useful contrast</strong><p style="margin:8px 0 4px;">${escapeHtml(accepted[0])}</p><p style="margin:0 0 4px;">${escapeHtml(raw)}</p><p style="margin:0;">The comma separates the opening adverbial from the main clause.</p></div>`,
            evaluate:(resp)=>markStringAnswer(resp.answer || "", accepted, {
              maxScore:2,
              misconception:"fronted_adverbial_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${accepted[0]}`
            })
          });
        }
  },
  {
    id: "proc_semicolon_choice",
    label: "Choose a semi-colon",
    domain: "Punctuation for grammar",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "boundary_punctuation"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const pair = pick(rng, EXTRA_LEXICON.clausePairs);
          const correct = ";";
          const options = [
            { value:";", label:";" },
            { value:":", label:":" },
            { value:",", label:"," },
            { value:"?", label:"?" }
          ];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>Which punctuation mark best completes the sentence below?</p><p><strong>${escapeHtml(pair[0])} ___ ${escapeHtml(pair[1])}.</strong></p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options },
            solutionLines:[
              "Both parts are complete clauses and closely linked in meaning.",
              "A semi-colon can join closely related main clauses without a conjunction.",
              `The best answer is: ${pair[0]}; ${pair[1]}.`
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer || "") === correct,
              score:(resp.answer || "") === correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer || "") === correct ? null : "boundary_punctuation_confusion",
              feedbackShort:(resp.answer || "") === correct ? "Correct." : "Not quite.",
              feedbackLong:`The best answer is: ${pair[0]}; ${pair[1]}.`,
              answerText:correct
            })
          });
        }
  },
  {
    id: "proc_colon_list_fix",
    label: "Insert a colon for a list",
    domain: "Punctuation for grammar",
    questionType: "fix",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    tags: [
      "surgery"
    ],
    skillIds: [
      "boundary_punctuation"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = pick(rng, EXTRA_LEXICON.colonLists);
          const raw = ensureSentenceEnd(`${item.intro} ${item.items.join(", ")}`);
          const accepted = [ensureSentenceEnd(`${item.intro}: ${item.items.join(", ")}`)];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Rewrite the sentence with a colon in the correct place.</p><p><strong>${escapeHtml(raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Write the corrected sentence." },
            solutionLines:[
              "Check that the words before the list make a complete clause.",
              "A colon can introduce the list that follows.",
              `A correct answer is: ${accepted[0]}`
            ],
            evaluate:(resp)=>markStringAnswer(resp.answer || "", accepted, {
              maxScore:2,
              misconception:"boundary_punctuation_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${accepted[0]}`
            })
          });
        }
  },
  {
    id: "proc_dash_boundary_fix",
    label: "Insert a dash to mark a strong break",
    domain: "Punctuation for grammar",
    questionType: "fix",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    tags: [
      "surgery"
    ],
    skillIds: [
      "boundary_punctuation"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const pair = pick(rng, EXTRA_LEXICON.dashBoundaries);
          const raw = ensureSentenceEnd(`${pair[0]} ${pair[1]}`);
          const accepted = dedupePlain([
            `${pair[0]} – ${pair[1]}.`,
            `${pair[0]} — ${pair[1]}.`,
            `${pair[0]} - ${pair[1]}.`
          ]);
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Rewrite the sentence with a dash in the correct place.</p><p><strong>${escapeHtml(raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Write the corrected sentence." },
            solutionLines:[
              "Both parts are strongly linked, and the second part explains or expands the first.",
              "A dash can mark that strong break.",
              `A correct answer is: ${accepted[0]}`
            ],
            evaluate:(resp)=>markStringAnswer(resp.answer || "", accepted, {
              maxScore:2,
              misconception:"boundary_punctuation_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${accepted[0]}`
            })
          });
        }
  },
  {
    id: "proc_hyphen_ambiguity_choice",
    label: "Choose the clearer hyphenated sentence",
    domain: "Punctuation for grammar",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "hyphen_ambiguity"
    ],
    generator(seed) {
          const item = EXTRA_LEXICON.hyphenPrompts[seed % EXTRA_LEXICON.hyphenPrompts.length];
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${escapeHtml(item.ask)}</p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options:item.options.map(opt => ({ value:opt, label:opt })) },
            solutionLines:[
              "Read both versions carefully and compare the meaning.",
              "The hyphen shows that two words are working together as one describing idea.",
              item.why
            ],
            contrastHtml:`<div class="contrast-card"><strong>Useful contrast</strong><p style="margin:8px 0 4px;">${escapeHtml(item.correct)}</p><p style="margin:0;">${escapeHtml(item.why)}</p></div>`,
            evaluate:(resp)=>mkResult({
              correct:(resp.answer || "") === item.correct,
              score:(resp.answer || "") === item.correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer || "") === item.correct ? null : "hyphen_ambiguity_confusion",
              feedbackShort:(resp.answer || "") === item.correct ? "Correct." : "Not quite.",
              feedbackLong:`The clearer answer is: ${item.correct}`,
              answerText:item.correct
            })
          });
        }
  },
  {
    id: "proc_speech_punctuation_fix",
    label: "Fix speech punctuation",
    domain: "Punctuation for grammar",
    questionType: "fix",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    tags: [
      "surgery"
    ],
    skillIds: [
      "speech_punctuation"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const speaker = pick(rng, EXTRA_LEXICON.speakers);
          const reporting = pick(rng, EXTRA_LEXICON.reportingVerbs);
          const mode = seed % 3;
          let raw = "";
          let accepted = [];
          let solutionLines = [];
          if (mode === 0) {
            const speech = pick(rng, EXTRA_LEXICON.speechQuestions);
            raw = `"${speech}" ${reporting} ${speaker}.`;
            accepted = dedupePlain([`“${speech}?” ${reporting} ${speaker}.`, `"${speech}?" ${reporting} ${speaker}.`]);
            solutionLines = [
              "The spoken words are a question.",
              "The question mark belongs inside the speech marks.",
              `A correct answer is: ${accepted[0]}`
            ];
          } else if (mode === 1) {
            const speech = pick(rng, EXTRA_LEXICON.speechCommands);
            raw = `${speaker} ${reporting} "${speech}!"`;
            accepted = dedupePlain([`${speaker} ${reporting}, “${speech}!”`, `${speaker} ${reporting}, "${speech}!"`]);
            solutionLines = [
              "Add a comma before the direct speech after the reporting clause.",
              "The exclamation mark stays inside the speech marks.",
              `A correct answer is: ${accepted[0]}`
            ];
          } else {
            const speech = pick(rng, EXTRA_LEXICON.speechExclaims);
            raw = `"${speech}" ${reporting} ${speaker}.`;
            accepted = dedupePlain([`“${speech}!” ${reporting} ${speaker}.`, `"${speech}!" ${reporting} ${speaker}.`]);
            solutionLines = [
              "The spoken words show strong feeling.",
              "The exclamation mark belongs inside the speech marks.",
              `A correct answer is: ${accepted[0]}`
            ];
          }
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Punctuate the direct speech correctly.</p><p><strong>${escapeHtml(raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Correctly punctuated sentence", placeholder:"Type the corrected sentence." },
            solutionLines,
            evaluate:(resp)=>markStringAnswer(resp.answer || "", accepted, {
              maxScore:2,
              misconception:"speech_punctuation_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${accepted[0]}`
            })
          });
        }
  },
  {
    id: "proc_apostrophe_possession_choice",
    label: "Choose the correct possessive apostrophe",
    domain: "Punctuation for grammar",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "apostrophes_possession"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = pick(rng, EXTRA_LEXICON.ownedItems);
          const mode = seed % 3;
          let options = [];
          let correct = "";
          let stem = "";
          if (mode === 0) {
            const owner = pick(rng, ["dog","cat","teacher","player","visitor","farmer"]);
            correct = `the ${owner}'s ${item}`;
            options = [`the ${owner}s ${item}`, `the ${owner}'s ${item}`, `the ${owner}s' ${item}`, `the ${owner}s's ${item}`];
            stem = `Choose the correct phrase for one ${owner} and its ${item}.`;
          } else if (mode === 1) {
            const owner = pick(rng, EXTRA_LEXICON.pluralOwners);
            const singular = owner.replace(/s$/, "");
            correct = `the ${owner}' ${item}`;
            options = [`the ${singular}'s ${item}`, `the ${owner}' ${item}`, `the ${owner} ${item}`, `the ${owner}'s ${item}`];
            stem = `Choose the correct phrase for more than one ${singular} and their ${item}.`;
          } else {
            const owner = pick(rng, EXTRA_LEXICON.irregularPluralOwners);
            correct = `the ${owner}'s ${item}`;
            options = [`the ${owner}s ${item}`, `the ${owner}'s ${item}`, `the ${owner}' ${item}`, `the ${owner} ${item}`];
            stem = `Choose the correct phrase for ${owner} and their ${item}.`;
          }
          options = dedupePlain(options);
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${escapeHtml(stem)}</p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options:options.map(opt => ({ value:opt, label:opt })) },
            solutionLines:[
              "Ask who owns the noun.",
              "Then decide whether the owner is singular, a regular plural ending in s, or an irregular plural.",
              `The correct answer is: ${correct}`
            ],
            evaluate:(resp)=>mkResult({
              correct:(resp.answer || "") === correct,
              score:(resp.answer || "") === correct ? 1 : 0,
              maxScore:1,
              misconception:(resp.answer || "") === correct ? null : "apostrophe_possession_confusion",
              feedbackShort:(resp.answer || "") === correct ? "Correct." : "Not quite.",
              feedbackLong:`The correct answer is: ${correct}`,
              answerText:correct
            })
          });
        }
  },
  {
    id: "proc2_standard_english_choice",
    label: "Choose Standard English",
    domain: "Standard English",
    questionType: "choose",
    difficulty: 1,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    skillIds: [
      "standard_english"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generateStandardEnglishCase(rng);
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${escapeHtml(item.stem)}</p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, item.correct, item.distractors) },
            solutionLines:[
              "Focus on the verb form that would fit formal written English.",
              item.why,
              `The correct answer is: ${item.correct}`
            ],
            evaluate:(resp)=>choiceResult(resp, item.correct, 1, `The correct answer is: ${item.correct}`, "standard_english_confusion", item.correct)
          });
        }
  },
  {
    id: "proc2_standard_english_fix",
    label: "Rewrite in Standard English",
    domain: "Standard English",
    questionType: "fix",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    tags: [
      "surgery"
    ],
    skillIds: [
      "standard_english"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generateStandardEnglishCase(rng);
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Rewrite the sentence in Standard English.</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Write the corrected sentence." },
            solutionLines:[
              "Find the non-standard spoken form.",
              "Replace it with the Standard English verb form.",
              `A correct answer is: ${item.correct}`
            ],
            evaluate:(resp)=>markStringAnswer(resp.answer || "", [item.correct], {
              maxScore:2,
              misconception:"standard_english_confusion",
              feedbackLong:`A correct answer is: ${item.correct}`
            })
          });
        }
  },
  {
    id: "proc2_tense_aspect_choice",
    label: "Choose the correct tense or aspect",
    domain: "Verb forms",
    questionType: "fill",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    skillIds: [
      "tense_aspect"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generateTenseCase(rng);
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${escapeHtml(item.stem)}</p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options:buildWordOptions(rng, item.correct, item.options.filter(x => x !== item.correct)) },
            solutionLines:[
              "Look for the time signal in the sentence.",
              item.why,
              `The correct answer is: ${item.correct}`
            ],
            evaluate:(resp)=>choiceResult(resp, item.correct, 1, item.answerText, "tense_confusion", item.correct)
          });
        }
  },
  {
    id: "proc2_modal_choice",
    label: "Choose the modal verb",
    domain: "Verb forms",
    questionType: "fill",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    skillIds: [
      "modal_verbs"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generateModalCase(rng);
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${escapeHtml(item.prompt)}</p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options:shuffle(rng, [item.correct].concat(item.distractors)).map(x => ({ value:x, label:x })) },
            solutionLines:[
              "Match the modal verb to the meaning: advice, possibility, certainty or obligation.",
              item.why,
              `The correct answer is: ${item.correct}`
            ],
            evaluate:(resp)=>choiceResult(resp, item.correct, 1, `The correct answer is: ${item.correct}. ${item.why}`, "modal_verb_confusion", item.correct)
          });
        }
  },
  {
    id: "proc2_formality_choice",
    label: "Choose the more formal sentence",
    domain: "Register",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    skillIds: [
      "formality"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generateFormalityCase(rng);
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${escapeHtml(item.prompt)}</p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, item.correct, item.distractors) },
            solutionLines:[
              "Formal writing avoids chatty wording and uses more precise vocabulary.",
              item.why,
              `The correct answer is: ${item.correct}`
            ],
            evaluate:(resp)=>choiceResult(resp, item.correct, 1, `The correct answer is: ${item.correct}`, "formality_confusion", item.correct)
          });
        }
  },
  {
    id: "proc2_pronoun_cohesion_choice",
    label: "Choose the clearer cohesive version",
    domain: "Cohesion",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    skillIds: [
      "pronouns_cohesion"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generatePronounCohesionCase(rng);
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${escapeHtml(item.prompt)}</p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, item.correct, item.distractors) },
            solutionLines:[
              "A pronoun should help the sentence flow without making the meaning unclear.",
              item.why,
              `The clearest answer is: ${item.correct}`
            ],
            evaluate:(resp)=>choiceResult(resp, item.correct, 1, `The clearest answer is: ${item.correct}`, "pronoun_cohesion_confusion", item.correct)
          });
        }
  },
  {
    id: "proc2_subject_object_identify",
    label: "Identify subject or object",
    domain: "Sentence structure",
    questionType: "identify",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    skillIds: [
      "subject_object"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generateSubjectObjectCase(rng);
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>${escapeHtml(item.ask)}</p><p><strong>${escapeHtml(item.sentence)}</strong></p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options:shuffle(rng, item.options).map(x => ({ value:x, label:x })) },
            solutionLines:[
              "Ask who or what is doing the action. Then ask who or what receives it.",
              item.why,
              `The correct answer is: ${item.correct}`
            ],
            evaluate:(resp)=>choiceResult(resp, item.correct, 1, `The correct answer is: ${item.correct}`, "subject_object_confusion", item.correct)
          });
        }
  },
  {
    id: "proc2_passive_to_active",
    label: "Rewrite passive as active",
    domain: "Sentence structure",
    questionType: "rewrite",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    tags: [
      "builder"
    ],
    skillIds: [
      "active_passive"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generatePassiveCase(rng);
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Rewrite the sentence in the active voice.</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Rewritten sentence", placeholder:"Write the full sentence." },
            solutionLines:[
              "Find the doer after ‘by’ in the passive sentence.",
              "Move that doer into the subject position and keep the tense steady.",
              `A correct answer is: ${item.accepted[0]}`
            ],
            evaluate:(resp)=>markStringAnswer(resp.answer || "", item.accepted, {
              maxScore:2,
              misconception:"active_passive_confusion",
              feedbackLong:`A correct answer is: ${item.accepted[0]}`
            })
          });
        }
  },
  {
    id: "proc2_relative_clause_choice",
    label: "Choose the sentence with a relative clause",
    domain: "Clauses",
    questionType: "identify",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    skillIds: [
      "relative_clauses"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generateRelativeClauseCase(rng);
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>Which sentence contains a relative clause?</p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, item.correct, item.distractors) },
            solutionLines:[
              "A relative clause adds information about a noun.",
              item.why,
              `The correct answer is: ${item.correct}`
            ],
            evaluate:(resp)=>choiceResult(resp, item.correct, 1, `The correct answer is: ${item.correct}`, "relative_clause_confusion", item.correct)
          });
        }
  },
  {
    id: "proc2_fronted_adverbial_build",
    label: "Build a sentence with a fronted adverbial",
    domain: "Adverbials",
    questionType: "build",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    tags: [
      "builder"
    ],
    punctStage: "produce",
    skillIds: [
      "adverbials"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const adv = pick(rng, EXTRA_LEXICON.fronted);
          const clause = proceduralSubjectObject(rng).clause;
          const accepted = [ensureSentenceEnd(`${adv}, ${clause}`)];
          return makeBaseQuestion(this, seed, {
            marks:2,
            stemHtml:`<p>Use this opening phrase and clause to build one correct sentence.</p><p><strong>Opening phrase:</strong> ${escapeHtml(adv)}</p><p><strong>Main clause:</strong> ${escapeHtml(capFirst(clause))}</p>`,
            inputSpec:{ type:"textarea", label:"Your sentence", placeholder:"Write one complete sentence." },
            solutionLines:[
              "Put the fronted adverbial first.",
              "Add a comma after it before the main clause begins.",
              `A correct answer is: ${accepted[0]}`
            ],
            evaluate:(resp)=>markStringAnswer(resp.answer || "", accepted, {
              maxScore:2,
              misconception:"fronted_adverbial_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${accepted[0]}`
            })
          });
        }
  },
  {
    id: "proc2_boundary_punctuation_explain",
    label: "Explain boundary punctuation",
    domain: "Punctuation for grammar",
    questionType: "explain",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    punctStage: "produce",
    skillIds: [
      "boundary_punctuation"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const mode = seed % 3;
          let sentence = "";
          let correct = "";
          let distractors = [];
          let why = "";
          if (mode === 0) {
            const pair = pick(rng, EXTRA_LEXICON.clausePairs);
            sentence = `${pair[0]}; ${pair[1]}.`;
            correct = "A semi-colon can join two closely related main clauses.";
            distractors = [
              "A semi-colon introduces direct speech.",
              "A semi-colon marks a fronted adverbial.",
              "A semi-colon shows possession."
            ];
            why = "Both sides of the semi-colon are complete clauses.";
          } else if (mode === 1) {
            const list = pick(rng, EXTRA_LEXICON.colonLists);
            sentence = `${list.intro}: ${list.items.join(", ")}.`;
            correct = "The words before the colon make a complete clause and the colon introduces a list.";
            distractors = [
              "The colon marks possession.",
              "The colon shows a question.",
              "The colon replaces speech marks."
            ];
            why = "A colon often comes after a full clause and introduces a list or explanation.";
          } else {
            const pair = pick(rng, EXTRA_LEXICON.dashBoundaries);
            sentence = `${pair[0]} – ${pair[1]}.`;
            correct = "The dash creates a strong break before an explanation or afterthought.";
            distractors = [
              "The dash shows plural possession.",
              "The dash turns the sentence into a question.",
              "The dash marks a direct speech tag."
            ];
            why = "The dash creates a deliberate strong break in the sentence.";
          }
          return makeBaseQuestion(this, seed, {
            marks:1,
            stemHtml:`<p>Why is the punctuation in this sentence effective?</p><p><strong>${escapeHtml(sentence)}</strong></p>`,
            inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, correct, distractors) },
            solutionLines:[
              "Look at the relationship between the parts of the sentence.",
              why,
              `The best explanation is: ${correct}`
            ],
            evaluate:(resp)=>choiceResult(resp, correct, 1, `The best explanation is: ${correct}`, "boundary_punctuation_confusion", correct)
          });
        }
  },
  {
    id: "proc3_sentence_function_choice",
    label: "Choose the sentence function",
    domain: "Sentence function",
    questionType: "choose",
    difficulty: 1,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "sentence_functions"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const bank = {
              statement:[
                "The lantern was still on the bench.",
                "The choir begins at nine o'clock.",
                "The path beside the stream was muddy.",
                "Our team practised in the hall today."
              ],
              question:[
                "Where is the missing torch?",
                "When does the match begin?",
                "Why is the gate still open?",
                "Who packed the blue folder?"
              ],
              command:[
                "Close the gate before the dog runs out.",
                "Bring the blue folder to the hall.",
                "Wait by the door for the coach.",
                "Put the wet boots on the mat."
              ],
              exclamation:[
                "What a noisy drum that is!",
                "How quickly the clouds moved!",
                "What an enormous splash that was!",
                "How bright the lantern looked!"
              ]
            };
            const targets = ["statement","question","command","exclamation"];
            const target = pick(rng, targets);
            const targetSentence = pick(rng, bank[target]);
            const distractors = shuffle(rng, targets.filter(x => x !== target)).map(type => pick(rng, bank[type]));
            const labels = { statement:"statement", question:"question", command:"command", exclamation:"grammatical exclamation" };
            return makeBaseQuestion(this, seed, {
              marks:1,
              stemHtml:`<p>Which sentence is a <strong>${labels[target]}</strong>?</p>`,
              inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, targetSentence, distractors) },
              solutionLines:[
                "Decide what the whole sentence is doing.",
                target === "statement" ? "A statement gives information." : target === "question" ? "A question asks something." : target === "command" ? "A command tells someone to do something." : "A grammatical exclamation uses a pattern such as ‘What ...’ or ‘How ...’ to express strong feeling.",
                `The correct sentence is: ${targetSentence}`
              ],
              evaluate:(resp)=>choiceResult(resp, targetSentence, 1, `The correct sentence is: ${targetSentence}`, "sentence_function_confusion", targetSentence)
            });
          }
  },
  {
    id: "proc3_word_class_contrast_choice",
    label: "Choose the correct word class",
    domain: "Word classes",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    tags: [
      "identify"
    ],
    skillIds: [
      "word_classes"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const cases = [
              {
                stem:"In the sentence <strong>After lunch, Ben hurried inside.</strong>, what is the word <strong>After</strong>?",
                correct:"preposition",
                distractors:["adverb","conjunction","determiner"],
                why:"‘After’ introduces the phrase ‘after lunch’, so it is a preposition."
              },
              {
                stem:"In the sentence <strong>Afterwards, Ben hurried inside.</strong>, what is the word <strong>Afterwards</strong>?",
                correct:"adverb",
                distractors:["preposition","conjunction","determiner"],
                why:"‘Afterwards’ tells us when Ben hurried, so it is an adverb."
              },
              {
                stem:"In the sentence <strong>The muddy boots were by the door.</strong>, what is the word <strong>The</strong>?",
                correct:"determiner",
                distractors:["pronoun","adverb","preposition"],
                why:"‘The’ introduces the noun phrase ‘the muddy boots’, so it is a determiner."
              },
              {
                stem:"In the sentence <strong>Those are muddy.</strong>, what is the word <strong>Those</strong>?",
                correct:"pronoun",
                distractors:["determiner","adjective","conjunction"],
                why:"‘Those’ stands in place of a noun, so it is a pronoun here."
              },
              {
                stem:"In the sentence <strong>We stayed inside because it was raining.</strong>, what is the word <strong>because</strong>?",
                correct:"conjunction",
                distractors:["preposition","adverb","determiner"],
                why:"‘Because’ introduces a subordinate clause, so it is a conjunction."
              },
              {
                stem:"In the sentence <strong>We stayed inside during the storm.</strong>, what is the word <strong>during</strong>?",
                correct:"preposition",
                distractors:["conjunction","adverb","pronoun"],
                why:"‘During’ introduces the phrase ‘during the storm’, so it is a preposition."
              }
            ];
            const item = cases[seed % cases.length];
            return makeBaseQuestion(this, seed, {
              marks:1,
              stemHtml:`<p>${item.stem}</p>`,
              inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, item.correct, item.distractors) },
              solutionLines:[
                "Focus on the word’s job in the sentence, not just its meaning on its own.",
                item.why,
                `The correct answer is: ${item.correct}.`
              ],
              evaluate:(resp)=>choiceResult(resp, item.correct, 1, item.why, "word_class_confusion", item.correct)
            });
          }
  },
  {
    id: "proc3_noun_phrase_build",
    label: "Build an expanded noun phrase",
    domain: "Phrases",
    questionType: "build",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    tags: [
      "builder"
    ],
    skillIds: [
      "noun_phrases"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const sizes = ["tiny","large","old","heavy","bright","narrow"];
            const colours = ["silver","blue","red","green","golden","striped"];
            const nouns = ["key","lantern","scarf","bucket","trophy","rucksack"];
            const endings = [
              "___ was hidden under the bench.",
              "___ lay beside the tent.",
              "___ rested near the gate.",
              "___ was still on the shelf."
            ];
            const sizeWord = pick(rng, sizes);
            const colourWord = pick(rng, colours);
            const noun = pick(rng, nouns);
            const sentence = pick(rng, endings);
            const correct = `the ${sizeWord} ${colourWord} ${noun}`;
            return makeBaseQuestion(this, seed, {
              marks:2,
              stemHtml:`<p>Use all the words to build an <strong>expanded noun phrase</strong> that could complete the sentence.</p><p><strong>Words:</strong> the / ${sizeWord} / ${colourWord} / ${noun}</p><p><strong>${sentence}</strong></p>`,
              inputSpec:{ type:"text", label:"Expanded noun phrase", placeholder:"Type the noun phrase." },
              solutionLines:[
                "Start with the determiner, then add the describing words, then finish with the noun.",
                `A clear expanded noun phrase is: ${correct}.`,
                "The whole phrase centres on the noun at the end."
              ],
              evaluate:(resp)=>markStringAnswer(resp.answer || "", [correct], {
                maxScore:2,
                misconception:"noun_phrase_confusion",
                punctuationMisconception:"punctuation_precision",
                feedbackLong:`A correct expanded noun phrase is: ${correct}.`
              })
            });
          }
  },
  {
    id: "proc3_clause_join_rewrite",
    label: "Join clauses with a conjunction",
    domain: "Clauses",
    questionType: "rewrite",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    tags: [
      "builder"
    ],
    skillIds: [
      "clauses"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const banks = {
              because:[
                ["we stayed inside","it was raining"],
                ["Ben hurried home","he had forgotten his kit"],
                ["Mia smiled","she had found the missing map"]
              ],
              although:[
                ["Mia was tired","she finished the race"],
                ["the path was muddy","the walkers kept going"],
                ["the room was noisy","Jay carried on reading"]
              ],
              when:[
                ["the bell rang","the pupils lined up"],
                ["the gate opened","the crowd cheered"],
                ["the lights went out","everyone fell silent"]
              ],
              if:[
                ["you need help","call the office"],
                ["the rain starts","go inside the tent"],
                ["the torch stops working","fetch the spare one"]
              ]
            };
            const conjunction = pick(rng, Object.keys(banks));
            const pair = pick(rng, banks[conjunction]);
            const main = pair[0];
            const sub = pair[1];
            let accepted;
            if (conjunction === "because") {
              accepted = dedupePlain([
                `${capFirst(main)} because ${sub}.`,
                `Because ${sub}, ${main}.`
              ]);
            } else if (conjunction === "although") {
              accepted = dedupePlain([
                `Although ${main}, ${sub}.`,
                `${capFirst(sub)} although ${main}.`
              ]);
            } else if (conjunction === "when") {
              accepted = dedupePlain([
                `When ${main}, ${sub}.`,
                `${capFirst(sub)} when ${main}.`
              ]);
            } else {
              accepted = dedupePlain([
                `If ${main}, ${sub}.`,
                `${capFirst(sub)} if ${main}.`
              ]);
            }
            return makeBaseQuestion(this, seed, {
              marks:2,
              stemHtml:`<p>Combine these ideas into one sentence using <strong>${conjunction}</strong>.</p><ul><li>${capFirst(main)}.</li><li>${capFirst(sub)}.</li></ul>`,
              inputSpec:{ type:"textarea", label:"Combined sentence", placeholder:"Write one combined sentence." },
              solutionLines:[
                "Use the conjunction to join the ideas so the relationship is clear.",
                accepted[0],
                "Check that the sentence is complete and punctuated as one whole sentence."
              ],
              evaluate:(resp)=>markStringAnswer(resp.answer || "", accepted, {
                maxScore:2,
                misconception:"subordinate_clause_confusion",
                punctuationMisconception:"punctuation_precision",
                feedbackLong:`A correct answer is: ${accepted[0]}`
              })
            });
          }
  },
  {
    id: "proc3_parenthesis_commas_fix",
    label: "Add commas for parenthesis",
    domain: "Punctuation for grammar",
    questionType: "fix",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    punctStage: "repair",
    tags: [
      "surgery"
    ],
    skillIds: [
      "parenthesis_commas"
    ],
    generator(seed) {
            const items = [
              {
                raw:"Ben after a short pause opened the gate.",
                accepted:"Ben, after a short pause, opened the gate.",
                why:"The extra phrase ‘after a short pause’ is parenthesis, so commas mark it off."
              },
              {
                raw:"The map in my opinion needs replacing.",
                accepted:"The map, in my opinion, needs replacing.",
                why:"The phrase ‘in my opinion’ is extra information, so commas mark it off."
              },
              {
                raw:"Our new puppy to my surprise slept through the storm.",
                accepted:"Our new puppy, to my surprise, slept through the storm.",
                why:"The phrase ‘to my surprise’ adds extra information, so commas show the parenthesis."
              },
              {
                raw:"The coach without any warning changed the teams.",
                accepted:"The coach, without any warning, changed the teams.",
                why:"The phrase ‘without any warning’ is inserted as extra information here."
              }
            ];
            const item = items[seed % items.length];
            return makeBaseQuestion(this, seed, {
              marks:2,
              stemHtml:`<p>Add commas to show the <strong>parenthesis</strong>.</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
              inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Type the corrected sentence." },
              solutionLines:[
                "Find the extra information that could be lifted out.",
                item.why,
                `A correct answer is: ${item.accepted}`
              ],
              evaluate:(resp)=>markStringAnswer(resp.answer || "", [item.accepted], {
                maxScore:2,
                misconception:"parenthesis_confusion",
                punctuationMisconception:"punctuation_precision",
                feedbackLong:`A correct answer is: ${item.accepted}`
              })
            });
          }
  },
  {
    id: "proc3_hyphen_fix_meaning",
    label: "Use a hyphen to make the meaning clear",
    domain: "Punctuation for grammar",
    questionType: "fix",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    punctStage: "produce",
    tags: [
      "surgery"
    ],
    skillIds: [
      "hyphen_ambiguity"
    ],
    generator(seed) {
            const items = [
              {
                raw:"We visited the small animal hospital after lunch.",
                accepted:"We visited the small-animal hospital after lunch.",
                why:"The hyphen shows that the hospital is for small animals."
              },
              {
                raw:"We saw a man eating shark near the rocks.",
                accepted:"We saw a man-eating shark near the rocks.",
                why:"The hyphen shows that the shark eats people."
              },
              {
                raw:"The class made a last minute poster for the hall.",
                accepted:"The class made a last-minute poster for the hall.",
                why:"The hyphen joins the words into one describing idea before the noun."
              },
              {
                raw:"She bought a sugar free drink for the journey.",
                accepted:"She bought a sugar-free drink for the journey.",
                why:"The hyphen joins the words into one describing idea before the noun."
              }
            ];
            const item = items[seed % items.length];
            return makeBaseQuestion(this, seed, {
              marks:2,
              stemHtml:`<p>Rewrite the sentence with a <strong>hyphen</strong> to make the meaning clear.</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
              inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Type the corrected sentence." },
              solutionLines:[
                "Find the words that work together as one describing idea before the noun.",
                item.why,
                `A correct answer is: ${item.accepted}`
              ],
              evaluate:(resp)=>markStringAnswer(resp.answer || "", [item.accepted], {
                maxScore:2,
                misconception:"punctuation_precision",
                punctuationMisconception:"punctuation_precision",
                feedbackLong:`A correct answer is: ${item.accepted}`
              })
            });
          }
  },
  {
    id: "qg_active_passive_choice",
    label: "Choose active or passive voice",
    domain: "Verb forms",
    questionType: "choose",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    tags: [
      "qg-p1",
      "identify"
    ],
    skillIds: [
      "active_passive"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const cases = [
              {
                active:"Maya opened the heavy gate after lunch.",
                passive:"The heavy gate was opened by Maya after lunch.",
                distractors:[
                  "Maya was opening the heavy gate after lunch.",
                  "After lunch, Maya opened the heavy gate."
                ],
                why:"The passive sentence puts the thing affected first and uses 'was opened by'."
              },
              {
                active:"The caretaker locked the hall before assembly.",
                passive:"The hall was locked by the caretaker before assembly.",
                distractors:[
                  "The caretaker was locking the hall before assembly.",
                  "Before assembly, the caretaker locked the hall."
                ],
                why:"The hall receives the action, so it comes first in the passive sentence."
              },
              {
                active:"Aisha painted the scenery for the play.",
                passive:"The scenery was painted by Aisha for the play.",
                distractors:[
                  "Aisha was painting the scenery for the play.",
                  "For the play, Aisha painted the scenery."
                ],
                why:"The passive voice focuses on the scenery rather than the person doing the painting."
              }
            ];
            const item = cases[seed % cases.length];
            const answerSpec = exactAnswerSpec(item.passive, [item.active].concat(item.distractors), {
              misconception:"active_passive_confusion",
              feedbackLong:item.why
            });
            return makeBaseQuestion(this, seed, {
              marks:1,
              answerSpec,
              stemHtml:`<p>Which sentence is written in the <strong>passive voice</strong>?</p>`,
              inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, item.passive, [item.active].concat(item.distractors)) },
              solutionLines:[
                "In passive voice, the thing affected often comes before the doer.",
                item.why,
                `The passive sentence is: ${item.passive}`
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
            });
          }
  },
  {
    id: "qg_subject_object_classify_table",
    label: "Classify subject and object roles",
    domain: "Sentence structure",
    questionType: "classify",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "multiField",
    tags: [
      "qg-p1",
      "identify"
    ],
    skillIds: [
      "subject_object"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const first = proceduralSubjectObject(rng);
            const second = proceduralSubjectObject(rng);
            const rows = [
              {
                label:`In "${first.clause}.", what is "${first.name}"?`,
                answer:"subject"
              },
              {
                label:`In "${second.clause}.", what is "${second.object}"?`,
                answer:"object"
              }
            ];
            const fields = Object.fromEntries(rows.map((row, index) => [
              `row${index}`,
              exactAnswerSpec(row.answer, ["subject", "object", "neither"].filter(value => value !== row.answer), {
                misconception:"subject_object_confusion",
                feedbackLong:"The subject does the action; the object receives it."
              })
            ]));
            const answerText = rows.map(row => `${row.label} ${row.answer}`).join(" | ");
            const answerSpec = multiFieldAnswerSpec(fields, {
              maxScore:2,
              misconception:"subject_object_confusion",
              feedbackLong:"The subject does the action; the object receives it.",
              answerText
            });
            return makeBaseQuestion(this, seed, {
              marks:2,
              answerSpec,
              stemHtml:`<p>Classify each named noun phrase as the <strong>subject</strong> or <strong>object</strong>.</p>`,
              inputSpec:{ type:"table_choice", columns:["subject","object","neither"], rows: rows.map((row,i)=>({ key:`row${i}`, label:row.label })) },
              solutionLines:[
                "Ask who or what does the verb, then ask who or what receives it.",
                answerText
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
            });
          }
  },
  {
    id: "qg_pronoun_referent_identify",
    label: "Identify a pronoun referent",
    domain: "Cohesion",
    questionType: "identify",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    tags: [
      "qg-p1",
      "identify"
    ],
    skillIds: [
      "pronouns_cohesion"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const cases = [
              {
                sentence:"Lena put the map beside the torch because it was too large for her pocket.",
                pronoun:"it",
                correct:"the map",
                distractors:["the torch", "Lena", "her pocket"],
                why:"The pronoun 'it' refers to the map because the map is described as too large for the pocket."
              },
              {
                sentence:"Sam thanked Oliver after he returned the library book.",
                pronoun:"he",
                correct:"Oliver",
                distractors:["Sam", "the library book", "the library"],
                why:"The pronoun 'he' refers to Oliver because Oliver returned the book."
              },
              {
                sentence:"The pupils moved the benches after they finished lunch.",
                pronoun:"they",
                correct:"The pupils",
                distractors:["the benches", "lunch", "the hall"],
                why:"The pronoun 'they' refers to the pupils because the pupils finished lunch."
              }
            ];
            const item = cases[seed % cases.length];
            const answerSpec = exactAnswerSpec(item.correct, item.distractors, {
              misconception:"pronoun_cohesion_confusion",
              feedbackLong:item.why
            });
            return makeBaseQuestion(this, seed, {
              marks:1,
              answerSpec,
              stemHtml:`<p>In this sentence, what does the pronoun <strong>${escapeHtml(item.pronoun)}</strong> refer to?</p><p><strong>${escapeHtml(item.sentence)}</strong></p>`,
              inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, item.correct, item.distractors) },
              solutionLines:[
                "A pronoun should point clearly to a noun or noun phrase.",
                item.why,
                `The referent is: ${item.correct}`
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
            });
          }
  },
  {
    id: "qg_formality_classify_table",
    label: "Classify formal and informal register",
    domain: "Register",
    questionType: "classify",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "multiField",
    tags: [
      "qg-p1",
      "identify"
    ],
    skillIds: [
      "formality"
    ],
    generator(seed) {
            const cases = [
              [
                { text:"We request that visitors remain seated.", answer:"formal" },
                { text:"Please hang on until we get started.", answer:"informal" }
              ],
              [
                { text:"The equipment was inspected before use.", answer:"formal" },
                { text:"The kit got checked before we used it.", answer:"informal" }
              ],
              [
                { text:"Pupils are required to return the form by Friday.", answer:"formal" },
                { text:"Bring the form back by Friday, OK?", answer:"informal" }
              ]
            ];
            const rows = cases[seed % cases.length];
            const fields = Object.fromEntries(rows.map((row, index) => [
              `row${index}`,
              exactAnswerSpec(row.answer, ["formal", "informal"].filter(value => value !== row.answer), {
                misconception:"formality_confusion",
                feedbackLong:"Formal writing avoids chatty phrasing and uses precise vocabulary."
              })
            ]));
            const answerText = rows.map(row => `${row.text} -> ${row.answer}`).join(" | ");
            const answerSpec = multiFieldAnswerSpec(fields, {
              maxScore:2,
              misconception:"formality_confusion",
              feedbackLong:"Formal writing avoids chatty phrasing and uses precise vocabulary.",
              answerText
            });
            return makeBaseQuestion(this, seed, {
              marks:2,
              answerSpec,
              stemHtml:`<p>Classify each sentence as <strong>formal</strong> or <strong>informal</strong>.</p>`,
              inputSpec:{ type:"table_choice", columns:["formal","informal"], rows: rows.map((row,i)=>({ key:`row${i}`, label:row.text })) },
              solutionLines:[
                "Match the language to the audience and purpose.",
                answerText
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
            });
          }
  },
  {
    id: "qg_modal_verb_explain",
    label: "Explain modal verb meaning",
    domain: "Verb forms",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    tags: [
      "qg-p1",
      "explain"
    ],
    skillIds: [
      "modal_verbs"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const cases = [
              {
                sentence:"You must wear a helmet on the climbing wall.",
                modal:"must",
                correct:"It shows a rule or strong obligation.",
                distractors:[
                  "It shows a weak possibility.",
                  "It makes the sentence a question.",
                  "It shows the action happened yesterday."
                ],
                why:"'Must' is used here for a rule or strong obligation."
              },
              {
                sentence:"The clouds are dark, so it might rain later.",
                modal:"might",
                correct:"It shows possibility, not certainty.",
                distractors:[
                  "It shows a fixed rule.",
                  "It shows the action is happening now.",
                  "It names the person doing the action."
                ],
                why:"'Might' shows that rain is possible but not certain."
              },
              {
                sentence:"You should check your work before handing it in.",
                modal:"should",
                correct:"It gives advice.",
                distractors:[
                  "It shows something is impossible.",
                  "It marks direct speech.",
                  "It turns the verb into the past tense."
                ],
                why:"'Should' commonly gives advice or a recommendation."
              }
            ];
            const item = cases[seed % cases.length];
            const answerSpec = exactAnswerSpec(item.correct, item.distractors, {
              misconception:"modal_verb_confusion",
              feedbackLong:item.why
            });
            return makeBaseQuestion(this, seed, {
              marks:1,
              answerSpec,
              stemHtml:`<p>In this sentence, what does the modal verb <strong>${escapeHtml(item.modal)}</strong> show?</p><p><strong>${escapeHtml(item.sentence)}</strong></p>`,
              inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, item.correct, item.distractors) },
              solutionLines:[
                "Modal verbs show meanings such as possibility, certainty, obligation, permission, or advice.",
                item.why
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
            });
          }
  },
  {
    id: "qg_hyphen_ambiguity_explain",
    label: "Explain how a hyphen changes meaning",
    domain: "Punctuation for grammar",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    punctStage: "sense",
    tags: [
      "qg-p1",
      "explain"
    ],
    skillIds: [
      "hyphen_ambiguity"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const cases = [
              {
                phrase:"man-eating shark",
                contrast:"man eating shark",
                correct:"The hyphen shows that the shark eats people.",
                distractors:[
                  "The hyphen shows that a man is eating a shark.",
                  "The hyphen turns the phrase into direct speech.",
                  "The hyphen shows plural possession."
                ],
                why:"The hyphen joins 'man' and 'eating' into one describing idea before the noun."
              },
              {
                phrase:"small-animal hospital",
                contrast:"small animal hospital",
                correct:"The hyphen shows that the hospital is for small animals.",
                distractors:[
                  "The hyphen shows that the hospital building is small.",
                  "The hyphen marks a fronted adverbial.",
                  "The hyphen shows a missing letter."
                ],
                why:"The hyphen joins 'small' and 'animal' so they work together before 'hospital'."
              },
              {
                phrase:"last-minute poster",
                contrast:"last minute poster",
                correct:"The hyphen shows that 'last-minute' is one describing idea before 'poster'.",
                distractors:[
                  "The hyphen shows that the poster is the final minute.",
                  "The hyphen joins two complete clauses.",
                  "The hyphen marks direct speech."
                ],
                why:"The compound adjective comes before the noun, so the hyphen protects the intended meaning."
              }
            ];
            const item = cases[seed % cases.length];
            const answerSpec = exactAnswerSpec(item.correct, item.distractors, {
              misconception:"hyphen_ambiguity_confusion",
              feedbackLong:item.why
            });
            return makeBaseQuestion(this, seed, {
              marks:1,
              answerSpec,
              stemHtml:`<p>Why does the hyphen matter in <strong>${escapeHtml(item.phrase)}</strong> rather than <strong>${escapeHtml(item.contrast)}</strong>?</p>`,
              inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, item.correct, item.distractors) },
              solutionLines:[
                "A hyphen can join words so they work as one describing idea before a noun.",
                item.why
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
            });
          }
  },
  {
    id: "proc3_apostrophe_rewrite",
    label: "Rewrite with a possessive apostrophe",
    domain: "Punctuation for grammar",
    questionType: "rewrite",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: false,
    generative: true,
    punctStage: "produce",
    tags: [
      "builder"
    ],
    skillIds: [
      "apostrophes_possession"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const item = pick(rng, EXTRA_LEXICON.ownedItems);
            const kind = randInt(rng, 0, 2);
            let prompt, accepted, why;
            if (kind === 0) {
              const owner = pick(rng, EXTRA_LEXICON.names.filter(name => !/s$/i.test(name)));
              prompt = `the ${item} belonging to ${owner}`;
              accepted = `${owner}'s ${item}`;
              why = "A singular owner usually takes apostrophe + s.";
            } else if (kind === 1) {
              const owner = pick(rng, EXTRA_LEXICON.pluralOwners);
              prompt = `the ${item} belonging to the ${owner}`;
              accepted = `the ${owner}' ${item}`;
              why = "A regular plural owner ending in s usually takes an apostrophe after the s.";
            } else {
              const owner = pick(rng, EXTRA_LEXICON.irregularPluralOwners);
              prompt = `the ${item} belonging to the ${owner}`;
              accepted = `the ${owner}'s ${item}`;
              why = "An irregular plural owner that does not end in s usually takes apostrophe + s.";
            }
            return makeBaseQuestion(this, seed, {
              marks:2,
              stemHtml:`<p>Rewrite this phrase using the correct <strong>possessive apostrophe</strong>.</p><p><strong>${escapeHtml(prompt)}</strong></p>`,
              inputSpec:{ type:"text", label:"Rewritten phrase", placeholder:"Type the rewritten phrase." },
              solutionLines:[
                "Work out who owns the noun.",
                why,
                `A correct answer is: ${accepted}`
              ],
              evaluate:(resp)=>markStringAnswer(resp.answer || "", [accepted], {
                maxScore:2,
                misconception:"apostrophe_possession_confusion",
                punctuationMisconception:"punctuation_precision",
                feedbackLong:`A correct answer is: ${accepted}`
              })
            });
          }
  }
];

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, arr) {
  return arr[randInt(rng, 0, arr.length - 1)];
}

function shuffle(rng, arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sampleMany(rng, arr, n) {
  return shuffle(rng, arr).slice(0, n);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanSpaces(value) {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function lowerClean(value) {
  return cleanSpaces(value).toLowerCase();
}

function sentenceBare(value) {
  return lowerClean(value).replace(/[.,!?;:'"()\-]/g, '');
}

function compareAnswerString(actual, acceptedList) {
  const actualNorm = lowerClean(actual);
  const exact = acceptedList.some(x => lowerClean(x) === actualNorm);
  const bare = acceptedList.some(x => sentenceBare(x) === sentenceBare(actual));
  return { exact, bare };
}

function setEq(a, b) {
  const A = [...new Set(a)].map(String).sort();
  const B = [...new Set(b)].map(String).sort();
  return A.length === B.length && A.every((v,i)=>v===B[i]);
}

function mkResult({correct, score, maxScore, misconception, feedbackShort, feedbackLong, answerText, minimalHint}) {
  return {
    correct: !!correct,
    score,
    maxScore,
    misconception: misconception || null,
    feedbackShort: feedbackShort || "",
    feedbackLong: feedbackLong || "",
    answerText: answerText || "",
    minimalHint: minimalHint || MINIMAL_HINTS[misconception] || "Check the sentence structure and the instruction again."
  };
}

// Thin adapter — U5 migration window. Inline `accepted: [...]` arrays on
// template items continue to flow through this helper, which constructs a
// transient `acceptedSet` answerSpec and delegates to the shared
// markByAnswerSpec marker in ./answer-spec.js. Every marking call in this
// module therefore routes through the same declarative code path, even before
// per-template answerSpec declarations land in a content-release PR.
//
// We keep the legacy `minimalHint` lookup injection here so the result shape
// matches `mkResult` exactly (oracle fixtures depend on it).
function markStringAnswer(respText, acceptedList, opts = {}) {
  const spec = {
    kind: 'acceptedSet',
    golden: Array.isArray(acceptedList) ? acceptedList.slice() : [],
    nearMiss: [],
    maxScore: opts.maxScore || 2,
    misconception: opts.misconception,
    punctuationMisconception: opts.punctuationMisconception,
    feedbackLong: opts.feedbackLong,
  };
  const result = markByAnswerSpec(spec, { answer: respText });
  result.minimalHint = MINIMAL_HINTS[result.misconception] || "Check the sentence structure and the instruction again.";
  return result;
}

function makeBaseQuestion(template, seed, data) {
  return Object.assign({
    templateId: template.id,
    templateLabel: template.label,
    domain: template.domain,
    skillIds: template.skillIds.slice(),
    questionType: template.questionType,
    seed,
    itemId: `${template.id}:${seed}`,
    marks: 1,
    visualHtml: "",
    reflectionPrompt: "",
    checkLine: "",
    contrastHtml: ""
  }, data || {});
}

function capFirst(text) {
  const s = cleanSpaces(text);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function ensureSentenceEnd(text, end = ".") {
  let s = cleanSpaces(text).replace(/[.?!]+$/, "");
  return s + end;
}

function quoteVariants(inner) {
  const clean = cleanSpaces(inner);
  return [`“${clean}”`, `"${clean}"`];
}

function dedupePlain(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr || []) {
    const clean = cleanSpaces(item);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function proceduralSubjectObject(rng) {
  const name = pick(rng, EXTRA_LEXICON.names);
  const object = pick(rng, EXTRA_LEXICON.objects);
  const verbs = [
    { past:"carried", base:"carry" },
    { past:"opened", base:"open" },
    { past:"packed", base:"pack" },
    { past:"dropped", base:"drop" },
    { past:"found", base:"find" },
    { past:"lifted", base:"lift" },
    { past:"cleaned", base:"clean" },
    { past:"locked", base:"lock" }
  ];
  const verb = pick(rng, verbs);
  return {
    name,
    object,
    verb,
    clause: `${name} ${verb.past} ${object}`
  };
}

function buildChoiceOptions(rng, correct, distractors) {
  return shuffle(rng, dedupePlain([correct].concat(distractors))).map(text => ({ value:text, label:text }));
}

function buildWordOptions(rng, correct, distractors) {
  return shuffle(rng, dedupePlain([correct].concat(distractors))).map(text => ({ value:text, label:text }));
}

function choiceResult(resp, correct, maxScore, why, misconception, answerText) {
  const ok = (resp.answer || "") === correct;
  return mkResult({
    correct: ok,
    score: ok ? maxScore : 0,
    maxScore,
    misconception: ok ? null : misconception,
    feedbackShort: ok ? "Correct." : "Not quite.",
    feedbackLong: why,
    answerText: answerText || correct
  });
}

function exactAnswerSpec(correct, nearMiss, opts = {}) {
  const misconception = opts.misconception || "misread_question";
  return {
    kind: "exact",
    golden: [correct],
    nearMiss: dedupePlain(nearMiss || []).filter(item => item !== correct),
    maxScore: opts.maxScore || 1,
    misconception,
    feedbackLong: opts.feedbackLong || "",
    answerText: opts.answerText || correct,
    minimalHint: MINIMAL_HINTS[misconception] || "Check the sentence structure and the instruction again."
  };
}

function multiFieldAnswerSpec(fields, opts = {}) {
  const misconception = opts.misconception || "misread_question";
  return {
    kind: "multiField",
    params: { fields },
    maxScore: opts.maxScore || Object.keys(fields || {}).length || 1,
    misconception,
    feedbackLong: opts.feedbackLong || "",
    answerText: opts.answerText || "",
    minimalHint: MINIMAL_HINTS[misconception] || "Check the sentence structure and the instruction again."
  };
}

function generateStandardEnglishCase(rng) {
  const kind = randInt(rng, 0, 3);
  if (kind === 0) {
    const phrase = pick(rng, ["waiting by the gate","walking home after lunch","standing near the hall","ready for the start"]);
    const subject = pick(rng, ["We","They","The players","The visitors"]);
    return {
      stem:"Which sentence is written in Standard English?",
      correct:`${subject} were ${phrase}.`,
      distractors:[`${subject} was ${phrase}.`, `${subject} is ${phrase}.`, `${subject} be ${phrase}.`],
      why:`With this plural subject, Standard English uses ‘were’.`,
      raw:`${subject} was ${phrase}.`
    };
  }
  if (kind === 1) {
    const obj = pick(rng, ["my homework","the poster","my reading record","the map work"]);
    return {
      stem:"Which sentence is written in Standard English?",
      correct:`I did ${obj} before tea.`,
      distractors:[`I done ${obj} before tea.`, `I do ${obj} before tea.`, `I have did ${obj} before tea.`],
      why:"Standard English uses ‘did’ here.",
      raw:`I done ${obj} before tea.`
    };
  }
  if (kind === 2) {
    const name = pick(rng, EXTRA_LEXICON.names);
    const ending = pick(rng, ["the answer yet","where the hall is","why the gate is locked","how to fold the map"]);
    return {
      stem:"Which sentence is written in Standard English?",
      correct:`${name} doesn't know ${ending}.`,
      distractors:[`${name} don't know ${ending}.`, `${name} didn't know ${ending}.`, `${name} not know ${ending}.`],
      why:"With a singular subject in the present, Standard English uses ‘doesn't’.",
      raw:`${name} don't know ${ending}.`
    };
  }
  const name = pick(rng, EXTRA_LEXICON.names);
  const thing = pick(rng, ["the comet","the notice","the trophy","the lost glove"]);
  const time = pick(rng, ["last night","yesterday","on Monday","after school"]);
  return {
    stem:"Which sentence is written in Standard English?",
    correct:`${name} saw ${thing} ${time}.`,
    distractors:[`${name} seen ${thing} ${time}.`, `${name} has saw ${thing} ${time}.`, `${name} see ${thing} ${time}.`],
    why:"In Standard English, the simple past form here is ‘saw’.",
    raw:`${name} seen ${thing} ${time}.`
  };
}

function generateTenseCase(rng) {
  const verb = pick(rng, EXTRA_LEXICON.verbsRich.filter(v => v.base !== "carry"));
  const object = pick(rng, ["the project","the bag","the poster","the display","the plan"]);
  const singular = rng() < 0.5;
  const subject = singular ? pick(rng, [pick(rng, EXTRA_LEXICON.names), "She", "He"]) : pick(rng, ["They","We","The pupils"]);
  const have = (subject === "They" || subject === "We" || subject === "The pupils") ? "have" : "has";
  const be = (subject === "They" || subject === "We" || subject === "The pupils") ? "are" : "is";
  const kind = randInt(rng, 0, 2);
  if (kind === 0) {
    const signal = pick(rng, ["already","just","today"]);
    return {
      stem:`Choose the verb form that best completes the sentence: ${subject} ___ ${object} ${signal}.`,
      correct:`${have} ${verb.part}`,
      options:[`${have} ${verb.part}`, verb.past, `had ${verb.part}`, `${be} ${verb.ing}`],
      why:"The present perfect links an earlier action to the present.",
      answerText:`${subject} ${have} ${verb.part} ${object} ${signal}.`
    };
  }
  if (kind === 1) {
    const time = pick(rng, ["yesterday","last night","on Monday","before lunch yesterday"]);
    return {
      stem:`Choose the verb form that best completes the sentence: ${time}, ${subject} ___ ${object}.`,
      correct:verb.past,
      options:[verb.past, `${have} ${verb.part}`, `had ${verb.part}`, `${be} ${verb.ing}`],
      why:"A finished time expression such as ‘yesterday’ calls for the simple past.",
      answerText:`${capFirst(time)}, ${subject} ${verb.past} ${object}.`
    };
  }
  const laterEvent = pick(rng, ["the bell rang","the coach arrived","the rain started","the lesson began"]);
  return {
    stem:`Choose the verb form that best completes the sentence: By the time ${laterEvent}, ${subject} ___ ${object}.`,
    correct:`had ${verb.part}`,
    options:[`had ${verb.part}`, verb.past, `${have} ${verb.part}`, `${be} ${verb.ing}`],
    why:"The past perfect shows an earlier past action before another past event.",
    answerText:`By the time ${laterEvent}, ${subject} had ${verb.part} ${object}.`
  };
}

function generatePassiveCase(rng) {
  const agent = pick(rng, EXTRA_LEXICON.names);
  const obj = pick(rng, EXTRA_LEXICON.objects);
  const verb = pick(rng, EXTRA_LEXICON.verbsRich.filter(v => ["open","pack","carry","lift","paint","clean","wash"].includes(v.base)));
  const tail = pick(rng, ["", " before lunch", " after the match", " this morning"]);
  if (seededBool(rng)) {
    return {
      raw:`${capFirst(obj)} was ${verb.part} by ${agent}${tail}.`,
      accepted:[`${agent} ${verb.past} ${obj}${tail}.`],
      why:"To rewrite in the active, move the doer into the subject position and keep the tense the same."
    };
  }
  return {
    raw:`${capFirst(obj)} is ${verb.part} by ${agent}${tail}.`,
    accepted:[`${agent} ${verb.s} ${obj}${tail}.`],
    why:"Keep the tense steady when moving from passive to active voice."
  };
}

function seededBool(rng) { return rng() < 0.5; }

function generateRelativeClauseCase(rng) {
  const kind = randInt(rng, 0, 1);
  if (kind === 0) {
    const noun = pick(rng, ["runner","teacher","boy","girl"]);
    const detail = pick(rng, ["who wore a blue cap","who was first in line","who had lost a glove","who carried the flag"]);
    const correct = `The ${noun} ${detail} waved to the crowd.`;
    const distractors = [
      `When the ${noun} wore a blue cap, the crowd waved.`,
      `The ${noun} in a blue cap waved to the crowd.`,
      `The ${noun} waved to the crowd quickly.`
    ];
    return { correct, distractors, why:"A relative clause adds information about a noun, here using ‘who’." };
  }
  const noun = pick(rng, ["book","bag","tent","coat"]);
  const detail = pick(rng, ["that everyone wanted","which Ben packed carefully","that belonged to the club","which stood by the window"]);
  const correct = `The ${noun} ${detail} was easy to spot.`;
  const distractors = [
    `When everyone wanted the ${noun}, it was easy to spot.`,
    `The club ${noun} was easy to spot.`,
    `The ${noun} was easy to spot outside.`
  ];
  return { correct, distractors, why:"A relative clause gives extra information about the noun using words such as ‘that’ or ‘which’." };
}

function generatePronounCohesionCase(rng) {
  const a = pick(rng, EXTRA_LEXICON.names);
  const b = pick(rng, EXTRA_LEXICON.names.filter(n => n !== a));
  const item = pick(rng, ["map","torch","ticket","glove","note"]);
  const reason = pick(rng, [
    `${b} was leaving first`,
    `${a} had found it earlier`,
    `${b} needed it for the next lesson`,
    `${a} was carrying too many bags`
  ]);
  let correct = "";
  let distractors = [];
  if (reason.includes(b)) {
    correct = `${a} gave ${b} the ${item} because ${b} ${reason.split(`${b} `)[1]}.`;
    distractors = [
      `${a} gave ${b} the ${item} because she ${reason.split(`${b} `)[1]}.`,
      `${a} gave ${b} it because ${b} ${reason.split(`${b} `)[1]}.`,
      `${a} gave the ${item} to her because ${b} ${reason.split(`${b} `)[1]}.`
    ];
  } else {
    correct = `${a} gave ${b} the ${item} because ${a} ${reason.split(`${a} `)[1]}.`;
    distractors = [
      `${a} gave ${b} the ${item} because she ${reason.split(`${a} `)[1]}.`,
      `${a} gave ${b} it because ${a} ${reason.split(`${a} `)[1]}.`,
      `${a} gave the ${item} to ${b} because she ${reason.split(`${a} `)[1]}.`
    ];
  }
  return { prompt:"Which version keeps the meaning clearest?", correct, distractors, why:"Good cohesion avoids unnecessary repetition without making the referent unclear." };
}

function generateSubjectObjectCase(rng) {
  const adv = pick(rng, EXTRA_LEXICON.fronted);
  const subject = pick(rng, EXTRA_LEXICON.names);
  const verb = pick(rng, EXTRA_LEXICON.verbsRich.filter(v => ["carry","pack","open","wash","paint","lift","clean"].includes(v.base)));
  const object = pick(rng, EXTRA_LEXICON.objects);
  const tail = pick(rng, ["across the yard","before the lesson","after the bell","into the hall"]);
  const sentence = `${adv}, ${subject} ${verb.past} ${object} ${tail}.`;
  const askForObject = rng() < 0.5;
  const correct = askForObject ? object : subject;
  const options = askForObject
    ? [object, subject, adv, tail]
    : [subject, object, adv, tail];
  return {
    sentence,
    ask: askForObject ? "Which words are the object in this sentence?" : "Which word or words are the subject in this sentence?",
    correct,
    options,
    why: askForObject
      ? "The object receives the action. The subject does the action."
      : "The subject is the person or thing doing the action."
  };
}

function generateFormalityCase(rng) {
  return EXTRA_LEXICON.formalFrames[seededIndex(rng, EXTRA_LEXICON.formalFrames.length)];
}

function generateModalCase(rng) {
  return EXTRA_LEXICON.modalFrames[seededIndex(rng, EXTRA_LEXICON.modalFrames.length)];
}

function seededIndex(rng, len) { return Math.max(0, Math.min(len - 1, Math.floor(rng() * len))); }

function isPunctuationSkill(skillId) {
  return PUNCTUATION_SKILL_IDS.includes(skillId);
}

const TEMPLATE_MAP = Object.fromEntries(TEMPLATES.map(template => [template.id, template]));

function stripLegacyHtml(value) {
  return cleanSpaces(String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/li>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"'));
}

function cloneSerialisable(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function serialiseInputSpec(inputSpec) {
  if (!inputSpec || typeof inputSpec !== 'object' || Array.isArray(inputSpec)) return null;
  return cloneSerialisable(inputSpec);
}

function sortByStableJson(a, b) {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function canonicaliseInputSpecForSignature(inputSpec) {
  const spec = serialiseInputSpec(inputSpec);
  if (!spec) return null;

  if (Array.isArray(spec.options)) {
    spec.options = spec.options
      .map((option) => ({
        label: cleanSpaces(option?.label || option?.value || ''),
        value: cleanSpaces(option?.value || option?.label || ''),
      }))
      .sort(sortByStableJson);
  }

  if (Array.isArray(spec.columns)) {
    spec.columns = spec.columns.map((column) => cleanSpaces(column)).sort();
  }

  if (Array.isArray(spec.rows)) {
    spec.rows = spec.rows
      .map((row) => ({
        label: cleanSpaces(row?.label || ''),
      }))
      .sort(sortByStableJson);
  }

  return spec;
}

function stableStringHash(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

export function grammarTemplateGeneratorFamilyId(template = {}) {
  const raw = template.generatorFamilyId || template.id || 'unknown';
  return String(raw).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

export function grammarQuestionVariantSignature(question) {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return null;
  const payload = {
    promptText: stripLegacyHtml(question.stemHtml),
    inputSpec: canonicaliseInputSpecForSignature(question.inputSpec),
    questionType: question.questionType || '',
    skillIds: Array.isArray(question.skillIds) ? question.skillIds.slice().sort() : [],
  };
  return `grammar-v1:${stableStringHash(JSON.stringify(payload))}`;
}

export const GRAMMAR_CONTENT_RELEASE_ID = 'grammar-qg-p1-2026-04-28';
export const GRAMMAR_MISCONCEPTIONS = Object.freeze(MISCONCEPTIONS);
export const GRAMMAR_MINIMAL_HINTS = Object.freeze(MINIMAL_HINTS);
export const GRAMMAR_QUESTION_TYPES = Object.freeze(QUESTION_TYPES);
export const GRAMMAR_PUNCTUATION_CONCEPT_IDS = Object.freeze(PUNCTUATION_SKILL_IDS.slice());
export const GRAMMAR_CONCEPTS = Object.freeze(Object.entries(SKILLS).map(([id, skill]) => Object.freeze({
  id,
  domain: skill.domain,
  name: skill.name,
  summary: skill.summary,
  notices: Object.freeze((skill.notices || []).slice()),
  worked: Object.freeze({ ...(skill.worked || {}) }),
  contrast: Object.freeze({ ...(skill.contrast || {}) }),
  punctuationForGrammar: PUNCTUATION_SKILL_IDS.includes(id),
})));
export const GRAMMAR_TEMPLATES = Object.freeze(TEMPLATES);
export const GRAMMAR_TEMPLATE_MAP = Object.freeze(TEMPLATE_MAP);

export function grammarTemplateMetadata(template = {}) {
  return {
    id: template.id,
    label: template.label,
    domain: template.domain,
    questionType: template.questionType,
    difficulty: Number(template.difficulty) || 1,
    satsFriendly: Boolean(template.satsFriendly),
    isSelectedResponse: Boolean(template.isSelectedResponse),
    generative: Boolean(template.generative),
    generatorFamilyId: grammarTemplateGeneratorFamilyId(template),
    answerSpecKind: template.answerSpecKind || null,
    requiresAnswerSpec: Boolean(template.requiresAnswerSpec || template.answerSpecKind),
    tags: Object.freeze((template.tags || []).slice()),
    skillIds: Object.freeze((template.skillIds || []).slice()),
  };
}

export const GRAMMAR_TEMPLATE_METADATA = Object.freeze(GRAMMAR_TEMPLATES.map(grammarTemplateMetadata));

export function grammarConceptById(conceptId) {
  return GRAMMAR_CONCEPTS.find((concept) => concept.id === conceptId) || null;
}

export function grammarTemplateById(templateId) {
  return GRAMMAR_TEMPLATE_MAP[templateId] || null;
}

export function createGrammarQuestion({ templateId, seed } = {}) {
  const template = grammarTemplateById(templateId);
  if (!template || typeof template.generator !== 'function') return null;
  return template.generator(Number(seed) || 0);
}

export function evaluateGrammarQuestion(question, response = {}) {
  if (!question || typeof question.evaluate !== 'function') return null;
  return question.evaluate(response && typeof response === 'object' && !Array.isArray(response) ? response : {});
}

export function serialiseGrammarQuestion(question) {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return null;
  return {
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    templateId: question.templateId,
    templateLabel: question.templateLabel,
    domain: question.domain,
    skillIds: (question.skillIds || []).slice(),
    questionType: question.questionType,
    seed: Number(question.seed) || 0,
    itemId: question.itemId,
    marks: Number(question.marks) || 1,
    promptText: stripLegacyHtml(question.stemHtml),
    inputSpec: serialiseInputSpec(question.inputSpec),
    solutionLines: (question.solutionLines || []).map(stripLegacyHtml),
    reflectionPrompt: stripLegacyHtml(question.reflectionPrompt || ''),
    checkLine: stripLegacyHtml(question.checkLine || ''),
    replay: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      templateId: question.templateId,
      seed: Number(question.seed) || 0,
      itemId: question.itemId,
      conceptIds: (question.skillIds || []).slice(),
      questionType: question.questionType,
    },
  };
}
