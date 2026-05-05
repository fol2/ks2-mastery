// Original KS2 Reading content promoted from the single-file PoC into the shared
// subject-content layer. The Worker reading engine imports this file; the
// browser may render its safe metadata but never performs production marking.

export const READING_CONTENT_RELEASE_ID = 'reading-poc-promoted-2026-05-05';
export const READING_CONTENT_VERSION = 1;

export const READING_SKILLS = Object.freeze({
  "2a": {
    "name": "Vocabulary in context",
    "domain": "KS2 content domain 2a"
  },
  "2b": {
    "name": "Retrieve and record information",
    "domain": "KS2 content domain 2b"
  },
  "2c": {
    "name": "Summarise main ideas",
    "domain": "KS2 content domain 2c"
  },
  "2d": {
    "name": "Inference with evidence",
    "domain": "KS2 content domain 2d"
  },
  "2e": {
    "name": "Prediction",
    "domain": "KS2 content domain 2e"
  },
  "2f": {
    "name": "How structure contributes",
    "domain": "KS2 content domain 2f"
  },
  "2g": {
    "name": "Author word or phrase choices",
    "domain": "KS2 content domain 2g"
  },
  "2h": {
    "name": "Make comparisons within a text",
    "domain": "KS2 content domain 2h"
  },
  "P1": {
    "name": "Punctuation for pausing and meaning",
    "domain": "Punctuation support strand"
  },
  "P2": {
    "name": "Speech punctuation and voice",
    "domain": "Punctuation support strand"
  },
  "P3": {
    "name": "Parenthesis, dashes and brackets",
    "domain": "Punctuation support strand"
  },
  "P4": {
    "name": "Colon, semicolon and list punctuation",
    "domain": "Punctuation support strand"
  }
});

export const READING_QUESTION_TYPE_LABELS = Object.freeze({
  "mcq": "Multiple choice",
  "short": "Short answer",
  "evidenceShort": "Answer + evidence",
  "open": "Short written explanation",
  "multiSelect": "Choose all that apply",
  "match": "Matching",
  "order": "Ordering"
});

export const READING_MISCONCEPTIONS = Object.freeze({
  "no_attempt": "No real attempt made",
  "misread_detail": "Important detail missed or misread",
  "weak_evidence": "Answer not anchored in the text",
  "vocab_out_of_context": "Word meaning guessed without using the sentence",
  "summary_too_narrow": "Focused on one detail instead of the main idea",
  "prediction_not_text_based": "Prediction not supported by clues in the text",
  "author_choice_literal_only": "Described the words but not their effect",
  "whole_text_structure": "Missed how one part builds on another",
  "comparison_partial": "Only one side of the comparison was used",
  "sequence_tracking": "Events were not tracked in the right order",
  "selection_slip": "An option was chosen without checking the text carefully",
  "punctuation_job": "Punctuation was noticed but its job in the sentence was unclear",
  "punctuation_meaning": "The punctuation mark was not linked clearly to meaning",
  "punctuation_voice": "Speech or end punctuation cues were missed",
  "punctuation_extra_info": "The extra information set off by punctuation was not tracked",
  "punctuation_linking": "The punctuation that linked or prepared ideas was misunderstood"
});

export const READING_PASSAGES = Object.freeze([
  {
    "id": "red_tin_box",
    "title": "The Red Tin Box",
    "genre": "fiction",
    "difficulty": 2,
    "isLong": false,
    "blocks": [
      "By mid-morning, the rain had turned the yard behind Grandad's house into a tray of silver puddles. Nia had already played cards, sorted buttons into jam jars and looked through every cupboard in the narrow kitchen. When Grandad said she could explore the loft, she climbed the ladder with the serious feeling that treasure might be hiding under the dust.",
      "The loft smelled of old paper and warm wood. At the back, behind a rolled-up rug, she found a red tin box no bigger than a lunch tin. Its paint was chipped at the corners, but someone had once polished the lid until it shone. Inside were not coins or jewellery, but dozens of folded slips of paper tied with blue thread.",
      "Grandad laughed when he saw her puzzled face. \"That was your gran's noticing box,\" he said. \"When work was busy and money was tight, she made herself write down one thing each day that was worth noticing.\" Nia untied the bundle. The slips held small, exact observations: first swallow above the canal; smell of oranges on a freezing Tuesday; Mrs Khan laughing before six o'clock; plum tree trying again after the frost.",
      "At first, Nia thought the notes were odd. None of them sounded important. Yet when she read them a second time, the house around her seemed to change. The ticking hall clock no longer sounded lonely. The rain on the skylight no longer felt like weather that was trapping her indoors. It was as if the box had quietly opened a second version of the day, one she had almost missed.",
      "She carried the tin downstairs and sat beside the window while Grandad mended a broken drawer handle. By lunchtime, Nia had started her own list on the back of an old envelope: the strip of gold light on the sink, the hiss of the kettle, the way the wet yard held the shape of the clouds."
    ],
    "questions": [
      {
        "id": "rtb_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "What did Nia find inside the red tin box?",
        "check": {
          "keywordAny": [
            [
              "fold",
              "slip",
              "paper"
            ],
            [
              "note"
            ],
            [
              "paper",
              "thread"
            ]
          ]
        },
        "modelAnswer": "Folded slips of paper with notes on them.",
        "explanation": "The box held folded slips of paper tied with blue thread.",
        "hint": "Look again at the end of the second paragraph."
      },
      {
        "id": "rtb_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the phrase \"worth noticing\" mean in paragraph 3?",
        "options": [
          "expensive enough to keep",
          "important enough to pay attention to",
          "too difficult to understand",
          "hidden so that others cannot see it"
        ],
        "correct": 1,
        "modelAnswer": "important enough to pay attention to",
        "explanation": "Grandad explains that Gran wrote down one thing each day that deserved attention, even if it was small.",
        "hint": "Think about why Gran wrote one thing down each day."
      },
      {
        "id": "rtb_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "How does Nia's view of the house change after she reads the notes? Use a short quotation or phrase from the text to support your answer.",
        "answerCheck": {
          "keywordAny": [
            [
              "house",
              "seem",
              "chang"
            ],
            [
              "see",
              "day",
              "different"
            ],
            [
              "notice",
              "small",
              "thing"
            ],
            [
              "less",
              "bore"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "opened a second version of the day",
            "the house around her seemed to change",
            "the ticking hall clock no longer sounded lonely",
            "the rain on the skylight no longer felt like weather that was trapping her indoors"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "She starts to see the house and day differently, noticing interesting details instead of just feeling bored. Evidence could include: \"the house around her seemed to change\".",
        "explanation": "The notes help Nia notice value in ordinary things, so the same house feels fuller and more interesting.",
        "hint": "Answer the change first, then copy a few words that prove it.",
        "reread": [
          4
        ]
      },
      {
        "id": "rtb_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which option best summarises paragraphs 3 and 4?",
        "options": [
          "Grandad tells Nia to clean the loft, and she feels annoyed that she has to work.",
          "Nia learns that Gran recorded small daily details, and this helps Nia notice the day differently.",
          "Nia decides the notes are silly, so she puts the box back in the loft.",
          "Grandad explains how expensive the box was when Gran bought it."
        ],
        "correct": 1,
        "modelAnswer": "Nia learns that Gran recorded small daily details, and this helps Nia notice the day differently.",
        "explanation": "Those paragraphs explain what the notes are for and how they change Nia's thinking.",
        "hint": "Pick the choice that includes both the notes and their effect on Nia."
      },
      {
        "id": "rtb_q5",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why does the writer say the plum tree was \"trying again after the frost\"?",
        "rubric": [
          {
            "label": "Explains personification",
            "check": {
              "keywordAny": [
                [
                  "tree",
                  "sound",
                  "like",
                  "person"
                ],
                [
                  "personif"
                ],
                [
                  "giv",
                  "tree",
                  "human"
                ]
              ]
            }
          },
          {
            "label": "Shows persistence or recovery",
            "check": {
              "keywordAny": [
                [
                  "recover"
                ],
                [
                  "start",
                  "again"
                ],
                [
                  "keep",
                  "grow"
                ],
                [
                  "persever"
                ],
                [
                  "not",
                  "give",
                  "up"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The writer makes the tree sound like a person so that its recovery feels brave and hopeful, as if it is making another effort after damage from the frost.",
        "explanation": "This choice of words personifies the tree and makes the small detail feel hopeful.",
        "hint": "Think about how the tree is made to sound almost human."
      },
      {
        "id": "rtb_q6",
        "type": "short",
        "skill": "2e",
        "marks": 1,
        "stem": "What is Nia most likely to do the next day? Explain briefly.",
        "check": {
          "keywordAny": [
            [
              "keep",
              "list"
            ],
            [
              "write",
              "notic"
            ],
            [
              "make",
              "note"
            ],
            [
              "start",
              "own",
              "list"
            ]
          ]
        },
        "modelAnswer": "She is likely to keep writing her own noticing list.",
        "explanation": "The final paragraph shows she has already begun her own list, so continuing it is the most likely next step.",
        "hint": "Use the final paragraph to make your prediction."
      },
      {
        "id": "rtb_q7",
        "type": "mcq",
        "skill": "P4",
        "marks": 1,
        "stem": "In the sentence beginning \"The slips held small, exact observations:\", what job does the colon do?",
        "options": [
          "It prepares the reader for the examples that follow.",
          "It shows the exact words being spoken.",
          "It marks the end of a question.",
          "It separates a fronted adverbial from the rest of the sentence."
        ],
        "correct": 0,
        "modelAnswer": "It prepares the reader for the examples that follow.",
        "explanation": "The colon signals that specific examples of the observations are about to come next.",
        "hint": "Look at what comes immediately after the colon."
      }
    ]
  },
  {
    "id": "city_swifts",
    "title": "Why Swifts Choose Towns",
    "genre": "non-fiction",
    "difficulty": 2,
    "isLong": false,
    "blocks": [
      "Swifts are dark, narrow-winged birds that spend astonishing amounts of time in the air. Unlike many birds, they may eat, drink and even sleep while flying. They arrive in Britain in late spring after a long migration from Africa, and for a few months their sharp calls race over streets, rivers and school roofs.",
      "Although people often imagine wildlife far from buildings and traffic, swifts have learned to use towns well. Older buildings can contain small gaps beneath tiles or behind brickwork, which make safe nest spaces high above the ground. Warm air over roofs and roads can also lift flying insects, giving swifts plenty to eat as they sweep and turn.",
      "However, town life can create problems too. When roofs are repaired or walls are sealed, the narrow holes that swifts have used for years may disappear. Because swifts often return to the same nesting place each summer, they can lose a home without warning. To help, some builders now fit special swift bricks that leave a safe cavity inside a wall.",
      "In June and July, groups of swifts sometimes rush together at dusk in what birdwatchers call screaming parties. The name sounds dramatic, but the birds are not angry. They are calling to one another as they twist through the evening air. For many people, that noisy flight is a sign that summer in the town is properly under way."
    ],
    "questions": [
      {
        "id": "sw_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "According to paragraph 1, what makes swifts unusual compared with many other birds?",
        "check": {
          "keywordAny": [
            [
              "most",
              "time",
              "air"
            ],
            [
              "spend",
              "life",
              "air"
            ],
            [
              "eat",
              "drink",
              "sleep",
              "fly"
            ]
          ]
        },
        "modelAnswer": "They spend most of their lives in the air and can even eat, drink and sleep while flying.",
        "explanation": "Paragraph 1 explains that swifts do a remarkable amount while flying.",
        "hint": "Find the line in paragraph 1 that lists things swifts can do while flying."
      },
      {
        "id": "sw_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"migration\" mean in paragraph 1?",
        "options": [
          "a noisy group of birds calling together",
          "a long seasonal journey from one place to another",
          "the repairing of roofs and walls",
          "a place hidden high inside a building"
        ],
        "correct": 1,
        "modelAnswer": "a long seasonal journey from one place to another",
        "explanation": "The text says swifts arrive after a long migration from Africa, meaning a seasonal journey.",
        "hint": "Use the words around \"from Africa\" to help."
      },
      {
        "id": "sw_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "Why can repairing buildings be a problem for swifts? Use a short quotation or phrase from the text to support your answer.",
        "answerCheck": {
          "keywordAny": [
            [
              "repair",
              "seal",
              "block",
              "nest"
            ],
            [
              "lose",
              "home"
            ],
            [
              "hole",
              "disappear"
            ],
            [
              "nest",
              "place",
              "gone"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "the narrow holes that swifts have used for years may disappear",
            "lose a home without warning",
            "return to the same nesting place each summer",
            "small gaps beneath tiles"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "Repairs can remove the holes where swifts nest, so they may lose their usual home. Evidence could include: \"the narrow holes ... may disappear\".",
        "explanation": "Paragraph 3 explains both the physical change to buildings and why that matters to birds that return to the same site.",
        "hint": "State the problem in your own words, then copy the phrase that proves it.",
        "reread": [
          3
        ]
      },
      {
        "id": "sw_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which option best summarises paragraph 2?",
        "options": [
          "Swifts dislike towns because traffic scares insects away.",
          "Towns can suit swifts because buildings offer nest spaces and warm air can gather insects.",
          "Only new buildings are useful to swifts because they are clean and bright.",
          "Swifts spend all winter hidden in gaps under roof tiles."
        ],
        "correct": 1,
        "modelAnswer": "Towns can suit swifts because buildings offer nest spaces and warm air can gather insects.",
        "explanation": "The paragraph gives two main reasons towns can help swifts: nesting spaces and food.",
        "hint": "Choose the answer that includes both homes and food."
      },
      {
        "id": "sw_q5",
        "type": "open",
        "skill": "2f",
        "marks": 2,
        "stem": "How does paragraph 3 build on the information in paragraphs 1 and 2?",
        "rubric": [
          {
            "label": "Adds a problem or challenge",
            "check": {
              "keywordAny": [
                [
                  "problem"
                ],
                [
                  "difficulti"
                ],
                [
                  "repair",
                  "seal"
                ],
                [
                  "hole",
                  "disappear"
                ],
                [
                  "lose",
                  "home"
                ],
                [
                  "warning"
                ],
                [
                  "repair"
                ],
                [
                  "remove",
                  "nest",
                  "space"
                ]
              ]
            }
          },
          {
            "label": "Adds a solution or response",
            "check": {
              "keywordAny": [
                [
                  "swift",
                  "brick"
                ],
                [
                  "help"
                ],
                [
                  "builder"
                ],
                [
                  "safe",
                  "cavity"
                ],
                [
                  "solution"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Paragraph 3 moves from explaining why towns can suit swifts to warning that building repairs can remove nest spaces, and then it adds a solution: swift bricks.",
        "explanation": "The structure shifts from benefits to difficulties and then offers a practical response.",
        "hint": "Think about how the writer moves from good news to a problem, then to help."
      },
      {
        "id": "sw_q6",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why does the writer include the phrase \"screaming parties\" in paragraph 4?",
        "rubric": [
          {
            "label": "Shows noise or energy",
            "check": {
              "keywordAny": [
                [
                  "noisy"
                ],
                [
                  "loud"
                ],
                [
                  "energetic"
                ],
                [
                  "busy"
                ],
                [
                  "dramatic"
                ],
                [
                  "excit"
                ]
              ]
            }
          },
          {
            "label": "Creates vivid picture or interest",
            "check": {
              "keywordAny": [
                [
                  "picture"
                ],
                [
                  "imag"
                ],
                [
                  "reader"
                ],
                [
                  "vivid"
                ],
                [
                  "memorable"
                ],
                [
                  "catch",
                  "attent"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "It makes the swifts' evening flight sound noisy, lively and memorable, helping the reader picture the birds twisting through the air.",
        "explanation": "The unusual phrase catches attention and paints a vivid scene.",
        "hint": "Think about the sound and feeling the phrase creates."
      },
      {
        "id": "sw_q7",
        "type": "match",
        "skill": "2h",
        "marks": 2,
        "stem": "Match each feature to how it helps swifts.",
        "prompts": [
          "gaps under tiles or brickwork",
          "warm air over roofs and roads",
          "swift bricks"
        ],
        "options": [
          "collect flying insects where swifts can catch them",
          "provide a safe cavity for nesting inside a wall",
          "offer older nest spaces high above the ground"
        ],
        "correctMap": {
          "0": "2",
          "1": "0",
          "2": "1"
        },
        "modelAnswer": "Gaps under tiles or brickwork -> offer older nest spaces high above the ground; warm air -> collect flying insects; swift bricks -> provide a safe cavity inside a wall.",
        "explanation": "This question asks you to compare three different details from the text and link each one to its job.",
        "hint": "Find the part of the passage that explains how each feature helps swifts."
      },
      {
        "id": "sw_q8",
        "type": "short",
        "skill": "2e",
        "marks": 1,
        "stem": "What is most likely to happen in towns where more builders fit swift bricks?",
        "check": {
          "keywordAny": [
            [
              "more",
              "nest",
              "space"
            ],
            [
              "more",
              "home"
            ],
            [
              "swift",
              "more",
              "likely",
              "nest"
            ],
            [
              "safe",
              "cavity"
            ],
            [
              "more",
              "place",
              "nest"
            ]
          ]
        },
        "modelAnswer": "Swifts are likely to have more safe nesting places in those towns.",
        "explanation": "The text says swift bricks leave a safe cavity inside a wall, so more of them should mean more nest sites.",
        "hint": "Use the final part of paragraph 3 to make a text-based prediction."
      }
    ]
  },
  {
    "id": "museum_after_closing",
    "title": "Museum After Closing",
    "genre": "poetry",
    "difficulty": 2,
    "isLong": false,
    "blocks": [
      "When the front doors breathe shut\nand the last shoe-squeak fades,\nmoonlight pours along the floor\nin thin, careful blades.",
      "The helmets in the glass case\nhold a cold and patient gleam.\nA dinosaur rib remembers rain.\nThe maps begin to dream.",
      "Somewhere, the tall clock clears its throat\nand walks on its own small shoes.\nPortraits listen from their frames.\nDust chooses what to lose.",
      "Nothing moves, the guard would say,\nlocking up with jangling keys.\nYet all night long the museum hums\nwith its quiet industries."
    ],
    "questions": [
      {
        "id": "mac_q1",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"blades\" suggest in the first stanza?",
        "options": [
          "The moonlight falls in sharp, thin strips.",
          "The floor is made from metal.",
          "Someone is fighting in the museum.",
          "The moonlight is too bright to look at."
        ],
        "correct": 0,
        "modelAnswer": "The moonlight falls in sharp, thin strips.",
        "explanation": "The image of blades suggests something narrow and sharp-edged.",
        "hint": "Think about the shape of a blade."
      },
      {
        "id": "mac_q2",
        "type": "short",
        "skill": "2d",
        "marks": 1,
        "stem": "Which object in the poem is described as if it could move by itself?",
        "check": {
          "keywordAny": [
            [
              "clock"
            ]
          ]
        },
        "modelAnswer": "The tall clock.",
        "explanation": "The clock is said to clear its throat and walk on its own small shoes.",
        "hint": "Look in the third stanza."
      },
      {
        "id": "mac_q3",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why does the poet describe the clock as \"walking on its own small shoes\"?",
        "rubric": [
          {
            "label": "Gives clock human qualities",
            "check": {
              "keywordAny": [
                [
                  "human"
                ],
                [
                  "personif"
                ],
                [
                  "person"
                ],
                [
                  "alive"
                ],
                [
                  "character"
                ]
              ]
            }
          },
          {
            "label": "Suggests ticking or careful movement",
            "check": {
              "keywordAny": [
                [
                  "tick"
                ],
                [
                  "small",
                  "step"
                ],
                [
                  "careful",
                  "move"
                ],
                [
                  "quiet",
                  "move"
                ],
                [
                  "sound"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The poet gives the clock human qualities, making its ticking seem like small careful footsteps in the quiet museum.",
        "explanation": "The phrase turns a sound into a movement the reader can picture.",
        "hint": "What does the clock really do, and how has that been turned into a picture?"
      },
      {
        "id": "mac_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 1,
        "stem": "Which sentence best matches the mood of the poem?",
        "options": [
          "The museum feels bright, busy and noisy.",
          "The museum feels spooky in a violent way.",
          "The museum feels quiet but strangely alive.",
          "The museum feels empty and completely lifeless."
        ],
        "correct": 2,
        "modelAnswer": "The museum feels quiet but strangely alive.",
        "explanation": "The poem keeps the setting calm and hushed, while suggesting hidden activity all night.",
        "hint": "Choose the option that fits both the stillness and the hidden life."
      },
      {
        "id": "mac_q5",
        "type": "open",
        "skill": "2d",
        "marks": 3,
        "stem": "How does the poet make the museum seem both quiet and busy? Give two ways.",
        "rubric": [
          {
            "label": "Mentions quiet details",
            "check": {
              "keywordAny": [
                [
                  "quiet"
                ],
                [
                  "last",
                  "shoe",
                  "squeak"
                ],
                [
                  "moonlight"
                ],
                [
                  "careful"
                ],
                [
                  "locking",
                  "up"
                ],
                [
                  "nothing",
                  "moves"
                ]
              ]
            }
          },
          {
            "label": "Mentions hidden activity",
            "check": {
              "keywordAny": [
                [
                  "map",
                  "dream"
                ],
                [
                  "clock"
                ],
                [
                  "portrait",
                  "listen"
                ],
                [
                  "dust",
                  "choos"
                ],
                [
                  "museum",
                  "hums"
                ],
                [
                  "industri"
                ]
              ]
            }
          },
          {
            "label": "Explains contrast",
            "check": {
              "keywordAny": [
                [
                  "both"
                ],
                [
                  "while"
                ],
                [
                  "even",
                  "though"
                ],
                [
                  "contrast"
                ],
                [
                  "seem",
                  "still",
                  "but"
                ],
                [
                  "but"
                ],
                [
                  "quiet",
                  "busy"
                ],
                [
                  "still",
                  "busy"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The poem uses quiet images such as the fading shoe-squeak and careful moonlight, but it also gives objects secret activity: maps dream, portraits listen and the museum hums with \"quiet industries\".",
        "explanation": "A strong answer notices the contrast between silence and hidden life.",
        "hint": "Find one detail that is calm and one that suggests secret activity."
      }
    ]
  },
  {
    "id": "greenhouse_window",
    "title": "The Greenhouse Window",
    "genre": "fiction",
    "difficulty": 3,
    "isLong": false,
    "blocks": [
      "Sami liked the greenhouse before anyone else arrived. At half past seven it belonged to watering cans, seed trays and the first clean smell of damp soil. The panes along the east side usually caught the earliest light, but on Monday one square of glass looked milky and wrong, as if the morning had been rubbed away.",
      "He set down the hose and saw the problem at once. A sheet of plywood, which had been left against the frame after Saturday's storm, had slipped sideways in the night and blocked the light from one bench. The runner-bean seedlings below it leaned so sharply that their thin stems almost touched the compost. Sami felt heat climb into his face. He had stacked the board there after helping to tidy up.",
      "When Miss Dara arrived, he began apologising before she had even put down her bag. She looked at the window, then at the seedlings, then at Sami's miserable expression. \"Good,\" she said, to his surprise. \"You noticed in time.\" Together they moved the board, turned each tray a quarter turn and tied the weakest stems to short bamboo canes. Sunlight spread back across the bench in a pale rectangle.",
      "\"Plants are excellent forgivers,\" Miss Dara said, opening the roof vent. \"They don't ask whether something went wrong. They just use whatever light comes next.\" Sami was not sure people were so sensible, but he nodded. Before school, he checked the bench again. The seedlings were still crooked, yet they no longer looked desperate. They looked busy.",
      "By Thursday, tiny hooks of new growth had curled upward from the tops of the stems. Sami stopped at the greenhouse door and grinned. The window still carried a hairline crack, but the bench beneath it had turned the colour of bottled spring."
    ],
    "questions": [
      {
        "id": "gw_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "What had blocked the light from the seedlings?",
        "check": {
          "keywordAny": [
            [
              "sheet",
              "plywood"
            ],
            [
              "board"
            ],
            [
              "plywood",
              "board"
            ]
          ]
        },
        "modelAnswer": "A sheet of plywood / a board.",
        "explanation": "Paragraph 2 explains that a sheet of plywood had slipped sideways and blocked the light.",
        "hint": "Look near the start of paragraph 2."
      },
      {
        "id": "gw_q2",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "How can you tell Sami feels guilty? Use evidence from the text.",
        "answerCheck": {
          "keywordAny": [
            [
              "apologis"
            ],
            [
              "heat",
              "face"
            ],
            [
              "miserabl"
            ],
            [
              "his",
              "fault"
            ],
            [
              "stack",
              "board"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "Sami felt heat climb into his face",
            "he began apologising before she had even put down her bag",
            "Sami's miserable expression",
            "He had stacked the board there"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "We can tell Sami feels guilty because he thinks the problem is his fault and starts apologising straight away. Evidence could include: \"he began apologising before she had even put down her bag\".",
        "explanation": "The writer shows Sami's guilt through his body language and how quickly he apologises.",
        "hint": "Look for a physical reaction and something he says or does.",
        "reread": [
          2,
          3
        ]
      },
      {
        "id": "gw_q3",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does Miss Dara mean when she says, \"Plants are excellent forgivers\"?",
        "options": [
          "Plants can talk when they are upset.",
          "Plants never need sunlight again once they have had some.",
          "Plants keep growing if you fix the problem quickly instead of holding a grudge.",
          "Plants like people better when they are given names."
        ],
        "correct": 2,
        "modelAnswer": "Plants keep growing if you fix the problem quickly instead of holding a grudge.",
        "explanation": "Miss Dara means that plants respond to light and care in the present; they do not stay angry.",
        "hint": "Think about what the plants do after the problem is fixed."
      },
      {
        "id": "gw_q4",
        "type": "order",
        "skill": "2b",
        "marks": 2,
        "stem": "Number these events from 1 (first) to 4 (last).",
        "items": [
          "Miss Dara and Sami tie weak stems to bamboo canes.",
          "Sami notices the east-side window looks wrong.",
          "New growth curls upward from the seedlings.",
          "The plywood is moved away from the frame."
        ],
        "correctPositions": [
          3,
          1,
          4,
          2
        ],
        "modelAnswer": "1 Sami notices the window looks wrong; 2 the plywood is moved; 3 they tie weak stems; 4 new growth appears.",
        "explanation": "Ordering questions reward careful tracking of the sequence across the passage.",
        "hint": "Start with the discovery, then follow the actions that fix the problem."
      },
      {
        "id": "gw_q5",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why does the writer say the seedlings no longer looked desperate and \"looked busy\" instead?",
        "rubric": [
          {
            "label": "Shows change in condition",
            "check": {
              "keywordAny": [
                [
                  "healthier"
                ],
                [
                  "recover"
                ],
                [
                  "better"
                ],
                [
                  "less",
                  "damage"
                ],
                [
                  "chang"
                ]
              ]
            }
          },
          {
            "label": "Suggests growth or purposeful activity",
            "check": {
              "keywordAny": [
                [
                  "grow"
                ],
                [
                  "active"
                ],
                [
                  "working"
                ],
                [
                  "trying"
                ],
                [
                  "toward",
                  "light"
                ],
                [
                  "busy"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The phrase shows that the seedlings are recovering. Instead of seeming weak and in trouble, they seem active and ready to grow toward the light.",
        "explanation": "The writer uses a human-sounding description to show the plants' recovery.",
        "hint": "What does the new word choice suggest about the plants now?"
      },
      {
        "id": "gw_q6",
        "type": "short",
        "skill": "2e",
        "marks": 1,
        "stem": "What is Sami most likely to do the next morning? Why?",
        "check": {
          "keywordAny": [
            [
              "check",
              "bench"
            ],
            [
              "look",
              "seedling"
            ],
            [
              "visit",
              "greenhous"
            ],
            [
              "notice",
              "light"
            ]
          ]
        },
        "modelAnswer": "He is likely to check the bench or seedlings again because he now feels responsible for noticing problems early.",
        "explanation": "The ending shows Sami has started paying close attention, so repeating that behaviour is the safest prediction.",
        "hint": "Base your answer on what he learns from Miss Dara and the ending."
      },
      {
        "id": "gw_q7",
        "type": "short",
        "skill": "P2",
        "marks": 1,
        "stem": "Which punctuation shows the exact words Miss Dara says?",
        "check": {
          "containsAny": [
            "speech marks",
            "quotation marks",
            "inverted commas"
          ]
        },
        "modelAnswer": "Speech marks / quotation marks.",
        "explanation": "Speech marks show the exact words spoken by a character.",
        "hint": "Look at the punctuation around Miss Dara's spoken words."
      }
    ]
  },
  {
    "id": "salt_marsh_makers",
    "title": "Salt Marsh Makers",
    "genre": "non-fiction",
    "difficulty": 3,
    "isLong": false,
    "blocks": [
      "At first glance, a salt marsh can look like an untidy edge where land, river and sea have failed to agree. Mud glistens, channels twist and the ground may seem too wet to trust. Yet this shifting place is one of the busiest builders on the coast.",
      "When the tide slows, tiny grains of silt settle out of the water. Special plants such as cordgrass trap more of that silt with their stems and roots, so the mud surface gradually rises. Over years, what began as soft, low ground can become a thick patchwork of creeks, pools and grassy platforms.",
      "That patchwork matters. Salt marshes can soften the force of waves and storm surges before the water reaches houses, roads or farmland farther inland. They also provide feeding and nesting places for insects, fish and birds. Curlews probe the mud, young fish shelter in creeks and migrating birds stop to refuel.",
      "People once dismissed marshes as useless wasteland because they were awkward to cross and difficult to farm. Scientists now understand that losing them can leave coasts more exposed, not less. In some places, sea walls are being moved back so that new marsh can form naturally.",
      "A salt marsh is not neat, and it does not stay still. That is exactly why it works. Its strength comes from movement, from roots holding silt one day and new water spreading it the next."
    ],
    "questions": [
      {
        "id": "sm_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "Which plant is named in the text as helping to trap silt?",
        "check": {
          "keywordAny": [
            [
              "cordgrass"
            ]
          ]
        },
        "modelAnswer": "Cordgrass.",
        "explanation": "Paragraph 2 names cordgrass as a plant that traps silt.",
        "hint": "Look in paragraph 2 for the specific plant name."
      },
      {
        "id": "sm_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"dismissed\" mean in paragraph 4?",
        "options": [
          "carefully protected",
          "measured and mapped",
          "treated as unimportant",
          "filled with extra water"
        ],
        "correct": 2,
        "modelAnswer": "treated as unimportant",
        "explanation": "People once dismissed marshes as useless wasteland, meaning they treated them as having little value.",
        "hint": "Use the phrase \"useless wasteland\" to help."
      },
      {
        "id": "sm_q3",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which statement best summarises paragraph 3?",
        "options": [
          "Salt marshes are always dry enough to build houses on.",
          "Salt marshes matter because they protect coasts and support many living things.",
          "Only curlews and fish can survive in a salt marsh.",
          "Storms create salt marshes in a single afternoon."
        ],
        "correct": 1,
        "modelAnswer": "Salt marshes matter because they protect coasts and support many living things.",
        "explanation": "Paragraph 3 focuses on the marsh's protective role and its value as a habitat.",
        "hint": "Find the answer that includes both protection and wildlife."
      },
      {
        "id": "sm_q4",
        "type": "mcq",
        "skill": "2b",
        "marks": 1,
        "stem": "Which statement is presented as a past view in the text?",
        "options": [
          "Salt marshes can soften the force of waves.",
          "Young fish shelter in creeks.",
          "Scientists now understand their value.",
          "Salt marshes are useless wasteland."
        ],
        "correct": 3,
        "modelAnswer": "Salt marshes are useless wasteland.",
        "explanation": "Paragraph 4 says people once dismissed marshes in this way.",
        "hint": "Look for the idea the writer disagrees with now."
      },
      {
        "id": "sm_q5",
        "type": "open",
        "skill": "2f",
        "marks": 2,
        "stem": "How does the writer change the reader's view of salt marshes from the start of the text to the end?",
        "rubric": [
          {
            "label": "Starts with appearance or mistaken impression",
            "check": {
              "keywordAny": [
                [
                  "first",
                  "glance"
                ],
                [
                  "untidy"
                ],
                [
                  "wet"
                ],
                [
                  "failed",
                  "agree"
                ],
                [
                  "seem"
                ]
              ]
            }
          },
          {
            "label": "Ends with value or strength",
            "check": {
              "keywordAny": [
                [
                  "busy",
                  "builder"
                ],
                [
                  "strength"
                ],
                [
                  "work"
                ],
                [
                  "protect"
                ],
                [
                  "value"
                ],
                [
                  "movement"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The writer begins with how messy or untrustworthy a marsh can seem, then gradually shows that this same untidy movement is what makes it strong and useful.",
        "explanation": "This is a whole-text structure question: the opening impression is revised by later explanation.",
        "hint": "Compare the first paragraph with the final sentence."
      },
      {
        "id": "sm_q6",
        "type": "match",
        "skill": "2b",
        "marks": 2,
        "stem": "Match each detail to the job it is doing in the text.",
        "prompts": [
          "curlews probe the mud",
          "sea walls are being moved back",
          "cordgrass traps silt"
        ],
        "options": [
          "an example of wildlife using the marsh",
          "an example of people helping new marsh to form",
          "an explanation of how marsh ground builds up"
        ],
        "correctMap": {
          "0": "0",
          "1": "1",
          "2": "2"
        },
        "modelAnswer": "Curlews -> wildlife example; sea walls moved back -> people helping marsh form; cordgrass traps silt -> how marsh builds up.",
        "explanation": "Each detail plays a different job in the overall explanation.",
        "hint": "Ask what each detail is there to show."
      },
      {
        "id": "sm_q7",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why does the writer call the salt marsh a \"busy builder\"?",
        "rubric": [
          {
            "label": "Shows it is active",
            "check": {
              "keywordAny": [
                [
                  "active"
                ],
                [
                  "busy"
                ],
                [
                  "working"
                ],
                [
                  "constantly"
                ],
                [
                  "build"
                ]
              ]
            }
          },
          {
            "label": "Links to creating or shaping coast",
            "check": {
              "keywordAny": [
                [
                  "shape",
                  "land"
                ],
                [
                  "trap",
                  "silt"
                ],
                [
                  "raise",
                  "ground"
                ],
                [
                  "form",
                  "creek"
                ],
                [
                  "build",
                  "coast"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The phrase makes the marsh sound active and productive. It is \"building\" by trapping silt and gradually shaping the coastline.",
        "explanation": "The writer uses a compact image to make a scientific process feel vivid and purposeful.",
        "hint": "What is the marsh creating over time?"
      },
      {
        "id": "sm_q8",
        "type": "mcq",
        "skill": "P1",
        "marks": 1,
        "stem": "In the sentence \"At first glance, a salt marsh can look like an untidy edge...\", what does the comma help the reader understand?",
        "options": [
          "That the opening phrase comes before the main idea of the sentence.",
          "That somebody is speaking.",
          "That a list of items is beginning.",
          "That the sentence is unfinished."
        ],
        "correct": 0,
        "modelAnswer": "That the opening phrase comes before the main idea of the sentence.",
        "explanation": "The comma separates the opening phrase from the main statement so the sentence is easier to track.",
        "hint": "Read the sentence in two sense groups: the opener first, then the main idea."
      }
    ]
  },
  {
    "id": "night_ferry",
    "title": "Night Ferry",
    "genre": "poetry",
    "difficulty": 3,
    "isLong": false,
    "blocks": [
      "The ferry noses out from the harbour wall,\nslow as a thought being said aloud.\nWindows carry squares of talk,\nwarm against the water's shroud.",
      "Ropes relax. The gulls grow small.\nThe town unbuttons, light by light.\nBehind us, chimneys keep their smoke.\nAhead, the channel folds up night.",
      "A child leans hard against the rail\nand names each buoy a floating star.\nThe engine counts beneath our feet.\nHome changes shape, but not how far."
    ],
    "questions": [
      {
        "id": "nf_q1",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"shroud\" suggest in stanza 1?",
        "options": [
          "The water feels bright and cheerful.",
          "The water seems dark and covering.",
          "The water is full of waves and spray.",
          "The water is too shallow for the boat."
        ],
        "correct": 1,
        "modelAnswer": "The water seems dark and covering.",
        "explanation": "A shroud suggests something that wraps or covers, so the water feels dark and enclosing.",
        "hint": "Think about the kind of image the word creates."
      },
      {
        "id": "nf_q2",
        "type": "short",
        "skill": "2d",
        "marks": 1,
        "stem": "What happens to the town as the ferry moves away?",
        "check": {
          "keywordAny": [
            [
              "light",
              "small"
            ],
            [
              "light",
              "fad"
            ],
            [
              "grow",
              "small"
            ],
            [
              "behind",
              "us"
            ],
            [
              "town",
              "unbutton"
            ]
          ]
        },
        "modelAnswer": "The town seems to loosen and its lights fade or grow smaller as the ferry moves away.",
        "explanation": "The second stanza describes the town changing as distance increases.",
        "hint": "Look at the second stanza."
      },
      {
        "id": "nf_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "How can you tell the child is excited or imaginative? Use evidence from the poem.",
        "answerCheck": {
          "keywordAny": [
            [
              "name",
              "buoy",
              "star"
            ],
            [
              "imagin"
            ],
            [
              "excit"
            ],
            [
              "lean",
              "rail"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "leans hard against the rail",
            "names each buoy a floating star"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "The child seems excited and imaginative because they lean forward eagerly and call each buoy \"a floating star\".",
        "explanation": "The poet shows both physical eagerness and creative thinking.",
        "hint": "Find one action and one image linked to the child."
      },
      {
        "id": "nf_q4",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "What is the effect of the phrase \"The engine counts beneath our feet\"?",
        "rubric": [
          {
            "label": "Shows steady rhythm or sound",
            "check": {
              "keywordAny": [
                [
                  "rhythm"
                ],
                [
                  "beat"
                ],
                [
                  "regular"
                ],
                [
                  "steady"
                ],
                [
                  "count"
                ],
                [
                  "sound"
                ]
              ]
            }
          },
          {
            "label": "Suggests movement or progress",
            "check": {
              "keywordAny": [
                [
                  "journey"
                ],
                [
                  "move"
                ],
                [
                  "travel"
                ],
                [
                  "progress"
                ],
                [
                  "carry",
                  "on"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The phrase turns the engine's steady sound into counting, which suggests rhythm, movement and the sense that the journey is carrying everyone forward.",
        "explanation": "The engine is personified in a way that emphasises steady travel.",
        "hint": "Think about what counting feels like: random or regular?"
      },
      {
        "id": "nf_q5",
        "type": "open",
        "skill": "2c",
        "marks": 2,
        "stem": "What is the best summary of the poem?",
        "rubric": [
          {
            "label": "Includes leaving harbour or town",
            "check": {
              "keywordAny": [
                [
                  "leave",
                  "harbour"
                ],
                [
                  "move",
                  "away",
                  "town"
                ],
                [
                  "ferry",
                  "out"
                ],
                [
                  "leave",
                  "town",
                  "behind"
                ],
                [
                  "town",
                  "behind"
                ],
                [
                  "ferry",
                  "move",
                  "away"
                ]
              ]
            }
          },
          {
            "label": "Includes mood of calm travel at night",
            "check": {
              "keywordAny": [
                [
                  "night"
                ],
                [
                  "calm"
                ],
                [
                  "quiet"
                ],
                [
                  "journey"
                ],
                [
                  "water"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The poem describes a calm night journey by ferry as the travellers leave the town behind and move across dark water.",
        "explanation": "A summary should capture the main situation and mood without retelling every detail.",
        "hint": "Keep only the biggest ideas: where, when and what feeling."
      },
      {
        "id": "nf_q6",
        "type": "open",
        "skill": "2h",
        "marks": 2,
        "stem": "How is the town behind the ferry presented differently from the water ahead?",
        "rubric": [
          {
            "label": "Town behind is warm, human or familiar",
            "check": {
              "keywordAny": [
                [
                  "warm"
                ],
                [
                  "talk"
                ],
                [
                  "window"
                ],
                [
                  "chimney"
                ],
                [
                  "home"
                ],
                [
                  "town"
                ],
                [
                  "familiar"
                ]
              ]
            }
          },
          {
            "label": "Water ahead feels darker, quieter or more unknown",
            "check": {
              "keywordAny": [
                [
                  "dark"
                ],
                [
                  "night"
                ],
                [
                  "unknown"
                ],
                [
                  "channel"
                ],
                [
                  "ahead"
                ],
                [
                  "water"
                ],
                [
                  "sea"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The town behind the ferry feels warm and familiar, with windows, talk and chimneys, while the water ahead feels darker and more unknown as the channel \"folds up night\".",
        "explanation": "A strong comparison gives a clear idea from both sides of the poem, not just one.",
        "hint": "Compare the human details behind the ferry with the darker image ahead."
      }
    ]
  },
  {
    "id": "tide_clock",
    "title": "The Keeper of the Tide Clock",
    "genre": "fiction",
    "difficulty": 5,
    "isLong": true,
    "blocks": [
      "All summer, the harbour clock had seemed to Mara like a face that had forgotten its own expression. It hung above the stone archway leading to the quay, rimmed with rust and salt, one hand frozen between numbers no one trusted any longer. Tourists still photographed it because it looked beautifully old. Fishermen glanced past it to the glowing screens in their palms.",
      "Mara was staying with her aunt Lila, who repaired watches and clocks in a narrow shop below the harbour tower. Every drawer in the workroom held springs, screws or tiny labelled envelopes. Lila claimed that every good clock was really a question about attention. Mara did not know what that meant, but she liked hearing tools click softly on the bench while gulls argued outside.",
      "The town was preparing for its annual Lantern Walk to St Brannock's Island. At the year's lowest summer tide, people crossed the causeway at dusk, carrying paper lanterns to the ruined chapel on the far side. Stalls were being painted. Ropes were being checked. Children had already started boasting about who would dare to walk back last.",
      "On Tuesday, while Lila delivered a repaired kitchen timer, Mara climbed the spiral stairs inside the harbour tower. She expected dust and pigeon feathers. She did not expect a sound. Yet halfway up, just as the wind dropped, she heard a faint tick ... tick ... tick, so light she might have imagined it. At the top room she found the clock's inner frame, larger than a table, its gears furred with old grease. Wedged beside one brass wheel was a ribbon of dry sand.",
      "On a shelf near the window lay a thin notebook tied with black string. The first page read: Notes of Elias Penhal, keeper of the tide clock. Most pages held figures, moon times and weather marks, but in the margins he had left blunt instructions: wind from the south-west shortens the safe crossing; trust the sea, not the crowd; if the channel speaks early, ring early.",
      "When Mara showed the notebook to the Lantern Walk organisers that evening, they smiled kindly and returned to their planning. Mr Teague, who chaired the committee, tapped the printed tide table on his clipboard. Another woman lifted her phone and said the harbour app updated every hour. \"It's a charming relic,\" Mr Teague said of the tower clock, \"but charm is not the same as accuracy.\" Lila said nothing. Later, in the shop, she only asked Mara what the notebook had made her notice.",
      "By Thursday, Mara had removed the dry sand from the gear and brushed away enough dirt to free a second wheel. She did not tell anyone except Lila that the mechanism now moved a little if she nudged it. It still stuck after a few turns, as though the clock were clearing its throat after years of silence. On the wall below the narrow window, she also found a faded green line. Lila told her it marked the height of a tide that had flooded the quay before Mara was born.",
      "The evening of the walk arrived hot and bright. By sunset, however, a new wind had started to press in from the south-west, flattening the harbour water and pushing a skin of ripples up the channel. Lanterns bobbed ahead like a patient trail of stars as people set off across the causeway. Mara carried one too, but the notebook's warning sat in her mind so heavily that it seemed to change the colour of the air.",
      "Halfway to the island, she heard it: not a crash, not a shout, but a quick licking sound against the causeway stones. Water was already curling into a side channel that had been bare ten minutes earlier. Farther ahead, the crowd kept moving. Mr Teague was laughing. Someone called back that the app still showed plenty of time. Mara looked at the wind, then at the water, and knew the notebook had not been written by someone who liked dramatic advice. It had been written by someone who had watched.",
      "She turned and ran. By the time she reached the tower stair, her breath tore at her throat. The bell hammer above the clock had seized with rust, and it took both hands and all her weight to jerk it free. The first strike came out dull. The second boomed across the quay. Heads lifted. Lanterns stopped. Then the line on the causeway broke and began flowing shoreward instead of out.",
      "Afterwards, when the walkers had returned red-faced and breathless but safe, Mr Teague stood under the tower with one hand on the back of his neck. He did not apologise exactly. He only said that the bell had made everyone look up, and looking up had made them look at the water properly. Lila, locking the shop, said, \"A good clock is never magic. It simply teaches people when to pay attention.\"",
      "The next morning, Mara climbed the tower again. The gears still needed proper repair, and the sand would certainly creep back, but she wound the mechanism as far as it would go and listened. This time the ticking held. From the quay below came the rattle of crates, the slap of ropes and the answering cry of gulls. The harbour, she thought, was not silent at all. It had only been waiting for somebody to hear it."
    ],
    "questions": [
      {
        "id": "tc_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "What annual event was the town preparing for?",
        "check": {
          "keywordAny": [
            [
              "lantern",
              "walk"
            ],
            [
              "walk",
              "st",
              "brannock"
            ],
            [
              "causeway",
              "lantern"
            ]
          ]
        },
        "modelAnswer": "The annual Lantern Walk to St Brannock's Island.",
        "explanation": "Paragraph 3 introduces the Lantern Walk.",
        "hint": "Look in paragraph 3."
      },
      {
        "id": "tc_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"relic\" suggest in paragraph 6?",
        "options": [
          "something modern and reliable",
          "something old from the past",
          "something heavy and dangerous",
          "something hidden under the sea"
        ],
        "correct": 1,
        "modelAnswer": "something old from the past",
        "explanation": "Mr Teague calls the clock a relic because he sees it as an old object from the past.",
        "hint": "Think about how Mr Teague feels about the clock."
      },
      {
        "id": "tc_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "What do Elias Penhal's notes suggest about him? Use evidence from the text.",
        "answerCheck": {
          "keywordAny": [
            [
              "careful"
            ],
            [
              "observ"
            ],
            [
              "experienc"
            ],
            [
              "respect",
              "sea"
            ],
            [
              "practical"
            ],
            [
              "watch"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "trust the sea, not the crowd",
            "wind from the south-west shortens the safe crossing",
            "if the channel speaks early, ring early",
            "someone who had watched"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "His notes suggest he was careful, observant and practical. Evidence could include: \"trust the sea, not the crowd\".",
        "explanation": "The notes show repeated close observation and a serious respect for the sea.",
        "hint": "Describe what kind of person leaves instructions like these, then quote one.",
        "reread": [
          5,
          9
        ]
      },
      {
        "id": "tc_q4",
        "type": "open",
        "skill": "2b",
        "marks": 2,
        "stem": "Give two things Mara discovered inside the harbour tower that made her think the tide clock might still matter.",
        "rubric": [
          {
            "label": "Heard ticking",
            "check": {
              "keywordAny": [
                [
                  "tick"
                ]
              ]
            }
          },
          {
            "label": "Found sand in gear",
            "check": {
              "keywordAny": [
                [
                  "sand",
                  "gear"
                ],
                [
                  "sand",
                  "wheel"
                ],
                [
                  "dry",
                  "sand"
                ]
              ]
            }
          },
          {
            "label": "Found Penhal's notebook",
            "check": {
              "keywordAny": [
                [
                  "notebook"
                ],
                [
                  "elias",
                  "penhal"
                ],
                [
                  "black",
                  "string"
                ]
              ]
            }
          },
          {
            "label": "Found flood line",
            "check": {
              "keywordAny": [
                [
                  "green",
                  "line"
                ],
                [
                  "flood",
                  "mark"
                ],
                [
                  "height",
                  "tide"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Possible answers include: she heard faint ticking, found sand stuck in a gear, found Elias Penhal's notebook, or found the faded green flood line.",
        "explanation": "Several discoveries inside the tower show Mara that the clock is not just an empty decoration.",
        "hint": "Choose any two discoveries from paragraphs 4, 5 and 7."
      },
      {
        "id": "tc_q5",
        "type": "open",
        "skill": "2f",
        "marks": 3,
        "stem": "How does paragraph 6 increase the tension in the story?",
        "rubric": [
          {
            "label": "Adults dismiss warning",
            "check": {
              "keywordAny": [
                [
                  "smil",
                  "kindly"
                ],
                [
                  "charming",
                  "relic"
                ],
                [
                  "phone"
                ],
                [
                  "app"
                ],
                [
                  "committee"
                ],
                [
                  "did",
                  "not",
                  "listen"
                ],
                [
                  "dismiss"
                ]
              ]
            }
          },
          {
            "label": "Shows conflict between old and new ways of judging safety",
            "check": {
              "keywordAny": [
                [
                  "clock",
                  "versus",
                  "app"
                ],
                [
                  "notebook",
                  "versus",
                  "table"
                ],
                [
                  "old",
                  "new"
                ],
                [
                  "crowd",
                  "versus",
                  "sea"
                ],
                [
                  "conflict"
                ]
              ]
            }
          },
          {
            "label": "Makes reader worry Mara may be right but ignored",
            "check": {
              "keywordAny": [
                [
                  "reader",
                  "worry"
                ],
                [
                  "danger"
                ],
                [
                  "ignored"
                ],
                [
                  "not",
                  "believ"
                ],
                [
                  "tension"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The paragraph raises tension because the organisers politely ignore Mara's warning and trust their printed table or app instead. That creates a conflict between careful observation and confident planning, so the reader begins to worry that Mara may be right too late.",
        "explanation": "Tension grows when a possible danger is noticed but not taken seriously.",
        "hint": "What do the adults choose to trust, and why does that worry the reader?"
      },
      {
        "id": "tc_q6",
        "type": "multiSelect",
        "skill": "2b",
        "marks": 2,
        "stem": "Which two things warned Mara that the crossing was becoming unsafe?",
        "options": [
          "a new wind pressing in from the south-west",
          "the chapel bell ringing from the island",
          "water curling into a side channel earlier than expected",
          "tourists taking photographs of the clock"
        ],
        "correctSet": [
          0,
          2
        ],
        "modelAnswer": "The correct answers are the south-west wind and the water curling into a side channel early.",
        "explanation": "Both of these details connect directly to the notebook's warning and the changing conditions.",
        "hint": "Choose the two details linked to weather or water, not to people."
      },
      {
        "id": "tc_q7",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "How do we know Mara trusts observation more than the crowd by the end of the story? Use evidence.",
        "answerCheck": {
          "keywordAny": [
            [
              "listen",
              "water"
            ],
            [
              "trust",
              "notebook"
            ],
            [
              "look",
              "water"
            ],
            [
              "pay",
              "attent"
            ],
            [
              "observ"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "the notebook's warning sat in her mind",
            "knew the notebook had not been written by someone who liked dramatic advice",
            "It had been written by someone who had watched",
            "looking up had made them look at the water properly",
            "waiting for somebody to hear it"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "By the end, Mara trusts close observation more than the crowd's confidence. Evidence could include: \"It had been written by someone who had watched.\"",
        "explanation": "Her actions show she values what careful watching reveals, even when others are relaxed.",
        "hint": "Focus on what Mara chooses to believe when the crowd keeps walking."
      },
      {
        "id": "tc_q8",
        "type": "open",
        "skill": "2g",
        "marks": 3,
        "stem": "What is the effect of the final sentence: \"It had only been waiting for somebody to hear it\"?",
        "rubric": [
          {
            "label": "Gives harbour human qualities",
            "check": {
              "keywordAny": [
                [
                  "personif"
                ],
                [
                  "human"
                ],
                [
                  "alive"
                ],
                [
                  "voice"
                ],
                [
                  "waiting"
                ]
              ]
            }
          },
          {
            "label": "Links back to theme of attention or listening",
            "check": {
              "keywordAny": [
                [
                  "pay",
                  "attent"
                ],
                [
                  "listen"
                ],
                [
                  "notice"
                ],
                [
                  "hear"
                ],
                [
                  "theme"
                ]
              ]
            }
          },
          {
            "label": "Creates satisfying or hopeful ending",
            "check": {
              "keywordAny": [
                [
                  "hope"
                ],
                [
                  "satisfy"
                ],
                [
                  "ending"
                ],
                [
                  "complete"
                ],
                [
                  "change"
                ],
                [
                  "new",
                  "understand"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The final sentence personifies the harbour, making it seem as if it has a voice. This ties the ending to the story's theme of paying attention and gives the ending a satisfying sense that Mara has learned how to listen properly.",
        "explanation": "The line works as both an image and a final statement of the story's main idea.",
        "hint": "Think about what has changed in Mara by the end."
      },
      {
        "id": "tc_q9",
        "type": "open",
        "skill": "2c",
        "marks": 3,
        "stem": "Summarise what Mara discovers in the tower and why it matters.",
        "rubric": [
          {
            "label": "Mentions mechanical clues",
            "check": {
              "keywordAny": [
                [
                  "tick"
                ],
                [
                  "gear"
                ],
                [
                  "sand"
                ],
                [
                  "mechanism"
                ],
                [
                  "bell",
                  "hammer"
                ]
              ]
            }
          },
          {
            "label": "Mentions written or historical clues",
            "check": {
              "keywordAny": [
                [
                  "notebook"
                ],
                [
                  "elias",
                  "penhal"
                ],
                [
                  "instruction"
                ],
                [
                  "green",
                  "line"
                ],
                [
                  "flood",
                  "mark"
                ]
              ]
            }
          },
          {
            "label": "Explains why discoveries matter",
            "check": {
              "keywordAny": [
                [
                  "warning"
                ],
                [
                  "safe"
                ],
                [
                  "cross"
                ],
                [
                  "help",
                  "save"
                ],
                [
                  "clock",
                  "still",
                  "matter"
                ],
                [
                  "attention"
                ],
                [
                  "warn"
                ],
                [
                  "warn",
                  "walker"
                ],
                [
                  "danger"
                ],
                [
                  "in",
                  "time"
                ],
                [
                  "save"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Mara discovers mechanical signs that the clock is not completely dead, such as ticking and a jammed gear, and historical clues such as Elias Penhal's notebook and the flood line. These matter because they help her understand real signs of danger and later warn the walkers in time.",
        "explanation": "A strong summary keeps the main discoveries and their importance, without retelling every detail.",
        "hint": "Group the discoveries into what she finds and why those finds matter."
      },
      {
        "id": "tc_q10",
        "type": "order",
        "skill": "2b",
        "marks": 3,
        "stem": "Number these events from 1 (first) to 5 (last).",
        "items": [
          "Mara frees the bell hammer and rings the bell.",
          "Mara hears faint ticking in the tower.",
          "The organisers tell Mara they trust the tide table and app.",
          "Water begins curling into a side channel on the causeway.",
          "Mara winds the mechanism again the next morning."
        ],
        "correctPositions": [
          4,
          1,
          2,
          3,
          5
        ],
        "modelAnswer": "1 Mara hears ticking; 2 the organisers trust the app; 3 water curls into the side channel; 4 she rings the bell; 5 she winds the mechanism next morning.",
        "explanation": "This sequence tracks the story from first clue to final resolution.",
        "hint": "Start with the first discovery in the tower, then follow the cause-and-effect."
      },
      {
        "id": "tc_q11",
        "type": "open",
        "skill": "2e",
        "marks": 2,
        "stem": "What is Aunt Lila most likely to expect from Mara after these events? Give a reason for your prediction.",
        "rubric": [
          {
            "label": "Predicts Mara will help keep or repair clock / watch carefully",
            "check": {
              "keywordAny": [
                [
                  "help",
                  "clock"
                ],
                [
                  "wind",
                  "clock"
                ],
                [
                  "repair"
                ],
                [
                  "keep",
                  "watch"
                ],
                [
                  "pay",
                  "attent"
                ],
                [
                  "look",
                  "careful"
                ]
              ]
            }
          },
          {
            "label": "Uses reason from text",
            "check": {
              "keywordAny": [
                [
                  "learn"
                ],
                [
                  "notic"
                ],
                [
                  "good",
                  "clock",
                  "question",
                  "attention"
                ],
                [
                  "Lila"
                ],
                [
                  "because"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Aunt Lila is likely to expect Mara to keep helping with the tide clock and to keep paying close attention, because Lila sees clocks as a lesson in noticing properly and Mara has shown she can do that.",
        "explanation": "Predictions need to fit both the character and what has just changed.",
        "hint": "Base your answer on what Lila values throughout the story."
      },
      {
        "id": "tc_q12",
        "type": "open",
        "skill": "2h",
        "marks": 4,
        "stem": "Compare how people see the tide clock at the start and at the end of the story.",
        "rubric": [
          {
            "label": "Start: old decoration or ignored object",
            "check": {
              "keywordAny": [
                [
                  "tourist"
                ],
                [
                  "photograph"
                ],
                [
                  "beautifully",
                  "old"
                ],
                [
                  "frozen"
                ],
                [
                  "no",
                  "trust"
                ],
                [
                  "glance",
                  "past"
                ],
                [
                  "relic"
                ]
              ]
            }
          },
          {
            "label": "End: useful warning / reason to look up",
            "check": {
              "keywordAny": [
                [
                  "bell"
                ],
                [
                  "safe"
                ],
                [
                  "warning"
                ],
                [
                  "look",
                  "up"
                ],
                [
                  "look",
                  "water"
                ],
                [
                  "matter"
                ],
                [
                  "attention"
                ]
              ]
            }
          },
          {
            "label": "Mentions change in understanding",
            "check": {
              "keywordAny": [
                [
                  "chang"
                ],
                [
                  "instead"
                ],
                [
                  "before",
                  "after"
                ],
                [
                  "from",
                  "to"
                ],
                [
                  "realis"
                ]
              ]
            }
          },
          {
            "label": "Uses detail from both parts",
            "check": {
              "keywordAny": [
                [
                  "start"
                ],
                [
                  "end"
                ],
                [
                  "at",
                  "first"
                ],
                [
                  "afterward"
                ],
                [
                  "beginning"
                ],
                [
                  "ending"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "At the start, people treat the tide clock mainly as an old object: tourists photograph it and fishermen ignore it in favour of phone screens. By the end, the bell it controls has helped people notice the danger properly, so the clock becomes a useful warning rather than just a decoration. The story changes the clock from a relic into something worth trusting and attending to.",
        "explanation": "Comparison questions need evidence from both sides, not just one.",
        "hint": "Make sure you mention one view from the start and one from the end."
      },
      {
        "id": "tc_q13",
        "type": "open",
        "skill": "2d",
        "marks": 4,
        "stem": "The story suggests that careful observation matters more than confidence. How far do you agree? Use evidence from different parts of the story.",
        "rubric": [
          {
            "label": "States view clearly",
            "check": {
              "keywordAny": [
                [
                  "agree"
                ],
                [
                  "observation",
                  "matter"
                ],
                [
                  "careful",
                  "watch"
                ],
                [
                  "confidence",
                  "not",
                  "enough"
                ],
                [
                  "far",
                  "agree"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence from early/middle of story",
            "check": {
              "keywordAny": [
                [
                  "notebook"
                ],
                [
                  "tick"
                ],
                [
                  "sand"
                ],
                [
                  "organiser"
                ],
                [
                  "app"
                ],
                [
                  "Lila"
                ],
                [
                  "relic"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence from climax/end",
            "check": {
              "keywordAny": [
                [
                  "side",
                  "channel"
                ],
                [
                  "bell"
                ],
                [
                  "look",
                  "water"
                ],
                [
                  "safe"
                ],
                [
                  "waiting",
                  "hear"
                ],
                [
                  "look",
                  "up"
                ]
              ]
            }
          },
          {
            "label": "Explains link between evidence and idea",
            "check": {
              "keywordAny": [
                [
                  "show"
                ],
                [
                  "because"
                ],
                [
                  "therefore"
                ],
                [
                  "this",
                  "means"
                ],
                [
                  "prove"
                ],
                [
                  "suggest"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "I agree to a great extent. The story repeatedly shows that paying close attention leads to safer decisions than sounding confident. Mara notices the ticking, the sand and Penhal's notebook, while the organisers rely on a table and an app because they sound official. At the causeway, Mara watches the wind and hears the water changing, then rings the bell. Afterwards, even Mr Teague realises that the bell made people look up and look at the water properly. The story does not say confidence is useless, but it does show that confidence without observation can be risky.",
        "explanation": "A high-scoring answer needs a clear view, evidence from different parts and explanation of how that evidence supports the idea.",
        "hint": "Use at least one detail from before the walk and one from during or after it."
      }
    ]
  },
  {
    "id": "messages_from_deep",
    "title": "Messages from the Deep",
    "genre": "non-fiction",
    "difficulty": 4,
    "isLong": true,
    "blocks": [
      "For centuries, the deep ocean was imagined more easily than it was explored. Once sunlight disappears, the sea becomes a place of pressure, cold and distance. Sending a person there is difficult, expensive and sometimes impossible. That is why many discoveries now begin with machines.",
      "Some of these machines are remotely operated vehicles, or ROVs. They are connected to a ship by a long cable that sends power down and information back. Cameras, lights and gripping arms allow them to inspect shipwrecks, collect samples or place instruments on the sea floor. Because they remain linked to a ship, pilots can control them very precisely.",
      "Other machines, such as underwater gliders, travel for far longer but with less direct control. A glider changes its buoyancy to sink or rise, and small wings turn that movement into forward travel. It may spend weeks gathering temperature, salinity and current data before surfacing briefly to send a packet of information by satellite.",
      "The deep sea still surprises scientists. Some animals make their own light through bioluminescence, producing flashes or glows to attract prey, confuse predators or recognise members of their own species. Other creatures survive enormous pressure with soft bodies, unusual chemicals or flexible structures that would fail nearer the surface.",
      "Bringing animals up quickly can damage them, which is one reason deep-sea research depends so heavily on images and careful measurements taken where the animals live. A fish that seems clumsy in a tank may be perfectly suited to drifting in darkness half a kilometre down. Context matters.",
      "Studying the deep ocean is not only about collecting strange facts. The deep sea helps regulate Earth's climate, stores carbon and influences the movement of heat around the planet. Understanding it better can improve weather models, guide conservation and show how life solves problems in extreme conditions.",
      "Even now, huge areas of the ocean floor remain poorly mapped. Each mission adds only a little to the picture, rather like sketching a vast landscape by torchlight. Yet piece by piece, the darkness becomes more legible, and the sea begins to answer questions that humans have only recently learned how to ask."
    ],
    "questions": [
      {
        "id": "md_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "Why do many deep-ocean discoveries now begin with machines instead of people?",
        "check": {
          "keywordAny": [
            [
              "pressure"
            ],
            [
              "cold"
            ],
            [
              "distance"
            ],
            [
              "difficult",
              "expens"
            ],
            [
              "send",
              "person",
              "hard"
            ],
            [
              "imposs"
            ]
          ]
        },
        "modelAnswer": "Because the deep ocean is cold, high-pressure and far away, so sending people there is difficult, expensive or impossible.",
        "explanation": "Paragraph 1 gives several reasons machines are often used first.",
        "hint": "Use paragraph 1."
      },
      {
        "id": "md_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"precisely\" mean in paragraph 2?",
        "options": [
          "in a very exact way",
          "at a very fast speed",
          "for a very low cost",
          "without any cable at all"
        ],
        "correct": 0,
        "modelAnswer": "in a very exact way",
        "explanation": "The cable lets pilots control ROVs very exactly.",
        "hint": "Think about the benefit of being linked to the ship."
      },
      {
        "id": "md_q3",
        "type": "open",
        "skill": "2h",
        "marks": 2,
        "stem": "Give one difference between an ROV and an underwater glider.",
        "rubric": [
          {
            "label": "ROV linked by cable / precise control",
            "check": {
              "keywordAny": [
                [
                  "cable"
                ],
                [
                  "ship"
                ],
                [
                  "precise",
                  "control"
                ],
                [
                  "pilot"
                ]
              ]
            }
          },
          {
            "label": "Glider travels longer / less direct control / gathers data over time",
            "check": {
              "keywordAny": [
                [
                  "week"
                ],
                [
                  "long"
                ],
                [
                  "less",
                  "direct"
                ],
                [
                  "buoyanc"
                ],
                [
                  "surface",
                  "briefly"
                ],
                [
                  "data"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "An ROV stays linked to a ship by cable and can be controlled very precisely, while a glider travels for much longer with less direct control and surfaces only briefly to send data.",
        "explanation": "Comparison needs a contrast between both machines, not just a fact about one.",
        "hint": "Mention one feature of each machine."
      },
      {
        "id": "md_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which statement best summarises paragraph 4?",
        "options": [
          "Deep-sea animals are all transparent and harmless.",
          "Deep-sea animals use a range of special adaptations to survive.",
          "Scientists prefer not to study animals in the deep sea.",
          "Pressure in the deep sea makes all movement impossible."
        ],
        "correct": 1,
        "modelAnswer": "Deep-sea animals use a range of special adaptations to survive.",
        "explanation": "Paragraph 4 gives several survival adaptations, including bioluminescence and flexible structures.",
        "hint": "Choose the option that captures the paragraph's main idea."
      },
      {
        "id": "md_q5",
        "type": "open",
        "skill": "2d",
        "marks": 3,
        "stem": "Why does the writer say, \"Context matters\" in paragraph 5?",
        "rubric": [
          {
            "label": "Explains creatures need to be understood in their natural environment",
            "check": {
              "keywordAny": [
                [
                  "where",
                  "live"
                ],
                [
                  "natural",
                  "environment"
                ],
                [
                  "habitat"
                ],
                [
                  "deep",
                  "sea",
                  "condition"
                ],
                [
                  "context"
                ]
              ]
            }
          },
          {
            "label": "Mentions damage or change when brought up",
            "check": {
              "keywordAny": [
                [
                  "bring",
                  "up",
                  "quick"
                ],
                [
                  "damage"
                ],
                [
                  "tank"
                ],
                [
                  "surface"
                ],
                [
                  "clumsy",
                  "tank"
                ]
              ]
            }
          },
          {
            "label": "Links to need for images/measurements in place",
            "check": {
              "keywordAny": [
                [
                  "image"
                ],
                [
                  "measurement"
                ],
                [
                  "research"
                ],
                [
                  "where",
                  "animals",
                  "live"
                ],
                [
                  "depend",
                  "heavily"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The writer means that deep-sea animals have to be understood in the environment they evolved for. Bringing them to the surface can damage them or make them seem awkward, so scientists rely on images and measurements taken where the animals actually live.",
        "explanation": "The phrase sums up why location and conditions affect what scientists can conclude.",
        "hint": "Think about what changes when a deep-sea animal is moved."
      },
      {
        "id": "md_q6",
        "type": "open",
        "skill": "2f",
        "marks": 2,
        "stem": "How does paragraph 6 broaden the text?",
        "rubric": [
          {
            "label": "Moves from strange creatures / machines to wider importance",
            "check": {
              "keywordAny": [
                [
                  "not",
                  "only"
                ],
                [
                  "broaden"
                ],
                [
                  "wider"
                ],
                [
                  "bigger"
                ],
                [
                  "beyond",
                  "fact"
                ],
                [
                  "more",
                  "than",
                  "strange"
                ]
              ]
            }
          },
          {
            "label": "Mentions climate / carbon / conservation",
            "check": {
              "keywordAny": [
                [
                  "climate"
                ],
                [
                  "carbon"
                ],
                [
                  "weather"
                ],
                [
                  "conservation"
                ],
                [
                  "heat",
                  "planet"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Paragraph 6 broadens the text by moving beyond fascinating machines and creatures to explain why the deep ocean matters to the whole planet, including climate and conservation.",
        "explanation": "This is a structure question about how the writer widens the focus.",
        "hint": "What new scale or importance appears in paragraph 6?"
      },
      {
        "id": "md_q7",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why does the writer compare mapping the sea floor to \"sketching a vast landscape by torchlight\"?",
        "rubric": [
          {
            "label": "Shows limited visibility / partial knowledge",
            "check": {
              "keywordAny": [
                [
                  "small",
                  "part"
                ],
                [
                  "limited"
                ],
                [
                  "partial"
                ],
                [
                  "cannot",
                  "see",
                  "all"
                ],
                [
                  "torchlight"
                ],
                [
                  "little",
                  "picture"
                ]
              ]
            }
          },
          {
            "label": "Shows slow, gradual progress",
            "check": {
              "keywordAny": [
                [
                  "slow"
                ],
                [
                  "piece",
                  "by",
                  "piece"
                ],
                [
                  "gradual"
                ],
                [
                  "one",
                  "mission"
                ],
                [
                  "bit",
                  "by",
                  "bit"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The comparison shows that scientists can only see and record a small part at a time, so progress is slow and incomplete even though it keeps growing.",
        "explanation": "The image makes a mapping problem easier to picture.",
        "hint": "What can a torchlight not do all at once?"
      },
      {
        "id": "md_q8",
        "type": "short",
        "skill": "2e",
        "marks": 1,
        "stem": "What might scientists be able to do better if deep-ocean knowledge improves?",
        "check": {
          "keywordAny": [
            [
              "weather",
              "model"
            ],
            [
              "guide",
              "conserv"
            ],
            [
              "understand",
              "climate"
            ],
            [
              "solve",
              "problem",
              "extreme"
            ]
          ]
        },
        "modelAnswer": "They may improve weather models, guide conservation and understand life in extreme conditions better.",
        "explanation": "Paragraph 6 lists several possible benefits of better understanding.",
        "hint": "Use the list in paragraph 6."
      },
      {
        "id": "md_q9",
        "type": "mcq",
        "skill": "P3",
        "marks": 1,
        "stem": "In the sentence \"Some of these machines are remotely operated vehicles, or ROVs.\", what job do the commas do?",
        "options": [
          "They add a brief extra explanation without changing the main sentence.",
          "They show someone speaking.",
          "They prepare the reader for a list.",
          "They turn the sentence into a question."
        ],
        "correct": 0,
        "modelAnswer": "They add a brief extra explanation without changing the main sentence.",
        "explanation": "The words \"or ROVs\" give the shorter name for the machines as extra information.",
        "hint": "Try reading the sentence without the words inside the commas. The main sentence still works."
      }
    ]
  },
  {
    "id": "library_key",
    "title": "The Library Key",
    "genre": "fiction",
    "difficulty": 2,
    "isLong": false,
    "blocks": [
      "On the Saturday before repainting week, Sam expected the library to feel smaller, not busier. Dust sheets hung from the tall shelves like folded sails, and every trolley seemed to be carrying either tin lids of paint or towers of returned books. Mrs Devlin, the librarian, tucked a strand of grey hair behind one ear and asked him to help clear the window seat at the back. As she lifted a tray of atlases, a small brass key slid across the wood and tapped against his wrist.",
      "Sam held it up. The key was old-fashioned, with a clover-shaped handle polished pale by years of fingers. \"What does it open?\" he asked, already imagining a locked cupboard full of rare maps or a donation tin nobody had counted. Mrs Devlin smiled in the unhelpful way adults do when they are enjoying a surprise. She pointed to a narrow drawer built underneath the window seat. \"That,\" she said, \"but do not expect treasure of the shiny kind.\"",
      "Inside lay hundreds of stiff cards, each no bigger than a postcard. Some were borrowing records from decades ago, but others held quick notes in pencil or blue ink. One child had written: read under the kitchen table while the washing machine marched. Another: finished chapter nine in the bus shelter before football. A third simply said: best page, page 47, because Dad laughed too loudly. Sam almost said they were only scraps, but the room had gone strangely quiet around the cards, as if it were waiting to hear whether he had understood them.",
      "Mrs Devlin explained that, years ago, children were sometimes invited to leave a line about where a book had met them most strongly. The drawer had never been put on display because the notes mattered more when they were stumbled upon. Sam read another card, then another. The library stopped looking like a quiet room full of shelves and started looking like a meeting place that had learned how to keep people's voices.",
      "When the first paint roller hissed across the far wall, Sam found a blank card at the back. He wrote: finished the storm chapter while ladders clicked and windows smelled of rain. Before locking the drawer again, he slid the card on top of the others instead of underneath, not to make his own note more important, but so that the next finder would know the conversation was still going."
    ],
    "questions": [
      {
        "id": "lk_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "What slid across the window seat and tapped against Sam's wrist?",
        "check": {
          "keywordAny": [
            [
              "brass",
              "key"
            ],
            [
              "small",
              "key"
            ],
            [
              "key"
            ]
          ]
        },
        "modelAnswer": "A small brass key.",
        "explanation": "In paragraph 1, the brass key slides across the wood when Mrs Devlin lifts the atlases.",
        "hint": "Look at the end of paragraph 1."
      },
      {
        "id": "lk_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"scraps\" suggest in paragraph 3?",
        "options": [
          "small pieces that seem unimportant",
          "objects made from silver",
          "rules for borrowing books",
          "noisy machines in the library"
        ],
        "correct": 0,
        "modelAnswer": "small pieces that seem unimportant",
        "explanation": "Sam first thinks the notes are just bits of paper and not very valuable.",
        "hint": "Think about why Sam nearly dismisses the cards."
      },
      {
        "id": "lk_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "Why does Sam change his mind about the cards? Use a short quotation or phrase from the text to support your answer.",
        "answerCheck": {
          "keywordAny": [
            [
              "past",
              "reader"
            ],
            [
              "voice"
            ],
            [
              "connect"
            ],
            [
              "library",
              "more",
              "alive"
            ],
            [
              "not",
              "just",
              "scrap"
            ],
            [
              "meeting",
              "place"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "the room had gone strangely quiet around the cards",
            "a meeting place that had learned how to keep people's voices",
            "Sam read another card, then another"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "He realises the cards make old readers feel present, so the library seems fuller and more alive. Evidence could include: \"a meeting place that had learned how to keep people's voices\".",
        "explanation": "The cards stop seeming like scraps and begin to feel like a record of many readers meeting the library in different moments.",
        "hint": "Explain the change in Sam's thinking first, then give a short phrase that proves it.",
        "reread": [
          3,
          4
        ]
      },
      {
        "id": "lk_q4",
        "type": "order",
        "skill": "2f",
        "marks": 2,
        "stem": "Put these events in the order they happen in the story.",
        "items": [
          "Sam reads the old cards in the drawer.",
          "Mrs Devlin points to the drawer under the window seat.",
          "Sam imagines shiny treasure.",
          "Sam writes his own card."
        ],
        "correctPositions": [
          3,
          2,
          1,
          4
        ],
        "modelAnswer": "1 Sam imagines shiny treasure, 2 Mrs Devlin points to the drawer, 3 Sam reads the old cards, 4 Sam writes his own card.",
        "explanation": "The key leads Sam to imagine treasure first; then he is shown the drawer, reads the cards and finally adds his own.",
        "hint": "Track the key, the drawer, the reading and the writing."
      },
      {
        "id": "lk_q5",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why might the writer describe the library as \"a meeting place that had learned how to keep people's voices\"?",
        "rubric": [
          {
            "label": "Explains that voices are memories or words, not literal talking",
            "check": {
              "keywordAny": [
                [
                  "not",
                  "literal"
                ],
                [
                  "memory"
                ],
                [
                  "word"
                ],
                [
                  "note"
                ],
                [
                  "reader",
                  "voice"
                ],
                [
                  "keep",
                  "people",
                  "voice"
                ]
              ]
            }
          },
          {
            "label": "Explains the effect of connection or liveliness",
            "check": {
              "keywordAny": [
                [
                  "alive"
                ],
                [
                  "connected"
                ],
                [
                  "many",
                  "reader"
                ],
                [
                  "meeting"
                ],
                [
                  "shared"
                ],
                [
                  "not",
                  "quiet",
                  "room"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The writer makes the library seem alive with past readers. It is not keeping actual voices, but it is keeping their words and experiences so the room feels shared rather than silent.",
        "explanation": "This phrase suggests that books and notes can hold traces of many people across time.",
        "hint": "Think about what is being 'kept' in the drawer besides paper."
      },
      {
        "id": "lk_q6",
        "type": "open",
        "skill": "2e",
        "marks": 2,
        "stem": "What is Sam most likely to do the next time he visits the library? Explain briefly.",
        "rubric": [
          {
            "label": "Predicts that Sam will read, add to or look for more cards",
            "check": {
              "keywordAny": [
                [
                  "read",
                  "card"
                ],
                [
                  "look",
                  "card"
                ],
                [
                  "write",
                  "card"
                ],
                [
                  "add",
                  "note"
                ],
                [
                  "drawer"
                ],
                [
                  "conversation"
                ]
              ]
            }
          },
          {
            "label": "Roots the prediction in the ending",
            "check": {
              "keywordAny": [
                [
                  "conversation"
                ],
                [
                  "next",
                  "finder"
                ],
                [
                  "still",
                  "going"
                ],
                [
                  "top",
                  "others"
                ],
                [
                  "changed",
                  "mind"
                ],
                [
                  "because"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "He is likely to look for the drawer again and read or add more cards, because the ending shows he now sees the notes as an ongoing conversation between readers.",
        "explanation": "The final paragraph shows Sam actively joining in rather than dismissing the cards.",
        "hint": "Use the final paragraph, especially what Sam does with his own card."
      }
    ]
  },
  {
    "id": "when_bridges_sing",
    "title": "When Bridges Sing",
    "genre": "non-fiction",
    "difficulty": 3,
    "isLong": false,
    "blocks": [
      "Most bridges are designed to be strong, not musical, yet some can hum, whistle or even produce a low shivering note when the wind is right. The sound does not come from hidden speakers or anything mysterious inside the road. It happens when moving air brushes past cables, rails or the edges of the deck and makes them vibrate.",
      "A small vibration is not automatically a sign of danger. Many structures flex slightly because that is safer than being perfectly rigid. Engineers pay attention when the movement grows rhythmic or begins to match the bridge's own natural frequency. Then a gentle tremble can build into something larger, rather as a swing travels higher if each push arrives at just the right moment.",
      "To reduce that risk, designers may change the shape of parts that catch the wind or add dampers that absorb energy before it grows. On some modern bridges, sensors measure movement day and night. If a bridge begins to sing more loudly than expected, the sound is not treated as a performance. It is treated as information.",
      "This is one reason engineers sometimes describe a bridge as talking. They do not mean it thinks. They mean that sound, movement and strain can all reveal what the structure is experiencing. A tuned ear will not replace calculations or inspections, but it can offer an early clue that the weather and the bridge are starting to argue with each other."
    ],
    "questions": [
      {
        "id": "wbs_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "According to paragraph 1, what makes the sound when a bridge seems to sing?",
        "check": {
          "keywordAny": [
            [
              "moving",
              "air"
            ],
            [
              "wind"
            ],
            [
              "air",
              "brush"
            ],
            [
              "make",
              "vibrat"
            ],
            [
              "cable"
            ]
          ]
        },
        "modelAnswer": "Moving air makes parts of the bridge, such as cables or edges, vibrate.",
        "explanation": "The text explains that the sound comes from air moving past parts of the bridge and making them vibrate.",
        "hint": "Use the final sentence of paragraph 1."
      },
      {
        "id": "wbs_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"vibrate\" mean in paragraph 1?",
        "options": [
          "move with a quick shaking motion",
          "freeze completely still",
          "become brighter in colour",
          "grow much heavier than before"
        ],
        "correct": 0,
        "modelAnswer": "move with a quick shaking motion",
        "explanation": "The word describes a quick trembling movement that can create sound.",
        "hint": "Think about what has to happen for a hum or whistle to be heard."
      },
      {
        "id": "wbs_q3",
        "type": "multiSelect",
        "skill": "2b",
        "marks": 2,
        "stem": "Which TWO reasons show why engineers pay attention to bridge sounds?",
        "options": [
          "The sounds can show that movement is becoming rhythmic or stronger.",
          "The sounds can act as early clues about what the structure is experiencing.",
          "The sounds help engineers choose a paint colour.",
          "The sounds are mainly there to entertain drivers."
        ],
        "correctSet": [
          0,
          1
        ],
        "modelAnswer": "Engineers listen because sound can show movement growing more serious and can provide early clues about strain or weather effects.",
        "explanation": "The passage links bridge sounds to safety information, not entertainment.",
        "hint": "Choose the options that connect sound to structure and warning signs."
      },
      {
        "id": "wbs_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which statement best summarises paragraph 3?",
        "options": [
          "Engineers avoid modern bridges because sensors are too expensive to use.",
          "Designers can reduce risky movement and use sensors so unusual sound becomes useful information.",
          "Bridge sounds should always be ignored unless the bridge has already closed.",
          "Wind can never be controlled, so engineers simply wait for storms to end."
        ],
        "correct": 1,
        "modelAnswer": "Designers can reduce risky movement and use sensors so unusual sound becomes useful information.",
        "explanation": "Paragraph 3 explains both how movement is reduced and why sound is monitored.",
        "hint": "Pick the option that includes both reducing risk and reading information."
      },
      {
        "id": "wbs_q5",
        "type": "open",
        "skill": "2h",
        "marks": 2,
        "stem": "Give one way a bridge is like a guitar string and one way it is different.",
        "rubric": [
          {
            "label": "Similarity: both can vibrate or make sound",
            "check": {
              "keywordAny": [
                [
                  "both",
                  "vibrat"
                ],
                [
                  "both",
                  "sound"
                ],
                [
                  "like",
                  "string"
                ],
                [
                  "hum"
                ],
                [
                  "whistle"
                ]
              ]
            }
          },
          {
            "label": "Difference: bridge is not an instrument / is controlled for safety",
            "check": {
              "keywordAny": [
                [
                  "not",
                  "instrument"
                ],
                [
                  "not",
                  "music"
                ],
                [
                  "safety"
                ],
                [
                  "damp"
                ],
                [
                  "engineer"
                ],
                [
                  "structure"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "They are similar because both can vibrate and make a note when energy passes through them. They are different because a bridge is not meant to be played like an instrument, and engineers try to control its movement for safety.",
        "explanation": "A good comparison needs one similarity and one clear difference.",
        "hint": "Mention what both can do, then explain the bridge's real purpose."
      },
      {
        "id": "wbs_q6",
        "type": "open",
        "skill": "2f",
        "marks": 2,
        "stem": "How does paragraph 4 broaden the explanation in the rest of the text?",
        "rubric": [
          {
            "label": "Moves from mechanics to wider meaning or interpretation",
            "check": {
              "keywordAny": [
                [
                  "broaden"
                ],
                [
                  "wider"
                ],
                [
                  "beyond"
                ],
                [
                  "not",
                  "just"
                ],
                [
                  "meaning"
                ],
                [
                  "talking"
                ]
              ]
            }
          },
          {
            "label": "Mentions sound as a clue about the structure or weather",
            "check": {
              "keywordAny": [
                [
                  "clue"
                ],
                [
                  "structure"
                ],
                [
                  "weather"
                ],
                [
                  "experienc"
                ],
                [
                  "strain"
                ],
                [
                  "argue"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The final paragraph broadens the explanation by moving from how sound is produced to the bigger idea that sound can help engineers understand what the bridge is experiencing.",
        "explanation": "Paragraph 4 turns the science of vibration into a wider way of interpreting the bridge's condition.",
        "hint": "What new idea does the writer add after explaining vibration and dampers?"
      }
    ]
  },
  {
    "id": "before_market",
    "title": "Before the Market",
    "genre": "poetry",
    "difficulty": 3,
    "isLong": false,
    "blocks": [
      "Before the shutters yawn,\nthe square is blue with cold.\nVans cough by the kerb.\nHands pull striped awnings out of the dark\nlike flags remembering their colours.",
      "Crates knock shoulders with the pavement.\nOranges roll a little light into the air.\nA fishmonger lays silver commas on crushed ice\nand the florist unties morning from buckets of green.",
      "No customers yet—\nonly the clink of coins being counted awake,\nonly tea steam climbing from paper cups,\nonly a gull practising its rude opinion overhead.",
      "Then, as the clock on the chemist's wall strikes six,\nthe square clears its throat and brightens.\nBy the time the first footsteps cross the stones,\nthe market is already speaking in scent, colour and calls."
    ],
    "questions": [
      {
        "id": "bm_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "What is being pulled \"out of the dark\" in the first stanza?",
        "check": {
          "keywordAny": [
            [
              "striped",
              "awning"
            ],
            [
              "awning"
            ],
            [
              "flag"
            ]
          ]
        },
        "modelAnswer": "The striped awnings are being pulled out of the dark.",
        "explanation": "The first stanza describes the awnings being pulled out before customers arrive.",
        "hint": "Look at the fourth line of stanza 1."
      },
      {
        "id": "bm_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "In stanza 1, what does the phrase \"Vans cough by the kerb\" suggest?",
        "options": [
          "Their engines are starting roughly and noisily.",
          "The drivers are ill and need medicine.",
          "The market has become completely silent.",
          "The vans are about to be painted."
        ],
        "correct": 0,
        "modelAnswer": "Their engines are starting roughly and noisily.",
        "explanation": "The poet compares the engine sounds to a cough to make the early-morning starting noises vivid.",
        "hint": "Think about the sound a vehicle might make before it warms up."
      },
      {
        "id": "bm_q3",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which statement best summarises stanzas 2 and 3?",
        "options": [
          "The market has already become crowded and difficult to move through.",
          "The stalls are being prepared carefully, and the square is waiting before shoppers arrive.",
          "The traders decide to pack everything away because of the cold weather.",
          "The poet explains how to grow flowers and prepare fish for sale."
        ],
        "correct": 1,
        "modelAnswer": "The stalls are being prepared carefully, and the square is waiting before shoppers arrive.",
        "explanation": "These stanzas focus on the objects, sounds and preparation before customers come.",
        "hint": "Choose the option that includes both preparation and waiting."
      },
      {
        "id": "bm_q4",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "How does the poet make the square seem like a person waking up?",
        "rubric": [
          {
            "label": "Identifies personification",
            "check": {
              "keywordAny": [
                [
                  "yawn"
                ],
                [
                  "clear",
                  "throat"
                ],
                [
                  "speaking"
                ],
                [
                  "personif"
                ],
                [
                  "like",
                  "person"
                ]
              ]
            }
          },
          {
            "label": "Explains effect of waking liveliness",
            "check": {
              "keywordAny": [
                [
                  "wake"
                ],
                [
                  "come",
                  "alive"
                ],
                [
                  "lively"
                ],
                [
                  "morning"
                ],
                [
                  "start",
                  "day"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The poet uses personification, saying the shutters \"yawn\" and the square \"clears its throat\" and is \"speaking\". This makes the place seem to wake up and come alive as the market begins.",
        "explanation": "Personification turns the square into something that seems to rouse itself for the day.",
        "hint": "Look for the words that belong to a person rather than a place."
      },
      {
        "id": "bm_q5",
        "type": "open",
        "skill": "2h",
        "marks": 2,
        "stem": "How is the market different at the start and end of the poem?",
        "rubric": [
          {
            "label": "Start is cold, quiet or still in preparation",
            "check": {
              "keywordAny": [
                [
                  "cold"
                ],
                [
                  "quiet"
                ],
                [
                  "before"
                ],
                [
                  "no",
                  "customer"
                ],
                [
                  "waiting"
                ],
                [
                  "dark"
                ]
              ]
            }
          },
          {
            "label": "End is brighter, more lively or active",
            "check": {
              "keywordAny": [
                [
                  "bright"
                ],
                [
                  "speaking"
                ],
                [
                  "colour"
                ],
                [
                  "call"
                ],
                [
                  "alive"
                ],
                [
                  "first",
                  "footstep"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "At the start, the market is cold, dark and still being set up. By the end, it is bright, lively and ready to meet the first shoppers.",
        "explanation": "The poem moves from preparation to full wakefulness.",
        "hint": "Compare the atmosphere before six o'clock with the final lines."
      },
      {
        "id": "bm_q6",
        "type": "mcq",
        "skill": "P3",
        "marks": 1,
        "stem": "What job does the dash do after \"No customers yet\"?",
        "options": [
          "It creates a pause before extra detail about the empty square.",
          "It shows the exact words someone is saying.",
          "It introduces a question the poet wants answered.",
          "It links two unrelated ideas."
        ],
        "correct": 0,
        "modelAnswer": "It creates a pause before extra detail about the empty square.",
        "explanation": "The dash helps the line pause and then unfold more detail about what can be heard before the market opens.",
        "hint": "Ask what comes after the dash: is it a new voice, or more description?"
      }
    ]
  },
  {
    "id": "last_lantern_keeper",
    "title": "The Last Lantern Keeper",
    "genre": "fiction",
    "difficulty": 5,
    "isLong": true,
    "blocks": [
      "By the time the village lost power, the sea had already turned the colour of slate. From our kitchen window, I could see the harbour lights blinking on one by one and then, as the gusts strengthened, vanishing behind rain. Aunt Caro buttoned her oilskin to the throat, lifted the canvas bag that held the reserve lamp parts and said, \"You're tall enough to carry the dry cloths now.\" I followed her because there was nothing else to do in a blackout and because, although she never admitted it, she preferred company on the climb to the old headland light.\n\nI had always thought of the headland light as one of Aunt Caro's noble, unnecessary jobs. She kept the small stone lamp room ready for emergencies, even though ships had radar, digital charts and radios that spoke in tidy numbers. To me, the place belonged with museum ropes and brass plaques: worth keeping, perhaps, but mainly ceremonial.",
      "The lamp room stood above the harbour path, round-shouldered against the wind. Inside, Aunt Caro moved without wasted effort. She polished the thick lens until it lost its breathy film, checked the wick box, tested the handbell rope and opened a notebook whose pages were furred at the edges from damp air. Beside each date she had written wind directions, tide states and small observations that seemed too minor to matter: gulls keeping low over west rocks; bell on marker late by half a beat; fog rising from the narrows, not the open bay.\n\n\"You still write all that down?\" I asked.\n\"Old things fail slowly,\" she said, not looking up. \"If you watch properly, they tell you they are changing. Screens go black all at once.\"",
      "When she switched on the electric lamp for its test sweep, the beam crossed the harbour wall, touched the rain and thinned. Farther out, the buoy at Black Tooth should have answered with three patient flashes. Instead it gave two quick blinks, hesitated and went dark long enough to make me think I had imagined it. Aunt Caro did not swear or rush. She simply put down her cloth.\n\n\"Watch the water under the west path,\" she said. \"Not the top. The pull underneath.\"\n\nI listened to the radio while she watched the glass. All it gave us was a burst of crackle and half of someone's call sign before the sound dropped away. Outside, fog was climbing the cliff in pale folds. When the beam met it, the light did not seem to pass through so much as get eaten.",
      "I leaned over the gallery rail and did what she had said. Below, where the channel bent between the black rocks, the water was not streaming straight. It curled sideways, hesitating, then jerked back on itself like cloth caught on nails. From farther out came the metal note of the channel marker bell, late once, then early, then silent.\n\nAunt Caro was beside me before I heard her move. She looked from the water to the fog and then to the notebook in her hand.\n\"Crosswind,\" she said. \"And the mist's being pushed through the narrows. If the buoy battery is failing as well, the gap between signals will look wrong from the water.\"\n\"To who?\"\n\"Anyone trying to judge the safe line in by habit.\" She closed the book. \"Fetch the reserve frame.\"",
      "The old oil lamp was heavier than it looked. We carried it up the iron steps to the open gallery, where the wind slapped at our sleeves and tried to steal the dry matches. Aunt Caro lit the wick on the third strike, adjusted the collar until the flame stopped fluttering and set the lens in place. Then she handed me the bell rope.\n\n\"Three slow rings. Pause. Three slow rings again.\"\n\nMy first attempt came out thin and hurried. She made me do it again, this time waiting for the sound to roll outward before pulling once more. Below us, the harbour had almost disappeared. Beyond the wall, two fishing boats were only thicker pieces of darkness moving inside a larger dark. One of them angled too soon towards the rocks, corrected, then held the safer line as the lamp burned steadier.",
      "The harbour master arrived soaked through and angry with the weather rather than with us. The buoy battery had failed, he said, and the mast that carried the back-up radio signal had gone down across the road. One of the skippers had seen the reserve lamp; the other had heard the bell and looked up just in time to understand what the shoreline was telling him.\n\nAunt Caro only nodded. Her face, usually calm in the flat way of stones, had gone slack with tiredness.\n\"I nearly left the lamp room locked this winter,\" the harbour master admitted.\n\"Then next winter don't,\" she said.\nWhen he had gone, I asked how she had known the electric beam was not enough.\n\"I didn't know,\" she said. \"I knew enough not to guess. There's a difference.\"",
      "Morning arrived like a slow apology. The fog had broken into rags over the fields, and the village below looked newly washed, as if the storm had been scrubbed off it during the night. While Aunt Caro hung the damp cloths to dry, I copied the last notes into her notebook in my neatest print: buoy misfiring; fog through narrows; bell pattern used; both boats in by 21:17.\n\nThe lamp room no longer felt ceremonial. It felt precise. Everything in it—the lens cloth, the notebook, the bell, even the patience of waiting long enough to hear the sea answer—belonged to the same job. On the walk down, I kept glancing back at the small tower above the cliff. It was only a light, I thought, and then corrected myself. It was also a way of refusing to guess."
    ],
    "questions": [
      {
        "id": "ll_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "Why does the narrator go with Aunt Caro to the headland light?",
        "check": {
          "keywordAny": [
            [
              "blackout"
            ],
            [
              "help",
              "aunt"
            ],
            [
              "carry",
              "cloth"
            ],
            [
              "company"
            ],
            [
              "headland",
              "light"
            ]
          ]
        },
        "modelAnswer": "The narrator goes because the village is in blackout and Aunt Caro needs help and company climbing to the headland light.",
        "explanation": "Paragraph 1 explains both the blackout and the narrator's sense that Aunt Caro prefers company on the climb.",
        "hint": "Use the end of the first paragraph."
      },
      {
        "id": "ll_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"ceremonial\" suggest in paragraph 1?",
        "options": [
          "mostly symbolic or traditional rather than truly useful",
          "extremely noisy and frightening",
          "hidden from everybody in the village",
          "too modern for the narrator to understand"
        ],
        "correct": 0,
        "modelAnswer": "mostly symbolic or traditional rather than truly useful",
        "explanation": "The narrator thinks the lamp room is worth keeping but not really needed now that ships have modern technology.",
        "hint": "Look at the sentences around radar, charts and radios."
      },
      {
        "id": "ll_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "Why does the narrator think the lamp room job is old-fashioned at first? Use a short quotation or phrase from the text to support your answer.",
        "answerCheck": {
          "keywordAny": [
            [
              "radar"
            ],
            [
              "digital",
              "chart"
            ],
            [
              "old fashioned"
            ],
            [
              "unnecessary"
            ],
            [
              "mainly",
              "ceremonial"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "ships had radar, digital charts and radios",
            "noble, unnecessary jobs",
            "mainly ceremonial"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "At first the narrator thinks modern technology has made the job unnecessary. Evidence could include: \"ships had radar, digital charts and radios\" or \"mainly ceremonial\".",
        "explanation": "The narrator begins by seeing the lamp room as a relic beside newer systems.",
        "hint": "Explain the idea first, then quote the words that prove it.",
        "reread": [
          1
        ]
      },
      {
        "id": "ll_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which option best summarises paragraphs 2 and 3?",
        "options": [
          "Aunt Caro wastes time cleaning equipment while the narrator grows bored of waiting.",
          "Aunt Caro prepares carefully and notices warning signs while the narrator starts to see the old system may matter.",
          "The harbour master arrives early and orders the lamp to be lit immediately.",
          "The narrator reads the notebook alone and decides to ignore Aunt Caro's instructions."
        ],
        "correct": 1,
        "modelAnswer": "Aunt Caro prepares carefully and notices warning signs while the narrator starts to see the old system may matter.",
        "explanation": "These paragraphs combine careful preparation with the first clues that conditions are changing.",
        "hint": "Choose the answer that includes both preparation and growing danger."
      },
      {
        "id": "ll_q5",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why does the writer say the light seemed to \"get eaten\"?",
        "rubric": [
          {
            "label": "Explains personification or image of swallowing/biting",
            "check": {
              "keywordAny": [
                [
                  "eat"
                ],
                [
                  "swallow"
                ],
                [
                  "personif"
                ],
                [
                  "bite"
                ],
                [
                  "fog",
                  "like",
                  "mouth"
                ]
              ]
            }
          },
          {
            "label": "Explains effect on the beam or danger",
            "check": {
              "keywordAny": [
                [
                  "fog",
                  "thick"
                ],
                [
                  "light",
                  "lost"
                ],
                [
                  "beam",
                  "weaker"
                ],
                [
                  "cannot",
                  "pass"
                ],
                [
                  "danger"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The phrase makes the fog seem like something alive that is swallowing the beam. This shows how thick the fog is and how much it is weakening the light.",
        "explanation": "The image turns a weather effect into something the reader can picture and feel.",
        "hint": "Think about what happens to the beam when fog becomes dense."
      },
      {
        "id": "ll_q6",
        "type": "match",
        "skill": "2h",
        "marks": 2,
        "stem": "Match each detail to the job it does in the story.",
        "prompts": [
          "Aunt Caro's notebook",
          "The buoy at Black Tooth",
          "The handbell"
        ],
        "options": [
          "gave clues about wind and tide",
          "showed that the usual signal could not be trusted",
          "helped crews notice the warning from shore"
        ],
        "correctMap": [
          0,
          1,
          2
        ],
        "modelAnswer": "Notebook → clues about wind and tide; buoy → usual signal could not be trusted; handbell → helped crews notice the warning from shore.",
        "explanation": "Each detail contributes a different part of the problem or solution.",
        "hint": "Think about which detail gives clues, which one fails and which one warns."
      },
      {
        "id": "ll_q7",
        "type": "order",
        "skill": "2f",
        "marks": 2,
        "stem": "Put these events in the order they happen.",
        "items": [
          "The radio breaks into crackle and dies.",
          "The reserve lamp is lit on the gallery.",
          "The harbour master arrives soaked through.",
          "The narrator notices the water curling sideways below the west path."
        ],
        "correctPositions": [
          1,
          3,
          4,
          2
        ],
        "modelAnswer": "1 The radio dies, 2 the water is seen curling sideways, 3 the reserve lamp is lit, 4 the harbour master arrives.",
        "explanation": "The story moves from clue to clue before reaching the action and explanation.",
        "hint": "Track the clues before the lamp is lit."
      },
      {
        "id": "ll_q8",
        "type": "open",
        "skill": "2d",
        "marks": 4,
        "stem": "Why does Aunt Caro wait and observe carefully before lighting the reserve lamp? Use evidence from different parts of the story.",
        "rubric": [
          {
            "label": "Explains that she does not want to guess",
            "check": {
              "keywordAny": [
                [
                  "not",
                  "guess"
                ],
                [
                  "careful"
                ],
                [
                  "observe"
                ],
                [
                  "watch"
                ],
                [
                  "wait"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence about notebook or slow failure",
            "check": {
              "keywordAny": [
                [
                  "old things fail slowly"
                ],
                [
                  "notebook"
                ],
                [
                  "written"
                ],
                [
                  "watch properly"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence about changing signals or water",
            "check": {
              "keywordAny": [
                [
                  "two",
                  "quick",
                  "blink"
                ],
                [
                  "radio"
                ],
                [
                  "water",
                  "curl"
                ],
                [
                  "bell",
                  "late"
                ],
                [
                  "fog"
                ]
              ]
            }
          },
          {
            "label": "Explains how the observation leads to safer action",
            "check": {
              "keywordAny": [
                [
                  "safe"
                ],
                [
                  "judge",
                  "line"
                ],
                [
                  "habit"
                ],
                [
                  "work out"
                ],
                [
                  "decide",
                  "reserve"
                ],
                [
                  "safer"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Aunt Caro waits because she wants evidence before acting. Earlier she says, \"Old things fail slowly,\" which shows she trusts careful observation. She studies the notebook, the buoy flashes, the fog and the water curling in the channel before deciding the signals may look wrong from the sea. That careful reading of the situation helps her choose the safer action instead of just guessing.",
        "explanation": "A high-scoring answer explains her reasoning and supports it with details from more than one part of the story.",
        "hint": "Use one detail from the notebook section and one from the warning signs outside."
      },
      {
        "id": "ll_q9",
        "type": "mcq",
        "skill": "2f",
        "marks": 2,
        "stem": "How does paragraph 5 change the pace and feeling of the story?",
        "options": [
          "It slows the story to give a long history of the harbour.",
          "It shifts from careful observation to urgent physical action on the gallery.",
          "It adds a comic break after the danger has passed.",
          "It repeats earlier information without changing the mood."
        ],
        "correct": 1,
        "modelAnswer": "It shifts from careful observation to urgent physical action on the gallery.",
        "explanation": "The story moves from studying clues to lighting the lamp and ringing the bell under pressure.",
        "hint": "Compare the watching in earlier paragraphs with what happens on the gallery."
      },
      {
        "id": "ll_q10",
        "type": "short",
        "skill": "2e",
        "marks": 2,
        "stem": "If the reserve lamp had not been lit, what is most likely to have happened to the boats?",
        "check": {
          "keywordAny": [
            [
              "wrong",
              "line"
            ],
            [
              "too",
              "soon",
              "rock"
            ],
            [
              "danger"
            ],
            [
              "miss",
              "safe",
              "line"
            ],
            [
              "channel"
            ]
          ]
        },
        "modelAnswer": "At least one boat would have been more likely to take the wrong line in and risk the rocks or the unsafe part of the channel.",
        "explanation": "Paragraph 5 shows one boat already angling too soon towards the rocks before correcting.",
        "hint": "Use the moment when one boat turns too early."
      },
      {
        "id": "ll_q11",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 4,
        "stem": "How does the narrator's view of Aunt Caro change from the start to the end of the story? Use details or short quotations from different parts of the text.",
        "answerCheck": {
          "keywordAny": [
            [
              "from",
              "ceremonial",
              "precise"
            ],
            [
              "respect"
            ],
            [
              "skilled"
            ],
            [
              "careful"
            ],
            [
              "not",
              "old fashioned"
            ],
            [
              "refusing",
              "guess"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "mainly ceremonial",
            "Old things fail slowly",
            "I knew enough not to guess",
            "The lamp room no longer felt ceremonial. It felt precise.",
            "a way of refusing to guess"
          ]
        },
        "answerMarks": 2,
        "evidenceMarks": 2,
        "modelAnswer": "At first the narrator sees Aunt Caro as the keeper of something old and mostly symbolic. By the end, the narrator respects her as skilled, precise and wise because her careful methods helped keep the boats safe. Evidence could include: \"mainly ceremonial\" at the start and \"The lamp room no longer felt ceremonial. It felt precise.\" at the end.",
        "explanation": "The narrator's change in attitude is one of the main movements of the story.",
        "hint": "Compare the narrator's early opinion with the final paragraph.",
        "reread": [
          1,
          7
        ]
      },
      {
        "id": "ll_q12",
        "type": "open",
        "skill": "2g",
        "marks": 4,
        "stem": "How does the writer make old equipment seem powerful rather than outdated?",
        "rubric": [
          {
            "label": "Mentions precise detail about objects or actions",
            "check": {
              "keywordAny": [
                [
                  "lens"
                ],
                [
                  "wick"
                ],
                [
                  "bell"
                ],
                [
                  "notebook"
                ],
                [
                  "cloth"
                ],
                [
                  "reserve lamp"
                ]
              ]
            }
          },
          {
            "label": "Mentions contrast with failing modern systems",
            "check": {
              "keywordAny": [
                [
                  "screen"
                ],
                [
                  "radio"
                ],
                [
                  "mast"
                ],
                [
                  "back-up"
                ],
                [
                  "go black"
                ],
                [
                  "battery"
                ]
              ]
            }
          },
          {
            "label": "Explains that the equipment leads to safety or understanding",
            "check": {
              "keywordAny": [
                [
                  "boat"
                ],
                [
                  "safe"
                ],
                [
                  "warning"
                ],
                [
                  "guide"
                ],
                [
                  "look up"
                ],
                [
                  "understand"
                ]
              ]
            }
          },
          {
            "label": "Comments on effect of language such as precise, steady or patient",
            "check": {
              "keywordAny": [
                [
                  "precise"
                ],
                [
                  "patient"
                ],
                [
                  "steady"
                ],
                [
                  "careful"
                ],
                [
                  "powerful"
                ],
                [
                  "refusing",
                  "guess"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The writer gives the old equipment precise, practical detail: lens, wick, notebook, bell and the exact ringing pattern. This makes it feel purposeful rather than decorative. It is also contrasted with failing modern systems such as the dead radio and fallen mast. Most importantly, the old tools help the boats find the safer line, so the reader sees them as effective. Words like \"precise\" and the final idea of \"refusing to guess\" make the equipment seem disciplined and powerful.",
        "explanation": "A strong answer links the objects, the contrast and the effect on the reader.",
        "hint": "Use both the old tools and the failing modern systems in your answer."
      },
      {
        "id": "ll_q13",
        "type": "open",
        "skill": "2f",
        "marks": 4,
        "stem": "What does the ending with the notebook and the phrase \"a way of refusing to guess\" suggest the narrator has learned? Use evidence from across the story.",
        "rubric": [
          {
            "label": "Explains the lesson about careful observation or patience",
            "check": {
              "keywordAny": [
                [
                  "observe"
                ],
                [
                  "careful"
                ],
                [
                  "patient"
                ],
                [
                  "listen"
                ],
                [
                  "not",
                  "guess"
                ],
                [
                  "precise"
                ]
              ]
            }
          },
          {
            "label": "Shows the narrator now respects the lamp room or Aunt Caro",
            "check": {
              "keywordAny": [
                [
                  "respect"
                ],
                [
                  "value"
                ],
                [
                  "no longer",
                  "ceremonial"
                ],
                [
                  "precise"
                ],
                [
                  "understand"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence from earlier in the story",
            "check": {
              "keywordAny": [
                [
                  "radar"
                ],
                [
                  "ceremonial"
                ],
                [
                  "old things fail slowly"
                ],
                [
                  "notebook"
                ],
                [
                  "bell"
                ]
              ]
            }
          },
          {
            "label": "Uses the ending to explain the change",
            "check": {
              "keywordAny": [
                [
                  "copy"
                ],
                [
                  "notebook"
                ],
                [
                  "refusing",
                  "guess"
                ],
                [
                  "corrected",
                  "myself"
                ],
                [
                  "final"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The ending suggests the narrator has learned that real judgement comes from careful attention, not from assuming modern systems will always be enough. At the start, the headland light seemed \"mainly ceremonial\". By the end, the narrator is copying notes into the notebook and understands why Aunt Caro values patience and evidence. The phrase \"a way of refusing to guess\" shows that the lesson is not only about a lamp, but about a disciplined way of reading danger.",
        "explanation": "The ending ties together the narrator's change in view and the story's larger idea about observation.",
        "hint": "Compare the narrator's first opinion with the final correction: \"It was only a light\"."
      }
    ]
  },
  {
    "id": "how_beavers_rebuild_wetlands",
    "title": "How Beavers Rebuild Wetlands",
    "genre": "non-fiction",
    "difficulty": 4,
    "isLong": true,
    "blocks": [
      "For hundreds of years, beavers shaped rivers in Britain by felling small trees, digging channels and building dams from branches and mud. Then they were hunted heavily for fur, meat and a scented oil called castoreum. By the sixteenth century, they had been driven to extinction in Britain. Their recent return, in a small number of carefully managed places, is therefore not the arrival of a completely new animal but the return of an old landscape-maker.",
      "Beavers are often called ecosystem engineers. The title does not mean they carry plans or solve equations. It means their ordinary behaviour changes the places around them. When a beaver drags branches into a stream and packs gaps with mud, water slows down. When it nibbles trees near the bank, more light can reach the ground. When it digs side channels, water can spread into places it once rushed past.",
      "That slowing effect matters. Fast water carries soil, leaf litter and force in one hard shove. Slower water drops mud, spreads sideways and begins to collect in ponds and wet hollows. After very heavy rain, that can mean a surge is delayed rather than racing downstream at once. Some scientists describe this as spending the river's energy slowly instead of all at once.",
      "The result can look untidy to human eyes: dead wood leaning in the margins, shallow pools where grass once grew, reeds pushing into open water. Yet many species thrive in that messiness. Dragonflies breed in still pools, amphibians use the wetter edges, young fish shelter in quieter channels and birds feed where insects multiply. A wetter, more varied place can hold more life than a straight, fast ditch.",
      "None of this means beavers are helpful in every location or every season. A dam can flood a path, soak the corner of a field or block a culvert near a road. Trees valued by landowners may be gnawed. For that reason, reintroduction projects use monitoring, tree guards, flow devices and, sometimes, the removal of particular dams. The choice is rarely between leaving everything alone and removing every beaver. It is usually about deciding what kind of management a place needs.",
      "This is why the modern debate is less sentimental than it first appears. Scientists and land managers are not simply asking whether beavers are \"good\" or \"bad\". They are asking where wetland creation is most useful, what other species respond, how nearby farms are affected and which tools reduce conflict without destroying the benefits. In other words, the question is not whether beavers change landscapes, but how deliberately people can live with that change.",
      "The wider interest in beavers comes from more than curiosity about one mammal. In a warmer, less predictable climate, many parts of Britain face both flash floods and summer drought. Landscapes that can store water, release it more slowly and support richer wetland habitats are increasingly valuable. Beavers are not a magic answer to those problems, but they can be one part of a broader plan for building healthier river systems."
    ],
    "questions": [
      {
        "id": "hb_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "Why did beavers disappear from Britain for many centuries?",
        "check": {
          "keywordAny": [
            [
              "hunt"
            ],
            [
              "fur"
            ],
            [
              "meat"
            ],
            [
              "castoreum"
            ],
            [
              "extinct"
            ]
          ]
        },
        "modelAnswer": "They were hunted heavily, which drove them to extinction in Britain.",
        "explanation": "Paragraph 1 explains that heavy hunting led to extinction.",
        "hint": "Use paragraph 1."
      },
      {
        "id": "hb_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"engineers\" suggest in paragraph 2?",
        "options": [
          "Beavers reshape their surroundings through what they do.",
          "Beavers are trained to build roads and bridges for people.",
          "Beavers mainly study equations before they move branches.",
          "Beavers do not really affect rivers at all."
        ],
        "correct": 0,
        "modelAnswer": "Beavers reshape their surroundings through what they do.",
        "explanation": "The text explains that the word refers to how beavers change places around them, not to a human job title.",
        "hint": "Read the sentence after the word \"engineers\"."
      },
      {
        "id": "hb_q3",
        "type": "multiSelect",
        "skill": "2b",
        "marks": 2,
        "stem": "Which TWO changes can happen when water slows behind a beaver dam?",
        "options": [
          "Mud can drop out of the water.",
          "Water can spread into ponds or wet hollows.",
          "The river always begins to burn hotter.",
          "The current always becomes faster than before."
        ],
        "correctSet": [
          0,
          1
        ],
        "modelAnswer": "Mud can drop and water can spread into ponds or wet hollows.",
        "explanation": "Paragraph 3 explains these changes directly.",
        "hint": "Choose the two outcomes named in paragraph 3."
      },
      {
        "id": "hb_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which statement best summarises paragraph 4?",
        "options": [
          "Messy-looking wet places can support many different kinds of life.",
          "Wetlands are always less useful than straight drainage ditches.",
          "Only fish benefit when beavers create pools.",
          "People usually prefer reeds and dead wood to tidy grass."
        ],
        "correct": 0,
        "modelAnswer": "Messy-looking wet places can support many different kinds of life.",
        "explanation": "Paragraph 4 contrasts the untidy appearance with the many species that thrive there.",
        "hint": "Choose the option that includes both the appearance and the wildlife benefit."
      },
      {
        "id": "hb_q5",
        "type": "open",
        "skill": "2h",
        "marks": 2,
        "stem": "Give one benefit and one difficulty that beavers can bring to the same landscape.",
        "rubric": [
          {
            "label": "Names a benefit",
            "check": {
              "keywordAny": [
                [
                  "flood"
                ],
                [
                  "store",
                  "water"
                ],
                [
                  "wetland"
                ],
                [
                  "habitat"
                ],
                [
                  "dragonfl"
                ],
                [
                  "amphib"
                ],
                [
                  "fish"
                ],
                [
                  "bird"
                ]
              ]
            }
          },
          {
            "label": "Names a difficulty",
            "check": {
              "keywordAny": [
                [
                  "flood",
                  "path"
                ],
                [
                  "field"
                ],
                [
                  "culvert"
                ],
                [
                  "gnaw"
                ],
                [
                  "tree"
                ],
                [
                  "landowner"
                ],
                [
                  "conflict"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "A benefit is that beavers can create wetter habitats and slow water, helping wildlife and reducing sudden surges. A difficulty is that a dam may flood a path or field, block a culvert or damage valued trees.",
        "explanation": "A strong comparison shows both sides of the issue, not just one.",
        "hint": "Use one detail from paragraph 4 and one from paragraph 5."
      },
      {
        "id": "hb_q6",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "Why can beaver dams reduce sudden flooding downstream? Use a short quotation or phrase from the text to support your answer.",
        "answerCheck": {
          "keywordAny": [
            [
              "slow",
              "water"
            ],
            [
              "delay",
              "surge"
            ],
            [
              "store",
              "water"
            ],
            [
              "spread",
              "sideways"
            ],
            [
              "not",
              "once"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "a surge is delayed rather than racing downstream at once",
            "water drops mud, spreads sideways and begins to collect in ponds and wet hollows",
            "spending the river's energy slowly instead of all at once"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "The dams slow and spread the water so a heavy surge is delayed instead of rushing downstream at once. Evidence could include: \"a surge is delayed rather than racing downstream at once\".",
        "explanation": "Paragraph 3 explains both the slowed flow and the reduced force downstream.",
        "hint": "Explain what happens to the water, then quote the line that proves it.",
        "reread": [
          3
        ]
      },
      {
        "id": "hb_q7",
        "type": "match",
        "skill": "2f",
        "marks": 2,
        "stem": "Match each paragraph to the job it does in the text.",
        "prompts": [
          "Paragraph 2",
          "Paragraph 5",
          "Paragraph 7"
        ],
        "options": [
          "explains how beavers physically change water movement",
          "shows why management may be needed",
          "broadens to wider national value and climate resilience"
        ],
        "correctMap": [
          0,
          1,
          2
        ],
        "modelAnswer": "Paragraph 2 → how beavers change water movement; Paragraph 5 → why management may be needed; Paragraph 7 → wider national value.",
        "explanation": "This question is about the structure of the whole text.",
        "hint": "Think about explanation, complication and widening out."
      },
      {
        "id": "hb_q8",
        "type": "open",
        "skill": "2g",
        "marks": 3,
        "stem": "Why might the writer use the phrase \"spending the river's energy slowly\" in paragraph 3?",
        "rubric": [
          {
            "label": "Explains the image is easier to picture than technical language",
            "check": {
              "keywordAny": [
                [
                  "picture"
                ],
                [
                  "image"
                ],
                [
                  "easier"
                ],
                [
                  "clearer"
                ],
                [
                  "figurative"
                ],
                [
                  "metaphor"
                ]
              ]
            }
          },
          {
            "label": "Explains that the force is spread out or reduced",
            "check": {
              "keywordAny": [
                [
                  "spread"
                ],
                [
                  "slow"
                ],
                [
                  "reduce"
                ],
                [
                  "less",
                  "force"
                ],
                [
                  "not",
                  "all",
                  "once"
                ],
                [
                  "delay"
                ]
              ]
            }
          },
          {
            "label": "Links to flood reduction or water behaviour",
            "check": {
              "keywordAny": [
                [
                  "flood"
                ],
                [
                  "surge"
                ],
                [
                  "downstream"
                ],
                [
                  "water"
                ],
                [
                  "energy"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The phrase turns a scientific idea into something the reader can picture. It suggests the river's force is being used up bit by bit instead of arriving all at once, which helps explain why downstream flooding may be reduced.",
        "explanation": "A good answer explains both the image and the effect of that image.",
        "hint": "Why is this phrase more vivid than simply saying 'the water slowed'?"
      },
      {
        "id": "hb_q9",
        "type": "open",
        "skill": "2d",
        "marks": 3,
        "stem": "Why does the writer include both benefits and problems in the passage instead of only praising beavers?",
        "rubric": [
          {
            "label": "Explains the passage is balanced or realistic",
            "check": {
              "keywordAny": [
                [
                  "balanced"
                ],
                [
                  "realistic"
                ],
                [
                  "both",
                  "side"
                ],
                [
                  "not",
                  "simple"
                ],
                [
                  "not",
                  "only",
                  "praise"
                ]
              ]
            }
          },
          {
            "label": "Mentions management or conflict",
            "check": {
              "keywordAny": [
                [
                  "management"
                ],
                [
                  "conflict"
                ],
                [
                  "field"
                ],
                [
                  "culvert"
                ],
                [
                  "tree guard"
                ],
                [
                  "monitoring"
                ]
              ]
            }
          },
          {
            "label": "Explains this makes the argument more trustworthy or useful",
            "check": {
              "keywordAny": [
                [
                  "trust"
                ],
                [
                  "convinc"
                ],
                [
                  "useful"
                ],
                [
                  "practical"
                ],
                [
                  "credibl"
                ],
                [
                  "help",
                  "reader"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The writer includes both sides to make the passage realistic and balanced. Beavers can create habitats and slow water, but they can also flood paths or fields and need management. Including the problems makes the explanation more trustworthy and practical.",
        "explanation": "The passage is not trying to romanticise beavers; it is trying to explain them honestly.",
        "hint": "Think about how the passage would feel if paragraph 5 were missing."
      },
      {
        "id": "hb_q10",
        "type": "open",
        "skill": "2e",
        "marks": 3,
        "stem": "Based on the passage, what is one likely result of putting beavers in the wrong place without planning? Explain briefly.",
        "rubric": [
          {
            "label": "Predicts a plausible problem",
            "check": {
              "keywordAny": [
                [
                  "flood"
                ],
                [
                  "field"
                ],
                [
                  "path"
                ],
                [
                  "culvert"
                ],
                [
                  "tree"
                ],
                [
                  "conflict"
                ],
                [
                  "farm"
                ]
              ]
            }
          },
          {
            "label": "Roots the prediction in the text",
            "check": {
              "keywordAny": [
                [
                  "because"
                ],
                [
                  "paragraph",
                  "5"
                ],
                [
                  "dam"
                ],
                [
                  "monitoring"
                ],
                [
                  "management"
                ],
                [
                  "landowner"
                ]
              ]
            }
          },
          {
            "label": "Shows understanding that location matters",
            "check": {
              "keywordAny": [
                [
                  "wrong",
                  "place"
                ],
                [
                  "without",
                  "planning"
                ],
                [
                  "location"
                ],
                [
                  "not",
                  "every",
                  "place"
                ],
                [
                  "season"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "A likely result is that a dam could flood a path or part of a field, causing conflict with landowners, because paragraph 5 explains that beavers are not helpful in every location and need planning and management.",
        "explanation": "A strong prediction stays close to the passage and explains why it follows.",
        "hint": "Use the warnings in paragraph 5."
      },
      {
        "id": "hb_q11",
        "type": "open",
        "skill": "2f",
        "marks": 4,
        "stem": "How does the writer broaden the subject from paragraph 1 to paragraph 7?",
        "rubric": [
          {
            "label": "Starts with history or return of beavers",
            "check": {
              "keywordAny": [
                [
                  "history"
                ],
                [
                  "return"
                ],
                [
                  "extinct"
                ],
                [
                  "britain"
                ],
                [
                  "old",
                  "landscape maker"
                ]
              ]
            }
          },
          {
            "label": "Moves to how beavers change water or habitats",
            "check": {
              "keywordAny": [
                [
                  "slow",
                  "water"
                ],
                [
                  "dam"
                ],
                [
                  "channel"
                ],
                [
                  "wetland"
                ],
                [
                  "habitat"
                ],
                [
                  "pond"
                ]
              ]
            }
          },
          {
            "label": "Includes management or debate",
            "check": {
              "keywordAny": [
                [
                  "management"
                ],
                [
                  "debate"
                ],
                [
                  "conflict"
                ],
                [
                  "good",
                  "bad"
                ],
                [
                  "farm"
                ],
                [
                  "land manager"
                ]
              ]
            }
          },
          {
            "label": "Ends with wider climate or river-system importance",
            "check": {
              "keywordAny": [
                [
                  "climate"
                ],
                [
                  "drought"
                ],
                [
                  "flash",
                  "flood"
                ],
                [
                  "broader",
                  "plan"
                ],
                [
                  "river system"
                ],
                [
                  "national"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The passage begins with the history of beavers disappearing and returning to Britain. It then explains how their behaviour changes water and creates habitats, before moving into the difficulties and management questions this raises. By the final paragraph, the writer has widened the focus to climate resilience and healthier river systems across Britain.",
        "explanation": "This is a whole-text structure question, so track how the scale widens.",
        "hint": "Think about starting point, middle explanation and final widening out."
      },
      {
        "id": "hb_q12",
        "type": "open",
        "skill": "2h",
        "marks": 4,
        "stem": "Compare how the writer presents \"messy\" landscapes in paragraphs 4 and 5.",
        "rubric": [
          {
            "label": "Paragraph 4: messy places help wildlife or richness",
            "check": {
              "keywordAny": [
                [
                  "wildlife"
                ],
                [
                  "dragonfl"
                ],
                [
                  "amphib"
                ],
                [
                  "fish"
                ],
                [
                  "bird"
                ],
                [
                  "more",
                  "life"
                ],
                [
                  "thrive"
                ]
              ]
            }
          },
          {
            "label": "Paragraph 5: messy changes can cause human problems",
            "check": {
              "keywordAny": [
                [
                  "path"
                ],
                [
                  "field"
                ],
                [
                  "culvert"
                ],
                [
                  "landowner"
                ],
                [
                  "problem"
                ],
                [
                  "flood"
                ]
              ]
            }
          },
          {
            "label": "Makes the comparison explicit",
            "check": {
              "keywordAny": [
                [
                  "whereas"
                ],
                [
                  "however"
                ],
                [
                  "but"
                ],
                [
                  "in paragraph 4"
                ],
                [
                  "in paragraph 5"
                ],
                [
                  "on the other hand"
                ]
              ]
            }
          },
          {
            "label": "Explains that the same feature can be both useful and difficult",
            "check": {
              "keywordAny": [
                [
                  "same"
                ],
                [
                  "both"
                ],
                [
                  "useful"
                ],
                [
                  "difficult"
                ],
                [
                  "benefit"
                ],
                [
                  "problem"
                ],
                [
                  "same",
                  "time"
                ],
                [
                  "same",
                  "landscape"
                ],
                [
                  "rich",
                  "and",
                  "difficult"
                ],
                [
                  "ecological",
                  "rich"
                ],
                [
                  "practical",
                  "difficult"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "In paragraph 4, messiness is presented as productive because it creates still pools, wetter edges and more habitats for wildlife. In paragraph 5, similar changes are presented from a human point of view, where they may flood paths, fields or block culverts. The writer shows that the same untidy landscape can be ecologically rich and practically difficult at the same time.",
        "explanation": "A strong comparison needs both paragraphs and the link between them.",
        "hint": "One paragraph looks mainly through wildlife eyes; the other through human management."
      },
      {
        "id": "hb_q13",
        "type": "open",
        "skill": "2d",
        "marks": 4,
        "stem": "\"The passage presents beavers as useful, but not magical.\" How far do you agree? Use evidence from different parts of the text.",
        "rubric": [
          {
            "label": "States a clear view",
            "check": {
              "keywordAny": [
                [
                  "agree"
                ],
                [
                  "useful"
                ],
                [
                  "not",
                  "magic"
                ],
                [
                  "to",
                  "some",
                  "extent"
                ],
                [
                  "far",
                  "agree"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence of benefits",
            "check": {
              "keywordAny": [
                [
                  "slow",
                  "water"
                ],
                [
                  "wetland"
                ],
                [
                  "habitat"
                ],
                [
                  "flash",
                  "flood"
                ],
                [
                  "store",
                  "water"
                ],
                [
                  "richer"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence of limits or management",
            "check": {
              "keywordAny": [
                [
                  "field"
                ],
                [
                  "culvert"
                ],
                [
                  "management"
                ],
                [
                  "tree guard"
                ],
                [
                  "flow device"
                ],
                [
                  "not",
                  "every",
                  "location"
                ]
              ]
            }
          },
          {
            "label": "Explains how the evidence supports the judgement",
            "check": {
              "keywordAny": [
                [
                  "show"
                ],
                [
                  "because"
                ],
                [
                  "therefore"
                ],
                [
                  "this",
                  "means"
                ],
                [
                  "suggest"
                ],
                [
                  "prove"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "I agree to a large extent. The passage clearly shows beavers can be useful because they slow water, create wetlands and support more wildlife. However, it also stresses that they are not a magical fix: dams can flood fields or paths, and projects need monitoring and management. The final paragraph makes this explicit by saying beavers are not a magic answer, but one part of a broader plan.",
        "explanation": "A high-scoring answer needs a judgement, evidence from more than one part and explanation of the balance.",
        "hint": "Use at least one benefit and one limit from different parts of the passage."
      }
    ]
  }
]);

export const READING_TEST_PAPERS = Object.freeze([
  {
    "id": "paper_a",
    "title": "Original KS2-style Paper A",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "city_swifts",
        "questionIds": [
          "sw_q1",
          "sw_q2",
          "sw_q3",
          "sw_q4",
          "sw_q5",
          "sw_q6",
          "sw_q7"
        ]
      },
      {
        "passageId": "museum_after_closing",
        "questionIds": [
          "mac_q1",
          "mac_q2",
          "mac_q3",
          "mac_q4",
          "mac_q5"
        ]
      },
      {
        "passageId": "tide_clock",
        "questionIds": [
          "tc_q1",
          "tc_q2",
          "tc_q3",
          "tc_q4",
          "tc_q5",
          "tc_q6",
          "tc_q7",
          "tc_q8",
          "tc_q9",
          "tc_q10",
          "tc_q12",
          "tc_q13"
        ]
      }
    ]
  },
  {
    "id": "paper_b",
    "title": "Original KS2-style Paper B",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "red_tin_box",
        "questionIds": [
          "rtb_q1",
          "rtb_q2",
          "rtb_q3",
          "rtb_q4",
          "rtb_q5",
          "rtb_q6"
        ]
      },
      {
        "passageId": "salt_marsh_makers",
        "questionIds": [
          "sm_q1",
          "sm_q2",
          "sm_q3",
          "sm_q4",
          "sm_q5",
          "sm_q6",
          "sm_q7"
        ]
      },
      {
        "passageId": "last_lantern_keeper",
        "questionIds": [
          "ll_q1",
          "ll_q2",
          "ll_q3",
          "ll_q4",
          "ll_q5",
          "ll_q6",
          "ll_q7",
          "ll_q8",
          "ll_q9",
          "ll_q11",
          "ll_q12",
          "ll_q13"
        ]
      }
    ]
  },
  {
    "id": "paper_c",
    "title": "Original KS2-style Paper C",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "greenhouse_window",
        "questionIds": [
          "gw_q1",
          "gw_q2",
          "gw_q3",
          "gw_q4",
          "gw_q5",
          "gw_q6"
        ]
      },
      {
        "passageId": "night_ferry",
        "questionIds": [
          "nf_q1",
          "nf_q2",
          "nf_q3",
          "nf_q4",
          "nf_q5"
        ]
      },
      {
        "passageId": "how_beavers_rebuild_wetlands",
        "questionIds": [
          "hb_q1",
          "hb_q2",
          "hb_q3",
          "hb_q4",
          "hb_q5",
          "hb_q6",
          "hb_q7",
          "hb_q8",
          "hb_q9",
          "hb_q10",
          "hb_q11",
          "hb_q12",
          "hb_q13"
        ]
      }
    ]
  },
  {
    "id": "paper_d",
    "title": "Original KS2-style Paper D",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "library_key",
        "questionIds": [
          "lk_q1",
          "lk_q2",
          "lk_q3",
          "lk_q4",
          "lk_q5",
          "lk_q6"
        ]
      },
      {
        "passageId": "before_market",
        "questionIds": [
          "bm_q1",
          "bm_q2",
          "bm_q3",
          "bm_q4",
          "bm_q5"
        ]
      },
      {
        "passageId": "tide_clock",
        "questionIds": [
          "tc_q1",
          "tc_q2",
          "tc_q3",
          "tc_q4",
          "tc_q5",
          "tc_q6",
          "tc_q7",
          "tc_q8",
          "tc_q9",
          "tc_q10",
          "tc_q11",
          "tc_q12",
          "tc_q13"
        ]
      }
    ]
  },
  {
    "id": "paper_e",
    "title": "Original KS2-style Paper E",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "when_bridges_sing",
        "questionIds": [
          "wbs_q1",
          "wbs_q2",
          "wbs_q3",
          "wbs_q4",
          "wbs_q5",
          "wbs_q6"
        ]
      },
      {
        "passageId": "museum_after_closing",
        "questionIds": [
          "mac_q1",
          "mac_q2",
          "mac_q3",
          "mac_q4",
          "mac_q5"
        ]
      },
      {
        "passageId": "last_lantern_keeper",
        "questionIds": [
          "ll_q1",
          "ll_q2",
          "ll_q3",
          "ll_q4",
          "ll_q5",
          "ll_q6",
          "ll_q7",
          "ll_q8",
          "ll_q9",
          "ll_q10",
          "ll_q11",
          "ll_q12",
          "ll_q13"
        ]
      }
    ]
  },
  {
    "id": "paper_f",
    "title": "Original KS2-style Paper F",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "city_swifts",
        "questionIds": [
          "sw_q1",
          "sw_q2",
          "sw_q3",
          "sw_q4",
          "sw_q5",
          "sw_q6",
          "sw_q7"
        ]
      },
      {
        "passageId": "library_key",
        "questionIds": [
          "lk_q1",
          "lk_q2",
          "lk_q3",
          "lk_q4",
          "lk_q5",
          "lk_q6"
        ]
      },
      {
        "passageId": "how_beavers_rebuild_wetlands",
        "questionIds": [
          "hb_q1",
          "hb_q2",
          "hb_q3",
          "hb_q4",
          "hb_q5",
          "hb_q6",
          "hb_q8",
          "hb_q9",
          "hb_q11",
          "hb_q12",
          "hb_q13"
        ]
      }
    ]
  },
  {
    "id": "paper_g",
    "title": "Original KS2-style Paper G",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "red_tin_box",
        "questionIds": [
          "rtb_q1",
          "rtb_q2",
          "rtb_q3",
          "rtb_q4",
          "rtb_q5",
          "rtb_q6"
        ]
      },
      {
        "passageId": "when_bridges_sing",
        "questionIds": [
          "wbs_q1",
          "wbs_q2",
          "wbs_q3",
          "wbs_q4",
          "wbs_q5",
          "wbs_q6"
        ]
      },
      {
        "passageId": "how_beavers_rebuild_wetlands",
        "questionIds": [
          "hb_q3",
          "hb_q4",
          "hb_q5",
          "hb_q6",
          "hb_q7",
          "hb_q8",
          "hb_q9",
          "hb_q10",
          "hb_q11",
          "hb_q12",
          "hb_q13"
        ]
      }
    ]
  },
  {
    "id": "paper_h",
    "title": "Original KS2-style Paper H",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "city_swifts",
        "questionIds": [
          "sw_q1",
          "sw_q2",
          "sw_q3",
          "sw_q4",
          "sw_q5",
          "sw_q6",
          "sw_q7"
        ]
      },
      {
        "passageId": "before_market",
        "questionIds": [
          "bm_q1",
          "bm_q2",
          "bm_q3",
          "bm_q4",
          "bm_q5"
        ]
      },
      {
        "passageId": "last_lantern_keeper",
        "questionIds": [
          "ll_q3",
          "ll_q4",
          "ll_q5",
          "ll_q6",
          "ll_q7",
          "ll_q8",
          "ll_q9",
          "ll_q10",
          "ll_q11",
          "ll_q12",
          "ll_q13"
        ]
      }
    ]
  }
]);

export const READING_GENRES = Object.freeze(['fiction', 'non-fiction', 'poetry']);
export const READING_MODES = Object.freeze(['guided', 'core', 'smart', 'evidence', 'vocab', 'inference', 'punct', 'stamina', 'test']);

export function readingPassageMap(passages = READING_PASSAGES) {
  return Object.freeze(Object.fromEntries(passages.map((passage) => [passage.id, passage])));
}

export function readingQuestionRefMap(passages = READING_PASSAGES) {
  const entries = [];
  for (const passage of passages) {
    for (const [index, question] of (passage.questions || []).entries()) {
      entries.push([question.id, { passageId: passage.id, question, index }]);
    }
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function readingWordCount(passage) {
  return String((passage?.blocks || []).join(' ')).trim().split(/\s+/).filter(Boolean).length;
}

export function readingContentSummary() {
  const passages = READING_PASSAGES;
  const questionCount = passages.reduce((sum, passage) => sum + (passage.questions || []).length, 0);
  const genres = Object.fromEntries(READING_GENRES.map((genre) => [
    genre,
    passages.filter((passage) => passage.genre === genre).length,
  ]));
  return {
    releaseId: READING_CONTENT_RELEASE_ID,
    version: READING_CONTENT_VERSION,
    passageCount: passages.length,
    questionCount,
    paperCount: READING_TEST_PAPERS.length,
    skillCount: Object.keys(READING_SKILLS).length,
    genres,
    longPassageCount: passages.filter((passage) => passage.isLong).length,
  };
}
