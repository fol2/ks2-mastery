// Manual fixed-question expansion for Punctuation QG.
// These are hand-authored choice items to widen the first-click surface across all published skills.

export const PUNCTUATION_FIXED_EXPANSION_ITEMS = Object.freeze([
  Object.freeze({
    "id": "fx_se_choose_river_question",
    "mode": "choose",
    "skillIds": [
      "sentence_endings"
    ],
    "clusterId": "endmarks",
    "rewardUnitId": "sentence-endings-core",
    "prompt": "Choose the correctly punctuated sentence.",
    "options": [
      "where does the river begin?",
      "Where does the river begin?",
      "Where does the river begin.",
      "where does the river begin."
    ],
    "correctIndex": 1,
    "explanation": "A question starts with a capital letter and ends with a question mark.",
    "model": "Where does the river begin?",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "sentence.endmark-question",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_se_choose_command_full_stop",
    "mode": "choose",
    "skillIds": [
      "sentence_endings"
    ],
    "clusterId": "endmarks",
    "rewardUnitId": "sentence-endings-core",
    "prompt": "Choose the correctly punctuated command.",
    "options": [
      "put the glue sticks away",
      "Put the glue sticks away.",
      "Put the glue sticks away?",
      "put the glue sticks away."
    ],
    "correctIndex": 1,
    "explanation": "A command is a sentence, so it needs a capital letter and a full stop.",
    "model": "Put the glue sticks away.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "sentence.endmark-statement",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_se_choose_exclamation_idea",
    "mode": "choose",
    "skillIds": [
      "sentence_endings"
    ],
    "clusterId": "endmarks",
    "rewardUnitId": "sentence-endings-core",
    "prompt": "Choose the sentence that shows excitement correctly.",
    "options": [
      "What an amazing idea!",
      "what an amazing idea!",
      "What an amazing idea?",
      "What an amazing idea."
    ],
    "correctIndex": 0,
    "explanation": "An exclamation begins with a capital letter and ends with an exclamation mark.",
    "model": "What an amazing idea!",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "sentence.endmark-exclamation",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_se_choose_statement_forest",
    "mode": "choose",
    "skillIds": [
      "sentence_endings"
    ],
    "clusterId": "endmarks",
    "rewardUnitId": "sentence-endings-core",
    "prompt": "Choose the correctly punctuated statement.",
    "options": [
      "The forest path was muddy?",
      "the forest path was muddy.",
      "The forest path was muddy.",
      "The forest path was muddy!"
    ],
    "correctIndex": 2,
    "explanation": "A statement starts with a capital letter and usually ends with a full stop.",
    "model": "The forest path was muddy.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "sentence.endmark-statement",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_lc_choose_sports_day",
    "mode": "choose",
    "skillIds": [
      "list_commas"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "list-commas-core",
    "prompt": "Choose the list with the commas in the right places.",
    "options": [
      "We carried cones hoops and beanbags.",
      "We carried cones, hoops and beanbags.",
      "We carried, cones hoops and beanbags.",
      "We carried cones hoops, and beanbags."
    ],
    "correctIndex": 1,
    "explanation": "Commas separate the first items in the list.",
    "model": "We carried cones, hoops and beanbags.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "list.comma-separation",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_lc_choose_art_table",
    "mode": "choose",
    "skillIds": [
      "list_commas"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "list-commas-core",
    "prompt": "Choose the best-punctuated list.",
    "options": [
      "On the table were paints, brushes and paper.",
      "On the table were paints brushes and paper.",
      "On the table, were paints brushes and paper.",
      "On the table were paints, brushes, and paper,"
    ],
    "correctIndex": 0,
    "explanation": "The comma belongs between paints and brushes.",
    "model": "On the table were paints, brushes and paper.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "list.comma-separation",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_lc_choose_library_bag",
    "mode": "choose",
    "skillIds": [
      "list_commas"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "list-commas-core",
    "prompt": "Choose the sentence with correct list punctuation.",
    "options": [
      "I packed a notebook, pencil and ruler.",
      "I packed, a notebook pencil and ruler.",
      "I packed a notebook pencil, and ruler.",
      "I packed a notebook pencil and ruler."
    ],
    "correctIndex": 0,
    "explanation": "A comma separates notebook and pencil in the list.",
    "model": "I packed a notebook, pencil and ruler.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "list.comma-separation",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_lc_choose_cake_stall",
    "mode": "choose",
    "skillIds": [
      "list_commas"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "list-commas-core",
    "prompt": "Choose the correctly punctuated list.",
    "options": [
      "The stall sold cakes biscuits and juice.",
      "The stall sold cakes, biscuits and juice.",
      "The stall sold, cakes biscuits and juice.",
      "The stall sold cakes biscuits, and juice."
    ],
    "correctIndex": 1,
    "explanation": "Commas separate the list items: cakes, biscuits and juice.",
    "model": "The stall sold cakes, biscuits and juice.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "list.comma-separation",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_ac_choose_cant_were",
    "mode": "choose",
    "skillIds": [
      "apostrophe_contractions"
    ],
    "clusterId": "apostrophe",
    "rewardUnitId": "apostrophe-contractions-core",
    "prompt": "Choose the sentence with correct contractions.",
    "options": [
      "We cant go because were early.",
      "We can't go because we're early.",
      "We can't go because were early.",
      "We cant go because we're early."
    ],
    "correctIndex": 1,
    "explanation": "Can't and we're both need apostrophes for missing letters.",
    "model": "We can't go because we're early.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "apostrophe.contraction-missing-letters",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_ac_choose_theyve_dont",
    "mode": "choose",
    "skillIds": [
      "apostrophe_contractions"
    ],
    "clusterId": "apostrophe",
    "rewardUnitId": "apostrophe-contractions-core",
    "prompt": "Choose the sentence with correct apostrophes.",
    "options": [
      "Theyve said we dont need coats.",
      "They've said we don't need coats.",
      "They've said we dont need coats.",
      "Theyve said we don't need coats."
    ],
    "correctIndex": 1,
    "explanation": "They've and don't use apostrophes to show omitted letters.",
    "model": "They've said we don't need coats.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "apostrophe.contraction-missing-letters",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_ac_choose_ill_youll",
    "mode": "choose",
    "skillIds": [
      "apostrophe_contractions"
    ],
    "clusterId": "apostrophe",
    "rewardUnitId": "apostrophe-contractions-core",
    "prompt": "Choose the sentence with both contractions correct.",
    "options": [
      "Ill help when youll ask.",
      "I'll help when you'll ask.",
      "I'll help when youll ask.",
      "Ill help when you'll ask."
    ],
    "correctIndex": 1,
    "explanation": "I'll and you'll both need apostrophes.",
    "model": "I'll help when you'll ask.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "apostrophe.contraction-missing-letters",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_ac_choose_isnt_wouldnt",
    "mode": "choose",
    "skillIds": [
      "apostrophe_contractions"
    ],
    "clusterId": "apostrophe",
    "rewardUnitId": "apostrophe-contractions-core",
    "prompt": "Choose the correctly punctuated sentence.",
    "options": [
      "It isnt fair that he wouldnt share.",
      "It isn't fair that he wouldn't share.",
      "It isn't fair that he wouldnt share.",
      "It isnt fair that he wouldn't share."
    ],
    "correctIndex": 1,
    "explanation": "Isn't and wouldn't both show missing letters.",
    "model": "It isn't fair that he wouldn't share.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "apostrophe.contraction-missing-letters",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_ap_choose_girls_bag",
    "mode": "choose",
    "skillIds": [
      "apostrophe_possession"
    ],
    "clusterId": "apostrophe",
    "rewardUnitId": "apostrophe-possession-core",
    "prompt": "Choose the sentence showing one girl owns the bag.",
    "options": [
      "The girls bag was red.",
      "The girl's bag was red.",
      "The girls' bag was red.",
      "The girl,s bag was red."
    ],
    "correctIndex": 1,
    "explanation": "One girl owns the bag, so the apostrophe comes before s.",
    "model": "The girl's bag was red.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "apostrophe.possession-singular",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_ap_choose_children_books",
    "mode": "choose",
    "skillIds": [
      "apostrophe_possession"
    ],
    "clusterId": "apostrophe",
    "rewardUnitId": "apostrophe-possession-core",
    "prompt": "Choose the sentence showing the children own the books.",
    "options": [
      "The childrens books were new.",
      "The children's books were new.",
      "The childrens' books were new.",
      "The children,s books were new."
    ],
    "correctIndex": 1,
    "explanation": "Children is an irregular plural, so the apostrophe goes before s in children's.",
    "model": "The children's books were new.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "apostrophe.possession-irregular-plural",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_ap_choose_teachers_room",
    "mode": "choose",
    "skillIds": [
      "apostrophe_possession"
    ],
    "clusterId": "apostrophe",
    "rewardUnitId": "apostrophe-possession-core",
    "prompt": "Choose the sentence showing several teachers share the room.",
    "options": [
      "The teachers room was quiet.",
      "The teacher's room was quiet.",
      "The teachers' room was quiet.",
      "The teacher,s room was quiet."
    ],
    "correctIndex": 2,
    "explanation": "Several teachers share it, so the apostrophe comes after the plural s.",
    "model": "The teachers' room was quiet.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "apostrophe.possession-plural-s",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_ap_choose_boys_team",
    "mode": "choose",
    "skillIds": [
      "apostrophe_possession"
    ],
    "clusterId": "apostrophe",
    "rewardUnitId": "apostrophe-possession-core",
    "prompt": "Choose the sentence showing several boys own the team shirts.",
    "options": [
      "The boys shirts were blue.",
      "The boy's shirts were blue.",
      "The boys' shirts were blue.",
      "The boys, shirts were blue."
    ],
    "correctIndex": 2,
    "explanation": "Several boys own the shirts, so the apostrophe goes after the plural s.",
    "model": "The boys' shirts were blue.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "apostrophe.possession-plural-s",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sp_choose_lucy_line",
    "mode": "choose",
    "skillIds": [
      "speech"
    ],
    "clusterId": "speech",
    "rewardUnitId": "speech-core",
    "prompt": "Choose the correctly punctuated direct speech.",
    "options": [
      "Lucy said \"I found it.\"",
      "Lucy said, \"I found it.\"",
      "Lucy said, \"I found it\".",
      "Lucy said \"I found it\"."
    ],
    "correctIndex": 1,
    "explanation": "Use a comma before the spoken words and keep the full stop inside the inverted commas.",
    "model": "Lucy said, \"I found it.\"",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "speech.reporting-comma",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sp_choose_question_inside",
    "mode": "choose",
    "skillIds": [
      "speech"
    ],
    "clusterId": "speech",
    "rewardUnitId": "speech-core",
    "prompt": "Choose the sentence where the question mark is inside the speech.",
    "options": [
      "\"Can I help\"? asked Omar.",
      "\"Can I help?\" asked Omar.",
      "\"Can I help? asked Omar.\"",
      "Can I help? asked Omar."
    ],
    "correctIndex": 1,
    "explanation": "The question mark belongs inside the closing inverted comma.",
    "model": "\"Can I help?\" asked Omar.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "speech.question-inside-quotes",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sp_choose_command_inside",
    "mode": "choose",
    "skillIds": [
      "speech"
    ],
    "clusterId": "speech",
    "rewardUnitId": "speech-core",
    "prompt": "Choose the correctly punctuated command in speech.",
    "options": [
      "Dad called, \"Close the gate.\"",
      "Dad called \"Close the gate\".",
      "Dad called, \"Close the gate\".",
      "Dad called \"Close the gate.\""
    ],
    "correctIndex": 0,
    "explanation": "The spoken command is inside inverted commas and ends with a full stop inside them.",
    "model": "Dad called, \"Close the gate.\"",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "speech.punctuation-inside-quotes",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sp_choose_quote_order",
    "mode": "choose",
    "skillIds": [
      "speech"
    ],
    "clusterId": "speech",
    "rewardUnitId": "speech-core",
    "prompt": "Choose the sentence with direct speech marked correctly.",
    "options": [
      "\"Wait here,\" said Priya.",
      "\"Wait here\", said Priya.",
      "\"Wait here said Priya.\"",
      "Wait here, said Priya."
    ],
    "correctIndex": 0,
    "explanation": "The comma belongs inside the closing inverted comma before the reporting clause.",
    "model": "\"Wait here,\" said Priya.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "speech.reporting-after",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_fa_choose_before_assembly",
    "mode": "choose",
    "skillIds": [
      "fronted_adverbial"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "fronted-adverbials-core",
    "prompt": "Choose the sentence with the comma after the fronted adverbial.",
    "options": [
      "Before assembly we practised the song.",
      "Before assembly, we practised the song.",
      "Before, assembly we practised the song.",
      "Before assembly we, practised the song."
    ],
    "correctIndex": 1,
    "explanation": "The opening phrase Before assembly is followed by a comma.",
    "model": "Before assembly, we practised the song.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "fronted-adverbial.comma-after-opener",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_fa_choose_after_the_rain",
    "mode": "choose",
    "skillIds": [
      "fronted_adverbial"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "fronted-adverbials-core",
    "prompt": "Choose the correctly punctuated sentence.",
    "options": [
      "After the rain the playground dried quickly.",
      "After the rain, the playground dried quickly.",
      "After, the rain the playground dried quickly.",
      "After the rain the playground, dried quickly."
    ],
    "correctIndex": 1,
    "explanation": "The fronted adverbial After the rain needs a comma after it.",
    "model": "After the rain, the playground dried quickly.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "fronted-adverbial.comma-after-opener",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_fa_choose_without_warning",
    "mode": "choose",
    "skillIds": [
      "fronted_adverbial"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "fronted-adverbials-core",
    "prompt": "Choose the sentence with the correct comma.",
    "options": [
      "Without warning the alarm rang.",
      "Without warning, the alarm rang.",
      "Without, warning the alarm rang.",
      "Without warning the alarm, rang."
    ],
    "correctIndex": 1,
    "explanation": "The comma shows where the opening phrase ends.",
    "model": "Without warning, the alarm rang.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "fronted-adverbial.comma-after-opener",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_fa_choose_in_the_distance",
    "mode": "choose",
    "skillIds": [
      "fronted_adverbial"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "fronted-adverbials-core",
    "prompt": "Choose the sentence with correct fronted adverbial punctuation.",
    "options": [
      "In the distance a dog barked.",
      "In the distance, a dog barked.",
      "In, the distance a dog barked.",
      "In the distance a dog, barked."
    ],
    "correctIndex": 1,
    "explanation": "In the distance is a fronted adverbial and needs a comma after it.",
    "model": "In the distance, a dog barked.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "fronted-adverbial.comma-after-opener",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_pa_choose_mrs_ali",
    "mode": "choose",
    "skillIds": [
      "parenthesis"
    ],
    "clusterId": "structure",
    "rewardUnitId": "parenthesis-core",
    "prompt": "Choose the sentence with the parenthesis marked correctly.",
    "options": [
      "Mrs Ali our guide smiled.",
      "Mrs Ali, our guide, smiled.",
      "Mrs Ali, our guide smiled.",
      "Mrs Ali our guide, smiled."
    ],
    "correctIndex": 1,
    "explanation": "The extra information our guide is marked off with commas.",
    "model": "Mrs Ali, our guide, smiled.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "parenthesis.additional-information",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_pa_choose_bridge",
    "mode": "choose",
    "skillIds": [
      "parenthesis"
    ],
    "clusterId": "structure",
    "rewardUnitId": "parenthesis-core",
    "prompt": "Choose the sentence where extra information is bracketed correctly.",
    "options": [
      "The bridge which was old crossed the stream.",
      "The bridge, which was old, crossed the stream.",
      "The bridge, which was old crossed the stream.",
      "The bridge which was old, crossed the stream."
    ],
    "correctIndex": 1,
    "explanation": "The phrase which was old is extra information, so it is marked off on both sides.",
    "model": "The bridge, which was old, crossed the stream.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "parenthesis.additional-information",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_pa_choose_book_club",
    "mode": "choose",
    "skillIds": [
      "parenthesis"
    ],
    "clusterId": "structure",
    "rewardUnitId": "parenthesis-core",
    "prompt": "Choose the sentence with balanced parenthesis.",
    "options": [
      "The club (which met on Fridays won a prize.",
      "The club (which met on Fridays) won a prize.",
      "The club which met on Fridays) won a prize.",
      "The club, which met on Fridays won a prize."
    ],
    "correctIndex": 1,
    "explanation": "Both sides of the parenthesis need to be marked.",
    "model": "The club (which met on Fridays) won a prize.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "parenthesis.additional-information",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_pa_choose_cafe",
    "mode": "choose",
    "skillIds": [
      "parenthesis"
    ],
    "clusterId": "structure",
    "rewardUnitId": "parenthesis-core",
    "prompt": "Choose the best-punctuated sentence.",
    "options": [
      "The cafe - near the station - opened early.",
      "The cafe - near the station opened early.",
      "The cafe near the station - opened early.",
      "The cafe, near the station opened early."
    ],
    "correctIndex": 0,
    "explanation": "The dashes mark the extra information on both sides.",
    "model": "The cafe - near the station - opened early.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "parenthesis.additional-information",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_cc_choose_eat_children",
    "mode": "choose",
    "skillIds": [
      "comma_clarity"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "comma-clarity-core",
    "prompt": "Choose the sentence where the comma makes the meaning clear.",
    "options": [
      "Let's eat children.",
      "Let's eat, children.",
      "Lets eat, children.",
      "Let's, eat children."
    ],
    "correctIndex": 1,
    "explanation": "The comma shows children are being spoken to, not eaten.",
    "model": "Let's eat, children.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "comma.clarity-vocative",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_cc_choose_before_swimming",
    "mode": "choose",
    "skillIds": [
      "comma_clarity"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "comma-clarity-core",
    "prompt": "Choose the sentence with the clarifying comma.",
    "options": [
      "Before swimming children warm up.",
      "Before swimming, children warm up.",
      "Before, swimming children warm up.",
      "Before swimming children, warm up."
    ],
    "correctIndex": 1,
    "explanation": "The comma separates the opening phrase from the main clause.",
    "model": "Before swimming, children warm up.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "comma.clarity-boundary",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_cc_choose_most_of_time",
    "mode": "choose",
    "skillIds": [
      "comma_clarity"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "comma-clarity-core",
    "prompt": "Choose the sentence where the comma prevents confusion.",
    "options": [
      "Most of the time travellers enjoyed the talk.",
      "Most of the time, travellers enjoyed the talk.",
      "Most of the time travellers, enjoyed the talk.",
      "Most, of the time travellers enjoyed the talk."
    ],
    "correctIndex": 1,
    "explanation": "The comma shows that most of the time is the opening phrase.",
    "model": "Most of the time, travellers enjoyed the talk.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "comma.clarity-boundary",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_cc_choose_when_finished",
    "mode": "choose",
    "skillIds": [
      "comma_clarity"
    ],
    "clusterId": "comma_flow",
    "rewardUnitId": "comma-clarity-core",
    "prompt": "Choose the correctly punctuated sentence.",
    "options": [
      "When we finished the teacher collected the books.",
      "When we finished, the teacher collected the books.",
      "When we, finished the teacher collected the books.",
      "When we finished the teacher, collected the books."
    ],
    "correctIndex": 1,
    "explanation": "The comma shows where the opening clause ends.",
    "model": "When we finished, the teacher collected the books.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "comma.clarity-boundary",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sc_choose_moon_clouds",
    "mode": "choose",
    "skillIds": [
      "semicolon"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "semicolons-core",
    "prompt": "Choose the sentence where the semi-colon joins two related clauses.",
    "options": [
      "The moon was bright; the clouds moved away.",
      "The moon was bright, the clouds moved away.",
      "The moon was bright; and the clouds moved away.",
      "The moon; was bright the clouds moved away."
    ],
    "correctIndex": 0,
    "explanation": "Both sides can stand as sentences, and the semi-colon joins them closely.",
    "model": "The moon was bright; the clouds moved away.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "semicolon.independent-clauses",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sc_choose_team_tired",
    "mode": "choose",
    "skillIds": [
      "semicolon"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "semicolons-core",
    "prompt": "Choose the best-punctuated sentence.",
    "options": [
      "The team was tired, they kept running.",
      "The team was tired; they kept running.",
      "The team was tired; and they kept running.",
      "The team; was tired they kept running."
    ],
    "correctIndex": 1,
    "explanation": "The semi-colon joins two related independent clauses.",
    "model": "The team was tired; they kept running.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "semicolon.independent-clauses",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sc_choose_lights_dimmed",
    "mode": "choose",
    "skillIds": [
      "semicolon"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "semicolons-core",
    "prompt": "Choose the sentence with the correct boundary punctuation.",
    "options": [
      "The lights dimmed; the audience became silent.",
      "The lights dimmed, the audience became silent.",
      "The lights dimmed; and the audience became silent.",
      "The lights; dimmed the audience became silent."
    ],
    "correctIndex": 0,
    "explanation": "A semi-colon can join these two complete, related clauses.",
    "model": "The lights dimmed; the audience became silent.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "semicolon.independent-clauses",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sc_choose_path_narrow",
    "mode": "choose",
    "skillIds": [
      "semicolon"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "semicolons-core",
    "prompt": "Choose the sentence with the correct semi-colon.",
    "options": [
      "The path was narrow, the map was unclear.",
      "The path was narrow; the map was unclear.",
      "The path was narrow; and the map was unclear.",
      "The path; was narrow the map was unclear."
    ],
    "correctIndex": 1,
    "explanation": "The comma splice is fixed with a semi-colon.",
    "model": "The path was narrow; the map was unclear.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "semicolon.independent-clauses",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_dc_choose_door_opened",
    "mode": "choose",
    "skillIds": [
      "dash_clause"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "dash-clauses-core",
    "prompt": "Choose the sentence where the dash adds a dramatic pause.",
    "options": [
      "The door opened, everyone froze.",
      "The door opened – everyone froze.",
      "The door opened – and everyone froze.",
      "The door – opened everyone froze."
    ],
    "correctIndex": 1,
    "explanation": "The dash separates two clauses and creates a pause.",
    "model": "The door opened – everyone froze.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "dash.independent-clauses",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_dc_choose_signal_failed",
    "mode": "choose",
    "skillIds": [
      "dash_clause"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "dash-clauses-core",
    "prompt": "Choose the correctly punctuated sentence.",
    "options": [
      "The signal failed – the team waited.",
      "The signal failed, the team waited.",
      "The signal failed – and the team waited.",
      "The signal – failed the team waited."
    ],
    "correctIndex": 0,
    "explanation": "The dash shows the boundary between two complete clauses.",
    "model": "The signal failed – the team waited.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "dash.independent-clauses",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_dc_choose_alarm_rang",
    "mode": "choose",
    "skillIds": [
      "dash_clause"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "dash-clauses-core",
    "prompt": "Choose the sentence with the dash in the right place.",
    "options": [
      "The alarm rang everyone ran outside.",
      "The alarm rang – everyone ran outside.",
      "The alarm – rang everyone ran outside.",
      "The alarm rang – and everyone ran outside."
    ],
    "correctIndex": 1,
    "explanation": "The dash belongs between the two clauses.",
    "model": "The alarm rang – everyone ran outside.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "dash.independent-clauses",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_dc_choose_curtain_rose",
    "mode": "choose",
    "skillIds": [
      "dash_clause"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "dash-clauses-core",
    "prompt": "Choose the sentence where the dash separates the clauses.",
    "options": [
      "The curtain rose, the crowd cheered.",
      "The curtain rose – the crowd cheered.",
      "The curtain rose – and the crowd cheered.",
      "The curtain – rose the crowd cheered."
    ],
    "correctIndex": 1,
    "explanation": "The dash creates a strong pause between related clauses.",
    "model": "The curtain rose – the crowd cheered.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "dash.independent-clauses",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_hy_choose_well_known",
    "mode": "choose",
    "skillIds": [
      "hyphen"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "hyphens-core",
    "prompt": "Choose the sentence where the hyphen keeps the meaning clear.",
    "options": [
      "The well known author visited school.",
      "The well-known author visited school.",
      "The well known-author visited school.",
      "The well-known, author visited school."
    ],
    "correctIndex": 1,
    "explanation": "The hyphen in well-known makes the words work together before author.",
    "model": "The well-known author visited school.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "hyphen.compound-modifier",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_hy_choose_fast_moving",
    "mode": "choose",
    "skillIds": [
      "hyphen"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "hyphens-core",
    "prompt": "Choose the correctly hyphenated sentence.",
    "options": [
      "We watched a fast moving river.",
      "We watched a fast-moving river.",
      "We watched a fast moving-river.",
      "We watched a fast-moving, river."
    ],
    "correctIndex": 1,
    "explanation": "The hyphen in fast-moving makes the words work together before river.",
    "model": "We watched a fast-moving river.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "hyphen.compound-modifier",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_hy_choose_part_time",
    "mode": "choose",
    "skillIds": [
      "hyphen"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "hyphens-core",
    "prompt": "Choose the sentence with the compound modifier punctuated correctly.",
    "options": [
      "My brother has a part time job.",
      "My brother has a part-time job.",
      "My brother has a part time-job.",
      "My brother has a part-time, job."
    ],
    "correctIndex": 1,
    "explanation": "The hyphen in part-time makes the words work together before job.",
    "model": "My brother has a part-time job.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "hyphen.compound-modifier",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_hy_choose_little_used",
    "mode": "choose",
    "skillIds": [
      "hyphen"
    ],
    "clusterId": "boundary",
    "rewardUnitId": "hyphens-core",
    "prompt": "Choose the sentence where the hyphen avoids ambiguity.",
    "options": [
      "We opened the little used cupboard.",
      "We opened the little-used cupboard.",
      "We opened the little used-cupboard.",
      "We opened the little-used, cupboard."
    ],
    "correctIndex": 1,
    "explanation": "The hyphen in little-used makes the phrase work as one modifier.",
    "model": "We opened the little-used cupboard.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "hyphen.compound-modifier",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_cl_choose_supplies",
    "mode": "choose",
    "skillIds": [
      "colon_list"
    ],
    "clusterId": "structure",
    "rewardUnitId": "colons-core",
    "prompt": "Choose the sentence where the colon introduces the list.",
    "options": [
      "We needed three things: rope, tape and chalk.",
      "We needed three things, rope, tape and chalk.",
      "We needed three things; rope, tape and chalk.",
      "We needed: three things rope, tape and chalk."
    ],
    "correctIndex": 0,
    "explanation": "The colon comes after the complete opening clause.",
    "model": "We needed three things: rope, tape and chalk.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "colon.before-list",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_cl_choose_awards",
    "mode": "choose",
    "skillIds": [
      "colon_list"
    ],
    "clusterId": "structure",
    "rewardUnitId": "colons-core",
    "prompt": "Choose the best-punctuated list introduction.",
    "options": [
      "The team won three awards: gold, silver and bronze.",
      "The team won three awards, gold, silver and bronze.",
      "The team won three awards; gold, silver and bronze.",
      "The team won: three awards gold, silver and bronze."
    ],
    "correctIndex": 0,
    "explanation": "The colon introduces the list of awards.",
    "model": "The team won three awards: gold, silver and bronze.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "colon.before-list",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_cl_choose_toolkit",
    "mode": "choose",
    "skillIds": [
      "colon_list"
    ],
    "clusterId": "structure",
    "rewardUnitId": "colons-core",
    "prompt": "Choose the sentence with the colon in the right place.",
    "options": [
      "Our toolkit contained three items: pliers, tape and string.",
      "Our toolkit contained three items, pliers, tape and string.",
      "Our toolkit contained: three items pliers, tape and string.",
      "Our toolkit contained three items; pliers, tape and string."
    ],
    "correctIndex": 0,
    "explanation": "The colon follows the complete opening clause before the list.",
    "model": "Our toolkit contained three items: pliers, tape and string.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "colon.before-list",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_cl_choose_camp",
    "mode": "choose",
    "skillIds": [
      "colon_list"
    ],
    "clusterId": "structure",
    "rewardUnitId": "colons-core",
    "prompt": "Choose the correctly punctuated list.",
    "options": [
      "For camp, we packed: boots, coats and torches.",
      "For camp, we packed boots, coats and torches:",
      "For camp, we packed boots, coats and torches.",
      "For camp, we packed; boots, coats and torches."
    ],
    "correctIndex": 0,
    "explanation": "The colon introduces the items being packed.",
    "model": "For camp, we packed: boots, coats and torches.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "colon.before-list",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sl_choose_places",
    "mode": "choose",
    "skillIds": [
      "semicolon_list"
    ],
    "clusterId": "structure",
    "rewardUnitId": "semicolon-lists-core",
    "prompt": "Choose the sentence that separates complex list items correctly.",
    "options": [
      "We visited York, England; Cardiff, Wales; and Perth, Scotland.",
      "We visited York, England, Cardiff, Wales, and Perth, Scotland.",
      "We visited York; England, Cardiff; Wales, and Perth; Scotland.",
      "We visited York, England; Cardiff, Wales and Perth, Scotland;"
    ],
    "correctIndex": 0,
    "explanation": "Semi-colons separate list items that already contain commas.",
    "model": "We visited York, England; Cardiff, Wales; and Perth, Scotland.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "semicolon.list-complex-items",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sl_choose_roles",
    "mode": "choose",
    "skillIds": [
      "semicolon_list"
    ],
    "clusterId": "structure",
    "rewardUnitId": "semicolon-lists-core",
    "prompt": "Choose the sentence with semi-colons in the list.",
    "options": [
      "The helpers were Maya, first aid; Ben, equipment; and Jo, maps.",
      "The helpers were Maya, first aid, Ben, equipment, and Jo, maps.",
      "The helpers were Maya; first aid, Ben; equipment, and Jo; maps.",
      "The helpers were Maya, first aid; Ben, equipment and Jo, maps;"
    ],
    "correctIndex": 0,
    "explanation": "Each helper-role pair contains a comma, so semi-colons separate the pairs.",
    "model": "The helpers were Maya, first aid; Ben, equipment; and Jo, maps.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "semicolon.list-complex-items",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sl_choose_clubs",
    "mode": "choose",
    "skillIds": [
      "semicolon_list"
    ],
    "clusterId": "structure",
    "rewardUnitId": "semicolon-lists-core",
    "prompt": "Choose the complex list punctuated correctly.",
    "options": [
      "The clubs met in Leeds, Monday; Bristol, Tuesday; and Derby, Friday.",
      "The clubs met in Leeds, Monday, Bristol, Tuesday, and Derby, Friday.",
      "The clubs met in Leeds; Monday, Bristol; Tuesday, and Derby; Friday.",
      "The clubs met in Leeds, Monday; Bristol, Tuesday and Derby, Friday;"
    ],
    "correctIndex": 0,
    "explanation": "Semi-colons make the complex list easier to read.",
    "model": "The clubs met in Leeds, Monday; Bristol, Tuesday; and Derby, Friday.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "semicolon.list-complex-items",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_sl_choose_captains",
    "mode": "choose",
    "skillIds": [
      "semicolon_list"
    ],
    "clusterId": "structure",
    "rewardUnitId": "semicolon-lists-core",
    "prompt": "Choose the sentence with the clearest list punctuation.",
    "options": [
      "Our captains were Sam, Year 5; Aisha, Year 6; and Leo, Year 4.",
      "Our captains were Sam, Year 5, Aisha, Year 6, and Leo, Year 4.",
      "Our captains were Sam; Year 5, Aisha; Year 6, and Leo; Year 4.",
      "Our captains were Sam, Year 5; Aisha, Year 6 and Leo, Year 4;"
    ],
    "correctIndex": 0,
    "explanation": "The semi-colons separate the captain-year pairs.",
    "model": "Our captains were Sam, Year 5; Aisha, Year 6; and Leo, Year 4.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "semicolon.list-complex-items",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_bp_choose_parallel",
    "mode": "choose",
    "skillIds": [
      "bullet_points"
    ],
    "clusterId": "structure",
    "rewardUnitId": "bullet-points-core",
    "prompt": "Choose the set where every bullet starts in the same grammatical pattern.",
    "options": [
      "- bring a coat\n- packed your lunch\n- walking quietly",
      "- bring a coat\n- bring your lunch\n- bring a notebook",
      "- a coat\n- bring your lunch\n- quietly walking",
      "- bring a coat;\n- bring your lunch;\n- bring a notebook,"
    ],
    "correctIndex": 1,
    "explanation": "Each bullet begins with the same command pattern: bring.",
    "model": "- bring a coat\n- bring your lunch\n- bring a notebook",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "bullet.parallel-list",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_bp_choose_capitals",
    "mode": "choose",
    "skillIds": [
      "bullet_points"
    ],
    "clusterId": "structure",
    "rewardUnitId": "bullet-points-core",
    "prompt": "Choose the bullet list with consistent punctuation.",
    "options": [
      "- Pack your bag.\n- Check your shoes.\n- Close the door.",
      "- Pack your bag\n- check your shoes.\n- Close the door",
      "- Pack your bag,\n- Check your shoes.\n- Close the door",
      "Pack your bag.\nCheck your shoes.\nClose the door."
    ],
    "correctIndex": 0,
    "explanation": "The bullets use consistent sentence-style capital letters and full stops.",
    "model": "- Pack your bag.\n- Check your shoes.\n- Close the door.",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "bullet.consistent-punctuation",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_bp_choose_notes",
    "mode": "choose",
    "skillIds": [
      "bullet_points"
    ],
    "clusterId": "structure",
    "rewardUnitId": "bullet-points-core",
    "prompt": "Choose the clearest bullet list.",
    "options": [
      "Remember to:\n- bring water\n- wear trainers\n- arrive early",
      "Remember to:\nbring water\nwear trainers\narrive early",
      "Remember to\n- bring water,\n- wear trainers.\n- arrive early?",
      "Remember to:\n- bring water.\n- wear trainers,\n- arrive early;"
    ],
    "correctIndex": 0,
    "explanation": "The colon introduces the bullet list, and the bullets are consistent.",
    "model": "Remember to:\n- bring water\n- wear trainers\n- arrive early",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "bullet.parallel-list",
    "source": "fixed"
  }),
  Object.freeze({
    "id": "fx_bp_choose_actions",
    "mode": "choose",
    "skillIds": [
      "bullet_points"
    ],
    "clusterId": "structure",
    "rewardUnitId": "bullet-points-core",
    "prompt": "Choose the bullet list where the items match in style.",
    "options": [
      "- checked the map\n- packed the rope\n- checking the compass",
      "- check the map\n- pack the rope\n- test the compass",
      "- check the map;\n- packed the rope\n- testing the compass",
      "- the map\n- pack the rope\n- test the compass"
    ],
    "correctIndex": 1,
    "explanation": "Each bullet starts with an imperative verb.",
    "model": "- check the map\n- pack the rope\n- test the compass",
    "misconceptionTags": [
      "manual.choice_distractor",
      "manual.variety_expansion"
    ],
    "readiness": [
      "retrieve_discriminate",
      "misconception",
      "negative_test"
    ],
    "explanationRuleId": "bullet.parallel-list",
    "source": "fixed"
  }),
]);

export const PUNCTUATION_FIXED_EXPANSION_ITEM_COUNT = PUNCTUATION_FIXED_EXPANSION_ITEMS.length;
