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
    ],
    [
      "The sun broke through the clouds",
      "the ice on the pond started to melt"
    ],
    [
      "The tide was rising quickly",
      "the fishermen hauled in their nets"
    ],
    [
      "The whistle blew",
      "the runners set off down the track"
    ],
    [
      "The audience clapped loudly",
      "the choir took a bow"
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
    },
    {
      intro: "The recipe called for five ingredients",
      items: [
        "flour",
        "butter",
        "eggs",
        "sugar",
        "milk"
      ]
    },
    {
      intro: "Three countries were represented at the fair",
      items: [
        "France",
        "Japan",
        "Brazil"
      ]
    },
    {
      intro: "The explorer carried four essential supplies",
      items: [
        "a compass",
        "a water bottle",
        "a rope",
        "a first-aid kit"
      ]
    },
    {
      intro: "The school banned three items from the playground",
      items: [
        "skateboards",
        "glass bottles",
        "footballs"
      ]
    },
    {
      intro: "The gardener planted four types of vegetable",
      items: [
        "carrots",
        "beans",
        "potatoes",
        "onions"
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
    ],
    [
      "She had made her decision",
      "the letter would be posted today"
    ],
    [
      "The message was clear",
      "everyone must leave the building at once"
    ],
    [
      "He remembered just one rule",
      "never open the gate after dark"
    ],
    [
      "The result surprised us all",
      "the youngest team had won"
    ],
    [
      "Only one thing could save us",
      "the map in her rucksack"
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
    },
    {
      ask: "Which sentence means the cabinet is used for drying clothes?",
      options: [
        "Dad opened the clothes-drying cabinet in the hall.",
        "Dad opened the clothes drying cabinet in the hall.",
        "Dad opened the cabinet for the hall clothes.",
        "Dad opened the drying clothes in the cabinet."
      ],
      correct: "Dad opened the clothes-drying cabinet in the hall.",
      why: "The hyphen links ‘clothes-drying’ into one compound modifier describing the cabinet."
    },
    {
      ask: "Which sentence means the test is well known?",
      options: [
        "The teacher set a well-known test for the class.",
        "The teacher set a well known test for the class.",
        "The teacher knew the test well for the class.",
        "The teacher set a known well test for the class."
      ],
      correct: "The teacher set a well-known test for the class.",
      why: "The hyphen joins ‘well-known’ into a single compound adjective before the noun."
    },
    {
      ask: "Which sentence means the building has ten storeys?",
      options: [
        "We looked up at the ten-storey building.",
        "We looked up at the ten storey building.",
        "We looked up at ten buildings in a storey.",
        "We looked up at the storey with ten buildings."
      ],
      correct: "We looked up at the ten-storey building.",
      why: "The hyphen links ‘ten-storey’ into one compound modifier describing the building."
    },
    {
      ask: "Which sentence means the race lasts for three miles?",
      options: [
        "Sam ran in the three-mile race on Saturday.",
        "Sam ran in the three mile race on Saturday.",
        "Sam ran three miles in a race on Saturday.",
        "Sam ran in a race with three miles on Saturday."
      ],
      correct: "Sam ran in the three-mile race on Saturday.",
      why: "The hyphen joins ‘three-mile’ so it works as a single modifier before the noun."
    },
    {
      ask: "Which sentence means the shop has second-hand items?",
      options: [
        "Mum found a bargain at the second-hand shop.",
        "Mum found a bargain at the second hand shop.",
        "Mum found a second bargain handed to her at the shop.",
        "Mum found a shop with a second hand at the counter."
      ],
      correct: "Mum found a bargain at the second-hand shop.",
      why: "The hyphen turns ‘second-hand’ into one describing idea for the shop."
    },
    {
      ask: "Which sentence means the child is six years old?",
      options: [
        "The six-year-old child ran across the park.",
        "The six year old child ran across the park.",
        "The child ran across the park for six years.",
        "The child of six ran old across the park."
      ],
      correct: "The six-year-old child ran across the park.",
      why: "Hyphens connect ‘six-year-old’ into a single compound adjective before the noun."
    },
    {
      ask: "Which sentence means the ice cream is sugar free?",
      options: [
        "Jay chose the sugar-free ice cream from the van.",
        "Jay chose the sugar free ice cream from the van.",
        "Jay chose the ice cream and sugar from the free van.",
        "Jay freed the sugar from the ice cream van."
      ],
      correct: "Jay chose the sugar-free ice cream from the van.",
      why: "The hyphen makes ‘sugar-free’ one combined describing idea for the ice cream."
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
        "Some pupils didn’t come on the trip.",
        "Quite a few pupils were missing from it."
      ],
      why: "Formal writing often chooses more precise vocabulary and sentence structure."
    },
    {
      prompt: "Which sentence is most appropriate for a school newsletter?",
      correct: "We are delighted to announce the opening of the new library.",
      distractors: [
        "We’re so excited about the new library opening!",
        "The new library is opening and it’s going to be great.",
        "Guess what – there’s a new library starting up."
      ],
      why: "Formal register uses measured language rather than informal exclamations."
    },
    {
      prompt: "Choose the sentence that fits best in a formal invitation.",
      correct: "Guests are kindly requested to arrive by half past six.",
      distractors: [
        "Can everyone turn up by half six?",
        "Please try to get there by about six-thirty.",
        "Everyone should come at like half six."
      ],
      why: "Formal invitations use passive or impersonal constructions and precise time references."
    },
    {
      prompt: "Which sentence would be most suitable for a formal science report?",
      correct: "The experiment was conducted under controlled conditions.",
      distractors: [
        "We just did the experiment and it worked out fine.",
        "The experiment happened and everything was OK.",
        "We tried the experiment and it sort of worked."
      ],
      why: "Formal scientific writing uses passive constructions and precise vocabulary."
    },
    {
      prompt: "Which sentence is most appropriate for an official complaint letter?",
      correct: "I wish to draw your attention to the unsatisfactory service we received.",
      distractors: [
        "I want to tell you the service was rubbish.",
        "Your service was awful and I'm not happy about it.",
        "Just so you know, the service was really bad."
      ],
      why: "Formal complaint letters use measured, impersonal language rather than emotional outbursts."
    },
    {
      prompt: "Which sentence fits best in a formal assembly speech?",
      correct: "It is with great pleasure that I introduce our guest speaker.",
      distractors: [
        "I'm dead chuffed to get our speaker up here.",
        "Here's the person who's going to talk to us now.",
        "So yeah, this is the speaker we got in today."
      ],
      why: "Formal spoken register avoids slang and uses established ceremonial phrases."
    },
    {
      prompt: "Which sentence is most suitable for a formal thank-you letter?",
      correct: "I am writing to express my gratitude for your generous donation.",
      distractors: [
        "Thanks so much for the cash you gave us.",
        "Cheers for the donation – it was really kind.",
        "Just wanted to say thanks for giving us that money."
      ],
      why: "Formal thank-you letters use measured expressions rather than chatty abbreviations."
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
      why: "’Must’ shows strongest obligation."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: The clouds are dark, but the rain has not started. It ___ rain later.",
      correct: "might",
      distractors: [
        "must",
        "should",
        "will"
      ],
      why: "’Might’ shows possibility, not certainty."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: You are giving advice to a friend. You ___ begin with the easier question.",
      correct: "should",
      distractors: [
        "must",
        "might",
        "will"
      ],
      why: "’Should’ is the modal of advice here."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: The timetable is fixed. The coach ___ leave at 9 o’clock.",
      correct: "will",
      distractors: [
        "might",
        "should",
        "must"
      ],
      why: "’Will’ fits a definite future event here."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: The teacher says this is allowed. You ___ use a dictionary during the test.",
      correct: "may",
      distractors: [
        "must",
        "will",
        "might"
      ],
      why: "’May’ is the modal of permission here."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: The swimmers are very strong. They ___ cross the lake without stopping.",
      correct: "could",
      distractors: [
        "must",
        "should",
        "will"
      ],
      why: "’Could’ expresses ability or capacity here."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: The ice is very thin. You ___ not walk on the pond.",
      correct: "must",
      distractors: [
        "might",
        "could",
        "would"
      ],
      why: "’Must not’ expresses a strong prohibition here."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: The forecast says sun all day. It ___ be warm enough for a picnic.",
      correct: "should",
      distractors: [
        "must",
        "might",
        "could"
      ],
      why: "’Should’ expresses a reasonable expectation based on evidence."
    },
    {
      prompt: "Choose the modal verb that best fits the meaning: Ask your parents first. They ___ let you come to the party.",
      correct: "might",
      distractors: [
        "must",
        "will",
        "shall"
      ],
      why: "’Might’ shows an uncertain possibility that depends on someone else’s decision."
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
    requiresAnswerSpec: true,
    answerSpecKind: "manualReviewOnly",
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
          const answerSpec = manualReviewOnlyAnswerSpec({
            feedbackLong:"Your noun phrase has been saved for review. It is not auto-marked for mastery."
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>Build a noun phrase of at least three words to complete the sentence below.</p><p><strong>${escapeHtml(item.sentence)}</strong></p>`,
            inputSpec:{ type:"multi", fields:item.fields },
            solutionLines:[
              "Choose a sensible determiner/adjective opening, then a noun, then extra detail attached to that noun.",
              `A strong answer is: ${item.final}.`
            ],
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "punctuationPattern",
    tags: [
      "surgery"
    ],
    skillIds: [
      "adverbials"
    ],
    generator(seed) {
          const item = FRONTED_FIX_ITEMS[seed % FRONTED_FIX_ITEMS.length];
          const answerSpec = punctuationPatternAnswerSpec([item.answer], [item.raw], {
            maxScore:2,
            misconception:"fronted_adverbial_confusion",
            feedbackLong:`The correct sentence is: ${item.answer}`,
            answerText:item.answer
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>${item.prompt}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Type the corrected sentence here." },
            solutionLines:[
              "Spot the opening adverbial telling us when.",
              "Add a comma after that opening phrase.",
              `Correct answer: ${item.answer}`
            ],
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "acceptedSet",
    tags: [
      "builder",
      "surgery"
    ],
    skillIds: [
      "clauses"
    ],
    generator(seed) {
          const item = CLAUSE_COMBINE_ITEMS[seed % CLAUSE_COMBINE_ITEMS.length];
          const answerSpec = acceptedSetAnswerSpec(item.accepted, [], {
            maxScore:2,
            misconception:"subordinate_clause_confusion",
            punctuationMisconception:"punctuation_precision",
            feedbackLong:`A correct answer is: ${item.accepted[0]}`,
            answerText:item.accepted[0]
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>${item.instruction}</p><p><strong>${item.parts[0]}</strong><br><strong>${item.parts[1]}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Combined sentence", placeholder:"Write one complete sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "normalisedText",
    tags: [
      "surgery",
      "builder"
    ],
    skillIds: [
      "tense_aspect"
    ],
    generator(seed) {
          const item = TENSE_REWRITE_ITEMS[seed % TENSE_REWRITE_ITEMS.length];
          const answerSpec = normalisedTextAnswerSpec(item.accepted, [], {
            maxScore:2,
            misconception:"tense_confusion",
            feedbackLong:`A correct answer is: ${item.accepted[0]}`,
            answerText:item.accepted[0]
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>${item.instruction}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Rewritten sentence", placeholder:"Write the full sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "normalisedText",
    tags: [
      "builder",
      "surgery"
    ],
    skillIds: [
      "active_passive"
    ],
    generator(seed) {
          const item = ACTIVE_PASSIVE_ITEMS[seed % ACTIVE_PASSIVE_ITEMS.length];
          const answerSpec = normalisedTextAnswerSpec(item.accepted, [], {
            maxScore:2,
            misconception:"active_passive_confusion",
            feedbackLong:`A correct answer is: ${item.accepted[0]}`,
            answerText:item.accepted[0]
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>${item.instruction}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Rewritten sentence", placeholder:"Write the full transformed sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "punctuationPattern",
    tags: [
      "surgery"
    ],
    skillIds: [
      "parenthesis_commas"
    ],
    generator(seed) {
          const item = PARENTHESIS_FIX_ITEMS[seed % PARENTHESIS_FIX_ITEMS.length];
          const answerSpec = punctuationPatternAnswerSpec(item.accepted, [item.raw], {
            maxScore:2,
            misconception:"parenthesis_confusion",
            feedbackLong:`A correct answer is: ${item.accepted[0]}`,
            answerText:item.accepted[0]
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>${item.prompt}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Type the corrected sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "punctuationPattern",
    tags: [
      "surgery"
    ],
    skillIds: [
      "speech_punctuation"
    ],
    generator(seed) {
          const item = SPEECH_FIX_ITEMS[seed % SPEECH_FIX_ITEMS.length];
          const answerSpec = punctuationPatternAnswerSpec(item.accepted, [item.raw], {
            maxScore:2,
            misconception:"speech_punctuation_confusion",
            feedbackLong:`A correct answer is: ${item.accepted[0]}`,
            answerText:item.accepted[0]
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>${item.prompt}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Correctly punctuated sentence", placeholder:"Type the corrected sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "manualReviewOnly",
    tags: [
      "surgery"
    ],
    skillIds: [
      "standard_english"
    ],
    generator(seed) {
          const item = STANDARD_FIX_ITEMS[seed % STANDARD_FIX_ITEMS.length];
          const answerSpec = manualReviewOnlyAnswerSpec({
            feedbackLong:"Your Standard English rewrite has been saved for review. It is not auto-marked for mastery."
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>${item.instruction}</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Write the corrected sentence." },
            solutionLines:item.solution,
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "punctuationPattern",
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
          const answerSpec = punctuationPatternAnswerSpec(accepted, [raw], {
            maxScore:2,
            misconception:"fronted_adverbial_confusion",
            feedbackLong:`A correct answer is: ${accepted[0]}`,
            answerText:accepted[0]
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>Rewrite the sentence with the punctuation corrected.</p><p><strong>${escapeHtml(raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Write the corrected sentence." },
            solutionLines:[
              "Spot the opening time, place or manner phrase.",
              "Because the fronted adverbial comes first, place a comma after it.",
              `A correct answer is: ${accepted[0]}`
            ],
            contrastHtml:`<div class="contrast-card"><strong>Useful contrast</strong><p style="margin:8px 0 4px;">${escapeHtml(accepted[0])}</p><p style="margin:0 0 4px;">${escapeHtml(raw)}</p><p style="margin:0;">The comma separates the opening adverbial from the main clause.</p></div>`,
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
      "identify",
      "qg-p5"
    ],
    skillIds: [
      "boundary_punctuation"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const pair = pickBySeed(seed, EXTRA_LEXICON.clausePairs);
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
    requiresAnswerSpec: true,
    answerSpecKind: "punctuationPattern",
    tags: [
      "surgery",
      "qg-p5"
    ],
    skillIds: [
      "boundary_punctuation"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = pickBySeed(seed, EXTRA_LEXICON.colonLists);
          const raw = ensureSentenceEnd(`${item.intro} ${item.items.join(", ")}`);
          const accepted = [ensureSentenceEnd(`${item.intro}: ${item.items.join(", ")}`)];
          const answerSpec = punctuationPatternAnswerSpec(accepted, [raw], {
            maxScore:2,
            misconception:"boundary_punctuation_confusion",
            feedbackLong:`A correct answer is: ${accepted[0]}`,
            answerText:accepted[0]
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>Rewrite the sentence with a colon in the correct place.</p><p><strong>${escapeHtml(raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Write the corrected sentence." },
            solutionLines:[
              "Check that the words before the list make a complete clause.",
              "A colon can introduce the list that follows.",
              `A correct answer is: ${accepted[0]}`
            ],
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "punctuationPattern",
    tags: [
      "surgery",
      "qg-p5"
    ],
    skillIds: [
      "boundary_punctuation"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const pair = pickBySeed(seed, EXTRA_LEXICON.dashBoundaries);
          const raw = ensureSentenceEnd(`${pair[0]} ${pair[1]}`);
          const accepted = dedupePlain([
            `${pair[0]} – ${pair[1]}.`,
            `${pair[0]} — ${pair[1]}.`,
            `${pair[0]} - ${pair[1]}.`
          ]);
          const answerSpec = punctuationPatternAnswerSpec(accepted, [raw], {
            maxScore:2,
            misconception:"boundary_punctuation_confusion",
            feedbackLong:`A correct answer is: ${accepted[0]}`,
            answerText:accepted[0]
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>Rewrite the sentence with a dash in the correct place.</p><p><strong>${escapeHtml(raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Write the corrected sentence." },
            solutionLines:[
              "Both parts are strongly linked, and the second part explains or expands the first.",
              "A dash can mark that strong break.",
              `A correct answer is: ${accepted[0]}`
            ],
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
      "identify",
      "qg-p5"
    ],
    skillIds: [
      "hyphen_ambiguity"
    ],
    generator(seed) {
          const item = pickBySeed(seed, EXTRA_LEXICON.hyphenPrompts);
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
    requiresAnswerSpec: true,
    answerSpecKind: "punctuationPattern",
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
          const answerSpec = punctuationPatternAnswerSpec(accepted, [raw], {
            maxScore:2,
            misconception:"speech_punctuation_confusion",
            feedbackLong:`A correct answer is: ${accepted[0]}`,
            answerText:accepted[0]
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>Punctuate the direct speech correctly.</p><p><strong>${escapeHtml(raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Correctly punctuated sentence", placeholder:"Type the corrected sentence." },
            solutionLines,
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "normalisedText",
    tags: [
      "surgery"
    ],
    skillIds: [
      "standard_english"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generateStandardEnglishCase(rng);
          const answerSpec = normalisedTextAnswerSpec([item.correct], [item.raw], {
            maxScore:2,
            misconception:"standard_english_confusion",
            feedbackLong:`A correct answer is: ${item.correct}`,
            answerText:item.correct
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>Rewrite the sentence in Standard English.</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Write the corrected sentence." },
            solutionLines:[
              "Find the non-standard spoken form.",
              "Replace it with the Standard English verb form.",
              `A correct answer is: ${item.correct}`
            ],
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    tags: [
      "qg-p5"
    ],
    skillIds: [
      "modal_verbs"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generateModalCase(rng, seed);
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
    tags: [
      "qg-p5"
    ],
    skillIds: [
      "formality"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generateFormalityCase(rng, seed);
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
    requiresAnswerSpec: true,
    answerSpecKind: "normalisedText",
    tags: [
      "builder"
    ],
    skillIds: [
      "active_passive"
    ],
    generator(seed) {
          const rng = mulberry32(seed);
          const item = generatePassiveCase(rng);
          const answerSpec = normalisedTextAnswerSpec(item.accepted, [item.raw], {
            maxScore:2,
            misconception:"active_passive_confusion",
            feedbackLong:`A correct answer is: ${item.accepted[0]}`,
            answerText:item.accepted[0]
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>Rewrite the sentence in the active voice.</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
            inputSpec:{ type:"textarea", label:"Rewritten sentence", placeholder:"Write the full sentence." },
            solutionLines:[
              "Find the doer after ‘by’ in the passive sentence.",
              "Move that doer into the subject position and keep the tense steady.",
              `A correct answer is: ${item.accepted[0]}`
            ],
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "manualReviewOnly",
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
          const answerSpec = manualReviewOnlyAnswerSpec({
            feedbackLong:"Your fronted-adverbial sentence has been saved for review. It is not auto-marked for mastery."
          });
          return makeBaseQuestion(this, seed, {
            marks:2,
            answerSpec,
            stemHtml:`<p>Use this opening phrase and clause to build one correct sentence.</p><p><strong>Opening phrase:</strong> ${escapeHtml(adv)}</p><p><strong>Main clause:</strong> ${escapeHtml(capFirst(clause))}</p>`,
            inputSpec:{ type:"textarea", label:"Your sentence", placeholder:"Write one complete sentence." },
            solutionLines:[
              "Put the fronted adverbial first.",
              "Add a comma after it before the main clause begins.",
              `A correct answer is: ${accepted[0]}`
            ],
            evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
      "identify",
      "qg-p5"
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
                why:"’During’ introduces the phrase ‘during the storm’, so it is a preposition."
              },
              {
                stem:"In the sentence <strong>The old bridge creaked loudly.</strong>, what is the word <strong>loudly</strong>?",
                correct:"adverb",
                distractors:["adjective","verb","preposition"],
                why:"’Loudly’ tells us how the bridge creaked, so it is an adverb."
              },
              {
                stem:"In the sentence <strong>She packed her bag and left.</strong>, what is the word <strong>and</strong>?",
                correct:"conjunction",
                distractors:["preposition","adverb","pronoun"],
                why:"’And’ joins two clauses together, so it is a conjunction."
              },
              {
                stem:"In the sentence <strong>Several children waited by the gate.</strong>, what is the word <strong>Several</strong>?",
                correct:"determiner",
                distractors:["adjective","pronoun","adverb"],
                why:"’Several’ tells us how many children, working as a determiner before the noun."
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
    requiresAnswerSpec: true,
    answerSpecKind: "manualReviewOnly",
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
            const answerSpec = manualReviewOnlyAnswerSpec({
              feedbackLong:"Your expanded noun phrase has been saved for review. It is not auto-marked for mastery."
            });
            return makeBaseQuestion(this, seed, {
              marks:2,
              answerSpec,
              stemHtml:`<p>Use all the words to build an <strong>expanded noun phrase</strong> that could complete the sentence.</p><p><strong>Words:</strong> the / ${sizeWord} / ${colourWord} / ${noun}</p><p><strong>${sentence}</strong></p>`,
              inputSpec:{ type:"text", label:"Expanded noun phrase", placeholder:"Type the noun phrase." },
              solutionLines:[
                "Start with the determiner, then add the describing words, then finish with the noun.",
                `A clear expanded noun phrase is: ${correct}.`,
                "The whole phrase centres on the noun at the end."
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "acceptedSet",
    tags: [
      "builder"
    ],
    skillIds: [
      "clauses"
    ],
    generator(seed) {
            const rng = mulberry32(seed);
            const flatBank = [
              { conjunction:"because", pair:["we stayed inside","it was raining"] },
              { conjunction:"because", pair:["Ben hurried home","he had forgotten his kit"] },
              { conjunction:"because", pair:["Mia smiled","she had found the missing map"] },
              { conjunction:"although", pair:["Mia was tired","she finished the race"] },
              { conjunction:"although", pair:["the path was muddy","the walkers kept going"] },
              { conjunction:"although", pair:["the room was noisy","Jay carried on reading"] },
              { conjunction:"when", pair:["the bell rang","the pupils lined up"] },
              { conjunction:"when", pair:["the gate opened","the crowd cheered"] },
              { conjunction:"when", pair:["the lights went out","everyone fell silent"] },
              { conjunction:"if", pair:["you need help","call the office"] },
              { conjunction:"if", pair:["the rain starts","go inside the tent"] },
              { conjunction:"if", pair:["the torch stops working","fetch the spare one"] }
            ];
            const item = pickBySeed(seed, flatBank);
            const conjunction = item.conjunction;
            const pair = item.pair;
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
            const answerSpec = acceptedSetAnswerSpec(accepted, [], {
              maxScore:2,
              misconception:"subordinate_clause_confusion",
              punctuationMisconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${accepted[0]}`,
              answerText:accepted[0]
            });
            return makeBaseQuestion(this, seed, {
              marks:2,
              answerSpec,
              stemHtml:`<p>Combine these ideas into one sentence using <strong>${conjunction}</strong>.</p><ul><li>${capFirst(main)}.</li><li>${capFirst(sub)}.</li></ul>`,
              inputSpec:{ type:"textarea", label:"Combined sentence", placeholder:"Write one combined sentence." },
              solutionLines:[
                "Use the conjunction to join the ideas so the relationship is clear.",
                accepted[0],
                "Check that the sentence is complete and punctuated as one whole sentence."
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "punctuationPattern",
    tags: [
      "surgery",
      "qg-p5"
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
              },
              {
                raw:"The old bridge as everyone knew was unsafe.",
                accepted:"The old bridge, as everyone knew, was unsafe.",
                why:"The phrase ‘as everyone knew’ is extra commentary inserted into the sentence."
              },
              {
                raw:"The visitors despite the rain stayed until the end.",
                accepted:"The visitors, despite the rain, stayed until the end.",
                why:"The phrase ‘despite the rain’ adds extra information about the circumstances."
              },
              {
                raw:"Her answer I think was correct.",
                accepted:"Her answer, I think, was correct.",
                why:"The phrase ‘I think’ is a parenthetical aside that could be removed."
              },
              {
                raw:"The new path believe it or not was finished in a day.",
                accepted:"The new path, believe it or not, was finished in a day.",
                why:"The phrase ‘believe it or not’ is an inserted aside adding the speaker’s surprise."
              },
              {
                raw:"The hall to be honest needed a new coat of paint.",
                accepted:"The hall, to be honest, needed a new coat of paint.",
                why:"The phrase ‘to be honest’ is parenthetical commentary by the writer."
              }
            ];
            const item = items[seed % items.length];
            const answerSpec = punctuationPatternAnswerSpec([item.accepted], [item.raw], {
              maxScore:2,
              misconception:"parenthesis_confusion",
              feedbackLong:`A correct answer is: ${item.accepted}`,
              answerText:item.accepted
            });
            return makeBaseQuestion(this, seed, {
              marks:2,
              answerSpec,
              stemHtml:`<p>Add commas to show the <strong>parenthesis</strong>.</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
              inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Type the corrected sentence." },
              solutionLines:[
                "Find the extra information that could be lifted out.",
                item.why,
                `A correct answer is: ${item.accepted}`
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
    requiresAnswerSpec: true,
    answerSpecKind: "punctuationPattern",
    tags: [
      "surgery",
      "qg-p5"
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
              },
              {
                raw:"The team needed a well earned break after the match.",
                accepted:"The team needed a well-earned break after the match.",
                why:"The hyphen joins 'well-earned' into one compound modifier before the noun."
              },
              {
                raw:"Ben wore his brand new trainers to the park.",
                accepted:"Ben wore his brand-new trainers to the park.",
                why:"The hyphen links 'brand-new' into a single compound adjective."
              },
              {
                raw:"We crossed the narrow, fast flowing stream.",
                accepted:"We crossed the narrow, fast-flowing stream.",
                why:"The hyphen joins 'fast-flowing' because both words describe the stream together."
              },
              {
                raw:"The school held a fun filled sports day on Friday.",
                accepted:"The school held a fun-filled sports day on Friday.",
                why:"The hyphen makes 'fun-filled' one describing idea modifying the sports day."
              },
              {
                raw:"Mia drew a life size portrait of her brother.",
                accepted:"Mia drew a life-size portrait of her brother.",
                why:"The hyphen makes 'life-size' a single compound adjective describing the portrait."
              }
            ];
            const item = items[seed % items.length];
            const answerSpec = punctuationPatternAnswerSpec([item.accepted], [item.raw], {
              maxScore:2,
              misconception:"punctuation_precision",
              feedbackLong:`A correct answer is: ${item.accepted}`,
              answerText:item.accepted
            });
            return makeBaseQuestion(this, seed, {
              marks:2,
              answerSpec,
              stemHtml:`<p>Rewrite the sentence with a <strong>hyphen</strong> to make the meaning clear.</p><p><strong>${escapeHtml(item.raw)}</strong></p>`,
              inputSpec:{ type:"textarea", label:"Corrected sentence", placeholder:"Type the corrected sentence." },
              solutionLines:[
                "Find the words that work together as one describing idea before the noun.",
                item.why,
                `A correct answer is: ${item.accepted}`
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
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
      "identify",
      "qg-p5"
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
              },
              {
                active:"The gardener trimmed the hedges on Monday.",
                passive:"The hedges were trimmed by the gardener on Monday.",
                distractors:[
                  "The gardener was trimming the hedges on Monday.",
                  "On Monday, the gardener trimmed the hedges."
                ],
                why:"The hedges receive the action and come first in the passive sentence."
              },
              {
                active:"Noah carried the boxes to the office.",
                passive:"The boxes were carried by Noah to the office.",
                distractors:[
                  "Noah was carrying the boxes to the office.",
                  "To the office, Noah carried the boxes."
                ],
                why:"In the passive, the boxes are placed before the doer."
              },
              {
                active:"The chef prepared the meal before noon.",
                passive:"The meal was prepared by the chef before noon.",
                distractors:[
                  "The chef was preparing the meal before noon.",
                  "Before noon, the chef prepared the meal."
                ],
                why:"The passive puts the thing affected (the meal) into the subject position."
              },
              {
                active:"Lena designed the poster for the fair.",
                passive:"The poster was designed by Lena for the fair.",
                distractors:[
                  "Lena was designing the poster for the fair.",
                  "For the fair, Lena designed the poster."
                ],
                why:"The poster receives the action and appears first in the passive form."
              },
              {
                active:"The librarian sorted the returned books.",
                passive:"The returned books were sorted by the librarian.",
                distractors:[
                  "The librarian was sorting the returned books.",
                  "The returned books needed sorting by the librarian."
                ],
                why:"In the passive, the books are the grammatical subject and the librarian follows 'by'."
              },
              {
                active:"Sam repaired the puncture during break.",
                passive:"The puncture was repaired by Sam during break.",
                distractors:[
                  "Sam was repairing the puncture during break.",
                  "During break, Sam repaired the puncture."
                ],
                why:"The passive moves the thing affected into the subject position with 'was repaired by'."
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
      "identify",
      "qg-p5"
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
              },
              {
                sentence:"Mia handed the trophy to Ava because she had won the race.",
                pronoun:"she",
                correct:"Ava",
                distractors:["Mia", "the trophy", "the race"],
                why:"The pronoun 'she' refers to Ava because Ava won the race and received the trophy."
              },
              {
                sentence:"The dog chased the cat until it climbed over the fence.",
                pronoun:"it",
                correct:"the cat",
                distractors:["the dog", "the fence", "the garden"],
                why:"The pronoun 'it' refers to the cat because the cat escaped by climbing the fence."
              },
              {
                sentence:"Jay told Noah that he needed to finish the project today.",
                pronoun:"he",
                correct:"Noah",
                distractors:["Jay", "the project", "the teacher"],
                why:"The pronoun 'he' refers to Noah because Jay is giving the information to Noah."
              },
              {
                sentence:"The teachers praised the choir after they performed so well.",
                pronoun:"they",
                correct:"the choir",
                distractors:["The teachers", "the audience", "the hall"],
                why:"The pronoun 'they' refers to the choir because the choir performed."
              },
              {
                sentence:"Elsie placed the book beside the lamp because it was heavy.",
                pronoun:"it",
                correct:"the book",
                distractors:["the lamp", "Elsie", "the table"],
                why:"The pronoun 'it' refers to the book because the book is described as heavy."
              },
              {
                sentence:"Ben asked Zac whether he could borrow the compass.",
                pronoun:"he",
                correct:"Ben",
                distractors:["Zac", "the compass", "the teacher"],
                why:"The pronoun 'he' refers to Ben because Ben is the one making the request."
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
      "identify",
      "qg-p5"
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
              ],
              [
                { text:"The committee has resolved to postpone the event.", answer:"formal" },
                { text:"We've decided to put the event off for now.", answer:"informal" }
              ],
              [
                { text:"Residents are advised to secure their windows.", answer:"formal" },
                { text:"You should probably shut your windows.", answer:"informal" }
              ],
              [
                { text:"The headteacher wishes to commend the volunteers.", answer:"formal" },
                { text:"The head wants to say well done to the helpers.", answer:"informal" }
              ],
              [
                { text:"All participants must register prior to the deadline.", answer:"formal" },
                { text:"Everyone needs to sign up before it's too late.", answer:"informal" }
              ],
              [
                { text:"The council has undertaken to repair the footpath.", answer:"formal" },
                { text:"The council said they'd fix the path.", answer:"informal" }
              ],
              [
                { text:"Visitors are respectfully reminded to switch off mobile devices.", answer:"formal" },
                { text:"Can everyone turn their phones off, please?", answer:"informal" }
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
              },
              {
                sentence:"May I borrow the scissors, please?",
                modal:"may",
                correct:"It asks for permission politely.",
                distractors:[
                  "It shows that the action is certain to happen.",
                  "It names the month of the year.",
                  "It shows that the scissors belong to the speaker."
                ],
                why:"'May' can ask for or grant permission."
              },
              {
                sentence:"She could swim before she started school.",
                modal:"could",
                correct:"It shows past ability.",
                distractors:[
                  "It shows a future obligation.",
                  "It makes the sentence passive.",
                  "It replaces the subject she."
                ],
                why:"'Could' often shows that someone had the ability to do something in the past."
              },
              {
                sentence:"The package will arrive tomorrow morning.",
                modal:"will",
                correct:"It shows certainty about a future event.",
                distractors:[
                  "It shows that the action is only a weak possibility.",
                  "It gives advice about what to do.",
                  "It turns the sentence into a command."
                ],
                why:"'Will' is commonly used for future certainty or prediction."
              },
              {
                sentence:"You shall not enter without a pass.",
                modal:"shall",
                correct:"It expresses a rule or prohibition.",
                distractors:[
                  "It shows a weak possibility.",
                  "It asks a polite question.",
                  "It places the action in the past."
                ],
                why:"'Shall' can express rules, obligations, or formal determination."
              },
              {
                sentence:"The answer could be wrong.",
                modal:"could",
                correct:"It shows possibility or uncertainty.",
                distractors:[
                  "It shows that the answer was wrong in the past.",
                  "It gives a command to check the answer.",
                  "It turns the sentence into passive voice."
                ],
                why:"'Could' can also show possibility when the meaning is about the present or future."
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
              },
              {
                phrase:"well-known author",
                contrast:"well known author",
                correct:"The hyphen shows that 'well-known' is one describing idea before 'author'.",
                distractors:[
                  "The hyphen shows the author owns a well.",
                  "The hyphen turns well into a noun.",
                  "The hyphen separates two independent clauses."
                ],
                why:"Compound adjectives before a noun use a hyphen to show they form a single modifier."
              },
              {
                phrase:"twenty-four children",
                contrast:"twenty four children",
                correct:"The hyphen links twenty and four as a single compound number.",
                distractors:[
                  "The hyphen separates two different groups of children.",
                  "The hyphen shows possession by the number.",
                  "The hyphen marks a question."
                ],
                why:"Compound numbers from twenty-one to ninety-nine use a hyphen."
              },
              {
                phrase:"re-cover the book",
                contrast:"recover the book",
                correct:"The hyphen shows cover again, not get back.",
                distractors:[
                  "The hyphen shows that the book belongs to someone.",
                  "The hyphen marks a subordinate clause.",
                  "The hyphen means the same as a comma here."
                ],
                why:"A hyphen after 're' can prevent confusion with a different word."
              },
              {
                phrase:"old-fashioned clock",
                contrast:"old fashioned clock",
                correct:"The hyphen shows that 'old-fashioned' is one describing idea before 'clock'.",
                distractors:[
                  "The hyphen shows that the clock is old and separately fashioned.",
                  "The hyphen replaces a conjunction between old and fashioned.",
                  "The hyphen shows possession by the clock."
                ],
                why:"Without the hyphen, 'old' could be read as describing 'fashioned clock' separately."
              },
              {
                phrase:"long-term plan",
                contrast:"long term plan",
                correct:"The hyphen shows that 'long-term' is one describing idea before 'plan'.",
                distractors:[
                  "The hyphen shows that the plan is about long terms.",
                  "The hyphen makes the phrase a question.",
                  "The hyphen shows that term is a verb."
                ],
                why:"The compound adjective modifies the noun as a unit, and the hyphen makes this clear."
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
    id: "qg_p3_sentence_functions_explain",
    label: "Explain a sentence function",
    domain: "Sentence function",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_sentence_functions_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "sentence_functions"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_sentence_functions_explain);
          }
  },
  {
    id: "qg_p3_word_classes_explain",
    label: "Explain a word class in context",
    domain: "Word classes",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_word_classes_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "word_classes"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_word_classes_explain);
          }
  },
  {
    id: "qg_p3_noun_phrases_explain",
    label: "Explain an expanded noun phrase",
    domain: "Phrases",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_noun_phrases_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "noun_phrases"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_noun_phrases_explain);
          }
  },
  {
    id: "qg_p3_clauses_explain",
    label: "Explain a clause relationship",
    domain: "Clauses",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_clauses_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "clauses"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_clauses_explain);
          }
  },
  {
    id: "qg_p3_relative_clauses_explain",
    label: "Explain a relative clause",
    domain: "Clauses",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_relative_clauses_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "relative_clauses"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_relative_clauses_explain);
          }
  },
  {
    id: "qg_p3_tense_aspect_explain",
    label: "Explain tense and aspect",
    domain: "Verb forms",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_tense_aspect_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "tense_aspect"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_tense_aspect_explain);
          }
  },
  {
    id: "qg_p3_pronouns_cohesion_explain",
    label: "Explain pronoun cohesion",
    domain: "Cohesion",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_pronouns_cohesion_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "pronouns_cohesion"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_pronouns_cohesion_explain);
          }
  },
  {
    id: "qg_p3_formality_explain",
    label: "Explain formal and informal register",
    domain: "Register",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_formality_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "formality"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_formality_explain);
          }
  },
  {
    id: "qg_p3_active_passive_explain",
    label: "Explain active and passive voice",
    domain: "Sentence structure",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_active_passive_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "active_passive"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_active_passive_explain);
          }
  },
  {
    id: "qg_p3_subject_object_explain",
    label: "Explain subject and object roles",
    domain: "Sentence structure",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_subject_object_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "subject_object"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_subject_object_explain);
          }
  },
  {
    id: "qg_p3_parenthesis_commas_explain",
    label: "Explain parenthesis punctuation",
    domain: "Punctuation for grammar",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    punctStage: "sense",
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_parenthesis_commas_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "parenthesis_commas"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_parenthesis_commas_explain);
          }
  },
  {
    id: "qg_p3_speech_punctuation_explain",
    label: "Explain direct speech punctuation",
    domain: "Punctuation for grammar",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    punctStage: "sense",
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_speech_punctuation_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "speech_punctuation"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_speech_punctuation_explain);
          }
  },
  {
    id: "qg_p3_apostrophe_possession_explain",
    label: "Explain possessive apostrophes",
    domain: "Punctuation for grammar",
    questionType: "explain",
    difficulty: 2,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    punctStage: "sense",
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p3_apostrophe_possession_explain",
    tags: [
      "qg-p3",
      "explain"
    ],
    skillIds: [
      "apostrophes_possession"
    ],
    generator(seed) {
            return buildP3ExplanationChoiceQuestion(this, seed, P3_EXPLANATION_CASES.qg_p3_apostrophe_possession_explain);
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
    requiresAnswerSpec: true,
    answerSpecKind: "normalisedText",
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
            const answerSpec = normalisedTextAnswerSpec([accepted], [prompt], {
              maxScore:2,
              misconception:"apostrophe_possession_confusion",
              feedbackLong:`A correct answer is: ${accepted}`,
              answerText:accepted
            });
            return makeBaseQuestion(this, seed, {
              marks:2,
              answerSpec,
              stemHtml:`<p>Rewrite this phrase using the correct <strong>possessive apostrophe</strong>.</p><p><strong>${escapeHtml(prompt)}</strong></p>`,
              inputSpec:{ type:"text", label:"Rewritten phrase", placeholder:"Type the rewritten phrase." },
              solutionLines:[
                "Work out who owns the noun.",
                why,
                `A correct answer is: ${accepted}`
              ],
              evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
            });
          }
  },
  {
    id: "qg_p4_sentence_speech_transfer",
    label: "Sentence function meets speech punctuation",
    domain: "Sentence function",
    questionType: "choose",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p4_sentence_speech_transfer",
    tags: ["qg-p4", "mixed-transfer"],
    skillIds: ["sentence_functions", "speech_punctuation"],
    generator(seed) {
      return buildP4MixedTransferChoiceQuestion(this, seed, P4_MIXED_TRANSFER_CASES.qg_p4_sentence_speech_transfer);
    }
  },
  {
    id: "qg_p4_word_class_noun_phrase_transfer",
    label: "Word class and noun phrase analysis",
    domain: "Phrases",
    questionType: "classify",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "multiField",
    generatorFamilyId: "qg_p4_word_class_noun_phrase_transfer",
    tags: ["qg-p4", "mixed-transfer"],
    skillIds: ["word_classes", "noun_phrases"],
    generator(seed) {
      return buildP4MixedTransferClassifyQuestion(this, seed, P4_MIXED_TRANSFER_CASES.qg_p4_word_class_noun_phrase_transfer);
    }
  },
  {
    id: "qg_p4_adverbial_clause_boundary_transfer",
    label: "Adverbial placement with clause boundaries",
    domain: "Clauses",
    questionType: "choose",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p4_adverbial_clause_boundary_transfer",
    tags: ["qg-p4", "mixed-transfer"],
    skillIds: ["adverbials", "clauses", "boundary_punctuation"],
    generator(seed) {
      return buildP4MixedTransferChoiceQuestion(this, seed, P4_MIXED_TRANSFER_CASES.qg_p4_adverbial_clause_boundary_transfer);
    }
  },
  {
    id: "qg_p4_relative_parenthesis_transfer",
    label: "Relative clause with parenthesis commas",
    domain: "Clauses",
    questionType: "choose",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p4_relative_parenthesis_transfer",
    tags: ["qg-p4", "mixed-transfer"],
    skillIds: ["relative_clauses", "parenthesis_commas"],
    generator(seed) {
      return buildP4MixedTransferChoiceQuestion(this, seed, P4_MIXED_TRANSFER_CASES.qg_p4_relative_parenthesis_transfer);
    }
  },
  {
    id: "qg_p4_verb_form_register_transfer",
    label: "Verb form meets register and standard English",
    domain: "Verb forms",
    questionType: "choose",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p4_verb_form_register_transfer",
    tags: ["qg-p4", "mixed-transfer"],
    skillIds: ["tense_aspect", "modal_verbs", "standard_english"],
    generator(seed) {
      return buildP4MixedTransferChoiceQuestion(this, seed, P4_MIXED_TRANSFER_CASES.qg_p4_verb_form_register_transfer);
    }
  },
  {
    id: "qg_p4_cohesion_formality_transfer",
    label: "Pronoun cohesion meets formality",
    domain: "Cohesion",
    questionType: "choose",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p4_cohesion_formality_transfer",
    tags: ["qg-p4", "mixed-transfer"],
    skillIds: ["pronouns_cohesion", "formality"],
    generator(seed) {
      return buildP4MixedTransferChoiceQuestion(this, seed, P4_MIXED_TRANSFER_CASES.qg_p4_cohesion_formality_transfer);
    }
  },
  {
    id: "qg_p4_voice_roles_transfer",
    label: "Active/passive voice with subject and object roles",
    domain: "Sentence structure",
    questionType: "classify",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "multiField",
    generatorFamilyId: "qg_p4_voice_roles_transfer",
    tags: ["qg-p4", "mixed-transfer"],
    skillIds: ["active_passive", "subject_object"],
    generator(seed) {
      return buildP4MixedTransferClassifyQuestion(this, seed, P4_MIXED_TRANSFER_CASES.qg_p4_voice_roles_transfer);
    }
  },
  {
    id: "qg_p4_possession_hyphen_clarity_transfer",
    label: "Apostrophe possession meets hyphen clarity",
    domain: "Punctuation for grammar",
    questionType: "choose",
    difficulty: 3,
    satsFriendly: true,
    isSelectedResponse: true,
    generative: true,
    requiresAnswerSpec: true,
    answerSpecKind: "exact",
    generatorFamilyId: "qg_p4_possession_hyphen_clarity_transfer",
    tags: ["qg-p4", "mixed-transfer"],
    skillIds: ["apostrophes_possession", "hyphen_ambiguity"],
    generator(seed) {
      return buildP4MixedTransferChoiceQuestion(this, seed, P4_MIXED_TRANSFER_CASES.qg_p4_possession_hyphen_clarity_transfer);
    }
  }
];

const P3_EXPLANATION_CASES = Object.freeze({
  qg_p3_sentence_functions_explain: [
    {
      prompt: "Why is this sentence a command?",
      example: "Please place the wet coats on the rack.",
      correct: "It tells someone to do something, so it is a command.",
      distractors: [
        "It asks for information, so it is a question.",
        "It gives information without an instruction, so it is a statement.",
        "It begins with What or How and shows strong feeling."
      ],
      why: "A command gives an instruction or request, often with an imperative verb.",
      misconception: "sentence_function_confusion"
    },
    {
      prompt: "Why is this sentence a question?",
      example: "Where did the caretaker leave the keys?",
      correct: "It asks for information directly, so it is a question.",
      distractors: [
        "It tells the caretaker to leave the keys somewhere.",
        "It gives information about where the keys are.",
        "It is a grammatical exclamation because it ends with a question mark."
      ],
      why: "A question asks something directly; the question mark supports that function.",
      misconception: "sentence_function_confusion"
    },
    {
      prompt: "Why is this sentence a statement?",
      example: "The caretaker left the keys beside the office door.",
      correct: "It gives information, so it is a statement.",
      distractors: [
        "It asks where the keys are.",
        "It orders someone to move the keys.",
        "It begins with What or How to show strong feeling."
      ],
      why: "A statement tells the reader something and does not ask, order, or exclaim.",
      misconception: "sentence_function_confusion"
    },
    {
      prompt: "Why is this a grammatical exclamation?",
      example: "What an enormous wave that was!",
      correct: "It begins with What and expresses strong feeling about a noun phrase.",
      distractors: [
        "It is a question because it uses the word what.",
        "It is a command because it tells someone to look at the wave.",
        "It is a statement because it gives calm information only."
      ],
      why: "KS2 grammatical exclamations often begin with What or How and show strong feeling.",
      misconception: "sentence_function_confusion"
    },
    {
      prompt: "Why is this a statement rather than a question?",
      example: "I wonder where the missing torch is.",
      correct: "It reports someone wondering; it does not ask the reader directly.",
      distractors: [
        "It is a question because it contains the word where.",
        "It is a command because it tells the reader to find the torch.",
        "It is an exclamation because it shows strong feeling with What or How."
      ],
      why: "A reported question can be part of a statement if the whole sentence is giving information.",
      misconception: "sentence_function_confusion"
    },
    {
      prompt: "Why is this not a grammatical exclamation?",
      example: "The drums sounded very loud!",
      correct: "It shows excitement, but it does not use the What or How exclamation pattern.",
      distractors: [
        "Any sentence with an exclamation mark is a grammatical exclamation.",
        "It is a command because the drums are making noise.",
        "It is a question because it ends with strong punctuation."
      ],
      why: "In KS2 grammar, an exclamation mark alone does not make the sentence function an exclamation.",
      misconception: "sentence_function_confusion"
    },
    {
      prompt: "Why is this sentence a command even though it says 'please'?",
      example: "Please tidy the books before you leave.",
      correct: "It tells someone to do something; the polite word does not change the function.",
      distractors: [
        "It is a question because it uses the word please.",
        "It is a statement because it gives information about the books.",
        "It is an exclamation because the speaker feels strongly about tidiness."
      ],
      why: "A command instructs someone to act; politeness markers do not alter the sentence function.",
      misconception: "sentence_function_confusion"
    },
    {
      prompt: "Why is this sentence a grammatical exclamation?",
      example: "How quickly the fox disappeared!",
      correct: "It begins with How and expresses strong feeling about an adverb.",
      distractors: [
        "It is a question because it begins with the word How.",
        "It is a command because it tells the fox to disappear.",
        "It is a statement because it gives information about speed."
      ],
      why: "Grammatical exclamations at KS2 begin with What or How and express strong feeling.",
      misconception: "sentence_function_confusion"
    }
  ],
  qg_p3_word_classes_explain: [
    {
      prompt: "Why is the word 'bright' an adjective here?",
      example: "The bright lantern swung above the door.",
      correct: "It describes the noun lantern.",
      distractors: [
        "It names the action in the sentence.",
        "It joins two clauses together.",
        "It replaces a noun phrase to avoid repetition."
      ],
      why: "An adjective gives more information about a noun.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Why is the word 'carefully' an adverb here?",
      example: "Maya carefully folded the map.",
      correct: "It modifies the verb folded by saying how Maya folded.",
      distractors: [
        "It names the person doing the folding.",
        "It comes before a noun to identify it.",
        "It joins the two parts of the sentence."
      ],
      why: "Adverbs can modify verbs by telling how, when, where, or how often.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Why is the word 'before' a preposition here?",
      example: "The pupils waited before assembly.",
      correct: "It begins the phrase before assembly and shows a time relationship.",
      distractors: [
        "It replaces the noun pupils.",
        "It describes the noun assembly.",
        "It names the action of waiting."
      ],
      why: "A preposition usually links a noun phrase to the rest of the sentence by time, place, or cause.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Why is the word 'because' a conjunction here?",
      example: "Luca whispered because the baby was asleep.",
      correct: "It joins the reason clause to the main clause.",
      distractors: [
        "It describes the noun baby.",
        "It shows where Luca whispered.",
        "It replaces the name Luca."
      ],
      why: "A conjunction can join clauses and show the relationship between their ideas.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Why is the word 'Those' a determiner here?",
      example: "Those birds nested under the roof.",
      correct: "It comes before the noun birds and helps identify which birds.",
      distractors: [
        "It tells how the birds nested.",
        "It names the action in the sentence.",
        "It joins two clauses together."
      ],
      why: "Determiners come before nouns and help specify them.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Why is the word 'it' a pronoun here?",
      example: "Aisha found the compass and put it in her bag.",
      correct: "It replaces the noun phrase the compass.",
      distractors: [
        "It describes the compass.",
        "It shows the time of the action.",
        "It joins the two clauses because it means and."
      ],
      why: "Pronouns stand in for nouns or noun phrases when the reference is clear.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Why is the word 'swiftly' an adverb here?",
      example: "The river flowed swiftly under the bridge.",
      correct: "It modifies the verb flowed by telling how the river moved.",
      distractors: [
        "It names the bridge.",
        "It describes the noun river.",
        "It joins two clauses together."
      ],
      why: "Adverbs can modify verbs by explaining the manner of the action.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Why is the word 'across' a preposition here?",
      example: "The children ran across the playground.",
      correct: "It begins a phrase showing the place relationship between ran and playground.",
      distractors: [
        "It describes how the children felt.",
        "It replaces the noun children.",
        "It is a conjunction joining two clauses."
      ],
      why: "A preposition links a noun phrase to the rest of the sentence, often showing place or direction.",
      misconception: "word_class_confusion"
    }
  ],
  qg_p3_noun_phrases_explain: [
    {
      prompt: "Why is this an expanded noun phrase?",
      example: "the tiny silver key",
      correct: "It is centred on the noun key and expanded with describing words.",
      distractors: [
        "It is a full clause with a verb.",
        "It is an adverbial because it tells when.",
        "It is a conjunction because it joins ideas."
      ],
      why: "A noun phrase has a noun at its heart; expansion adds detail to that noun.",
      misconception: "noun_phrase_confusion"
    },
    {
      prompt: "Why is this an expanded noun phrase?",
      example: "the book with a torn cover",
      correct: "It is centred on the noun book and expanded by the phrase with a torn cover.",
      distractors: [
        "It is a sentence because it has a subject and a verb.",
        "It is a fronted adverbial because it starts with the.",
        "It is direct speech because it names an object."
      ],
      why: "A preposition phrase can expand a noun phrase by adding detail about the noun.",
      misconception: "noun_phrase_confusion"
    },
    {
      prompt: "Why is this not a noun phrase?",
      example: "quickly opened the gate",
      correct: "It contains a verb phrase, so it is part of a clause rather than a noun phrase.",
      distractors: [
        "It is a noun phrase because it has four words.",
        "It is a noun phrase because quickly describes a noun.",
        "It is a determiner phrase because it ends with gate."
      ],
      why: "Length is not enough: a noun phrase must centre on a noun, not a verb.",
      misconception: "noun_phrase_confusion"
    },
    {
      prompt: "Why is the underlined group a noun phrase?",
      example: "The nervous goalkeeper from Year 6 saved the penalty.",
      focus: "The nervous goalkeeper from Year 6",
      correct: "The whole group is centred on the noun goalkeeper.",
      distractors: [
        "The whole group is the verb phrase.",
        "It is a subordinate clause because it has extra information.",
        "It is an adverbial because it tells where the saving happened."
      ],
      why: "Extra words before and after the noun can belong inside the same noun phrase.",
      misconception: "noun_phrase_confusion"
    },
    {
      prompt: "Why is this an expanded noun phrase rather than a clause?",
      example: "the lighthouse on the cliff",
      correct: "It has no verb; it is a noun phrase centred on lighthouse.",
      distractors: [
        "It is a clause because every phrase with on has a verb.",
        "It is a clause because cliff is a subject.",
        "It is a sentence because it begins with the."
      ],
      why: "A clause normally has a verb; this group names and expands a noun.",
      misconception: "noun_phrase_confusion"
    },
    {
      prompt: "Why is this not the full noun phrase?",
      example: "the old oak tree beside the library",
      focus: "old oak",
      correct: "Old oak describes the noun, but the full noun phrase must include tree.",
      distractors: [
        "Old oak is the full noun phrase because adjectives can stand alone here.",
        "Old oak is a clause because it has two words.",
        "Old oak is the object because it comes before tree."
      ],
      why: "A noun phrase needs its head noun; adjectives alone do not make the complete noun phrase here.",
      misconception: "noun_phrase_confusion"
    },
    {
      prompt: "Why is this an expanded noun phrase?",
      example: "a rusty bicycle with a bent wheel",
      correct: "It is centred on the noun bicycle and expanded with an adjective and a prepositional phrase.",
      distractors: [
        "It is a clause because it has a hidden verb.",
        "It is an adverbial telling how something moved.",
        "It is a conjunction linking two ideas."
      ],
      why: "Adjectives and prepositional phrases can both expand a noun phrase.",
      misconception: "noun_phrase_confusion"
    },
    {
      prompt: "Why is the underlined group a noun phrase?",
      example: "The small grey kitten under the bench scratched the post.",
      focus: "The small grey kitten under the bench",
      correct: "The whole group is centred on the noun kitten and gives detail about it.",
      distractors: [
        "It is a verb phrase because scratching is implied.",
        "It is an adverbial because it tells where the post was.",
        "It is a subordinate clause because it has extra words."
      ],
      why: "Modifiers before and after the head noun can all belong inside one noun phrase.",
      misconception: "noun_phrase_confusion"
    }
  ],
  qg_p3_clauses_explain: [
    {
      prompt: "Why is the first clause subordinate?",
      example: "Because the rain stopped, we went outside.",
      correct: "Because the rain stopped depends on the main clause to complete the meaning.",
      distractors: [
        "It is subordinate because it is the longest part of the sentence.",
        "It is subordinate because it contains the subject we.",
        "It is subordinate because it can stand alone as a full sentence here."
      ],
      why: "A subordinate clause often begins with a subordinating conjunction and depends on a main clause.",
      misconception: "subordinate_clause_confusion"
    },
    {
      prompt: "Why does the conjunction 'although' fit this sentence?",
      example: "Although Mia was tired, she finished the race.",
      correct: "It introduces a subordinate clause showing contrast with the main clause.",
      distractors: [
        "It joins two noun phrases in a list.",
        "It introduces direct speech.",
        "It shows that the two clauses mean exactly the same thing."
      ],
      why: "Although links a contrasting subordinate clause to a main clause.",
      misconception: "subordinate_clause_confusion"
    },
    {
      prompt: "Why is this a main clause?",
      example: "The class cheered when the curtain rose.",
      focus: "The class cheered",
      correct: "It can stand alone as a complete clause in the intended meaning.",
      distractors: [
        "It is main because it begins with when.",
        "It is main because it has no verb.",
        "It is main because it only adds extra information about a noun."
      ],
      why: "The main clause carries the core meaning and can usually stand alone.",
      misconception: "subordinate_clause_confusion"
    },
    {
      prompt: "Why is the clause beginning with 'if' subordinate?",
      example: "If the gate is locked, wait by the office.",
      correct: "It gives a condition and needs the main clause to complete the instruction.",
      distractors: [
        "It is subordinate because it is a question.",
        "It is subordinate because it contains direct speech.",
        "It is subordinate because it has no subject or verb."
      ],
      why: "Conditional clauses beginning with if often depend on a main clause.",
      misconception: "subordinate_clause_confusion"
    },
    {
      prompt: "Why does 'and' join these clauses safely?",
      example: "The bell rang and the pupils lined up.",
      correct: "It links two related main clauses of equal importance.",
      distractors: [
        "It makes the second clause subordinate.",
        "It introduces a relative clause about bell.",
        "It shows possession between the two nouns."
      ],
      why: "Coordinating conjunctions such as and can join main clauses.",
      misconception: "subordinate_clause_confusion"
    },
    {
      prompt: "Why is this not a complete sentence by itself?",
      example: "When the coach arrived",
      correct: "It is a subordinate time clause that leaves the main action unfinished.",
      distractors: [
        "It is complete because it starts with When.",
        "It is complete because it has no conjunction.",
        "It is complete because coach is a noun."
      ],
      why: "A subordinate clause may contain a subject and verb but still depend on a main clause.",
      misconception: "subordinate_clause_confusion"
    },
    {
      prompt: "Why does 'while' introduce a subordinate clause here?",
      example: "While the audience waited, the actors prepared backstage.",
      correct: "It introduces a time clause that depends on the main clause for full meaning.",
      distractors: [
        "It introduces a main clause because it names who was waiting.",
        "It introduces a relative clause because it gives information about actors.",
        "It introduces direct speech because a group is speaking."
      ],
      why: "While is a subordinating conjunction that signals a time relationship.",
      misconception: "subordinate_clause_confusion"
    },
    {
      prompt: "Why are both clauses main clauses here?",
      example: "The wind howled but the tent held firm.",
      correct: "Both parts carry independent meaning and are joined by a coordinating conjunction.",
      distractors: [
        "The second clause is subordinate because it comes after but.",
        "The first clause is subordinate because it describes weather.",
        "Neither is a main clause because two clauses cannot both be main."
      ],
      why: "Coordinating conjunctions join clauses of equal grammatical weight.",
      misconception: "subordinate_clause_confusion"
    }
  ],
  qg_p3_relative_clauses_explain: [
    {
      prompt: "Why is the clause 'who carried the flag' a relative clause?",
      example: "The pupil who carried the flag led the line.",
      correct: "It adds information about the noun pupil.",
      distractors: [
        "It tells when the line was led.",
        "It joins two unrelated main clauses.",
        "It is direct speech by the pupil."
      ],
      why: "Relative clauses add information about a noun, often using who for people.",
      misconception: "relative_clause_confusion"
    },
    {
      prompt: "Why is the clause 'which stood by the window' a relative clause?",
      example: "The plant which stood by the window needed water.",
      correct: "It adds information about the noun plant.",
      distractors: [
        "It is a question because it starts with which.",
        "It shows possession by the window.",
        "It is an adverbial telling how the plant needed water."
      ],
      why: "Which can introduce a relative clause that gives more detail about a thing.",
      misconception: "relative_clause_confusion"
    },
    {
      prompt: "Why is the clause 'that everyone wanted' a relative clause?",
      example: "The book that everyone wanted was on the shelf.",
      correct: "It identifies the noun book more precisely.",
      distractors: [
        "It gives the time when the book was on the shelf.",
        "It is a command telling everyone to want the book.",
        "It is a main clause that can stand alone here."
      ],
      why: "Relative clauses can define or identify the noun they follow.",
      misconception: "relative_clause_confusion"
    },
    {
      prompt: "Why is this not a relative clause?",
      example: "When the show ended, the actors bowed.",
      correct: "When the show ended is a time clause, not extra information about a noun.",
      distractors: [
        "It is relative because every clause at the start is relative.",
        "It is relative because it contains the noun show.",
        "It is relative because it tells who bowed."
      ],
      why: "A relative clause attaches to a noun; a when-clause here tells time.",
      misconception: "relative_clause_confusion"
    },
    {
      prompt: "Why does 'whose' introduce a relative clause here?",
      example: "The girl whose boots were muddy waited outside.",
      correct: "The clause adds information about the girl by saying whose boots were muddy.",
      distractors: [
        "Whose introduces a direct question here.",
        "The clause tells where the girl waited.",
        "The clause is a command about cleaning boots."
      ],
      why: "Whose can link a relative clause to a noun by showing possession.",
      misconception: "relative_clause_confusion"
    },
    {
      prompt: "Why does this relative clause need commas?",
      example: "Mr Patel, who runs the chess club, opened the hall.",
      correct: "The clause adds extra information about Mr Patel and can be lifted out.",
      distractors: [
        "The commas show a list of teachers.",
        "The commas show that the sentence is a question.",
        "The commas mark possession by the chess club."
      ],
      why: "Non-essential relative clauses can be marked as parenthesis with commas.",
      misconception: "relative_clause_confusion"
    },
    {
      prompt: "Why is 'where' introducing a relative clause here?",
      example: "The park where we played football has a new fence.",
      correct: "The clause gives more information about the noun park.",
      distractors: [
        "It introduces a question about direction.",
        "It is a subordinating time conjunction.",
        "It marks a fronted adverbial."
      ],
      why: "Where can introduce a relative clause that tells more about a place noun.",
      misconception: "relative_clause_confusion"
    },
    {
      prompt: "Why is this a defining relative clause?",
      example: "The boy who scored the goal ran to his team.",
      correct: "It identifies which boy is meant and cannot be removed without losing meaning.",
      distractors: [
        "It is non-defining because commas could be added.",
        "It is not a relative clause because it tells about an action.",
        "It is a fronted adverbial because it comes before ran."
      ],
      why: "Defining relative clauses are essential for identifying the noun.",
      misconception: "relative_clause_confusion"
    }
  ],
  qg_p3_tense_aspect_explain: [
    {
      prompt: "Why is 'has finished' present perfect?",
      example: "She has finished the poster already.",
      correct: "It uses has plus a past participle to link a completed action to now.",
      distractors: [
        "It is simple past because already names a finished time.",
        "It is progressive because the action is happening right now.",
        "It is passive because the poster comes after the verb."
      ],
      why: "The present perfect often uses has or have plus a past participle.",
      misconception: "tense_confusion"
    },
    {
      prompt: "Why is 'had packed' past perfect?",
      example: "By the time the coach arrived, Sam had packed the bags.",
      correct: "It shows one past action completed before another past action.",
      distractors: [
        "It is present perfect because it uses have in the present.",
        "It is progressive because packing was in progress at that moment.",
        "It is simple past because had is always optional."
      ],
      why: "Past perfect uses had plus a past participle to show an earlier past action.",
      misconception: "tense_confusion"
    },
    {
      prompt: "Why is 'was reading' past progressive?",
      example: "Maya was reading when the bell rang.",
      correct: "It shows an action that was in progress in the past.",
      distractors: [
        "It shows an action completed before another past action.",
        "It is present tense because reading ends in ing.",
        "It is passive because it uses was."
      ],
      why: "Progressive forms use a form of be plus an -ing verb to show an action in progress.",
      misconception: "tense_confusion"
    },
    {
      prompt: "Why is 'are building' present progressive?",
      example: "The pupils are building a model bridge.",
      correct: "It shows an action in progress now using are plus an -ing verb.",
      distractors: [
        "It shows an action finished yesterday.",
        "It is past perfect because it has two verbs.",
        "It is a modal verb phrase showing obligation."
      ],
      why: "Present progressive uses am, is, or are with an -ing verb.",
      misconception: "tense_confusion"
    },
    {
      prompt: "Why is 'walked' simple past here?",
      example: "Yesterday, the team walked to the museum.",
      correct: "It uses a past verb form for a finished action at a finished time.",
      distractors: [
        "It is present perfect because it happened before now.",
        "It is progressive because the team kept moving.",
        "It is passive because the team receives the action."
      ],
      why: "A finished time word such as yesterday often fits the simple past.",
      misconception: "tense_confusion"
    },
    {
      prompt: "Why is 'have been practising' a perfect progressive form?",
      example: "We have been practising all week.",
      correct: "It links earlier practice to now and shows the action continuing over time.",
      distractors: [
        "It is simple present because the action is a habit only.",
        "It is passive because it uses been.",
        "It is simple past because all week is always finished."
      ],
      why: "The form have been plus an -ing verb combines perfect and progressive meanings.",
      misconception: "tense_confusion"
    },
    {
      prompt: "Why is 'will arrive' simple future here?",
      example: "The bus will arrive at half past three.",
      correct: "It uses will plus a base verb to refer to a time ahead.",
      distractors: [
        "It is present tense because will is in the sentence now.",
        "It is past perfect because it names a specific time.",
        "It is progressive because arrival takes time."
      ],
      why: "Will plus a base verb places the action in the future.",
      misconception: "tense_confusion"
    },
    {
      prompt: "Why is 'had been waiting' past perfect progressive?",
      example: "They had been waiting for an hour before the doors opened.",
      correct: "It shows a continuing action in the past that happened before another past event.",
      distractors: [
        "It is present perfect because it uses been.",
        "It is simple past because the doors opened yesterday.",
        "It is passive because waiting is received by them."
      ],
      why: "Had been plus an -ing verb shows an ongoing action that preceded another past action.",
      misconception: "tense_confusion"
    }
  ],
  qg_p3_pronouns_cohesion_explain: [
    {
      prompt: "Why does the pronoun 'it' make the second sentence cohesive?",
      example: "Aisha unfolded the map. It showed the quickest route.",
      correct: "It clearly refers back to the map and avoids repeating the noun.",
      distractors: [
        "It refers to Aisha, so the reader knows who showed the route.",
        "It is unclear because there is no noun before it.",
        "It changes the sentence into passive voice."
      ],
      why: "A pronoun supports cohesion when its referent is clear.",
      misconception: "pronoun_cohesion_confusion"
    },
    {
      prompt: "Why is the pronoun 'she' unclear here?",
      example: "Maya gave Priya the note because she needed it.",
      correct: "She could refer to Maya or Priya, so the reference is ambiguous.",
      distractors: [
        "She clearly refers to the note.",
        "She is unclear because pronouns can never refer to people.",
        "She is unclear because it is an adjective."
      ],
      why: "Pronouns should make links clear; ambiguity weakens cohesion.",
      misconception: "pronoun_cohesion_confusion"
    },
    {
      prompt: "Why is repeating 'the trophy' clearer here?",
      example: "The shelf was above the trophy, but the trophy was too heavy to move.",
      correct: "Repeating the trophy avoids confusing it with the shelf.",
      distractors: [
        "Repeating the noun always makes writing more formal.",
        "A pronoun would be clearer because it could only mean shelf.",
        "The noun must be repeated because trophies are plural."
      ],
      why: "Sometimes repeating a noun is better than using a pronoun with an unclear referent.",
      misconception: "pronoun_cohesion_confusion"
    },
    {
      prompt: "Why does 'they' work in this sentence?",
      example: "The pupils packed the benches after they finished lunch.",
      correct: "They clearly refers to the pupils, the group who finished lunch.",
      distractors: [
        "They refers to the benches because benches are nearby.",
        "They is wrong because pupils is singular.",
        "They makes the sentence a direct question."
      ],
      why: "A plural pronoun should point clearly to a plural noun phrase.",
      misconception: "pronoun_cohesion_confusion"
    },
    {
      prompt: "Why is 'this' cohesive here?",
      example: "The gate was locked. This delayed the match.",
      correct: "This refers back to the whole situation of the gate being locked.",
      distractors: [
        "This can only refer to a person.",
        "This refers forward to the match only.",
        "This is a verb because it shows an action."
      ],
      why: "Some pronouns can refer back to a whole idea, not just one noun.",
      misconception: "pronoun_cohesion_confusion"
    },
    {
      prompt: "Why is the pronoun 'him' clear here?",
      example: "Oliver dropped the baton, so Sam passed it back to him.",
      correct: "Him refers to Oliver, the person who dropped the baton.",
      distractors: [
        "Him refers to the baton because it receives the action.",
        "Him refers to Sam because Sam is nearest to the pronoun.",
        "Him is unclear because it is plural."
      ],
      why: "Object pronouns still need a clear noun phrase to refer back to.",
      misconception: "pronoun_cohesion_confusion"
    },
    {
      prompt: "Why does 'their' improve cohesion here?",
      example: "The team packed up. They put their equipment in the shed.",
      correct: "Their links clearly to the team, keeping both sentences connected.",
      distractors: [
        "Their replaces the shed.",
        "Their is unclear because it could mean anyone.",
        "Their changes the sentence into a question."
      ],
      why: "Possessive pronouns help cohesion when the owner is clear from the previous sentence.",
      misconception: "pronoun_cohesion_confusion"
    },
    {
      prompt: "Why should 'it' be replaced with a noun here?",
      example: "The cage was beside the hutch. It was empty.",
      correct: "It could refer to the cage or the hutch, so a noun would remove ambiguity.",
      distractors: [
        "It is always wrong after a full stop.",
        "It must refer to hutch because hutch is nearer.",
        "It is a conjunction, not a pronoun, here."
      ],
      why: "When two possible referents exist, replacing the pronoun with a noun improves clarity.",
      misconception: "pronoun_cohesion_confusion"
    }
  ],
  qg_p3_formality_explain: [
    {
      prompt: "Why is this sentence formal?",
      example: "Visitors are requested to remain seated.",
      correct: "It uses precise, polite wording suitable for official information.",
      distractors: [
        "It is formal because it uses slang.",
        "It is formal because it asks a direct question.",
        "It is formal because it avoids all verbs."
      ],
      why: "Formal writing is suited to public or official contexts and avoids chatty phrasing.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Why is this sentence informal?",
      example: "Hang on a minute while we get started.",
      correct: "It uses chatty wording that suits speech more than formal writing.",
      distractors: [
        "It is informal because it uses Standard English.",
        "It is informal because it has no subject.",
        "It is informal because it contains a noun phrase."
      ],
      why: "Informal register often sounds conversational and relaxed.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Why is 'request' the more formal choice?",
      example: "We request that pupils return the form by Friday.",
      correct: "Request is more precise and formal than ask for in this context.",
      distractors: [
        "Request is more formal because it is a modal verb.",
        "Request is more formal because it is shorter.",
        "Request is more formal because it makes the sentence a question."
      ],
      why: "Formal vocabulary often chooses precise words that fit the audience and purpose.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Why is this version more formal?",
      example: "The equipment was inspected before use.",
      correct: "It uses impersonal, precise wording instead of chatty phrasing.",
      distractors: [
        "It is more formal because passive voice is always required.",
        "It is more formal because it has fewer syllables.",
        "It is more formal because it uses the word got."
      ],
      why: "Formal writing can use impersonal structures when the action matters more than the doer.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Why is this ending too informal for an official letter?",
      example: "Send it back by Friday, OK?",
      correct: "OK is a chatty tag that does not suit an official letter.",
      distractors: [
        "OK is too formal for any letter.",
        "The sentence is informal because Friday is a noun.",
        "The sentence is informal because it has an object."
      ],
      why: "Formal writing avoids conversational tags such as OK? at the end of instructions.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Why is this not automatically formal?",
      example: "The club got set up last year.",
      correct: "Got set up is conversational; established would be more formal.",
      distractors: [
        "It is formal because every past-tense sentence is formal.",
        "It is formal because club is a noun.",
        "It is formal because got is always the most precise verb."
      ],
      why: "Register depends on vocabulary and structure, not only on whether the grammar is understandable.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Why is this sentence too informal for a school notice?",
      example: "Loads of kids are gonna use the new hall.",
      correct: "It uses slang ('loads of kids', 'gonna') that does not suit an official notice.",
      distractors: [
        "It is informal because it mentions children.",
        "It is informal because 'hall' is a short word.",
        "It is informal because it is in the present tense."
      ],
      why: "Slang and contractions like 'gonna' lower the formality below what official writing requires.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Why does the passive voice help formality here?",
      example: "All mobile devices must be switched off during assembly.",
      correct: "It removes a personal subject and uses impersonal, official wording.",
      distractors: [
        "Passive voice is always more formal than active voice in every case.",
        "It is formal because mobile devices is a plural noun.",
        "It is formal because it uses the word during."
      ],
      why: "Impersonal passive structures suit formal contexts where the doer is less important than the rule.",
      misconception: "formality_confusion"
    }
  ],
  qg_p3_active_passive_explain: [
    {
      prompt: "Why is this sentence passive?",
      example: "The hall was cleaned by the caretaker.",
      correct: "The thing affected comes first and the doer comes after by.",
      distractors: [
        "It is passive because it happened in the past.",
        "It is passive because the caretaker is doing the action first.",
        "It is passive because it asks a question."
      ],
      why: "Passive voice often uses a form of be plus a past participle and foregrounds the thing affected.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Why is this sentence active?",
      example: "The caretaker cleaned the hall.",
      correct: "The doer, the caretaker, is the subject before the verb.",
      distractors: [
        "It is active because the hall comes first.",
        "It is active because it uses was plus a past participle.",
        "It is active because it hides who did the cleaning."
      ],
      why: "In active voice, the doer normally comes before the verb as the subject.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Why might a writer choose the passive voice here?",
      example: "The window was broken during lunch.",
      correct: "It foregrounds the broken window and does not name the doer.",
      distractors: [
        "It proves that the action is still happening now.",
        "It makes the sentence a command.",
        "It shows that the window did the breaking."
      ],
      why: "Passive voice can focus attention on the thing affected or leave the doer unnamed.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Why is this not passive voice?",
      example: "Maya was carrying the heavy box.",
      correct: "Was carrying is progressive; Maya is still the doer before the verb.",
      distractors: [
        "It is passive because every sentence with was is passive.",
        "It is passive because box is an object.",
        "It is passive because the action happened in the past."
      ],
      why: "A form of be alone is not enough for passive voice; check the doer and the past participle.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Why does this passive sentence keep the meaning of the active one?",
      example: "The scenery was painted by Aisha.",
      correct: "Aisha is still the doer, but the scenery has been moved to the subject position.",
      distractors: [
        "The scenery becomes the person doing the painting.",
        "The tense changes from past to future.",
        "The sentence becomes a question about Aisha."
      ],
      why: "Active and passive can keep the same basic event while changing emphasis.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Why is this passive sentence missing the doer?",
      example: "The medals were presented after assembly.",
      correct: "Passive voice can leave out the by-phrase when the doer is unknown or less important.",
      distractors: [
        "The medals must be the doers because they come first.",
        "The sentence is active because no by-phrase appears.",
        "The sentence is informal because the doer is hidden."
      ],
      why: "A passive sentence does not have to include the doer.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Why is this sentence active even though the subject is not a person?",
      example: "The storm destroyed the fence.",
      correct: "The storm is the subject that does the action of destroying.",
      distractors: [
        "Only people can be the subject in active voice.",
        "It is passive because the fence receives the action.",
        "It is passive because storms are natural forces."
      ],
      why: "Any noun phrase that does the verb can be the subject in active voice, including non-human agents.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Why does changing to passive shift emphasis here?",
      example: "The report was written by a group of Year 6 pupils.",
      correct: "Passive voice foregrounds the report and backgrounds who wrote it.",
      distractors: [
        "The emphasis stays on the pupils because they are named.",
        "The sentence becomes a question when made passive.",
        "The report becomes the doer when it moves to the front."
      ],
      why: "Passive voice shifts attention to the thing affected, not the doer.",
      misconception: "active_passive_confusion"
    }
  ],
  qg_p3_subject_object_explain: [
    {
      prompt: "Why is 'The chef' the subject?",
      example: "The chef tasted the soup.",
      correct: "The chef does the action of tasting.",
      distractors: [
        "The chef receives the action.",
        "The chef comes after the verb.",
        "The chef is the object because it is a noun phrase."
      ],
      why: "In a simple active sentence, the subject usually does the verb.",
      misconception: "subject_object_confusion"
    },
    {
      prompt: "Why is 'the soup' the object?",
      example: "The chef tasted the soup.",
      correct: "The soup receives the action of tasting.",
      distractors: [
        "The soup does the action.",
        "The soup is the subject because it is at the end.",
        "The soup is an adverbial because it tells when."
      ],
      why: "The object is often the noun phrase that the action is done to.",
      misconception: "subject_object_confusion"
    },
    {
      prompt: "Why is 'Before lunch' not the subject?",
      example: "Before lunch, Aisha packed the kit.",
      correct: "Before lunch is an adverbial; Aisha does the action.",
      distractors: [
        "Before lunch is the subject because it comes first.",
        "Before lunch is the object because it receives packing.",
        "Before lunch is the verb phrase."
      ],
      why: "A fronted adverbial can come first, but the subject is still who or what does the verb.",
      misconception: "subject_object_confusion"
    },
    {
      prompt: "Why is the expanded noun phrase the subject?",
      example: "The tall goalkeeper with red gloves caught the ball.",
      correct: "The whole noun phrase names who did the catching.",
      distractors: [
        "Only red gloves can be the subject.",
        "The whole noun phrase is the object because it is long.",
        "The ball is the subject because it is affected by the verb."
      ],
      why: "A subject can be an expanded noun phrase, not just a single word.",
      misconception: "subject_object_confusion"
    },
    {
      prompt: "Why is 'the trophy' the subject in this passive sentence?",
      example: "The trophy was lifted by Aisha.",
      correct: "The trophy is before the verb phrase and the sentence is about what happened to it.",
      distractors: [
        "Aisha must be the subject because she is the doer.",
        "The trophy is the object because every affected thing is always the object.",
        "By Aisha is the subject because it comes after by."
      ],
      why: "In passive voice, the grammatical subject can be the thing affected.",
      misconception: "subject_object_confusion"
    },
    {
      prompt: "Why is 'the letters' the object?",
      example: "The pupils sorted the letters carefully.",
      correct: "The letters receive the action of sorting.",
      distractors: [
        "The letters are the subject because they are plural.",
        "The letters are an adverbial because they tell how.",
        "The letters are the verb because sorting happens to them."
      ],
      why: "Ask who or what receives the verb to find the object.",
      misconception: "subject_object_confusion"
    },
    {
      prompt: "Why is 'the audience' the subject even though it comes after a comma?",
      example: "After the interval, the audience returned to their seats.",
      correct: "The audience performs the action of returning; the opening phrase is an adverbial.",
      distractors: [
        "The audience is the object because it comes after a comma.",
        "After the interval is the subject because it comes first.",
        "Their seats is the subject because it receives the action."
      ],
      why: "A fronted adverbial does not change which noun phrase is the subject.",
      misconception: "subject_object_confusion"
    },
    {
      prompt: "Why does this sentence have no object?",
      example: "The baby slept peacefully.",
      correct: "Slept does not pass action onto another noun; no noun receives the action.",
      distractors: [
        "Peacefully is the object because it follows the verb.",
        "The baby is both subject and object here.",
        "Every sentence must have an object."
      ],
      why: "Some verbs are intransitive and do not require an object.",
      misconception: "subject_object_confusion"
    }
  ],
  qg_p3_parenthesis_commas_explain: [
    {
      prompt: "Why do the commas mark parenthesis here?",
      example: "Luca, a keen drummer, led the parade.",
      correct: "A keen drummer is extra information that could be lifted out.",
      distractors: [
        "The commas separate items in a list.",
        "The commas show where direct speech begins.",
        "The commas mark a fronted adverbial at the start."
      ],
      why: "Parenthesis adds extra information without breaking the main sentence.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Why do the dashes mark parenthesis here?",
      example: "The hall - usually quiet - was full of music.",
      correct: "Usually quiet is extra information inserted into the sentence.",
      distractors: [
        "The dashes join two equal main clauses.",
        "The dashes show plural possession.",
        "The dashes introduce a list after a complete clause."
      ],
      why: "Dashes can mark parenthesis when they enclose removable extra information.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Why do the brackets mark parenthesis here?",
      example: "The trip (which had been delayed) finally began.",
      correct: "The bracketed clause adds extra information about the trip.",
      distractors: [
        "The brackets show direct speech.",
        "The brackets make which into a question word.",
        "The brackets show that trip is plural."
      ],
      why: "Brackets can mark parenthetical information that is not essential to the main clause.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Why are these commas not marking parenthesis?",
      example: "We packed pencils, rulers, glue and card.",
      correct: "The commas separate items in a list, not removable extra information.",
      distractors: [
        "They mark a relative clause about pencils.",
        "They show direct speech punctuation.",
        "They show that the nouns own the card."
      ],
      why: "List commas separate items; parenthesis commas enclose extra information.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Why is a pair of commas needed here?",
      example: "The museum, which opened last year, is near the river.",
      correct: "The parenthetical relative clause sits in the middle of the main sentence.",
      distractors: [
        "Only one comma is needed after museum because the rest is a list.",
        "The commas show that the museum owns the river.",
        "The commas turn the sentence into direct speech."
      ],
      why: "When parenthesis interrupts the middle of a sentence, paired punctuation marks both ends.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Why is the phrase after the comma not parenthesis?",
      example: "After the storm, the path was muddy.",
      correct: "After the storm is a fronted adverbial telling when, not extra information in the middle.",
      distractors: [
        "It is parenthesis because every comma marks parenthesis.",
        "It is parenthesis because storm is a noun.",
        "It is direct speech because the comma comes early."
      ],
      why: "A fronted adverbial comma has a different job from parenthesis punctuation.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Why do dashes work better than commas here?",
      example: "The headteacher – who had been away all week – returned on Friday.",
      correct: "Dashes give a stronger visual break for the parenthetical information.",
      distractors: [
        "Dashes are the only punctuation that can mark parenthesis.",
        "Commas would be grammatically wrong here.",
        "Dashes show that the headteacher owns something."
      ],
      why: "Dashes, commas, and brackets can all mark parenthesis, but dashes give a stronger break.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Why can the bracketed words be removed?",
      example: "The school hall (built in 1987) needs a new roof.",
      correct: "The bracketed phrase adds optional extra detail and the sentence still makes sense without it.",
      distractors: [
        "Every part of a sentence in brackets is the main clause.",
        "The brackets mark direct speech.",
        "The brackets show that 1987 is the subject."
      ],
      why: "Parenthetical information is additional and removable without breaking the sentence.",
      misconception: "parenthesis_confusion"
    }
  ],
  qg_p3_speech_punctuation_explain: [
    {
      prompt: "Why does the question mark go inside the speech marks?",
      example: "\"Where is the map?\" asked Priya.",
      correct: "The spoken words are a question, so the question mark belongs inside them.",
      distractors: [
        "The question mark belongs after asked because Priya is asking.",
        "The question mark shows possession by the map.",
        "The question mark replaces the closing speech mark."
      ],
      why: "End punctuation for the spoken words sits inside the speech marks.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Why is there a comma before the closing speech mark?",
      example: "\"I found the map,\" said Priya.",
      correct: "The comma separates the spoken words from the reporting clause.",
      distractors: [
        "The comma shows that map is plural.",
        "The comma belongs outside the speech marks in this pattern.",
        "The comma marks a list of speakers."
      ],
      why: "When a reporting clause follows a statement in direct speech, the comma is part of the spoken section.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Why is there a comma after the reporting clause?",
      example: "Priya said, \"I found the map.\"",
      correct: "The comma introduces the direct speech after the reporting clause.",
      distractors: [
        "The comma shows that Priya is in a list.",
        "The comma marks a subordinate clause beginning with I.",
        "The comma shows plural possession."
      ],
      why: "A comma often separates a reporting clause from the direct speech that follows.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Why is the exclamation mark inside the speech marks?",
      example: "\"Watch out!\" shouted Sam.",
      correct: "The spoken words are an exclamation or warning, so the mark belongs inside.",
      distractors: [
        "The exclamation mark belongs after shouted because Sam is loud.",
        "The exclamation mark turns shouted into a noun.",
        "The exclamation mark shows that Sam owns the warning."
      ],
      why: "Punctuation that belongs to the spoken words is placed inside the speech marks.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Why does the spoken sentence start with a capital letter?",
      example: "Mum asked, \"Are you ready?\"",
      correct: "The direct speech starts a new spoken sentence.",
      distractors: [
        "Every word after a comma must have a capital letter.",
        "Are is capitalised because it is a noun.",
        "The capital letter shows possession."
      ],
      why: "Direct speech keeps the normal capital letter at the start of the spoken sentence.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Why is the full stop not outside the speech marks?",
      example: "\"The bus is here.\"",
      correct: "The full stop finishes the spoken sentence, so it belongs inside the speech marks.",
      distractors: [
        "The full stop belongs outside because speech marks are only decoration.",
        "The full stop belongs before the opening speech mark.",
        "The full stop should be replaced by an apostrophe."
      ],
      why: "The punctuation that ends the direct speech is part of the quoted words.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Why does the reporting clause start with a lower-case letter here?",
      example: "\"Pass the glue,\" whispered Luca.",
      correct: "The reporting clause continues the same sentence after the spoken words.",
      distractors: [
        "Whispered always has a lower-case letter in every context.",
        "The lower case shows possession by Luca.",
        "The lower case turns the sentence into a question."
      ],
      why: "After a comma inside speech marks, the reporting clause does not start a new sentence.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Why is there no full stop before the closing speech mark?",
      example: "\"Where are the scissors?\" asked Priya.",
      correct: "The question mark already ends the spoken sentence, so a full stop is not needed.",
      distractors: [
        "A full stop is always needed before closing speech marks.",
        "The question mark shows possession, not a question.",
        "The question mark belongs after asked."
      ],
      why: "One end-of-speech punctuation mark is enough; a question mark replaces a full stop.",
      misconception: "speech_punctuation_confusion"
    }
  ],
  qg_p3_apostrophe_possession_explain: [
    {
      prompt: "Why is the apostrophe before the s?",
      example: "the girl's bag",
      correct: "One girl owns the bag, so singular possession uses apostrophe + s.",
      distractors: [
        "More than one girl owns the bag, so the apostrophe follows the plural s.",
        "The apostrophe shows a missing letter from girl is.",
        "The apostrophe makes the noun plural."
      ],
      why: "For one regular singular owner, the apostrophe usually comes before s.",
      misconception: "apostrophe_possession_confusion"
    },
    {
      prompt: "Why is the apostrophe after the s?",
      example: "the girls' bags",
      correct: "More than one girl owns the bags, and girls is a regular plural ending in s.",
      distractors: [
        "One girl owns the bags, so the apostrophe must come after s.",
        "The apostrophe shows the bags are missing letters.",
        "The apostrophe turns bags into a verb."
      ],
      why: "For a regular plural owner ending in s, the apostrophe usually comes after the s.",
      misconception: "apostrophe_possession_confusion"
    },
    {
      prompt: "Why is this apostrophe + s?",
      example: "the children's coats",
      correct: "Children is an irregular plural that does not end in s, so it takes apostrophe + s.",
      distractors: [
        "Children is singular, so only one child owns the coats.",
        "The apostrophe comes after an s that is missing from children.",
        "The apostrophe shows a contraction of children is."
      ],
      why: "Irregular plural owners that do not end in s usually use apostrophe + s.",
      misconception: "apostrophe_possession_confusion"
    },
    {
      prompt: "Why does this phrase show possession, not omission?",
      example: "the teacher's desk",
      correct: "The apostrophe shows the desk belongs to the teacher.",
      distractors: [
        "The apostrophe replaces letters from teacher is.",
        "The apostrophe makes desk plural.",
        "The apostrophe marks a direct speech break."
      ],
      why: "Possessive apostrophes show ownership; contraction apostrophes show missing letters.",
      misconception: "apostrophe_possession_confusion"
    },
    {
      prompt: "Why is 'the boys' changing room' plural possession?",
      example: "the boys' changing room",
      correct: "The room belongs to more than one boy, so the apostrophe follows the plural s.",
      distractors: [
        "The room belongs to one boy, so the apostrophe follows the plural s.",
        "The apostrophe shows that changing is missing letters.",
        "The apostrophe is needed because room is singular."
      ],
      why: "The apostrophe position changes the owner number, not the number of the owned noun.",
      misconception: "apostrophe_possession_confusion"
    },
    {
      prompt: "Why is 'the dog's bowls' singular possession?",
      example: "the dog's bowls",
      correct: "One dog owns more than one bowl, so the apostrophe is before s in dog's.",
      distractors: [
        "More than one dog owns one bowl, so the apostrophe is before s.",
        "The apostrophe belongs after bowls because bowls is plural.",
        "The apostrophe shows dog is a verb."
      ],
      why: "Look at the owner, not only the owned noun, when placing the apostrophe.",
      misconception: "apostrophe_possession_confusion"
    },
    {
      prompt: "Why does 'James's' keep the extra s?",
      example: "James's pencil case",
      correct: "Names ending in s can take apostrophe + s to show singular possession.",
      distractors: [
        "The extra s shows there are two people called James.",
        "The apostrophe replaces a missing letter from James is.",
        "The extra s turns James into a verb."
      ],
      why: "For singular proper nouns ending in s, apostrophe + s is acceptable for possession.",
      misconception: "apostrophe_possession_confusion"
    },
    {
      prompt: "Why is the apostrophe wrong in 'the table's are set'?",
      example: "the table's are set",
      correct: "Tables here is a simple plural, not a possessive, so no apostrophe is needed.",
      distractors: [
        "The apostrophe is correct because are follows the noun.",
        "The apostrophe shows the tables own the setting.",
        "The apostrophe is needed because table ends with a vowel sound."
      ],
      why: "Plural nouns do not need an apostrophe unless they are showing possession.",
      misconception: "apostrophe_possession_confusion"
    }
  ]
});

const P4_MIXED_TRANSFER_CASES = Object.freeze({
  qg_p4_sentence_speech_transfer: [
    {
      prompt: "Which option correctly punctuates the direct speech AND keeps the whole sentence as a question?",
      example: "Did Mum really say ___",
      correct: "Did Mum really say, \"Pack your bag now\"?",
      distractors: [
        "Did Mum really say, \"Pack your bag now?\"",
        "Did Mum really say \"Pack your bag now\"?",
        "Did Mum really say, \"pack your bag now\"?"
      ],
      why: "The whole sentence is a question (sentence function), so the question mark comes outside the closing speech marks. The reported speech inside is a command, not a question.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Which option correctly punctuates the speech AND makes the sentence a statement?",
      example: "The teacher told us ___",
      correct: "The teacher told us, \"Open your books to page twelve.\"",
      distractors: [
        "The teacher told us \"Open your books to page twelve.\"",
        "The teacher told us, \"Open your books to page twelve\".",
        "The teacher told us, \"open your books to page twelve.\""
      ],
      why: "The whole sentence is a statement (reporting what was said). The speech inside is a command. The full stop goes inside the closing speech marks.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Which option correctly punctuates the direct speech AND identifies the sentence as an exclamation?",
      example: "What a surprise it was when Grandad announced ___",
      correct: "What a surprise it was when Grandad announced, \"We are moving to Wales!\"",
      distractors: [
        "What a surprise it was when Grandad announced, \"We are moving to Wales\"!",
        "What a surprise it was when Grandad announced \"We are moving to Wales!\"",
        "What a surprise it was when Grandad announced, \"we are moving to Wales!\""
      ],
      why: "The whole sentence begins with 'What a surprise' making it a grammatical exclamation. The speech inside is a statement. The exclamation mark goes inside because the spoken words carry the force.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Which option keeps the reported command inside speech marks AND makes the whole sentence a question?",
      example: "Did the coach shout ___",
      correct: "Did the coach shout, \"Run faster\"?",
      distractors: [
        "Did the coach shout, \"Run faster?\"",
        "Did the coach shout \"Run faster\"?",
        "Did the coach shout, \"run faster\"?"
      ],
      why: "The sentence function is a question (it asks whether the coach shouted). The reported speech is a command. The question mark belongs to the outer sentence, placed after the closing speech marks.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Which option correctly punctuates the question inside speech marks within a statement?",
      example: "Lena asked ___",
      correct: "Lena asked, \"Where is the library?\"",
      distractors: [
        "Lena asked, \"Where is the library\"?",
        "Lena asked \"Where is the library?\"",
        "Lena asked, \"where is the library?\""
      ],
      why: "The sentence is a statement (reporting what Lena asked). The speech inside is a question. The question mark stays inside the speech marks because the spoken words form the question.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Which option punctuates the exclamation inside speech marks AND keeps the outer sentence as a statement?",
      example: "Ben shouted ___",
      correct: "Ben shouted, \"What a fantastic goal that was!\"",
      distractors: [
        "Ben shouted, \"What a fantastic goal that was\"!",
        "Ben shouted \"What a fantastic goal that was!\"",
        "Ben shouted, \"what a fantastic goal that was!\""
      ],
      why: "The outer sentence is a statement (it reports what Ben shouted). The speech is a grammatical exclamation beginning with 'What'. The exclamation mark stays inside the speech marks.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Which option correctly places punctuation when the speech is a statement inside a question?",
      example: "Did the head teacher really announce ___",
      correct: "Did the head teacher really announce, \"School closes early on Friday\"?",
      distractors: [
        "Did the head teacher really announce, \"School closes early on Friday.\"?",
        "Did the head teacher really announce, \"School closes early on Friday?\"",
        "Did the head teacher really announce \"School closes early on Friday\"?"
      ],
      why: "The outer sentence is a question. The speech inside is a statement. The question mark belongs to the whole sentence and goes outside the closing speech marks. No full stop is needed inside.",
      misconception: "speech_punctuation_confusion"
    },
    {
      prompt: "Which option correctly punctuates the command inside speech marks within an exclamation?",
      example: "How loudly the sergeant bellowed ___",
      correct: "How loudly the sergeant bellowed, \"Stand to attention!\"",
      distractors: [
        "How loudly the sergeant bellowed, \"Stand to attention\"!",
        "How loudly the sergeant bellowed \"Stand to attention!\"",
        "How loudly the sergeant bellowed, \"stand to attention!\""
      ],
      why: "The whole sentence begins with 'How loudly' making it an exclamation. The spoken words are a command. The exclamation mark inside the speech marks serves both the command force and the overall exclamation.",
      misconception: "speech_punctuation_confusion"
    }
  ],

  qg_p4_word_class_noun_phrase_transfer: [
    {
      prompt: "Identify the head noun and its word class in this expanded noun phrase.",
      example: "the rusty old bicycle",
      fields: [
        { label: "Head noun", correct: "bicycle", options: ["the", "rusty", "old", "bicycle"] },
        { label: "Word class of 'rusty'", correct: "adjective", options: ["noun", "adjective", "adverb", "determiner"] }
      ],
      why: "The head noun is the main word the phrase is built around. 'Rusty' is an adjective modifying the noun.",
      misconception: "noun_phrase_confusion"
    },
    {
      prompt: "Identify the head noun and the word class of the modifier before it.",
      example: "a terrifying mountain storm",
      fields: [
        { label: "Head noun", correct: "storm", options: ["terrifying", "mountain", "storm", "a"] },
        { label: "Word class of 'mountain'", correct: "noun", options: ["noun", "adjective", "adverb", "verb"] }
      ],
      why: "'Storm' is the head noun. 'Mountain' is a noun used as a modifier (a noun adjunct), not an adjective.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Identify the head noun and the word class of the underlined word in this noun phrase.",
      example: "those incredibly brave firefighters",
      fields: [
        { label: "Head noun", correct: "firefighters", options: ["those", "incredibly", "brave", "firefighters"] },
        { label: "Word class of 'incredibly'", correct: "adverb", options: ["adjective", "adverb", "noun", "determiner"] }
      ],
      why: "'Firefighters' is the head noun. 'Incredibly' is an adverb modifying the adjective 'brave', not itself an adjective.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Identify the head noun and the word class of the first word in this noun phrase.",
      example: "every single morning lesson",
      fields: [
        { label: "Head noun", correct: "lesson", options: ["every", "single", "morning", "lesson"] },
        { label: "Word class of 'every'", correct: "determiner", options: ["determiner", "adjective", "pronoun", "adverb"] }
      ],
      why: "'Lesson' is the head noun the phrase centres on. 'Every' is a determiner specifying which lesson, not an adjective.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Identify the head noun and the word class of the describing word.",
      example: "the brightly painted fence",
      fields: [
        { label: "Head noun", correct: "fence", options: ["the", "brightly", "painted", "fence"] },
        { label: "Word class of 'painted'", correct: "adjective", options: ["verb", "adjective", "adverb", "noun"] }
      ],
      why: "'Fence' is the head noun. 'Painted' here is used as an adjective describing the fence, not as a verb showing ongoing action.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Identify the head noun and classify the word that tells us 'how many'.",
      example: "several heavy wooden crates",
      fields: [
        { label: "Head noun", correct: "crates", options: ["several", "heavy", "wooden", "crates"] },
        { label: "Word class of 'several'", correct: "determiner", options: ["determiner", "adjective", "noun", "adverb"] }
      ],
      why: "'Crates' is the head noun. 'Several' is a determiner telling us how many, not an adjective describing a quality.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Identify the head noun and the word class of the word before it.",
      example: "her new swimming costume",
      fields: [
        { label: "Head noun", correct: "costume", options: ["her", "new", "swimming", "costume"] },
        { label: "Word class of 'swimming'", correct: "adjective", options: ["verb", "adjective", "noun", "adverb"] }
      ],
      why: "'Costume' is the head noun. 'Swimming' is used as an adjective here, telling us the type of costume, not a verb showing action.",
      misconception: "word_class_confusion"
    },
    {
      prompt: "Identify the head noun and the word class of the word that specifies whose.",
      example: "their ancient stone castle",
      fields: [
        { label: "Head noun", correct: "castle", options: ["their", "ancient", "stone", "castle"] },
        { label: "Word class of 'their'", correct: "determiner", options: ["determiner", "pronoun", "adjective", "noun"] }
      ],
      why: "'Castle' is the head noun. 'Their' is a possessive determiner showing ownership, not a pronoun standing alone for a noun.",
      misconception: "word_class_confusion"
    }
  ],

  qg_p4_adverbial_clause_boundary_transfer: [
    {
      prompt: "Which option correctly joins a fronted adverbial to a main clause AND uses the right boundary punctuation?",
      example: "before the bell rang / the children lined up quietly",
      correct: "Before the bell rang, the children lined up quietly.",
      distractors: [
        "Before the bell rang the children lined up quietly.",
        "Before, the bell rang the children lined up quietly.",
        "Before the bell rang; the children lined up quietly."
      ],
      why: "A fronted adverbial clause needs a comma after it to mark the boundary between the adverbial and the main clause. A semicolon is wrong because the adverbial is not an independent clause.",
      misconception: "fronted_adverbial_confusion"
    },
    {
      prompt: "Which option correctly punctuates the sentence with a fronted adverbial AND identifies the main clause boundary?",
      example: "after the storm cleared / we inspected the damage",
      correct: "After the storm cleared, we inspected the damage.",
      distractors: [
        "After the storm cleared we inspected the damage.",
        "After the storm, cleared we inspected the damage.",
        "After the storm cleared: we inspected the damage."
      ],
      why: "The adverbial 'After the storm cleared' needs a comma to show where the subordinate clause ends and the main clause begins. A colon is not used to join an adverbial to a main clause.",
      misconception: "fronted_adverbial_confusion"
    },
    {
      prompt: "Which option places the comma correctly when the adverbial clause appears at the front?",
      example: "although the path was icy / nobody slipped",
      correct: "Although the path was icy, nobody slipped.",
      distractors: [
        "Although the path was icy nobody slipped.",
        "Although, the path was icy nobody slipped.",
        "Although the path was icy; nobody slipped."
      ],
      why: "'Although the path was icy' is a subordinate adverbial clause showing concession. It needs a comma after it because it is fronted. A semicolon would wrongly treat it as an independent clause.",
      misconception: "subordinate_clause_confusion"
    },
    {
      prompt: "Which option uses the correct boundary punctuation when two independent clauses follow a fronted adverbial?",
      example: "during the assembly / the head announced sports day; parents are invited",
      correct: "During the assembly, the head announced sports day; parents are invited.",
      distractors: [
        "During the assembly the head announced sports day; parents are invited.",
        "During the assembly, the head announced sports day, parents are invited.",
        "During the assembly; the head announced sports day; parents are invited."
      ],
      why: "A comma marks the fronted adverbial boundary, and a semicolon correctly separates the two independent clauses that follow. Using only commas creates a comma splice.",
      misconception: "boundary_punctuation_confusion"
    },
    {
      prompt: "Which option correctly punctuates the fronted adverbial and the clause boundary after it?",
      example: "when the museum opened / visitors rushed to the dinosaur hall",
      correct: "When the museum opened, visitors rushed to the dinosaur hall.",
      distractors: [
        "When the museum opened visitors rushed to the dinosaur hall.",
        "When, the museum opened visitors rushed to the dinosaur hall.",
        "When the museum opened; visitors rushed to the dinosaur hall."
      ],
      why: "'When the museum opened' is a fronted adverbial clause. A comma is needed after it. A semicolon is wrong because the adverbial is subordinate, not independent.",
      misconception: "fronted_adverbial_confusion"
    },
    {
      prompt: "Which option correctly uses a fronted adverbial with proper boundary punctuation between two clauses?",
      example: "as soon as the whistle blew / the players sprinted; the crowd cheered",
      correct: "As soon as the whistle blew, the players sprinted; the crowd cheered.",
      distractors: [
        "As soon as the whistle blew the players sprinted; the crowd cheered.",
        "As soon as the whistle blew, the players sprinted, the crowd cheered.",
        "As soon as the whistle blew; the players sprinted; the crowd cheered."
      ],
      why: "A comma separates the fronted adverbial from the first main clause. A semicolon then correctly joins the two independent main clauses. Without the comma, the adverbial boundary is unclear.",
      misconception: "boundary_punctuation_confusion"
    },
    {
      prompt: "Which option correctly punctuates the fronted time adverbial AND the clause it introduces?",
      example: "by the time we arrived / the cake had already been eaten",
      correct: "By the time we arrived, the cake had already been eaten.",
      distractors: [
        "By the time we arrived the cake had already been eaten.",
        "By the time, we arrived the cake had already been eaten.",
        "By the time we arrived: the cake had already been eaten."
      ],
      why: "'By the time we arrived' is a subordinate time adverbial. It needs a comma after the whole adverbial phrase, not after the first word. A colon does not introduce a main clause after an adverbial.",
      misconception: "fronted_adverbial_confusion"
    },
    {
      prompt: "Which option correctly places the comma after the fronted adverbial AND avoids a comma splice between clauses?",
      example: "despite the heavy rain / the match continued; nobody complained",
      correct: "Despite the heavy rain, the match continued; nobody complained.",
      distractors: [
        "Despite the heavy rain the match continued; nobody complained.",
        "Despite the heavy rain, the match continued, nobody complained.",
        "Despite, the heavy rain the match continued; nobody complained."
      ],
      why: "The fronted adverbial 'Despite the heavy rain' needs a comma. The two independent main clauses after it need a semicolon, not another comma, to avoid a comma splice.",
      misconception: "boundary_punctuation_confusion"
    }
  ],

  qg_p4_relative_parenthesis_transfer: [
    {
      prompt: "Which option correctly adds a relative clause as parenthesis with commas?",
      example: "The oak tree ___ has stood for two hundred years.",
      correct: "The oak tree, which was planted by the village founders, has stood for two hundred years.",
      distractors: [
        "The oak tree which was planted by the village founders has stood for two hundred years.",
        "The oak tree, which was planted by the village founders has stood for two hundred years.",
        "The oak tree which, was planted by the village founders, has stood for two hundred years."
      ],
      why: "A non-defining relative clause adds extra information about a specific noun and needs commas at both ends to show it is parenthesis. The commas show you could remove the clause and the sentence still works.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Which option correctly punctuates the non-defining relative clause as parenthesis?",
      example: "Mrs Patel ___ organised the whole event.",
      correct: "Mrs Patel, who teaches Year 6, organised the whole event.",
      distractors: [
        "Mrs Patel who teaches Year 6 organised the whole event.",
        "Mrs Patel, who teaches Year 6 organised the whole event.",
        "Mrs Patel who, teaches Year 6, organised the whole event."
      ],
      why: "The relative clause 'who teaches Year 6' is extra information about Mrs Patel. It needs a comma before and after because it is parenthetical. Without both commas, the boundary is unclear.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Which option correctly uses commas around the relative clause as parenthesis?",
      example: "The River Thames ___ flows through London.",
      correct: "The River Thames, which is over 200 miles long, flows through London.",
      distractors: [
        "The River Thames which is over 200 miles long flows through London.",
        "The River Thames, which is over 200 miles long flows through London.",
        "The River Thames which is over 200 miles long, flows through London."
      ],
      why: "The relative clause adds extra information about the Thames. It is parenthetical, so both commas are needed to show where the extra detail starts and ends.",
      misconception: "relative_clause_confusion"
    },
    {
      prompt: "Which option correctly places the relative clause within commas?",
      example: "The head teacher ___ congratulated the team.",
      correct: "The head teacher, who had been watching from the sideline, congratulated the team.",
      distractors: [
        "The head teacher who had been watching from the sideline congratulated the team.",
        "The head teacher, who had been watching from the sideline congratulated the team.",
        "The head teacher who had been watching, from the sideline, congratulated the team."
      ],
      why: "The relative clause 'who had been watching from the sideline' is non-defining parenthesis. Both commas are required to bracket it. Commas in the wrong place break the clause boundaries.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Which option correctly uses parenthesis commas for the relative clause?",
      example: "The school hall ___ was packed with parents.",
      correct: "The school hall, which had been decorated overnight, was packed with parents.",
      distractors: [
        "The school hall which had been decorated overnight was packed with parents.",
        "The school hall, which had been decorated overnight was packed with parents.",
        "The school hall which had been decorated, overnight, was packed with parents."
      ],
      why: "The clause 'which had been decorated overnight' is extra information (parenthesis). Both commas are needed to show where the extra detail begins and ends.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Which option correctly punctuates the parenthetical relative clause?",
      example: "My grandfather ___ loves telling stories about the war.",
      correct: "My grandfather, who served in the navy, loves telling stories about the war.",
      distractors: [
        "My grandfather who served in the navy loves telling stories about the war.",
        "My grandfather, who served in the navy loves telling stories about the war.",
        "My grandfather who served, in the navy, loves telling stories about the war."
      ],
      why: "The relative clause 'who served in the navy' is parenthetical: it adds extra detail about a specific person. Both commas are needed because the information could be lifted out.",
      misconception: "relative_clause_confusion"
    },
    {
      prompt: "Which option correctly adds a 'which' clause as parenthesis?",
      example: "The old bridge ___ was finally repaired last summer.",
      correct: "The old bridge, which had been damaged in the flood, was finally repaired last summer.",
      distractors: [
        "The old bridge which had been damaged in the flood was finally repaired last summer.",
        "The old bridge, which had been damaged in the flood was finally repaired last summer.",
        "The old bridge which had been damaged, in the flood, was finally repaired last summer."
      ],
      why: "The relative clause adds non-essential information and acts as parenthesis. You need both a comma before 'which' and a comma after the clause to bracket the extra detail.",
      misconception: "parenthesis_confusion"
    },
    {
      prompt: "Which option correctly places parenthesis commas around the relative clause?",
      example: "The library book ___ must be returned by Friday.",
      correct: "The library book, which Amir borrowed last week, must be returned by Friday.",
      distractors: [
        "The library book which Amir borrowed last week must be returned by Friday.",
        "The library book, which Amir borrowed last week must be returned by Friday.",
        "The library book which Amir, borrowed last week, must be returned by Friday."
      ],
      why: "The clause 'which Amir borrowed last week' is extra detail about the specific book. Both commas are needed because it is a non-defining relative clause functioning as parenthesis.",
      misconception: "parenthesis_confusion"
    }
  ],

  qg_p4_verb_form_register_transfer: [
    {
      prompt: "Which option uses the correct tense, an appropriate modal verb, AND Standard English?",
      example: "A letter to parents about a school trip that will happen next week.",
      correct: "Your child will need a packed lunch and should wear comfortable shoes.",
      distractors: [
        "Your child will need a packed lunch and should of wore comfortable shoes.",
        "Your child needed a packed lunch and should wear comfortable shoes.",
        "Your child will need a packed lunch and must of worn comfortable shoes."
      ],
      why: "The future tense ('will need') matches the upcoming trip. 'Should wear' is a suitable modal for advice. 'Should of' is non-standard (Standard English uses 'should have'), and past tense is wrong for a future event.",
      misconception: "standard_english_confusion"
    },
    {
      prompt: "Which option combines the correct past tense, a modal showing possibility, AND Standard English?",
      example: "A report about what happened during a science experiment yesterday.",
      correct: "The mixture changed colour, which could indicate a chemical reaction.",
      distractors: [
        "The mixture changed colour, which could of indicated a chemical reaction.",
        "The mixture changes colour, which could indicate a chemical reaction.",
        "The mixture changed colour, which can indicate a chemical reaction."
      ],
      why: "Past tense ('changed') matches yesterday. 'Could indicate' shows possibility. 'Could of' is non-standard. Present tense is wrong for a past event. 'Can' shows general ability, not past possibility.",
      misconception: "tense_confusion"
    },
    {
      prompt: "Which option uses the present perfect tense, a modal of certainty, AND Standard English?",
      example: "A notice about lost property that has been found.",
      correct: "A blue coat has been found; it must belong to someone in Year 5.",
      distractors: [
        "A blue coat has been found; it must of belonged to someone in Year 5.",
        "A blue coat was found; it must belong to someone in Year 5.",
        "A blue coat has been found; it might of belonged to someone in Year 5."
      ],
      why: "Present perfect ('has been found') shows the action is relevant now. 'Must belong' expresses certainty. 'Must of' is non-standard English; the correct form is 'must have'.",
      misconception: "standard_english_confusion"
    },
    {
      prompt: "Which option uses the correct future tense, an appropriate modal, AND Standard English?",
      example: "An announcement about a visitor coming to school tomorrow.",
      correct: "An author will visit tomorrow; pupils may ask questions afterwards.",
      distractors: [
        "An author will visit tomorrow; pupils may of asked questions afterwards.",
        "An author visited tomorrow; pupils may ask questions afterwards.",
        "An author will visit tomorrow; pupils might of ask questions afterwards."
      ],
      why: "Future tense ('will visit') fits tomorrow. 'May ask' is a suitable modal for permission. 'May of' is non-standard. Past tense is wrong for a future event.",
      misconception: "standard_english_confusion"
    },
    {
      prompt: "Which option combines past progressive tense, a modal of obligation, AND Standard English?",
      example: "A note explaining what happened when the fire alarm sounded.",
      correct: "Children were lining up when the alarm rang; they had to leave calmly.",
      distractors: [
        "Children were lining up when the alarm rang; they had of left calmly.",
        "Children are lining up when the alarm rang; they had to leave calmly.",
        "Children were lining up when the alarm rang; they should of left calmly."
      ],
      why: "Past progressive ('were lining up') shows an ongoing action interrupted by the alarm. 'Had to' expresses obligation. 'Had of' and 'should of' are non-standard English forms.",
      misconception: "standard_english_confusion"
    },
    {
      prompt: "Which option uses the present tense for a general truth, a modal of ability, AND Standard English?",
      example: "A poster about recycling for the school corridor.",
      correct: "Plastic takes hundreds of years to break down; we can reduce waste by recycling.",
      distractors: [
        "Plastic takes hundreds of years to break down; we can of reduced waste by recycling.",
        "Plastic took hundreds of years to break down; we can reduce waste by recycling.",
        "Plastic takes hundreds of years to break down; we could of reduce waste by recycling."
      ],
      why: "Present tense ('takes') states a general truth. 'Can reduce' shows ability. 'Can of' and 'could of' are non-standard English. Past tense is wrong for a timeless fact.",
      misconception: "standard_english_confusion"
    },
    {
      prompt: "Which option combines past perfect tense, a modal of likelihood, AND Standard English?",
      example: "A diary entry about a surprise that happened at a birthday party.",
      correct: "Grandma had hidden the present before I arrived; she might have planned it for weeks.",
      distractors: [
        "Grandma had hidden the present before I arrived; she might of planned it for weeks.",
        "Grandma hid the present before I arrived; she might have planned it for weeks.",
        "Grandma had hidden the present before I arrived; she might of plan it for weeks."
      ],
      why: "Past perfect ('had hidden') shows an action completed before another past event. 'Might have planned' combines the modal of likelihood with the correct Standard English form. 'Might of' is non-standard.",
      misconception: "standard_english_confusion"
    },
    {
      prompt: "Which option uses present tense for a rule, a modal of permission, AND Standard English?",
      example: "A classroom charter about behaviour during reading time.",
      correct: "Pupils read silently for twenty minutes; they may choose their own book.",
      distractors: [
        "Pupils read silently for twenty minutes; they may of chose their own book.",
        "Pupils were reading silently for twenty minutes; they may choose their own book.",
        "Pupils read silently for twenty minutes; they might of choose their own book."
      ],
      why: "Present tense ('read') suits a standing rule. 'May choose' grants permission. 'May of' and 'might of' are non-standard English. Past progressive is wrong for an ongoing rule.",
      misconception: "standard_english_confusion"
    }
  ],

  qg_p4_cohesion_formality_transfer: [
    {
      prompt: "Which option replaces the repeated noun with a pronoun AND maintains formal register?",
      example: "The council has approved the plans. The council will begin work in September.",
      correct: "The council has approved the plans. It will begin work in September.",
      distractors: [
        "The council has approved the plans. They're gonna start work in September.",
        "The council has approved the plans. The council will begin work in September.",
        "The council has approved the plans. Them lot will begin work in September."
      ],
      why: "'It' avoids repetition of 'the council' (cohesion) while keeping the formal tone. 'They're gonna' is too informal. Repeating the noun weakens cohesion. 'Them lot' is non-standard.",
      misconception: "pronoun_cohesion_confusion"
    },
    {
      prompt: "Which option improves cohesion AND keeps the writing formal?",
      example: "The museum opens at nine. The museum closes at five. Visitors must book online.",
      correct: "The museum opens at nine and closes at five. Visitors must book online.",
      distractors: [
        "The museum opens at nine. It shuts at five. Visitors have gotta book online.",
        "The museum opens at nine. The museum closes at five. You lot must book online.",
        "It opens at nine and shuts at five. People gotta book online."
      ],
      why: "Joining the clauses avoids repeating 'The museum' (cohesion) and keeps formal vocabulary ('closes', 'must book'). 'Gotta' and 'You lot' are informal.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Which option uses a pronoun for cohesion AND keeps formal vocabulary?",
      example: "Dr Patel presented the findings. Dr Patel explained the next steps.",
      correct: "Dr Patel presented the findings. She then explained the next steps.",
      distractors: [
        "Dr Patel presented the findings. She then chatted about what's next.",
        "Dr Patel presented the findings. Dr Patel explained the next steps.",
        "Patel presented the findings. She banged on about what comes next."
      ],
      why: "'She then explained' uses a pronoun to avoid repetition (cohesion) while maintaining formal language. 'Chatted about' and 'banged on' are informal.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Which option links the ideas cohesively AND keeps a formal tone?",
      example: "The project was completed on time. The project received praise from the governors.",
      correct: "The project was completed on time and received praise from the governors.",
      distractors: [
        "The project was done on time and the governors were well chuffed.",
        "The project was completed on time. The project received praise from the governors.",
        "It got done on time and the governors loved it."
      ],
      why: "Joining with 'and' avoids repetition (cohesion). 'Completed' and 'received praise' maintain formality. 'Well chuffed', 'got done', and 'loved it' are informal.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Which option improves pronoun cohesion AND keeps the tone suitable for a school report?",
      example: "James has improved his reading. James now reads chapter books independently.",
      correct: "James has improved his reading. He now reads chapter books independently.",
      distractors: [
        "James has improved his reading. The lad now reads chapter books on his own.",
        "James has improved his reading. James now reads chapter books independently.",
        "He's got better at reading. He reads chapter books by himself now."
      ],
      why: "'He' replaces the repeated name (cohesion) and the sentence stays formal. 'The lad' is too informal for a report. 'Got better' reduces formality.",
      misconception: "pronoun_cohesion_confusion"
    },
    {
      prompt: "Which option removes repetition AND maintains formal register?",
      example: "The charity raised three thousand pounds. The charity will donate it to the hospital.",
      correct: "The charity raised three thousand pounds, which it will donate to the hospital.",
      distractors: [
        "The charity got three grand and is giving it to the hospital.",
        "The charity raised three thousand pounds. The charity will donate it to the hospital.",
        "They raised three thousand pounds and they're gonna give it to the hospital."
      ],
      why: "Using 'which it will' avoids repetition (cohesion) with a relative clause and maintains the formal register. 'Three grand', 'gonna', and 'They' without a clear referent weaken both cohesion and formality.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Which option uses a pronoun to improve flow AND keeps formal language?",
      example: "The headteacher addressed the assembly. The headteacher reminded pupils about uniform.",
      correct: "The headteacher addressed the assembly. She reminded pupils about uniform expectations.",
      distractors: [
        "The headteacher addressed the assembly. She had a go at everyone about uniform.",
        "The headteacher addressed the assembly. The headteacher reminded pupils about uniform.",
        "The head gave a speech. She told kids to sort their uniform out."
      ],
      why: "'She reminded' uses a pronoun for cohesion and keeps the formal vocabulary. 'Had a go at' and 'told kids to sort' are too informal for this context.",
      misconception: "formality_confusion"
    },
    {
      prompt: "Which option avoids repetition through a pronoun AND uses formal phrasing?",
      example: "The experiment was successful. The experiment will be repeated next term.",
      correct: "The experiment was successful. It will be repeated next term.",
      distractors: [
        "The experiment was successful. We're gonna do it again next term.",
        "The experiment was successful. The experiment will be repeated next term.",
        "It went well so we'll have another go next term."
      ],
      why: "'It will be repeated' uses a pronoun to avoid repetition (cohesion) and keeps the passive, formal style of scientific writing. 'Gonna' and 'have another go' are informal.",
      misconception: "pronoun_cohesion_confusion"
    }
  ],

  qg_p4_voice_roles_transfer: [
    {
      prompt: "Identify the voice and the grammatical role of the underlined noun phrase.",
      example: "The trophy was awarded to Amir by the head teacher.",
      fields: [
        { label: "Voice of the sentence", correct: "passive", options: ["active", "passive"] },
        { label: "Role of 'the trophy'", correct: "subject", options: ["subject", "object"] }
      ],
      why: "The sentence is passive because the action is done TO the trophy. In a passive sentence, the thing affected ('the trophy') becomes the grammatical subject.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Identify the voice and the grammatical role of the underlined noun phrase.",
      example: "The goalkeeper saved the penalty brilliantly.",
      fields: [
        { label: "Voice of the sentence", correct: "active", options: ["active", "passive"] },
        { label: "Role of 'the penalty'", correct: "object", options: ["subject", "object"] }
      ],
      why: "The sentence is active because the doer ('the goalkeeper') comes first and does the action. 'The penalty' receives the action, so it is the object.",
      misconception: "subject_object_confusion"
    },
    {
      prompt: "Identify the voice and the grammatical role of the underlined noun phrase.",
      example: "The cake was eaten by the children before lunch.",
      fields: [
        { label: "Voice of the sentence", correct: "passive", options: ["active", "passive"] },
        { label: "Role of 'the cake'", correct: "subject", options: ["subject", "object"] }
      ],
      why: "This is passive voice: the thing affected ('the cake') has been moved to the subject position. Even though the children did the eating, 'the cake' is the grammatical subject.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Identify the voice and the grammatical role of the underlined noun phrase.",
      example: "Lena painted the scenery for the school play.",
      fields: [
        { label: "Voice of the sentence", correct: "active", options: ["active", "passive"] },
        { label: "Role of 'the scenery'", correct: "object", options: ["subject", "object"] }
      ],
      why: "The sentence is active because the doer ('Lena') performs the action. 'The scenery' receives the painting, making it the object.",
      misconception: "subject_object_confusion"
    },
    {
      prompt: "Identify the voice and the grammatical role of the underlined noun phrase.",
      example: "The windows were smashed by the hailstones during the storm.",
      fields: [
        { label: "Voice of the sentence", correct: "passive", options: ["active", "passive"] },
        { label: "Role of 'the windows'", correct: "subject", options: ["subject", "object"] }
      ],
      why: "This is passive voice: the affected thing ('the windows') is the grammatical subject. The doer ('the hailstones') appears later in a 'by' phrase.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Identify the voice and the grammatical role of the underlined noun phrase.",
      example: "The librarian shelved the new books carefully.",
      fields: [
        { label: "Voice of the sentence", correct: "active", options: ["active", "passive"] },
        { label: "Role of 'the new books'", correct: "object", options: ["subject", "object"] }
      ],
      why: "The sentence is active: the doer ('the librarian') performs the action. 'The new books' receive the shelving, so they are the object.",
      misconception: "subject_object_confusion"
    },
    {
      prompt: "Identify the voice and the grammatical role of the underlined noun phrase.",
      example: "The letter was posted by Grandma yesterday afternoon.",
      fields: [
        { label: "Voice of the sentence", correct: "passive", options: ["active", "passive"] },
        { label: "Role of 'the letter'", correct: "subject", options: ["subject", "object"] }
      ],
      why: "Passive voice places the affected thing ('the letter') in the subject position. Grandma did the posting but appears in the 'by' phrase, not as the grammatical subject.",
      misconception: "active_passive_confusion"
    },
    {
      prompt: "Identify the voice and the grammatical role of the underlined noun phrase.",
      example: "The children carried the heavy equipment across the field.",
      fields: [
        { label: "Voice of the sentence", correct: "active", options: ["active", "passive"] },
        { label: "Role of 'the heavy equipment'", correct: "object", options: ["subject", "object"] }
      ],
      why: "The sentence is active: the doer ('the children') performs the action. 'The heavy equipment' receives the carrying and is therefore the object.",
      misconception: "subject_object_confusion"
    }
  ],

  qg_p4_possession_hyphen_clarity_transfer: [
    {
      prompt: "Which option correctly uses both the possessive apostrophe AND a hyphen to avoid ambiguity?",
      example: "The well known author's latest book topped the charts.",
      correct: "The well-known author's latest book topped the charts.",
      distractors: [
        "The well known authors latest book topped the charts.",
        "The well known author's latest book topped the charts.",
        "The well-known authors' latest book topped the charts."
      ],
      why: "A hyphen in 'well-known' links the compound adjective before the noun, avoiding the misreading 'well known-author'. The apostrophe in 'author's' shows singular possession of the book.",
      misconception: "hyphen_ambiguity_confusion"
    },
    {
      prompt: "Which option uses the apostrophe for possession AND the hyphen to clarify meaning?",
      example: "The children's long awaited trip finally arrived.",
      correct: "The children's long-awaited trip finally arrived.",
      distractors: [
        "The childrens long-awaited trip finally arrived.",
        "The children's long awaited trip finally arrived.",
        "The childrens' long-awaited trip finally arrived."
      ],
      why: "'Children's' uses an apostrophe before 's' because 'children' is an irregular plural. 'Long-awaited' needs a hyphen to show the two words work together as one adjective before 'trip'.",
      misconception: "apostrophe_possession_confusion"
    },
    {
      prompt: "Which option correctly shows plural possession AND uses a hyphen to avoid misreading?",
      example: "The players hard earned medals were displayed in the cabinet.",
      correct: "The players' hard-earned medals were displayed in the cabinet.",
      distractors: [
        "The player's hard-earned medals were displayed in the cabinet.",
        "The players' hard earned medals were displayed in the cabinet.",
        "The players hard-earned medals were displayed in the cabinet."
      ],
      why: "'Players'' has the apostrophe after the 's' because multiple players own the medals (plural possession). 'Hard-earned' needs a hyphen to show it is a single compound adjective.",
      misconception: "apostrophe_possession_confusion"
    },
    {
      prompt: "Which option uses both the possessive apostrophe AND the hyphen correctly?",
      example: "The school's state of the art science lab impressed visitors.",
      correct: "The school's state-of-the-art science lab impressed visitors.",
      distractors: [
        "The schools state-of-the-art science lab impressed visitors.",
        "The school's state of the art science lab impressed visitors.",
        "The schools' state-of-the-art science lab impressed visitors."
      ],
      why: "'School's' shows the lab belongs to one school (singular possession). 'State-of-the-art' needs hyphens to form a single compound adjective modifying 'science lab'.",
      misconception: "hyphen_ambiguity_confusion"
    },
    {
      prompt: "Which option uses the possessive apostrophe AND the hyphen to prevent a misreading?",
      example: "My sister's hand painted vase sits on the shelf.",
      correct: "My sister's hand-painted vase sits on the shelf.",
      distractors: [
        "My sisters hand-painted vase sits on the shelf.",
        "My sister's hand painted vase sits on the shelf.",
        "My sisters' hand-painted vase sits on the shelf."
      ],
      why: "'Sister's' shows the vase belongs to one sister. 'Hand-painted' needs a hyphen so the reader understands the vase was painted by hand, not that a hand was painted on the vase.",
      misconception: "hyphen_ambiguity_confusion"
    },
    {
      prompt: "Which option uses both possession and hyphenation correctly?",
      example: "The teachers well prepared lesson plan impressed the inspector.",
      correct: "The teacher's well-prepared lesson plan impressed the inspector.",
      distractors: [
        "The teachers well-prepared lesson plan impressed the inspector.",
        "The teacher's well prepared lesson plan impressed the inspector.",
        "The teachers' well prepared lesson plan impressed the inspector."
      ],
      why: "'Teacher's' shows one teacher owns the plan (singular possession). 'Well-prepared' needs a hyphen because the two words form a single adjective before 'lesson plan'.",
      misconception: "apostrophe_possession_confusion"
    },
    {
      prompt: "Which option uses both the apostrophe and hyphen correctly in context?",
      example: "The company's award winning product sold out quickly.",
      correct: "The company's award-winning product sold out quickly.",
      distractors: [
        "The companys award-winning product sold out quickly.",
        "The company's award winning product sold out quickly.",
        "The companies' award-winning product sold out quickly."
      ],
      why: "'Company's' uses an apostrophe to show singular possession. 'Award-winning' needs a hyphen to show the compound adjective modifies 'product' as a unit.",
      misconception: "hyphen_ambiguity_confusion"
    },
    {
      prompt: "Which version makes ownership and compound meaning clear?",
      example: "The dog's bright orange collar stood out, or the dogs bright-orange collar stood out.",
      correct: "The dog's bright-orange collar stood out.",
      distractors: [
        "The dogs bright-orange collar stood out.",
        "The dog's bright orange collar stood out.",
        "The dogs' bright orange collar stood out."
      ],
      why: "The apostrophe shows the collar belongs to one dog, and the hyphen in 'bright-orange' shows that both words together describe the colour of the collar.",
      misconception: "apostrophe_possession_confusion"
    }
  ]
});

function buildP4MixedTransferChoiceQuestion(template, seed, cases) {
  const rng = mulberry32(seed);
  const item = pickBySeed(seed, cases);
  const correct = cleanSpaces(item.correct);
  const distractors = dedupePlain(item.distractors || []).filter(option => option !== correct);
  const answerSpec = exactAnswerSpec(correct, distractors, {
    misconception: item.misconception,
    feedbackLong: item.why,
    answerText: correct
  });
  const stemParts = [`<p>${escapeHtml(item.prompt)}</p>`];
  if (item.example) stemParts.push(`<p><strong>${escapeHtml(item.example)}</strong></p>`);
  return makeBaseQuestion(template, seed, {
    marks: 1,
    answerSpec,
    stemHtml: stemParts.join(""),
    inputSpec: { type: "single_choice", label: "Choose one", options: buildChoiceOptions(rng, correct, distractors) },
    solutionLines: [
      "Apply both grammar concepts together to find the correct answer.",
      item.why,
      `The correct option is: ${correct}`
    ],
    evaluate: (resp) => markByAnswerSpec(answerSpec, resp)
  });
}

function buildP4MixedTransferClassifyQuestion(template, seed, cases) {
  const item = pickBySeed(seed, cases);
  const rows = item.fields.map((field, index) => ({
    key: `row${index}`,
    label: field.label,
    correct: field.correct,
    options: field.options
  }));
  const allColumns = [...new Set(rows.flatMap(r => r.options))];
  const fields = Object.fromEntries(rows.map((row) => [
    row.key,
    exactAnswerSpec(row.correct, row.options.filter(o => o !== row.correct), {
      misconception: item.misconception,
      feedbackLong: item.why
    })
  ]));
  const answerText = rows.map(row => `${row.label}: ${row.correct}`).join(" | ");
  const answerSpec = multiFieldAnswerSpec(fields, {
    maxScore: rows.length,
    misconception: item.misconception,
    feedbackLong: item.why,
    answerText
  });
  return makeBaseQuestion(template, seed, {
    marks: rows.length,
    answerSpec,
    stemHtml: `<p>${escapeHtml(item.prompt)}</p><p><strong>${escapeHtml(item.example)}</strong></p>`,
    inputSpec: { type: "table_choice", columns: allColumns, rows: rows.map(r => ({ key: r.key, label: r.label })) },
    solutionLines: [
      "Classify each row by applying both grammar concepts.",
      item.why,
      answerText
    ],
    evaluate: (resp) => markByAnswerSpec(answerSpec, resp)
  });
}

function buildP3ExplanationChoiceQuestion(template, seed, cases) {
  const rng = mulberry32(seed);
  const item = cases[((Number(seed) || 0) % cases.length + cases.length) % cases.length];
  const correct = cleanSpaces(item.correct);
  const distractors = dedupePlain(item.distractors || []).filter(option => option !== correct);
  const answerSpec = exactAnswerSpec(correct, distractors, {
    misconception:item.misconception,
    feedbackLong:item.why,
    answerText:correct
  });
  const stemParts = [
    `<p>${escapeHtml(item.prompt)}</p>`
  ];
  if (item.example) stemParts.push(`<p><strong>${escapeHtml(item.example)}</strong></p>`);
  if (item.focus) stemParts.push(`<p><strong>Focus:</strong> ${escapeHtml(item.focus)}</p>`);
  return makeBaseQuestion(template, seed, {
    marks:1,
    answerSpec,
    stemHtml:stemParts.join(""),
    inputSpec:{ type:"single_choice", label:"Choose one", options:buildChoiceOptions(rng, correct, distractors) },
    solutionLines:[
      "Choose the option that explains the grammar relationship.",
      item.why,
      `The best explanation is: ${correct}`
    ],
    evaluate:(resp)=>markByAnswerSpec(answerSpec, resp)
  });
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, arr) {
  return arr[randInt(rng, 0, arr.length - 1)];
}

/** Deterministic seed-indexed pick — guarantees distinct items for consecutive seeds when bank.length >= 3. */
function pickBySeed(seed, arr) {
  return arr[((seed - 1) % arr.length + arr.length) % arr.length];
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

function answerSpecBase(kind, golden, nearMiss, opts = {}) {
  const misconception = opts.misconception || "misread_question";
  return {
    kind,
    golden: dedupePlain(Array.isArray(golden) ? golden : [golden]),
    nearMiss: dedupePlain(nearMiss || []),
    maxScore: opts.maxScore || 1,
    misconception,
    feedbackLong: opts.feedbackLong || "",
    answerText: opts.answerText || (Array.isArray(golden) ? golden[0] : golden) || "",
    minimalHint: MINIMAL_HINTS[misconception] || "Check the sentence structure and the instruction again.",
    ...(opts.punctuationMisconception ? { punctuationMisconception: opts.punctuationMisconception } : {}),
    ...(opts.params ? { params: opts.params } : {})
  };
}

function normalisedTextAnswerSpec(correct, nearMiss, opts = {}) {
  return answerSpecBase("normalisedText", correct, nearMiss, opts);
}

function acceptedSetAnswerSpec(accepted, nearMiss, opts = {}) {
  return answerSpecBase("acceptedSet", accepted, nearMiss, {
    maxScore: 2,
    ...opts
  });
}

function punctuationPatternAnswerSpec(accepted, nearMiss, opts = {}) {
  return answerSpecBase("punctuationPattern", accepted, nearMiss, opts);
}

function manualReviewOnlyAnswerSpec(opts = {}) {
  return {
    kind: "manualReviewOnly",
    maxScore: 0,
    feedbackLong: opts.feedbackLong || "Your response has been saved for teacher or parent review.",
    minimalHint: opts.minimalHint || "This writing response is for review, not automatic marking."
  };
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

function generateFormalityCase(rng, seed) {
  if (seed !== undefined) return pickBySeed(seed, EXTRA_LEXICON.formalFrames);
  return EXTRA_LEXICON.formalFrames[seededIndex(rng, EXTRA_LEXICON.formalFrames.length)];
}

function generateModalCase(rng, seed) {
  if (seed !== undefined) return pickBySeed(seed, EXTRA_LEXICON.modalFrames);
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

export const GRAMMAR_CONTENT_RELEASE_ID = 'grammar-qg-p4-2026-04-28';
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
