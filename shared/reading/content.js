// Original KS2 Reading content promoted from the single-file PoC into the shared
// subject-content layer. The Worker reading engine imports this file; the
// browser may render its safe metadata but never performs production marking.

export const READING_CONTENT_RELEASE_ID = 'reading-poc-promoted-2026-05-05';
export const READING_CONTENT_VERSION = 2;

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
        "stem": "Which option best summarises Gran's noticing box and its effect on Nia?",
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
        "stem": "Which statement best summarises why salt marshes matter in paragraph 3?",
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
        "stem": "What is the best summary of Night Ferry?",
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
        "stem": "Which statement best summarises the deep-sea adaptations in paragraph 4?",
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
        "stem": "Which statement best summarises how bridge designers manage risky movement?",
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
        "stem": "Which option best summarises Aunt Caro's careful preparation and the narrator's changing view?",
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
        "stem": "Put the lantern-keeper events in the order they happen.",
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
        "stem": "Which statement best summarises the wildlife value of messy wet places?",
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
  },

  {
    "id": "glass_roof_station",
    "title": "The Glass-Roof Station",
    "genre": "fiction",
    "difficulty": 3,
    "isLong": false,
    "blocks": [
      "The morning train had not arrived, and the station began to collect small worries. Coats steamed beside the ticket office. The glass roof, patched after last winter's hail, held a scatter of rain like coins balanced on a tray. Emma checked the folded timetable until the ink softened under her thumb.",
      "She was meant to meet Dad in the next town and carry the blue folder he had forgotten before his interview. Mum had said there was plenty of time. Yet the platform clock had stopped at 8:14, and nobody seemed to agree whether that was funny or serious.",
      "A porter in a green cap walked along the edge of the platform, tying a loose rope around a stack of newspapers. 'The signal box has lost power,' he told the waiting passengers. 'We are using the old hand bell until the lights come back.'",
      "The bell hung beside the office door. When it rang once, conversations thinned. When it rang twice, people gathered their bags. Emma listened harder than anyone, not because she understood trains, but because every sound now felt like part of her responsibility.",
      "At last the porter lifted the bell and gave two slow rings. The train slid in five minutes later, wet and silver, as if it had been hiding in the weather. Emma stepped aboard with the blue folder held flat against her coat. The timetable in her pocket was damp, but she no longer needed to keep reading it."
    ],
    "questions": [
      {
        "id": "gs_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "What important item is Emma carrying?",
        "check": {
          "keywordAny": [
            [
              "blue",
              "folder"
            ],
            [
              "folder"
            ]
          ]
        },
        "modelAnswer": "She is carrying Dad's blue folder.",
        "explanation": "Paragraph 2 says Emma has to carry the blue folder Dad forgot before his interview.",
        "hint": "Look in paragraph 2 for the thing Dad forgot."
      },
      {
        "id": "gs_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does the word \"thinned\" suggest in paragraph 4?",
        "options": [
          "The conversations became quieter and fewer.",
          "The bell became difficult to see.",
          "The platform became hotter.",
          "The newspapers were torn into strips."
        ],
        "correct": 0,
        "modelAnswer": "The conversations became quieter and fewer.",
        "explanation": "When the bell rings, people stop talking and listen, so the conversations thin out.",
        "hint": "Use what people do when the bell rings."
      },
      {
        "id": "gs_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "How can you tell Emma feels anxious and responsible? Use evidence from the text.",
        "answerCheck": {
          "keywordAny": [
            [
              "anxious"
            ],
            [
              "worried"
            ],
            [
              "responsib"
            ],
            [
              "nervous"
            ],
            [
              "pressure"
            ],
            [
              "listen",
              "hard"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "checked the folded timetable until the ink softened under her thumb",
            "Emma listened harder than anyone",
            "every sound now felt like part of her responsibility",
            "the blue folder held flat against her coat"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "Emma seems anxious and responsible because she keeps checking the timetable and listens closely for the bell. Evidence could include: \"every sound now felt like part of her responsibility\".",
        "explanation": "The writer shows Emma's worry through repeated checking and through the way she treats the station sounds as something she must act on.",
        "hint": "Find one action that shows worry and one phrase about responsibility.",
        "reread": [
          1,
          4
        ]
      },
      {
        "id": "gs_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which option best summarises the station problem and Emma's careful listening?",
        "options": [
          "The porter repairs the platform clock while Emma reads a newspaper.",
          "The signal box has failed, so the station uses a hand bell and Emma listens carefully.",
          "The train arrives early, but nobody is ready to leave the station.",
          "Emma decides the interview folder is not important after all."
        ],
        "correct": 1,
        "modelAnswer": "The signal box has failed, so the station uses a hand bell and Emma listens carefully.",
        "explanation": "Those paragraphs explain the problem, the temporary signal and Emma's reaction to it.",
        "hint": "Choose the answer that includes both the signal problem and Emma's response."
      },
      {
        "id": "gs_q5",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why might the writer say the station began to \"collect small worries\"?",
        "rubric": [
          {
            "label": "Explains personification or image",
            "check": {
              "keywordAny": [
                [
                  "personif"
                ],
                [
                  "station",
                  "like",
                  "person"
                ],
                [
                  "place",
                  "collect"
                ],
                [
                  "image"
                ]
              ]
            }
          },
          {
            "label": "Links to many passengers becoming uneasy",
            "check": {
              "keywordAny": [
                [
                  "worr"
                ],
                [
                  "anxious"
                ],
                [
                  "passenger"
                ],
                [
                  "delay"
                ],
                [
                  "small",
                  "problem"
                ],
                [
                  "waiting"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The writer makes the station sound as if it can gather feelings like objects. This shows that lots of little worries are building as passengers wait for the delayed train.",
        "explanation": "The phrase turns a busy place into something that holds the mood of the people inside it.",
        "hint": "Think about what is being collected: not objects, but feelings."
      },
      {
        "id": "gs_q6",
        "type": "short",
        "skill": "2e",
        "marks": 1,
        "stem": "What is Emma most likely to do when she reaches the next town? Explain briefly.",
        "check": {
          "keywordAny": [
            [
              "give",
              "folder"
            ],
            [
              "take",
              "folder"
            ],
            [
              "meet",
              "Dad"
            ],
            [
              "interview",
              "folder"
            ],
            [
              "bring",
              "folder"
            ]
          ]
        },
        "modelAnswer": "She is likely to meet Dad and give him the blue folder before his interview.",
        "explanation": "The purpose of her journey is explained in paragraph 2 and she still has the folder at the end.",
        "hint": "Use paragraph 2 and the final paragraph."
      },
      {
        "id": "gs_q7",
        "type": "mcq",
        "skill": "P1",
        "marks": 1,
        "stem": "In the sentence beginning \"When it rang once,\" what do the commas help the reader track?",
        "options": [
          "The timing of each bell signal before the result that follows.",
          "The exact words spoken by the porter.",
          "A list of objects Emma is carrying.",
          "A question the writer wants answered."
        ],
        "correct": 0,
        "modelAnswer": "The timing of each bell signal before the result that follows.",
        "explanation": "The commas help chunk the repeated time clauses from what people do afterwards.",
        "hint": "Read each 'When...' part as a separate sense group."
      },
      {
        "id": "gs_q8",
        "type": "order",
        "skill": "2f",
        "marks": 2,
        "stem": "Put Emma's station events in the order they happen.",
        "items": [
          "Emma hears that the signal box has lost power.",
          "The porter rings the hand bell twice.",
          "Emma checks the folded timetable again and again.",
          "Emma steps onto the train with the folder."
        ],
        "correctPositions": [
          2,
          3,
          1,
          4
        ],
        "modelAnswer": "1 Emma checks the timetable; 2 she hears the signal box has lost power; 3 the porter rings twice; 4 Emma boards with the folder.",
        "explanation": "The story moves from Emma's waiting and worry to the explanation, the bell signal and finally the train arriving.",
        "hint": "Start with what Emma is doing before the porter speaks."
      }
    ]
  },
  {
    "id": "rain_gardeners",
    "title": "The Rain Gardeners",
    "genre": "non-fiction",
    "difficulty": 3,
    "isLong": false,
    "blocks": [
      "After heavy rain, water that lands on roofs, roads and playgrounds can rush into drains in minutes. In some streets, that sudden flow overloads pipes and sends dirty water into rivers. A rain garden is a planted dip designed to slow that journey down.",
      "The garden is not simply a flower bed. Its surface sits slightly lower than the surrounding pavement, so water can gather there for a short time. Beneath the plants, layers of sandy soil and gravel filter the water while roots hold the soil open.",
      "Plants are chosen carefully. Deep-rooted grasses and flowers such as iris or sedge can survive both brief flooding and dry spells. Their stems also slow the water, giving it more time to soak down instead of sliding away.",
      "Rain gardens cannot solve every flood problem. If they are too small, badly placed or filled with compacted soil, water will still escape. However, when several are built along the same street, they can turn a hard surface into something that behaves a little more like a meadow.",
      "They bring other benefits too. Bees visit the flowers, birds search for insects among the stems and neighbours sometimes stop to talk while weeding. A useful drain has quietly become a small patch of habitat."
    ],
    "questions": [
      {
        "id": "rg_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "What is a rain garden designed to slow down?",
        "check": {
          "keywordAny": [
            [
              "water",
              "journey"
            ],
            [
              "rain",
              "water"
            ],
            [
              "flow"
            ],
            [
              "drain"
            ]
          ]
        },
        "modelAnswer": "It slows down the journey or flow of rainwater into drains.",
        "explanation": "Paragraph 1 says a rain garden is designed to slow the water's journey down.",
        "hint": "Use the final sentence of paragraph 1."
      },
      {
        "id": "rg_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does \"overloads\" mean in paragraph 1?",
        "options": [
          "puts too much pressure on",
          "makes something cleaner",
          "paints something a brighter colour",
          "empties something completely"
        ],
        "correct": 0,
        "modelAnswer": "puts too much pressure on",
        "explanation": "A sudden flow can put too much pressure on pipes, so they cannot cope properly.",
        "hint": "Think about what happens when too much water reaches pipes at once."
      },
      {
        "id": "rg_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "Why do rain gardens need plants that are chosen carefully? Use evidence from the text.",
        "answerCheck": {
          "keywordAny": [
            [
              "survive",
              "flood"
            ],
            [
              "survive",
              "dry"
            ],
            [
              "slow",
              "water"
            ],
            [
              "deep",
              "root"
            ],
            [
              "soak",
              "down"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "can survive both brief flooding and dry spells",
            "Their stems also slow the water",
            "giving it more time to soak down",
            "roots hold the soil open"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "The plants must cope with changing conditions and help the garden work. Evidence could include: \"can survive both brief flooding and dry spells\" or \"Their stems also slow the water\".",
        "explanation": "The plants are not just decorative: they survive wet and dry conditions and help slow and filter the water.",
        "hint": "Explain the job of the plants, then quote a phrase that proves it.",
        "reread": [
          2,
          3
        ]
      },
      {
        "id": "rg_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which statement best summarises how a rain garden works in paragraph 2?",
        "options": [
          "Rain gardens are ordinary flower beds that need no special design.",
          "A rain garden sits lower than the pavement and uses soil, gravel and roots to hold and filter water.",
          "All rain gardens must be built in school playgrounds.",
          "Sandy soil and gravel are used only to make the garden look pretty."
        ],
        "correct": 1,
        "modelAnswer": "A rain garden sits lower than the pavement and uses soil, gravel and roots to hold and filter water.",
        "explanation": "Paragraph 2 explains the design of the garden and how each layer helps the water.",
        "hint": "Choose the option that includes both the lowered surface and the underground layers."
      },
      {
        "id": "rg_q5",
        "type": "open",
        "skill": "2f",
        "marks": 2,
        "stem": "How does paragraph 4 make the explanation more balanced?",
        "rubric": [
          {
            "label": "Mentions limits or problems",
            "check": {
              "keywordAny": [
                [
                  "limit"
                ],
                [
                  "cannot",
                  "solve"
                ],
                [
                  "too",
                  "small"
                ],
                [
                  "badly",
                  "placed"
                ],
                [
                  "compacted",
                  "soil"
                ],
                [
                  "water",
                  "escape"
                ]
              ]
            }
          },
          {
            "label": "Mentions wider benefit when several are used",
            "check": {
              "keywordAny": [
                [
                  "several"
                ],
                [
                  "same",
                  "street"
                ],
                [
                  "hard",
                  "surface"
                ],
                [
                  "meadow"
                ],
                [
                  "more",
                  "useful"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Paragraph 4 balances the explanation by admitting rain gardens do not solve every flood problem, especially if they are badly designed, but showing that several together can still change how a street handles water.",
        "explanation": "A balanced paragraph includes both limitations and the conditions that make the idea work well.",
        "hint": "Find one sentence that gives a limit and one that shows when rain gardens help."
      },
      {
        "id": "rg_q6",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why does the writer compare several rain gardens to \"something that behaves a little more like a meadow\"?",
        "rubric": [
          {
            "label": "Explains softer/slower natural water behaviour",
            "check": {
              "keywordAny": [
                [
                  "slow"
                ],
                [
                  "soak"
                ],
                [
                  "natural"
                ],
                [
                  "absorb"
                ],
                [
                  "less",
                  "hard"
                ],
                [
                  "meadow"
                ]
              ]
            }
          },
          {
            "label": "Contrasts with hard street surfaces",
            "check": {
              "keywordAny": [
                [
                  "hard",
                  "surface"
                ],
                [
                  "pavement"
                ],
                [
                  "road"
                ],
                [
                  "street"
                ],
                [
                  "drain"
                ],
                [
                  "rush"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The comparison helps readers picture a hard street becoming more absorbent and natural, so water soaks and slows rather than rushing straight into drains.",
        "explanation": "The meadow image makes the technical idea of slowing and soaking water easier to imagine.",
        "hint": "Think about how a meadow deals with rain differently from pavement."
      },
      {
        "id": "rg_q7",
        "type": "multiSelect",
        "skill": "2b",
        "marks": 2,
        "stem": "Which TWO extra benefits of rain gardens are named in paragraph 5?",
        "options": [
          "bees visit the flowers",
          "birds search for insects among the stems",
          "cars can drive faster along the street",
          "pipes are removed from every house"
        ],
        "correctSet": [
          0,
          1
        ],
        "modelAnswer": "Bees visit the flowers and birds search for insects among the stems.",
        "explanation": "Paragraph 5 gives wildlife benefits as well as the water-management purpose.",
        "hint": "Choose the benefits linked to living things."
      },
      {
        "id": "rg_q8",
        "type": "match",
        "skill": "2h",
        "marks": 2,
        "stem": "Match each feature to its job in the rain garden.",
        "prompts": [
          "lower surface",
          "sandy soil and gravel",
          "plant stems"
        ],
        "options": [
          "filter the water",
          "slow the moving water",
          "let water gather briefly"
        ],
        "correctMap": {
          "0": "2",
          "1": "0",
          "2": "1"
        },
        "modelAnswer": "Lower surface \u2192 lets water gather briefly; sandy soil and gravel \u2192 filter water; plant stems \u2192 slow moving water.",
        "explanation": "The text links each design feature to a different job in slowing or cleaning the water.",
        "hint": "Look back at paragraphs 2 and 3."
      }
    ]
  },
  {
    "id": "under_bridge_song",
    "title": "Under-Bridge Song",
    "genre": "poetry",
    "difficulty": 3,
    "isLong": false,
    "blocks": [
      "Under the railway bridge\nthe river keeps its own small drum,\nbeating on stones the trains forgot\nwhen they thundered over and on.",
      "Graffiti blooms where sunlight thins,\nred letters, green wings, a silver name.\nA shopping trolley leans in the reeds\nlike a tired knight after a game.",
      "Above, the carriages flash and vanish;\nbelow, the minnows stitch the shade.\nThe city shouts along the girders,\nbut here the water will not be hurried away."
    ],
    "questions": [
      {
        "id": "ubs_q1",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does \"keeps its own small drum\" suggest about the river?",
        "options": [
          "It has a steady sound and rhythm.",
          "It is completely silent.",
          "It is carrying a real musical instrument.",
          "It has stopped moving."
        ],
        "correct": 0,
        "modelAnswer": "It has a steady sound and rhythm.",
        "explanation": "The drum image suggests repeated sound as the river beats on stones.",
        "hint": "Think about what a drum does."
      },
      {
        "id": "ubs_q2",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "What object is leaning in the reeds?",
        "check": {
          "keywordAny": [
            [
              "shopping",
              "trolley"
            ],
            [
              "trolley"
            ]
          ]
        },
        "modelAnswer": "A shopping trolley is leaning in the reeds.",
        "explanation": "The second stanza says a shopping trolley leans in the reeds.",
        "hint": "Look in the second stanza."
      },
      {
        "id": "ubs_q3",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why might the poet describe graffiti as something that \"blooms\"?",
        "rubric": [
          {
            "label": "Explains flower/growth image",
            "check": {
              "keywordAny": [
                [
                  "flower"
                ],
                [
                  "grow"
                ],
                [
                  "bloom"
                ],
                [
                  "plant"
                ],
                [
                  "colour"
                ]
              ]
            }
          },
          {
            "label": "Links to brightness or life in a dull place",
            "check": {
              "keywordAny": [
                [
                  "colour"
                ],
                [
                  "life"
                ],
                [
                  "dark"
                ],
                [
                  "sunlight",
                  "thins"
                ],
                [
                  "bright"
                ],
                [
                  "dull"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The word \"blooms\" makes the graffiti seem like colourful growth on the wall, bringing brightness and life to a place where the sunlight is thin.",
        "explanation": "The poet chooses a natural image for something urban, which makes the under-bridge scene feel unexpectedly alive.",
        "hint": "Think about what usually blooms and what effect that creates here."
      },
      {
        "id": "ubs_q4",
        "type": "open",
        "skill": "2h",
        "marks": 2,
        "stem": "How is the world above the bridge different from the world below it?",
        "rubric": [
          {
            "label": "Above is noisy or fast",
            "check": {
              "keywordAny": [
                [
                  "train"
                ],
                [
                  "carriage"
                ],
                [
                  "flash"
                ],
                [
                  "thunder"
                ],
                [
                  "shout"
                ],
                [
                  "fast"
                ],
                [
                  "noisy"
                ]
              ]
            }
          },
          {
            "label": "Below is quieter, slower or more hidden",
            "check": {
              "keywordAny": [
                [
                  "river"
                ],
                [
                  "minnow"
                ],
                [
                  "shade"
                ],
                [
                  "water"
                ],
                [
                  "not",
                  "hurried"
                ],
                [
                  "slow"
                ],
                [
                  "quiet"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Above the bridge is fast and noisy, with trains that thunder and carriages that flash past. Below it is slower and more hidden, with minnows and water that \"will not be hurried away\".",
        "explanation": "The comparison depends on using details from both parts of the poem.",
        "hint": "Use one detail from above and one from below."
      },
      {
        "id": "ubs_q5",
        "type": "open",
        "skill": "2c",
        "marks": 2,
        "stem": "What is the best summary of Under-Bridge Song?",
        "rubric": [
          {
            "label": "Mentions under-bridge river scene",
            "check": {
              "keywordAny": [
                [
                  "bridge"
                ],
                [
                  "river"
                ],
                [
                  "under"
                ],
                [
                  "railway"
                ]
              ]
            }
          },
          {
            "label": "Mentions contrast between city noise and hidden life",
            "check": {
              "keywordAny": [
                [
                  "city"
                ],
                [
                  "noise"
                ],
                [
                  "quiet"
                ],
                [
                  "hidden"
                ],
                [
                  "life"
                ],
                [
                  "contrast"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The poem describes a river under a railway bridge, showing how a hidden place beneath the noisy city has its own rhythm, colour and life.",
        "explanation": "A summary should capture the place and the main contrast without listing every image.",
        "hint": "Keep the biggest ideas: setting, mood and contrast."
      },
      {
        "id": "ubs_q6",
        "type": "mcq",
        "skill": "P3",
        "marks": 1,
        "stem": "In the line \"Above, the carriages flash and vanish; below, the minnows stitch the shade\", what does the semicolon help do?",
        "options": [
          "Link two contrasting but closely related pictures.",
          "Show the exact words somebody says.",
          "End the poem immediately.",
          "Introduce a list of train times."
        ],
        "correct": 0,
        "modelAnswer": "It links two contrasting but closely related pictures.",
        "explanation": "The semicolon holds the above/below comparison together in one balanced line.",
        "hint": "Look at how the line compares above and below."
      }
    ]
  },
  {
    "id": "borrowed_compass",
    "title": "The Borrowed Compass",
    "genre": "fiction",
    "difficulty": 4,
    "isLong": false,
    "blocks": [
      "Jude borrowed the brass compass from the geography cupboard because it looked more serious than the plastic ones. Its lid clicked shut like a secret being kept. During the orienteering challenge, he planned to reach the oak marker before anyone else and return with the neat confidence of a map expert.",
      "At first, everything went well. The needle settled towards north, the path bent where the map said it would, and Jude crossed the playing field with a stride that was almost a march. Then, near the old iron railings, the needle began to tremble. It swung east, shivered back and pointed towards the bins.",
      "Jude frowned at the map. The quickest route was meant to lead past the pond, not behind the caretaker's shed. He almost followed the compass anyway, because a borrowed brass compass felt like something that deserved obedience. Instead, he looked up. The sun was bright on his left cheek, and the line of poplar trees stood exactly where the map showed them.",
      "He stepped away from the railings. Slowly, the needle steadied. Jude laughed once, not loudly enough for the other teams to hear. The compass had not betrayed him; it had been confused by the metal. He had been the one confusing confidence with care.",
      "When he reached the oak marker, he wrote down the code and took the longer path back. Mrs Mistry asked why he had changed route. Jude handed over the compass and said, 'It gives clues. It doesn't do the thinking.'"
    ],
    "questions": [
      {
        "id": "bc_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "Why did Jude borrow the brass compass?",
        "check": {
          "keywordAny": [
            [
              "look",
              "serious"
            ],
            [
              "more",
              "serious"
            ],
            [
              "brass",
              "compass"
            ]
          ]
        },
        "modelAnswer": "He borrowed it because it looked more serious than the plastic compasses.",
        "explanation": "The opening sentence gives Jude's reason for choosing it.",
        "hint": "Look at the first sentence."
      },
      {
        "id": "bc_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does \"obedience\" mean in paragraph 3?",
        "options": [
          "following or doing what something seems to tell you",
          "laughing at a mistake",
          "folding a map neatly",
          "walking around a pond"
        ],
        "correct": 0,
        "modelAnswer": "following or doing what something seems to tell you",
        "explanation": "Jude feels the serious-looking compass deserves to be followed without question.",
        "hint": "Use the sentence about almost following the compass anyway."
      },
      {
        "id": "bc_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "How can you tell Jude is over-confident at the start? Use evidence from the text.",
        "answerCheck": {
          "keywordAny": [
            [
              "confident"
            ],
            [
              "overconfident"
            ],
            [
              "expert"
            ],
            [
              "march"
            ],
            [
              "before",
              "anyone"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "reach the oak marker before anyone else",
            "return with the neat confidence of a map expert",
            "a stride that was almost a march",
            "because a borrowed brass compass felt like something that deserved obedience"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "Jude is over-confident because he expects to finish first and act like an expert. Evidence could include: \"return with the neat confidence of a map expert\".",
        "explanation": "The writer shows his confidence through his plan, his stride and how much authority he gives the compass.",
        "hint": "Find a phrase that shows how expert Jude wants to seem.",
        "reread": [
          1,
          2
        ]
      },
      {
        "id": "bc_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which option best summarises Jude's compass problem and the clues he checks?",
        "options": [
          "The compass points strangely near the railings, so Jude checks the map and other clues before deciding.",
          "Jude reaches the oak marker and writes down the code immediately.",
          "Mrs Mistry tells Jude never to use a compass again.",
          "The poplar trees move to a different part of the field."
        ],
        "correct": 0,
        "modelAnswer": "The compass points strangely near the railings, so Jude checks the map and other clues before deciding.",
        "explanation": "Those paragraphs show the problem and Jude's decision to verify the compass with other evidence.",
        "hint": "Pick the answer that includes both the strange compass and Jude's checking."
      },
      {
        "id": "bc_q5",
        "type": "open",
        "skill": "2f",
        "marks": 2,
        "stem": "How does the sentence \"Instead, he looked up\" change the direction of the story?",
        "rubric": [
          {
            "label": "Marks a turning point from blind following to checking",
            "check": {
              "keywordAny": [
                [
                  "turning",
                  "point"
                ],
                [
                  "change"
                ],
                [
                  "instead"
                ],
                [
                  "stop",
                  "follow"
                ],
                [
                  "check"
                ],
                [
                  "look",
                  "up"
                ]
              ]
            }
          },
          {
            "label": "Links to using other clues or better judgement",
            "check": {
              "keywordAny": [
                [
                  "map"
                ],
                [
                  "sun"
                ],
                [
                  "trees"
                ],
                [
                  "clue"
                ],
                [
                  "judge"
                ],
                [
                  "thinking"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "It is a turning point because Jude stops blindly following the compass and starts checking the real surroundings, using the sun, trees and map to think for himself.",
        "explanation": "A short sentence can shift the action from one kind of behaviour to another.",
        "hint": "Compare what Jude almost does just before the sentence with what he does afterwards."
      },
      {
        "id": "bc_q6",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "What is the effect of saying the compass lid \"clicked shut like a secret being kept\"?",
        "rubric": [
          {
            "label": "Creates mystery or seriousness",
            "check": {
              "keywordAny": [
                [
                  "secret"
                ],
                [
                  "myster"
                ],
                [
                  "serious"
                ],
                [
                  "important"
                ],
                [
                  "special"
                ]
              ]
            }
          },
          {
            "label": "Links to Jude's attitude to the compass",
            "check": {
              "keywordAny": [
                [
                  "Jude"
                ],
                [
                  "trust"
                ],
                [
                  "impress"
                ],
                [
                  "compass"
                ],
                [
                  "authority"
                ],
                [
                  "respect"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The simile makes the compass seem mysterious and important, which helps explain why Jude treats it as if it has special authority.",
        "explanation": "The description builds Jude's early belief that the brass compass is more impressive than ordinary ones.",
        "hint": "Think about how the sound changes the way the object feels."
      },
      {
        "id": "bc_q7",
        "type": "open",
        "skill": "2e",
        "marks": 2,
        "stem": "What is Jude most likely to do the next time a tool gives him information? Give a reason.",
        "rubric": [
          {
            "label": "Predicts he will check against other evidence",
            "check": {
              "keywordAny": [
                [
                  "check"
                ],
                [
                  "map"
                ],
                [
                  "look"
                ],
                [
                  "other",
                  "clue"
                ],
                [
                  "not",
                  "blind"
                ],
                [
                  "think"
                ]
              ]
            }
          },
          {
            "label": "Roots reason in lesson from ending",
            "check": {
              "keywordAny": [
                [
                  "clue"
                ],
                [
                  "doesnt",
                  "do",
                  "thinking"
                ],
                [
                  "learn"
                ],
                [
                  "because"
                ],
                [
                  "metal"
                ],
                [
                  "railings"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "He is likely to check the tool against other clues before trusting it completely, because he has learned that a compass gives clues but does not do the thinking for him.",
        "explanation": "A good prediction uses Jude's final lesson and the problem caused by the railings.",
        "hint": "Use Jude's final line to make your prediction."
      },
      {
        "id": "bc_q8",
        "type": "mcq",
        "skill": "P4",
        "marks": 1,
        "stem": "What job does the semicolon do in \"The compass had not betrayed him; it had been confused by the metal\"?",
        "options": [
          "It links two closely connected ideas about the compass.",
          "It introduces direct speech.",
          "It shows a question is being asked.",
          "It separates items in a shopping list."
        ],
        "correct": 0,
        "modelAnswer": "It links two closely connected ideas about the compass.",
        "explanation": "The second clause explains the first: the compass was not disloyal, just affected by metal.",
        "hint": "Ask how the second part explains the first part."
      }
    ]
  },
  {
    "id": "bats_map_night",
    "title": "How Bats Map the Night",
    "genre": "non-fiction",
    "difficulty": 4,
    "isLong": true,
    "blocks": [
      "A bat leaving its roost at dusk is not flying blindly into darkness. Many bats build a fast-changing picture of the world by using echolocation. They produce high-pitched calls and listen for the echoes that return from insects, leaves, walls and open air.",
      "The process is extremely quick. A call may be too high for human ears, but the returning echo can tell the bat how far away an object is, whether it is moving and even something about its shape. In effect, the bat is reading a map made of returning sound.",
      "Different situations need different calls. When a bat is searching over a field, it may use slower calls that travel farther. When it begins to chase a moth, the calls come closer together, giving the bat more frequent updates before the final catch.",
      "Echolocation is powerful, but it is not the only sense a bat uses. Some species also rely on eyesight, smell or memory of familiar routes. A bat may remember a line of trees beside a river, then use echoes to track a sudden insect within that known space.",
      "The sounds bats make can also create problems for their prey. Some moths have ears tuned to bat calls and dive when they detect danger. Others produce clicks of their own, confusing the bat's echo picture for a moment. This is not a silent world; it is a contest of signals.",
      "Scientists study bat calls with ultrasonic detectors, which turn high frequencies into sounds or patterns people can examine. By comparing call shapes, researchers can often identify which species is nearby without seeing the animal at all.",
      "Understanding bats matters beyond curiosity. Bats eat huge numbers of night-flying insects, including some that damage crops. They also tell scientists about the health of habitats because different species need different roosts, feeding places and flight routes. Protecting bats often means protecting the dark corridors of trees, water and quiet air that allow them to map the night."
    ],
    "questions": [
      {
        "id": "bat_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "What do many bats use to build a picture of the world in darkness?",
        "check": {
          "keywordAny": [
            [
              "echolocation"
            ],
            [
              "echo"
            ],
            [
              "high",
              "pitched",
              "calls"
            ],
            [
              "returning",
              "sound"
            ]
          ]
        },
        "modelAnswer": "They use echolocation: high-pitched calls and returning echoes.",
        "explanation": "Paragraph 1 introduces echolocation as the way many bats build a picture of their surroundings.",
        "hint": "Look at paragraph 1 for the named process."
      },
      {
        "id": "bat_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does \"roost\" mean in paragraph 1?",
        "options": [
          "a place where a bat rests or shelters",
          "a kind of insect caught at night",
          "a machine used by scientists",
          "a line of trees beside a river"
        ],
        "correct": 0,
        "modelAnswer": "a place where a bat rests or shelters",
        "explanation": "The bat is leaving its roost at dusk, so the word means its resting or sheltering place.",
        "hint": "Use the idea that the bat is leaving it at dusk."
      },
      {
        "id": "bat_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "Why is echolocation useful for judging moving prey? Use evidence from the text.",
        "answerCheck": {
          "keywordAny": [
            [
              "moving"
            ],
            [
              "frequent",
              "updates"
            ],
            [
              "chase"
            ],
            [
              "moth"
            ],
            [
              "distance"
            ],
            [
              "shape"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "whether it is moving and even something about its shape",
            "the calls come closer together, giving the bat more frequent updates",
            "before the final catch",
            "returning echo can tell the bat how far away an object is"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "It helps because echoes give information about distance, movement and shape, and faster calls give more updates during a chase. Evidence could include: \"the calls come closer together, giving the bat more frequent updates\".",
        "explanation": "Paragraphs 2 and 3 show how echoes give information and how call rate changes during hunting.",
        "hint": "Use one detail about what the echo tells the bat and one about chasing.",
        "reread": [
          2,
          3
        ]
      },
      {
        "id": "bat_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which statement best summarises the different clues bats use to find their way?",
        "options": [
          "Bats use only echolocation and never any other sense.",
          "Bats may combine echolocation with sight, smell and memory of familiar routes.",
          "Bats cannot remember places they have flown before.",
          "All bats hunt only above open fields."
        ],
        "correct": 1,
        "modelAnswer": "Bats may combine echolocation with sight, smell and memory of familiar routes.",
        "explanation": "Paragraph 4 broadens the explanation by showing that echolocation works alongside other senses.",
        "hint": "Choose the option that includes more than one sense."
      },
      {
        "id": "bat_q5",
        "type": "open",
        "skill": "2h",
        "marks": 2,
        "stem": "Give one difference between a bat searching over a field and a bat chasing a moth.",
        "rubric": [
          {
            "label": "Searching calls are slower or travel farther",
            "check": {
              "keywordAny": [
                [
                  "search"
                ],
                [
                  "slower"
                ],
                [
                  "farther"
                ],
                [
                  "field"
                ]
              ]
            }
          },
          {
            "label": "Chasing calls are closer together or more frequent",
            "check": {
              "keywordAny": [
                [
                  "chase"
                ],
                [
                  "moth"
                ],
                [
                  "closer",
                  "together"
                ],
                [
                  "frequent"
                ],
                [
                  "updates"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "When searching over a field, a bat may use slower calls that travel farther. When chasing a moth, the calls come closer together to give more frequent updates.",
        "explanation": "The comparison is in paragraph 3 and needs both sides.",
        "hint": "Use the two situations named in paragraph 3."
      },
      {
        "id": "bat_q6",
        "type": "open",
        "skill": "2f",
        "marks": 2,
        "stem": "How does paragraph 5 add a new layer to the explanation?",
        "rubric": [
          {
            "label": "Moves from how bats hunt to how prey respond",
            "check": {
              "keywordAny": [
                [
                  "prey"
                ],
                [
                  "moth"
                ],
                [
                  "respond"
                ],
                [
                  "detect"
                ],
                [
                  "dive"
                ],
                [
                  "confuse"
                ]
              ]
            }
          },
          {
            "label": "Mentions contest of signals / problem for bats",
            "check": {
              "keywordAny": [
                [
                  "contest"
                ],
                [
                  "signal"
                ],
                [
                  "problem"
                ],
                [
                  "click"
                ],
                [
                  "confusing"
                ],
                [
                  "not",
                  "silent"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Paragraph 5 adds the prey's side of the story. It shows that moths can hear or confuse bat calls, turning hunting into a contest of signals rather than a simple one-way process.",
        "explanation": "The text shifts from the bat's skill to the interaction between hunter and prey.",
        "hint": "Ask whose point of view is added in paragraph 5."
      },
      {
        "id": "bat_q7",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why does the writer call echolocation \"a map made of returning sound\"?",
        "rubric": [
          {
            "label": "Explains sound creates information about surroundings",
            "check": {
              "keywordAny": [
                [
                  "sound"
                ],
                [
                  "echo"
                ],
                [
                  "surround"
                ],
                [
                  "object"
                ],
                [
                  "distance"
                ],
                [
                  "shape"
                ]
              ]
            }
          },
          {
            "label": "Explains map image helps reader picture navigation",
            "check": {
              "keywordAny": [
                [
                  "map"
                ],
                [
                  "navigate"
                ],
                [
                  "picture"
                ],
                [
                  "find",
                  "way"
                ],
                [
                  "reader"
                ],
                [
                  "imagine"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The phrase helps readers imagine echoes as information that builds a map of objects, distance and movement around the bat, even in darkness.",
        "explanation": "The writer uses a familiar idea, a map, to explain a process most humans cannot hear.",
        "hint": "Think about what a map gives you and how echoes can do a similar job for bats."
      },
      {
        "id": "bat_q8",
        "type": "multiSelect",
        "skill": "2b",
        "marks": 2,
        "stem": "Which TWO tools or methods are mentioned for studying or identifying bats?",
        "options": [
          "ultrasonic detectors",
          "comparing call shapes",
          "painting the bats' wings",
          "counting nests in daylight only"
        ],
        "correctSet": [
          0,
          1
        ],
        "modelAnswer": "Scientists use ultrasonic detectors and compare call shapes.",
        "explanation": "Paragraph 6 explains how high-frequency bat calls can be turned into patterns and compared.",
        "hint": "Choose the options linked to bat calls."
      },
      {
        "id": "bat_q9",
        "type": "open",
        "skill": "2d",
        "marks": 3,
        "stem": "Why does protecting bats often mean protecting \"dark corridors\"?",
        "rubric": [
          {
            "label": "Explains bats need routes or connected spaces",
            "check": {
              "keywordAny": [
                [
                  "route"
                ],
                [
                  "corridor"
                ],
                [
                  "fly"
                ],
                [
                  "travel"
                ],
                [
                  "connected"
                ],
                [
                  "line",
                  "trees"
                ]
              ]
            }
          },
          {
            "label": "Mentions trees, water or quiet air",
            "check": {
              "keywordAny": [
                [
                  "tree"
                ],
                [
                  "water"
                ],
                [
                  "quiet",
                  "air"
                ],
                [
                  "habitat"
                ],
                [
                  "roost"
                ]
              ]
            }
          },
          {
            "label": "Links to feeding/roosting/mapping night",
            "check": {
              "keywordAny": [
                [
                  "feed"
                ],
                [
                  "roost"
                ],
                [
                  "map",
                  "night"
                ],
                [
                  "insect"
                ],
                [
                  "habitat"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Bats need linked routes through suitable habitat, not just one resting place. Dark corridors of trees, water and quiet air help them move, feed and use their senses to map the night.",
        "explanation": "The final paragraph shows that conservation is about the routes and habitats bats depend on.",
        "hint": "Use the last two sentences of the passage."
      },
      {
        "id": "bat_q10",
        "type": "short",
        "skill": "2e",
        "marks": 1,
        "stem": "What might happen if a line of riverside trees used by bats was removed?",
        "check": {
          "keywordAny": [
            [
              "harder",
              "route"
            ],
            [
              "lose",
              "route"
            ],
            [
              "flight",
              "route"
            ],
            [
              "less",
              "habitat"
            ],
            [
              "feed",
              "place"
            ],
            [
              "corridor"
            ]
          ]
        },
        "modelAnswer": "Bats might lose a familiar flight route or feeding corridor, making it harder for them to move and hunt.",
        "explanation": "The text says bats may remember routes and need dark corridors of trees and water.",
        "hint": "Base the prediction on paragraphs 4 and 7."
      },
      {
        "id": "bat_q11",
        "type": "match",
        "skill": "2b",
        "marks": 2,
        "stem": "Match each detail to what it shows.",
        "prompts": [
          "calls closer together",
          "moths produce clicks",
          "ultrasonic detectors"
        ],
        "options": [
          "scientists turning bat calls into examinable sounds or patterns",
          "prey confusing the bat's echo picture",
          "bats getting more frequent updates during a chase"
        ],
        "correctMap": {
          "0": "2",
          "1": "1",
          "2": "0"
        },
        "modelAnswer": "Calls closer together \u2192 frequent updates; moth clicks \u2192 confuse the echo picture; ultrasonic detectors \u2192 make calls examinable.",
        "explanation": "Each detail has a different role in the explanation of bat signals.",
        "hint": "Find each detail in paragraphs 3, 5 and 6."
      },
      {
        "id": "bat_q12",
        "type": "open",
        "skill": "2f",
        "marks": 4,
        "stem": "How does the whole text move from explaining a skill to explaining why bats matter?",
        "rubric": [
          {
            "label": "Starts with echolocation/how bats navigate",
            "check": {
              "keywordAny": [
                [
                  "echolocation"
                ],
                [
                  "navigate"
                ],
                [
                  "sound"
                ],
                [
                  "echo"
                ],
                [
                  "skill"
                ]
              ]
            }
          },
          {
            "label": "Develops through hunting/prey/scientific study",
            "check": {
              "keywordAny": [
                [
                  "moth"
                ],
                [
                  "prey"
                ],
                [
                  "scientist"
                ],
                [
                  "detector"
                ],
                [
                  "study"
                ]
              ]
            }
          },
          {
            "label": "Ends with ecological or conservation importance",
            "check": {
              "keywordAny": [
                [
                  "insect"
                ],
                [
                  "crop"
                ],
                [
                  "habitat"
                ],
                [
                  "protect"
                ],
                [
                  "conservation"
                ],
                [
                  "health"
                ]
              ]
            }
          },
          {
            "label": "Explains widening structure",
            "check": {
              "keywordAny": [
                [
                  "moves"
                ],
                [
                  "broadens"
                ],
                [
                  "widen"
                ],
                [
                  "from",
                  "to"
                ],
                [
                  "whole",
                  "text"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The text begins by explaining echolocation and how bats navigate in darkness. It then develops that skill through hunting, prey responses and scientific study. By the end, the focus widens to why bats matter for insects, crops and habitat health, so the reader sees them as ecologically important rather than only interesting.",
        "explanation": "This is a whole-text structure question, so it rewards tracking how the focus widens.",
        "hint": "Use the beginning, middle and final paragraph."
      },
      {
        "id": "bat_q13",
        "type": "open",
        "skill": "2d",
        "marks": 4,
        "stem": "The passage suggests that the night is full of information. How far do you agree? Use evidence from different parts of the text.",
        "rubric": [
          {
            "label": "States a clear view",
            "check": {
              "keywordAny": [
                [
                  "agree"
                ],
                [
                  "information"
                ],
                [
                  "night"
                ],
                [
                  "far"
                ],
                [
                  "suggest"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence about echoes/calls",
            "check": {
              "keywordAny": [
                [
                  "echo"
                ],
                [
                  "call"
                ],
                [
                  "distance"
                ],
                [
                  "shape"
                ],
                [
                  "moving"
                ],
                [
                  "map"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence about other signals/routes/science",
            "check": {
              "keywordAny": [
                [
                  "moth"
                ],
                [
                  "click"
                ],
                [
                  "detector"
                ],
                [
                  "route"
                ],
                [
                  "corridor"
                ],
                [
                  "trees"
                ]
              ]
            }
          },
          {
            "label": "Explains how evidence proves the idea",
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
        "modelAnswer": "I agree. The passage shows that bats can read echoes for distance, movement and shape, making a \"map made of returning sound\". It also shows moths responding with ears or clicks, and scientists using detectors to interpret bat calls. Even routes such as trees and water become information bats use. The night is not empty; it is full of signals different creatures can read.",
        "explanation": "A high-scoring answer draws evidence from more than one part and explains how it supports the judgement.",
        "hint": "Use at least one detail from the echolocation section and one from later in the passage."
      }
    ]
  },
  {
    "id": "copper_weathercock",
    "title": "The Copper Weathercock",
    "genre": "fiction",
    "difficulty": 5,
    "isLong": true,
    "blocks": [
      "The weathercock above the school hall had faced west for so long that most pupils thought west was simply what weathercocks preferred. Its copper feathers were green at the edges, and its beak had been bent by storms into an expression of permanent suspicion. Mr Vale, the caretaker, said it had once spun freely enough to warn the village before sea-fogs came crawling over the fields.",
      "Tara heard that story on the morning the choir was due to sing at the harbour festival. The hall was full of folding chairs, nervous humming and cardboard boxes of programmes. Outside, flags snapped along the lane, but the weathercock did not move. It stared west, stubborn as a drawing pinned to the sky.",
      "During rehearsal, the piano began to sound wrong. Notes that should have floated together arrived thin and sour. Miss Okoro blamed the damp, then the tuner, then the age of the instrument. Tara, who had been asked to open the high windows, noticed that the sea wind was pushing through the hall in sudden cold ribbons. The pages on the music stands flicked backwards as if something unseen were reading them too quickly.",
      "At lunchtime Mr Vale climbed the roof ladder with a tin of oil while Tara held the bottom steady. The weathercock creaked when he touched it, but did not turn. A strand of fishing line, blown inland from some forgotten kite or net, had wrapped itself around the spindle and tightened under the copper body. Mr Vale cut it free. The bird swung once, twice, then snapped round to the south-east.",
      "Mr Vale stopped smiling. 'That wind brings the fog across the lower road,' he said. 'If it thickens, the coach won't see the bend by Bracken Pool.' Tara looked towards the harbour, where the festival tents shone white in the distance. The choir had been told to leave at three.",
      "The office phone was busy. The headteacher was outside judging the bunting competition with a clipboard and a face full of concentration. Tara ran to Miss Okoro, but the teacher had three parents asking about packed lunches and one child in tears because his bow tie had vanished. 'Tell Mr Vale to radio the harbour steward,' she said, and turned back to the bow tie emergency.",
      "The fog did not arrive as a wall. It arrived like milk being poured into water. First the distant tents blurred, then the hedges softened, then the white line on the lower road disappeared in short pieces. The freed weathercock pointed south-east without wavering. Tara felt the old story rearrange itself in her mind: not magic, not village gossip, but a tool that had been ignored because it had been stuck.",
      "Mr Vale's radio crackled and failed twice before the harbour steward answered. Tara heard only fragments: school coach, lower road, Bracken Pool, wait. At three o'clock, when the choir should have been climbing aboard, Miss Okoro kept everyone in the hall and made them practise the first verse again, very slowly. Nobody complained. Even the piano seemed to have decided that patience was musical.",
      "By four, the fog had folded over the lane so completely that the coach lamps glowed like coins under a blanket. The harbour steward arrived in a van and said the lower road had been closed after two cars slid into the verge near Bracken Pool. He looked at the roof and asked who had noticed the weathercock. Mr Vale pointed his thumb at Tara.",
      "The festival was delayed, not cancelled. The choir travelled by the upper road after sunset, wrapped in scarves and excitement. When they finally sang, their voices rose into a harbour still silvered with mist. Tara could not see the weathercock from the stage, but she imagined it above the school, no longer pretending that west was the only direction worth knowing.",
      "On Monday, Mr Vale asked Tara to help polish the copper body. Close up, the weathercock looked less like a suspicious bird and more like a patient one. Tara turned it gently and watched it answer the wind without argument. She liked that: a warning did not need to be dramatic to be useful. It only needed someone willing to notice when it changed."
    ],
    "questions": [
      {
        "id": "wc_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "Which direction had the weathercock faced for a long time?",
        "check": {
          "keywordAny": [
            [
              "west"
            ]
          ]
        },
        "modelAnswer": "It had faced west.",
        "explanation": "The first sentence says it had faced west for so long that pupils thought west was simply what weathercocks preferred.",
        "hint": "Look at the opening sentence."
      },
      {
        "id": "wc_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does \"stubborn\" suggest in paragraph 2?",
        "options": [
          "It seems fixed and unwilling to move.",
          "It is singing very loudly.",
          "It has become younger overnight.",
          "It is painted in bright colours."
        ],
        "correct": 0,
        "modelAnswer": "It seems fixed and unwilling to move.",
        "explanation": "The weathercock is compared to a drawing pinned to the sky, so it seems fixed and unmoving.",
        "hint": "Use the words around the comparison to a drawing."
      },
      {
        "id": "wc_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "How can you tell the hall is being affected by the weather before anyone fully understands the danger? Use evidence.",
        "answerCheck": {
          "keywordAny": [
            [
              "piano",
              "wrong"
            ],
            [
              "damp"
            ],
            [
              "wind"
            ],
            [
              "cold",
              "ribbons"
            ],
            [
              "pages",
              "flick"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "the piano began to sound wrong",
            "Notes that should have floated together arrived thin and sour",
            "the sea wind was pushing through the hall in sudden cold ribbons",
            "The pages on the music stands flicked backwards"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "The hall is being affected because the piano sounds wrong and cold sea wind pushes through the windows. Evidence could include: \"the sea wind was pushing through the hall in sudden cold ribbons\".",
        "explanation": "The early clues show weather entering the hall before the later fog warning is understood.",
        "hint": "Use details from the rehearsal scene.",
        "reread": [
          3
        ]
      },
      {
        "id": "wc_q4",
        "type": "open",
        "skill": "2b",
        "marks": 2,
        "stem": "Give two things Tara and Mr Vale discover when they inspect the weathercock.",
        "rubric": [
          {
            "label": "Fishing line wrapped around spindle",
            "check": {
              "keywordAny": [
                [
                  "fishing",
                  "line"
                ],
                [
                  "line",
                  "spindle"
                ],
                [
                  "wrapped"
                ],
                [
                  "tightened"
                ]
              ]
            }
          },
          {
            "label": "Weathercock turns to south-east after being freed",
            "check": {
              "keywordAny": [
                [
                  "south-east"
                ],
                [
                  "turn"
                ],
                [
                  "swung"
                ],
                [
                  "pointed"
                ],
                [
                  "freed"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "They discover that fishing line has wrapped around the spindle, and that once it is cut free the weathercock turns to the south-east.",
        "explanation": "Both details matter: one explains why the weathercock was stuck, the other gives the warning.",
        "hint": "Use paragraph 4."
      },
      {
        "id": "wc_q5",
        "type": "multiSelect",
        "skill": "2b",
        "marks": 2,
        "stem": "Which TWO details show that fog is arriving gradually?",
        "options": [
          "distant tents blurred",
          "hedges softened",
          "the school roof collapsed",
          "the weathercock turned into a real bird"
        ],
        "correctSet": [
          0,
          1
        ],
        "modelAnswer": "The distant tents blurred and the hedges softened.",
        "explanation": "Paragraph 7 presents the fog building in stages rather than all at once.",
        "hint": "Choose the details that describe what becomes harder to see."
      },
      {
        "id": "wc_q6",
        "type": "open",
        "skill": "2f",
        "marks": 2,
        "stem": "How does paragraph 7 change the reader's understanding of the old story about the weathercock?",
        "rubric": [
          {
            "label": "Moves from story/gossip/magic to practical tool",
            "check": {
              "keywordAny": [
                [
                  "not",
                  "magic"
                ],
                [
                  "not",
                  "gossip"
                ],
                [
                  "tool"
                ],
                [
                  "practical"
                ],
                [
                  "warning"
                ]
              ]
            }
          },
          {
            "label": "Shows Tara realises the meaning of the change",
            "check": {
              "keywordAny": [
                [
                  "Tara"
                ],
                [
                  "realise"
                ],
                [
                  "understand"
                ],
                [
                  "rearrange"
                ],
                [
                  "changed"
                ],
                [
                  "notice"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Paragraph 7 turns the old story from village gossip into practical evidence. Tara realises the weathercock matters because its new direction warns about fog on the lower road.",
        "explanation": "This is a structure question about how a detail introduced earlier becomes important later.",
        "hint": "Compare Mr Vale's first story with Tara's thought in paragraph 7."
      },
      {
        "id": "wc_q7",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "What is the effect of the phrase \"fog had folded over the lane\"?",
        "rubric": [
          {
            "label": "Shows fog covering or wrapping the lane",
            "check": {
              "keywordAny": [
                [
                  "cover"
                ],
                [
                  "wrap"
                ],
                [
                  "fold"
                ],
                [
                  "hide"
                ],
                [
                  "blanket"
                ]
              ]
            }
          },
          {
            "label": "Creates a soft but dangerous image",
            "check": {
              "keywordAny": [
                [
                  "danger"
                ],
                [
                  "hard",
                  "see"
                ],
                [
                  "soft"
                ],
                [
                  "mist"
                ],
                [
                  "road"
                ],
                [
                  "lane"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The phrase makes the fog seem as if it is wrapping or covering the lane, a soft image that still shows danger because the road becomes hard to see.",
        "explanation": "The image is quiet rather than violent, but it still builds concern about visibility.",
        "hint": "Think about what folding something over does to what is underneath."
      },
      {
        "id": "wc_q8",
        "type": "match",
        "skill": "2h",
        "marks": 2,
        "stem": "Match each detail to its role in the story.",
        "prompts": [
          "stuck weathercock",
          "radio message",
          "upper road"
        ],
        "options": [
          "the safer route used later",
          "the problem that hides an old warning system",
          "the way the warning reaches the harbour steward"
        ],
        "correctMap": {
          "0": "1",
          "1": "2",
          "2": "0"
        },
        "modelAnswer": "Stuck weathercock \u2192 hidden warning system; radio message \u2192 warning reaches steward; upper road \u2192 safer route later.",
        "explanation": "Each detail contributes to the problem, warning or solution.",
        "hint": "Ask whether each detail is a problem, a communication method or a safe choice."
      },
      {
        "id": "wc_q9",
        "type": "open",
        "skill": "2c",
        "marks": 3,
        "stem": "Summarise how Tara's actions help prevent a dangerous journey.",
        "rubric": [
          {
            "label": "Mentions noticing/freeing weathercock or wind direction",
            "check": {
              "keywordAny": [
                [
                  "weathercock"
                ],
                [
                  "south-east"
                ],
                [
                  "notice"
                ],
                [
                  "free"
                ],
                [
                  "wind"
                ]
              ]
            }
          },
          {
            "label": "Mentions communicating or getting help",
            "check": {
              "keywordAny": [
                [
                  "Mr",
                  "Vale"
                ],
                [
                  "radio"
                ],
                [
                  "harbour",
                  "steward"
                ],
                [
                  "tell"
                ],
                [
                  "warn"
                ]
              ]
            }
          },
          {
            "label": "Mentions coach/lower road danger avoided",
            "check": {
              "keywordAny": [
                [
                  "coach"
                ],
                [
                  "lower",
                  "road"
                ],
                [
                  "Bracken",
                  "Pool"
                ],
                [
                  "danger"
                ],
                [
                  "closed"
                ],
                [
                  "safe"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Tara helps by noticing the weathercock problem, supporting Mr Vale while it is freed and understanding that the south-east wind could bring fog to the lower road. She helps get the warning passed to the harbour steward, so the choir waits and avoids the dangerous route near Bracken Pool.",
        "explanation": "A strong summary links Tara's observations to the practical result.",
        "hint": "Group the answer into noticing, warning and avoiding danger."
      },
      {
        "id": "wc_q10",
        "type": "open",
        "skill": "2d",
        "marks": 3,
        "stem": "How does Tara's view of the weathercock change from the start to the end?",
        "rubric": [
          {
            "label": "Start: old/stuck/ignored object",
            "check": {
              "keywordAny": [
                [
                  "stuck"
                ],
                [
                  "old"
                ],
                [
                  "ignored"
                ],
                [
                  "west"
                ],
                [
                  "drawing"
                ],
                [
                  "sky"
                ]
              ]
            }
          },
          {
            "label": "End: useful/patient/warning tool",
            "check": {
              "keywordAny": [
                [
                  "useful"
                ],
                [
                  "warning"
                ],
                [
                  "tool"
                ],
                [
                  "patient"
                ],
                [
                  "answer",
                  "wind"
                ],
                [
                  "notice"
                ]
              ]
            }
          },
          {
            "label": "Makes change explicit",
            "check": {
              "keywordAny": [
                [
                  "change"
                ],
                [
                  "from"
                ],
                [
                  "to"
                ],
                [
                  "at",
                  "first"
                ],
                [
                  "by",
                  "end"
                ],
                [
                  "later"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "At first, the weathercock seems like a stuck old object that always points west. By the end, Tara sees it as a patient, useful warning tool that can answer the wind and help people notice danger.",
        "explanation": "The story changes the weathercock from a decorative relic into something practical and respected.",
        "hint": "Compare the opening description with the final paragraph."
      },
      {
        "id": "wc_q11",
        "type": "open",
        "skill": "2g",
        "marks": 4,
        "stem": "How does the writer make the weathercock seem important even though it is an ordinary object?",
        "rubric": [
          {
            "label": "Mentions vivid description/personification",
            "check": {
              "keywordAny": [
                [
                  "copper"
                ],
                [
                  "feathers"
                ],
                [
                  "suspicion"
                ],
                [
                  "stubborn"
                ],
                [
                  "patient"
                ],
                [
                  "personif"
                ]
              ]
            }
          },
          {
            "label": "Mentions old story or warning role",
            "check": {
              "keywordAny": [
                [
                  "story"
                ],
                [
                  "warn"
                ],
                [
                  "sea-fog"
                ],
                [
                  "wind"
                ],
                [
                  "village"
                ]
              ]
            }
          },
          {
            "label": "Mentions plot consequences / safety",
            "check": {
              "keywordAny": [
                [
                  "coach"
                ],
                [
                  "safe"
                ],
                [
                  "road"
                ],
                [
                  "harbour"
                ],
                [
                  "danger"
                ],
                [
                  "fog"
                ]
              ]
            }
          },
          {
            "label": "Explains effect on reader",
            "check": {
              "keywordAny": [
                [
                  "important"
                ],
                [
                  "respect"
                ],
                [
                  "useful"
                ],
                [
                  "reader"
                ],
                [
                  "notice"
                ],
                [
                  "ordinary"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The writer gives the weathercock vivid, almost living details: copper feathers, a suspicious expression and later a patient quality. It also has an old story attached to it and then proves useful when its direction warns about fog and helps keep the coach off the lower road. These choices make an ordinary object feel significant and worth respecting.",
        "explanation": "A high-quality answer links language, plot and reader effect.",
        "hint": "Use both the description of the object and what it does in the story."
      },
      {
        "id": "wc_q12",
        "type": "open",
        "skill": "2f",
        "marks": 4,
        "stem": "How does the writer build tension before the choir's journey is delayed? Use evidence from different parts of the story.",
        "rubric": [
          {
            "label": "Uses early warning clues",
            "check": {
              "keywordAny": [
                [
                  "piano"
                ],
                [
                  "wind"
                ],
                [
                  "pages"
                ],
                [
                  "weathercock"
                ],
                [
                  "south-east"
                ]
              ]
            }
          },
          {
            "label": "Uses communication/urgency obstacles",
            "check": {
              "keywordAny": [
                [
                  "phone",
                  "busy"
                ],
                [
                  "radio",
                  "failed"
                ],
                [
                  "headteacher"
                ],
                [
                  "parents"
                ],
                [
                  "bow",
                  "tie"
                ]
              ]
            }
          },
          {
            "label": "Uses fog/lower road danger",
            "check": {
              "keywordAny": [
                [
                  "fog"
                ],
                [
                  "lower",
                  "road"
                ],
                [
                  "Bracken",
                  "Pool"
                ],
                [
                  "white",
                  "line"
                ],
                [
                  "bend"
                ]
              ]
            }
          },
          {
            "label": "Explains tension effect",
            "check": {
              "keywordAny": [
                [
                  "tension"
                ],
                [
                  "worry"
                ],
                [
                  "danger"
                ],
                [
                  "before"
                ],
                [
                  "reader"
                ],
                [
                  "urgent"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The writer builds tension through small clues before the main danger is clear: the piano sounds wrong, cold wind pushes through the hall and the weathercock points south-east. The tension rises because the phone is busy, the radio crackles and adults are distracted. Then the fog gradually hides the lower road near Bracken Pool, making the reader worry the coach might leave too soon.",
        "explanation": "Tension is built by warning signs, obstacles and a deadline.",
        "hint": "Use one early clue, one communication problem and one fog detail."
      },
      {
        "id": "wc_q13",
        "type": "open",
        "skill": "2d",
        "marks": 4,
        "stem": "The story suggests that useful warnings can be quiet rather than dramatic. How far do you agree? Use evidence from across the text.",
        "rubric": [
          {
            "label": "States view clearly",
            "check": {
              "keywordAny": [
                [
                  "agree"
                ],
                [
                  "warning"
                ],
                [
                  "quiet"
                ],
                [
                  "dramatic"
                ],
                [
                  "far"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence about weathercock/wind/fog",
            "check": {
              "keywordAny": [
                [
                  "weathercock"
                ],
                [
                  "south-east"
                ],
                [
                  "fog"
                ],
                [
                  "wind"
                ],
                [
                  "changed"
                ]
              ]
            }
          },
          {
            "label": "Uses evidence about final lesson",
            "check": {
              "keywordAny": [
                [
                  "not",
                  "dramatic"
                ],
                [
                  "useful"
                ],
                [
                  "notice"
                ],
                [
                  "answer",
                  "wind"
                ],
                [
                  "patient"
                ]
              ]
            }
          },
          {
            "label": "Explains link between evidence and theme",
            "check": {
              "keywordAny": [
                [
                  "show"
                ],
                [
                  "because"
                ],
                [
                  "suggest"
                ],
                [
                  "means"
                ],
                [
                  "therefore"
                ],
                [
                  "lesson"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "I agree. The weathercock does not shout or make a dramatic alarm; it simply changes direction after being freed. Tara notices that quiet change and connects it to the fog on the lower road. The ending makes the idea explicit: a warning does not need to be dramatic to be useful, but it needs someone willing to notice when it changes.",
        "explanation": "A strong answer uses the story's evidence and connects it to the larger theme.",
        "hint": "Use the changed direction, the fog and the final sentence."
      }
    ]
  },
  {
    "id": "soil_remembers",
    "title": "What Soil Remembers",
    "genre": "non-fiction",
    "difficulty": 5,
    "isLong": true,
    "blocks": [
      "Soil can look like the quietest part of a landscape. It sits under grass, paths and crops, usually noticed only when it sticks to a shoe. Yet soil is not simply ground-up rock. It is a living record of weather, roots, animals, dead leaves and human choices layered together over time.",
      "A handful of healthy soil may contain mineral grains, air spaces, water, fungi, bacteria and tiny animals. Earthworms drag leaves underground and mix them with mineral particles. Fungal threads spread between roots, helping some plants take in nutrients. Even the gaps matter, because water and oxygen must move through them if roots are to survive.",
      "Soil forms slowly. Rain breaks rock into smaller pieces, plants push roots into cracks and dead material rots into humus. In cool or dry places, this may take centuries. A few centimetres of rich topsoil can therefore represent a very long process, while careless erosion can remove it in a single storm.",
      "Because soil records change, scientists can read it like an archive. Pollen grains preserved in layers can show which plants once grew nearby. Charcoal fragments may reveal past fires or farming. Chemical traces can point to pollution, while compacted layers can show where heavy machines or feet pressed the ground hard.",
      "Farmers and gardeners have always known that soil condition changes what can grow. Soil that is compacted may shed rain instead of absorbing it. Soil with too little organic matter may dry out quickly. Adding compost, growing cover crops and avoiding unnecessary digging can help rebuild structure and feed the organisms that keep soil working.",
      "There is also a climate link. Soil stores more carbon than many people realise, especially when plant roots and decayed material are left in place. Damaged soils can release some of that carbon back into the air. This does not mean soil alone can solve climate change, but it does mean caring for it is part of a wider response.",
      "The next time a muddy footprint appears on a doorstep, it may be worth seeing more than mess. That dark print could contain ground rock, yesterday's rain, last autumn's leaves and the work of creatures too small to name. Soil remembers because it is still being written."
    ],
    "questions": [
      {
        "id": "soil_q1",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "Name one living thing or organism found in healthy soil according to paragraph 2.",
        "check": {
          "keywordAny": [
            [
              "fungi"
            ],
            [
              "bacteria"
            ],
            [
              "earthworm"
            ],
            [
              "tiny",
              "animal"
            ],
            [
              "worm"
            ]
          ]
        },
        "modelAnswer": "Possible answers include fungi, bacteria, earthworms or tiny animals.",
        "explanation": "Paragraph 2 lists several living parts of healthy soil.",
        "hint": "Look for the list of things in a handful of healthy soil."
      },
      {
        "id": "soil_q2",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does \"archive\" mean in paragraph 4?",
        "options": [
          "a record that stores evidence from the past",
          "a tool for digging holes",
          "a type of fast-growing crop",
          "a storm that washes soil away"
        ],
        "correct": 0,
        "modelAnswer": "a record that stores evidence from the past",
        "explanation": "The paragraph explains that soil layers can preserve pollen, charcoal and chemical traces from earlier times.",
        "hint": "Use the examples that come after the word."
      },
      {
        "id": "soil_q3",
        "type": "evidenceShort",
        "skill": "2d",
        "marks": 2,
        "stem": "Why is losing topsoil serious? Use evidence from the text.",
        "answerCheck": {
          "keywordAny": [
            [
              "slow",
              "form"
            ],
            [
              "centur"
            ],
            [
              "storm",
              "remove"
            ],
            [
              "long",
              "process"
            ],
            [
              "erosion"
            ]
          ]
        },
        "evidenceCheck": {
          "containsAny": [
            "Soil forms slowly",
            "this may take centuries",
            "A few centimetres of rich topsoil can therefore represent a very long process",
            "careless erosion can remove it in a single storm"
          ]
        },
        "answerMarks": 1,
        "evidenceMarks": 1,
        "modelAnswer": "It is serious because topsoil takes a very long time to form but can be lost quickly. Evidence could include: \"careless erosion can remove it in a single storm\".",
        "explanation": "The contrast between slow formation and rapid loss makes topsoil valuable.",
        "hint": "Find the sentence that compares centuries with a single storm.",
        "reread": [
          3
        ]
      },
      {
        "id": "soil_q4",
        "type": "mcq",
        "skill": "2c",
        "marks": 2,
        "stem": "Which statement best summarises what healthy soil contains?",
        "options": [
          "Healthy soil is a mixture of minerals, spaces, water and living organisms that work together.",
          "Soil is made only of tiny stones and nothing else.",
          "Earthworms damage soil by removing all the leaves from it.",
          "Roots survive best when soil contains no air or water."
        ],
        "correct": 0,
        "modelAnswer": "Healthy soil is a mixture of minerals, spaces, water and living organisms that work together.",
        "explanation": "The paragraph explains the different parts of healthy soil and how they support roots and organisms.",
        "hint": "Choose the option that captures the whole mixture, not one detail."
      },
      {
        "id": "soil_q5",
        "type": "open",
        "skill": "2f",
        "marks": 2,
        "stem": "How does paragraph 4 broaden the explanation of soil?",
        "rubric": [
          {
            "label": "Moves from soil formation/life to evidence of the past",
            "check": {
              "keywordAny": [
                [
                  "past"
                ],
                [
                  "archive"
                ],
                [
                  "record"
                ],
                [
                  "layer"
                ],
                [
                  "evidence"
                ],
                [
                  "read"
                ]
              ]
            }
          },
          {
            "label": "Mentions examples such as pollen, charcoal, chemicals or compaction",
            "check": {
              "keywordAny": [
                [
                  "pollen"
                ],
                [
                  "charcoal"
                ],
                [
                  "chemical"
                ],
                [
                  "compacted"
                ],
                [
                  "pollution"
                ],
                [
                  "fires"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Paragraph 4 broadens the explanation by showing that soil is not only a living system but also a record of the past, preserving clues such as pollen, charcoal, chemical traces and compacted layers.",
        "explanation": "The paragraph shifts from how soil works to what soil can reveal.",
        "hint": "Ask what new job soil is given in paragraph 4."
      },
      {
        "id": "soil_q6",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why does the writer say soil is \"still being written\"?",
        "rubric": [
          {
            "label": "Explains record/book metaphor",
            "check": {
              "keywordAny": [
                [
                  "record"
                ],
                [
                  "book"
                ],
                [
                  "story"
                ],
                [
                  "written"
                ],
                [
                  "archive"
                ],
                [
                  "layer"
                ]
              ]
            }
          },
          {
            "label": "Links to continuing natural/human processes",
            "check": {
              "keywordAny": [
                [
                  "weather"
                ],
                [
                  "roots"
                ],
                [
                  "leaves"
                ],
                [
                  "animals"
                ],
                [
                  "human"
                ],
                [
                  "change"
                ],
                [
                  "continue"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The phrase treats soil like a record or story that keeps gaining new layers. Weather, roots, leaves, animals and human choices are still changing it, so its record is not finished.",
        "explanation": "The metaphor ties the final paragraph back to the idea of soil remembering change over time.",
        "hint": "Think about what keeps adding to soil's record."
      },
      {
        "id": "soil_q7",
        "type": "open",
        "skill": "2h",
        "marks": 2,
        "stem": "Compare compacted soil with healthy soil as described in the passage.",
        "rubric": [
          {
            "label": "Healthy soil has gaps/air/water/life",
            "check": {
              "keywordAny": [
                [
                  "gap"
                ],
                [
                  "air"
                ],
                [
                  "water"
                ],
                [
                  "organism"
                ],
                [
                  "roots"
                ],
                [
                  "healthy"
                ]
              ]
            }
          },
          {
            "label": "Compacted soil sheds water or is pressed hard",
            "check": {
              "keywordAny": [
                [
                  "compacted"
                ],
                [
                  "shed",
                  "rain"
                ],
                [
                  "pressed"
                ],
                [
                  "hard"
                ],
                [
                  "machines"
                ],
                [
                  "feet"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "Healthy soil has air spaces, water movement and living organisms that support roots. Compacted soil has been pressed hard, so it may shed rain instead of absorbing it and can make root growth harder.",
        "explanation": "The comparison needs both conditions, not just one.",
        "hint": "Use paragraphs 2, 4 and 5."
      },
      {
        "id": "soil_q8",
        "type": "open",
        "skill": "2d",
        "marks": 3,
        "stem": "Why does the writer include both tiny organisms and climate in the same passage?",
        "rubric": [
          {
            "label": "Shows soil works at small and large scales",
            "check": {
              "keywordAny": [
                [
                  "small"
                ],
                [
                  "tiny"
                ],
                [
                  "large"
                ],
                [
                  "scale"
                ],
                [
                  "bigger"
                ],
                [
                  "whole"
                ]
              ]
            }
          },
          {
            "label": "Mentions organisms/fungi/bacteria/earthworms",
            "check": {
              "keywordAny": [
                [
                  "organism"
                ],
                [
                  "fungi"
                ],
                [
                  "bacteria"
                ],
                [
                  "earthworm"
                ],
                [
                  "tiny"
                ]
              ]
            }
          },
          {
            "label": "Mentions carbon/climate/wider response",
            "check": {
              "keywordAny": [
                [
                  "carbon"
                ],
                [
                  "climate"
                ],
                [
                  "store"
                ],
                [
                  "release"
                ],
                [
                  "wider",
                  "response"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The writer includes both to show that soil matters at more than one scale. Tiny organisms help soil work day by day, while soil's ability to store or release carbon connects it to climate and wider environmental choices.",
        "explanation": "The passage links hidden small processes to large consequences.",
        "hint": "Use paragraph 2 and paragraph 6 together."
      },
      {
        "id": "soil_q9",
        "type": "match",
        "skill": "2b",
        "marks": 3,
        "stem": "Match each soil clue to what it can show.",
        "prompts": [
          "pollen grains",
          "charcoal fragments",
          "compacted layers"
        ],
        "options": [
          "where pressure from machines or feet hardened the ground",
          "which plants once grew nearby",
          "past fires or farming"
        ],
        "correctMap": {
          "0": "1",
          "1": "2",
          "2": "0"
        },
        "modelAnswer": "Pollen grains \u2192 plants once nearby; charcoal fragments \u2192 past fires or farming; compacted layers \u2192 pressure from machines or feet.",
        "explanation": "Paragraph 4 explains how different traces in soil reveal different kinds of past change.",
        "hint": "Use the examples in paragraph 4."
      },
      {
        "id": "soil_q10",
        "type": "short",
        "skill": "2e",
        "marks": 1,
        "stem": "What is likely to happen if soil has too little organic matter?",
        "check": {
          "keywordAny": [
            [
              "dry",
              "quick"
            ],
            [
              "dry",
              "out"
            ],
            [
              "less",
              "hold",
              "water"
            ]
          ]
        },
        "modelAnswer": "It may dry out quickly.",
        "explanation": "Paragraph 5 says soil with too little organic matter may dry out quickly.",
        "hint": "Look in paragraph 5."
      },
      {
        "id": "soil_q11",
        "type": "open",
        "skill": "2f",
        "marks": 4,
        "stem": "How does the final paragraph change the way the reader might think about a muddy footprint?",
        "rubric": [
          {
            "label": "Starts from ordinary mess/footprint",
            "check": {
              "keywordAny": [
                [
                  "muddy",
                  "footprint"
                ],
                [
                  "mess"
                ],
                [
                  "doorstep"
                ],
                [
                  "ordinary"
                ]
              ]
            }
          },
          {
            "label": "Shows hidden complexity/composition",
            "check": {
              "keywordAny": [
                [
                  "rock"
                ],
                [
                  "rain"
                ],
                [
                  "leaves"
                ],
                [
                  "creatures"
                ],
                [
                  "small"
                ],
                [
                  "contain"
                ]
              ]
            }
          },
          {
            "label": "Links to soil as record/memory",
            "check": {
              "keywordAny": [
                [
                  "remember"
                ],
                [
                  "record"
                ],
                [
                  "written"
                ],
                [
                  "past"
                ],
                [
                  "layer"
                ]
              ]
            }
          },
          {
            "label": "Explains reader effect",
            "check": {
              "keywordAny": [
                [
                  "think"
                ],
                [
                  "see"
                ],
                [
                  "reader"
                ],
                [
                  "value"
                ],
                [
                  "more",
                  "than"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The final paragraph turns a muddy footprint from ordinary mess into evidence of a complex living record. By listing rock, rain, leaves and tiny creatures, the writer makes the reader see soil as something valuable and layered rather than just dirt on a doorstep.",
        "explanation": "The ending uses a familiar image to reshape the reader's attitude.",
        "hint": "Compare 'mess' with the list of things the footprint could contain."
      },
      {
        "id": "soil_q12",
        "type": "open",
        "skill": "2d",
        "marks": 4,
        "stem": "The passage suggests soil is both fragile and powerful. How far do you agree? Use evidence from different parts of the text.",
        "rubric": [
          {
            "label": "States judgement",
            "check": {
              "keywordAny": [
                [
                  "agree"
                ],
                [
                  "fragile"
                ],
                [
                  "powerful"
                ],
                [
                  "far"
                ],
                [
                  "both"
                ]
              ]
            }
          },
          {
            "label": "Uses fragile evidence",
            "check": {
              "keywordAny": [
                [
                  "erosion"
                ],
                [
                  "single",
                  "storm"
                ],
                [
                  "compacted"
                ],
                [
                  "dry",
                  "out"
                ],
                [
                  "damage"
                ]
              ]
            }
          },
          {
            "label": "Uses powerful/useful evidence",
            "check": {
              "keywordAny": [
                [
                  "carbon"
                ],
                [
                  "roots"
                ],
                [
                  "organism"
                ],
                [
                  "archive"
                ],
                [
                  "grow"
                ],
                [
                  "water"
                ]
              ]
            }
          },
          {
            "label": "Explains balance",
            "check": {
              "keywordAny": [
                [
                  "because"
                ],
                [
                  "show"
                ],
                [
                  "therefore"
                ],
                [
                  "but"
                ],
                [
                  "while"
                ],
                [
                  "balance"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "I agree. Soil is fragile because rich topsoil can take centuries to form but be removed by erosion in a single storm, and compacted or low-organic soil can stop water and roots working well. It is powerful because it supports organisms and plants, records past environments and stores carbon. The passage shows that something quiet can still be essential.",
        "explanation": "A strong answer balances both sides and uses evidence from several paragraphs.",
        "hint": "Use one detail about damage and one about what soil does."
      },
      {
        "id": "soil_q13",
        "type": "open",
        "skill": "2h",
        "marks": 4,
        "stem": "Compare how the writer presents soil in the first paragraph and the final paragraph.",
        "rubric": [
          {
            "label": "First paragraph: quiet/unnoticed/simple-looking",
            "check": {
              "keywordAny": [
                [
                  "quiet"
                ],
                [
                  "unnoticed"
                ],
                [
                  "shoe"
                ],
                [
                  "under"
                ],
                [
                  "simple"
                ],
                [
                  "landscape"
                ]
              ]
            }
          },
          {
            "label": "Final paragraph: complex/living record/still changing",
            "check": {
              "keywordAny": [
                [
                  "footprint"
                ],
                [
                  "rock"
                ],
                [
                  "rain"
                ],
                [
                  "leaves"
                ],
                [
                  "creature"
                ],
                [
                  "remembers"
                ],
                [
                  "written"
                ]
              ]
            }
          },
          {
            "label": "Explicit comparison",
            "check": {
              "keywordAny": [
                [
                  "whereas"
                ],
                [
                  "but"
                ],
                [
                  "first"
                ],
                [
                  "final"
                ],
                [
                  "changes"
                ],
                [
                  "from",
                  "to"
                ]
              ]
            }
          },
          {
            "label": "Explains change in reader's view",
            "check": {
              "keywordAny": [
                [
                  "reader"
                ],
                [
                  "see"
                ],
                [
                  "think"
                ],
                [
                  "value"
                ],
                [
                  "more",
                  "than"
                ],
                [
                  "understand"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "In the first paragraph, soil is presented as quiet and usually unnoticed, something people may only think about when it sticks to a shoe. In the final paragraph, the muddy footprint becomes a sign of complexity, containing rock, rain, leaves and tiny creatures. The writer moves the reader from seeing soil as ordinary dirt to seeing it as a living record.",
        "explanation": "Comparison questions need detail from both parts and a clear account of the change.",
        "hint": "Use the opening image of soil on a shoe and the ending image of a footprint."
      }
    ]
  },
  {
    "id": "old_observatory",
    "title": "The Old Observatory",
    "genre": "poetry",
    "difficulty": 4,
    "isLong": false,
    "blocks": [
      "At noon the old observatory sleeps,\nits telescope hooded, its brass wheel still.\nDust gathers stars on the window ledge;\nsunlight climbs the hill.",
      "Night is folded in drawers of charts,\ninked moons, patient rings of Mars.\nA spider ties the afternoon\nto a shelf of bottled stars.",
      "When evening loosens the first blue thread,\nthe dome will turn and the shutters part.\nFor now, the sky keeps all its secrets\nin the daylight of its heart."
    ],
    "questions": [
      {
        "id": "obs_q1",
        "type": "mcq",
        "skill": "2a",
        "marks": 1,
        "stem": "What does \"hooded\" suggest about the telescope?",
        "options": [
          "It is covered or closed for now.",
          "It is running quickly down the hill.",
          "It is brighter than the sun.",
          "It has been turned into a bird."
        ],
        "correct": 0,
        "modelAnswer": "It is covered or closed for now.",
        "explanation": "A hood covers something, so the telescope is not yet in use.",
        "hint": "Think about what a hood does."
      },
      {
        "id": "obs_q2",
        "type": "short",
        "skill": "2b",
        "marks": 1,
        "stem": "What insect is mentioned in the poem?",
        "check": {
          "keywordAny": [
            [
              "spider"
            ]
          ]
        },
        "modelAnswer": "A spider is mentioned.",
        "explanation": "The second stanza says a spider ties the afternoon to a shelf.",
        "hint": "Look in the second stanza."
      },
      {
        "id": "obs_q3",
        "type": "open",
        "skill": "2g",
        "marks": 2,
        "stem": "Why might the poet say \"Dust gathers stars on the window ledge\"?",
        "rubric": [
          {
            "label": "Explains dust/star visual image",
            "check": {
              "keywordAny": [
                [
                  "dust"
                ],
                [
                  "speck"
                ],
                [
                  "sparkle"
                ],
                [
                  "star"
                ],
                [
                  "light"
                ]
              ]
            }
          },
          {
            "label": "Links to observatory theme/night sky",
            "check": {
              "keywordAny": [
                [
                  "observatory"
                ],
                [
                  "sky"
                ],
                [
                  "space"
                ],
                [
                  "night"
                ],
                [
                  "telescope"
                ],
                [
                  "stars"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The poet makes specks of dust in the sunlight seem like tiny stars, linking even the daytime observatory to the night sky it studies.",
        "explanation": "The image blends an ordinary indoor detail with the observatory's purpose.",
        "hint": "Think about how dust can look in a shaft of light."
      },
      {
        "id": "obs_q4",
        "type": "open",
        "skill": "2f",
        "marks": 2,
        "stem": "How does the poem move from noon to evening?",
        "rubric": [
          {
            "label": "Noon/resting observatory at start",
            "check": {
              "keywordAny": [
                [
                  "noon"
                ],
                [
                  "sleeps"
                ],
                [
                  "still"
                ],
                [
                  "daylight"
                ],
                [
                  "sunlight"
                ]
              ]
            }
          },
          {
            "label": "Evening/coming action at end",
            "check": {
              "keywordAny": [
                [
                  "evening"
                ],
                [
                  "blue",
                  "thread"
                ],
                [
                  "dome",
                  "turn"
                ],
                [
                  "shutters",
                  "part"
                ],
                [
                  "night"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The poem starts at noon with the observatory asleep and still, then looks ahead to evening when the dome will turn and the shutters will open for night viewing.",
        "explanation": "The structure moves from present stillness to future activity.",
        "hint": "Compare the first line with the final stanza."
      },
      {
        "id": "obs_q5",
        "type": "open",
        "skill": "2d",
        "marks": 2,
        "stem": "What mood does the poem create around the observatory? Use two details.",
        "rubric": [
          {
            "label": "Names calm/mysterious/patient mood",
            "check": {
              "keywordAny": [
                [
                  "calm"
                ],
                [
                  "quiet"
                ],
                [
                  "myster"
                ],
                [
                  "patient"
                ],
                [
                  "peaceful"
                ],
                [
                  "secret"
                ]
              ]
            }
          },
          {
            "label": "Uses two textual details",
            "check": {
              "keywordAny": [
                [
                  "sleeps"
                ],
                [
                  "still"
                ],
                [
                  "patient"
                ],
                [
                  "secrets"
                ],
                [
                  "folded"
                ],
                [
                  "hooded"
                ],
                [
                  "shutters"
                ]
              ]
            }
          }
        ],
        "modelAnswer": "The mood is calm and mysterious. Details such as the observatory that \"sleeps\", the \"patient rings of Mars\" and the sky keeping \"secrets\" make it feel quiet but full of hidden knowledge.",
        "explanation": "The mood comes from both stillness and the promise of secrets to be revealed later.",
        "hint": "Choose one detail about stillness and one about mystery."
      },
      {
        "id": "obs_q6",
        "type": "mcq",
        "skill": "P3",
        "marks": 1,
        "stem": "In the line \"For now, the sky keeps all its secrets\", what does the comma help do?",
        "options": [
          "It separates the opening phrase from the main idea.",
          "It shows somebody is speaking.",
          "It introduces a list of planets.",
          "It marks the end of a question."
        ],
        "correct": 0,
        "modelAnswer": "It separates the opening phrase from the main idea.",
        "explanation": "The comma helps the reader pause after the time phrase 'For now'.",
        "hint": "Read the line in two parts: the time phrase, then the main idea."
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
  },

  {
    "id": "paper_i",
    "title": "Original KS2-style Paper I",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "glass_roof_station",
        "questionIds": [
          "gs_q1",
          "gs_q2",
          "gs_q3",
          "gs_q4",
          "gs_q5",
          "gs_q6",
          "gs_q7",
          "gs_q8"
        ]
      },
      {
        "passageId": "under_bridge_song",
        "questionIds": [
          "ubs_q1",
          "ubs_q2",
          "ubs_q3",
          "ubs_q4",
          "ubs_q5",
          "ubs_q6"
        ]
      },
      {
        "passageId": "copper_weathercock",
        "questionIds": [
          "wc_q1",
          "wc_q2",
          "wc_q3",
          "wc_q4",
          "wc_q5",
          "wc_q6",
          "wc_q7",
          "wc_q8",
          "wc_q10",
          "wc_q11",
          "wc_q12",
          "wc_q13"
        ]
      }
    ]
  },
  {
    "id": "paper_j",
    "title": "Original KS2-style Paper J",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "rain_gardeners",
        "questionIds": [
          "rg_q1",
          "rg_q2",
          "rg_q3",
          "rg_q4",
          "rg_q5",
          "rg_q6",
          "rg_q7",
          "rg_q8"
        ]
      },
      {
        "passageId": "old_observatory",
        "questionIds": [
          "obs_q1",
          "obs_q2",
          "obs_q3",
          "obs_q4",
          "obs_q5",
          "obs_q6"
        ]
      },
      {
        "passageId": "soil_remembers",
        "questionIds": [
          "soil_q1",
          "soil_q2",
          "soil_q3",
          "soil_q4",
          "soil_q5",
          "soil_q6",
          "soil_q7",
          "soil_q8",
          "soil_q9",
          "soil_q10",
          "soil_q11",
          "soil_q12"
        ]
      }
    ]
  },
  {
    "id": "paper_k",
    "title": "Original KS2-style Paper K",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "borrowed_compass",
        "questionIds": [
          "bc_q1",
          "bc_q2",
          "bc_q3",
          "bc_q4",
          "bc_q5",
          "bc_q6",
          "bc_q7",
          "bc_q8"
        ]
      },
      {
        "passageId": "under_bridge_song",
        "questionIds": [
          "ubs_q1",
          "ubs_q2",
          "ubs_q3",
          "ubs_q4",
          "ubs_q5",
          "ubs_q6"
        ]
      },
      {
        "passageId": "bats_map_night",
        "questionIds": [
          "bat_q1",
          "bat_q2",
          "bat_q3",
          "bat_q4",
          "bat_q5",
          "bat_q6",
          "bat_q7",
          "bat_q8",
          "bat_q9",
          "bat_q10",
          "bat_q11",
          "bat_q12",
          "bat_q13"
        ]
      }
    ]
  },
  {
    "id": "paper_l",
    "title": "Original KS2-style Paper L",
    "timeLimitMin": 60,
    "totalMarks": 50,
    "sections": [
      {
        "passageId": "glass_roof_station",
        "questionIds": [
          "gs_q1",
          "gs_q2",
          "gs_q3",
          "gs_q4",
          "gs_q5",
          "gs_q6",
          "gs_q7",
          "gs_q8"
        ]
      },
      {
        "passageId": "rain_gardeners",
        "questionIds": [
          "rg_q1",
          "rg_q2",
          "rg_q3",
          "rg_q4",
          "rg_q5",
          "rg_q6",
          "rg_q7",
          "rg_q8"
        ]
      },
      {
        "passageId": "soil_remembers",
        "questionIds": [
          "soil_q1",
          "soil_q2",
          "soil_q3",
          "soil_q4",
          "soil_q5",
          "soil_q6",
          "soil_q7",
          "soil_q8",
          "soil_q10",
          "soil_q11",
          "soil_q12"
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
