# Punctuation P14 — Reviewer answer-surface samples

Release: `punctuation-qg-p14-3564-2026-05-04`
Generated from the live runtime manifest (no hand-crafted prose). Six items per surface mode plus six guided-skill flow snapshots, drawn deterministically from the post-expansion pool.

Runtime mode counts (post-P14):

| mode      | items |
| :-------- | ----: |
| choose    |   740 |
| insert    |   720 |
| fix       |   717 |
| transfer  |   276 |
| combine   |   606 |
| paragraph |   505 |

## Surface-mode samples

### choose (multi-choice)

1. `se_choose_exclaim` — *Choose the best punctuated sentence.* → **What a fantastic goal!**
2. `fx12_list_commas_022` — *Choose the sentence with commas used correctly in the list.* → **The book corner had badges, stickers and certificates.**
3. `fx12_comma_clarity_015` — *Choose the comma placement that makes the sentence clear.* → **Beside the display, the guides shared the tools.**
4. `fx12_colon_list_008` — *Choose the sentence that uses a colon correctly before the list.* → **The forest path needed three things: nets, buckets and spades.**
5. `gen_sentence_endings_choose_8cxebx_53` — *Choose the correctly punctuated sentence.* → stem `Choose the best ending for: what a useful invention` → **What a useful invention!**
6. `gen_apostrophe_possession_choose_1mef91w_76` — *Choose the sentence with the correct possessive apostrophe.* → stem `The shells belong to more than one coding leader.` → **The coding leaders' shells were ready in the secret garden.**

### insert (add the missing punctuation)

1. `se_insert_question` — stem `why was the hall still locked` → **Why was the hall still locked?**
2. `gen_apostrophe_possession_insert_pnjfvs_1` — stem `The farm monitors badges were checked beside the playground.` → **The farm monitors' badges were checked beside the playground.**
3. `gen_speech_insert_y31c74_21` — stem `Eva asked, where is the missing ticket?` → **Eva asked, "Where is the missing ticket?"**
4. `gen_list_commas_insert_zn9gmx_41` — stem `The museum tray held raincoats first-aid kits and test tubes.` → **The museum tray held raincoats, first-aid kits and test tubes.**
5. `gen_comma_clarity_insert_ckpyli_61` — stem `During the rehearsal beside the ticket desk the crew tightened the loose rope.` → **During the rehearsal beside the ticket desk, the crew tightened the loose rope.**
6. `gen_hyphen_insert_1f4daa0_81` — stem `The school wide room needed careful repairs in the media suite.` → **The school-wide room needed careful repairs in the media suite.**

### fix (correct the wrong punctuation)

1. `se_fix_statement` — stem `do not forget your reading journal?` → **Do not forget your reading journal.**
2. `gen_fronted_adverbial_fix_k05865_3` — stem `During the storm Maya found the missing badge.` → **During the storm, Maya found the missing badge.**
3. `gen_semicolon_fix_1vt85kq_22` — stem `The music stand worked better than expected, the robotics club team protected the equipment.` → **The music stand worked better than expected; the robotics club team protected the equipment.**
4. `gen_dash_clause_fix_1w1rhjc_41` — stem `The rucksack worked better than expected the mountain lodge team stood near the entrance.` → **The rucksack worked better than expected – the mountain lodge team stood near the entrance.**
5. `gen_parenthesis_fix_1j6mu9q_60` — stem `The outdoor classroom project which used the lunch tray made everyone smile.` → **The outdoor classroom project, which used the lunch tray, made everyone smile.**
6. `gen_semicolon_list_fix_14bkvh_79` — stem `The helpers were Keira, ranger, nature team, Elena, mapper, geography club and Iris, presenter, assembly team.` → **The helpers were Keira, ranger, nature team; Elena, mapper, geography club; and Iris, presenter, assembly team.**

### transfer (write your own complete sentence)

1. `se_transfer_why` — *Write one question that begins with 'Why' and ends correctly.* → model **Why was the gate still open?**
2. `gen_list_commas_transfer_18isan9_5` — *Write a sentence beginning 'On the menu were' listing three dishes.* → model **On the menu were soup, pasta and salad.**
3. `gen_apostrophe_possession_transfer_cebzf7_15` — *Write a sentence about several boys using 'boys''.* → model **The boys' kit was waiting by the lockers.**
4. `gen_parenthesis_transfer_95e1u0_7` — *Insert 'over a thousand years old' as parenthesis after 'The cathedral'.* → model **The cathedral, over a thousand years old, sits beside the river.**
5. `gen_colon_list_transfer_w0ttl1_17` — *Write a sentence introducing three courses with a colon.* → model **The chef prepared three courses: soup, pasta and tart.**
6. `gen_semicolon_list_transfer_1ocymhs_9` — *Write a sentence listing three exotic fruits with descriptions.* → model **The platter offered mango, ripe and golden; kiwi, sharp and green; and lychee, pale and sweet.**

> Token-only fragments (e.g. `"yes"`, `"ok then"`) are now rejected at the marker via the P14 `transfer.fragment_only` guard. Short complete answers like `"Stop!"` still pass.

### combine (join the notes into one sentence)

1. `lc_combine_trip_list` — stem `We packed\n- torches\n- maps\n- water` → **We packed torches, maps and water.**
2. `gen_list_commas_combine_19ffr87_96` — stem `The football pitch kit contained\n- noticeboards\n- badges\n- tablet chargers` → **The football pitch kit contained noticeboards, badges and tablet chargers.**
3. `gen_fronted_adverbial_combine_1nnk1b8_97` — stem `Before the telescope turned near rowing shed\nThe class wrote careful notes.` → **Before the telescope turned near rowing shed, the class wrote careful notes.**
4. `gen_semicolon_combine_ioag49_98` — stem `The map started the discussion.\nThe story corner team stayed open all day.` → **The map started the discussion; the story corner team stayed open all day.**
5. `gen_dash_clause_combine_1esox8z_99` — stem `The kitchen signal changed.\nEvery river helpers checked the net.` → **The kitchen signal changed – every river helpers checked the net.**
6. `gen_parenthesis_combine_c46d9k_100` — stem `The choir room display welcomed the team.\nExtra detail: a collection of rucksacks.` → **The choir room display, a collection of rucksacks, welcomed the team.**

### paragraph (repair the short passage)

1. `pg_fronted_speech` — stem `After lunch Mia asked can we start now` → **After lunch, Mia asked, "Can we start now?"**
2. `gen_apostrophe_mix_paragraph_d9yjmz_80` — stem `They didnt forget the nature helpers treasure clues. The box was beside the eco hut.` → **They didn't forget the nature helpers' treasure clues. The box was beside the eco hut.**
3. `gen_fronted_speech_paragraph_119inif_64` — stem `After the clay cooled Noah asked why did the bus turn round?` → **After the clay cooled, Noah asked, "Why did the bus turn round?"**
4. `gen_colon_semicolon_paragraph_143ms8x_48` — stem `The rowing shed team needed three things, a maze clue, a raincoat and a drama mask. The choir book made everyone smile, the staff garden team helped the class.` → **The rowing shed team needed three things: a maze clue, a raincoat and a drama mask. The choir book made everyone smile; the staff garden team helped the class.**
5. `gen_parenthesis_speech_paragraph_c6xbra_32` — stem `The weather station room which stored the stage curtain made the task easier. Maisie asked can we test the bridge?` → **The weather station room, which stored the stage curtain, made the task easier. Maisie asked, "Can we test the bridge?"**
6. `gen_bullet_points_paragraph_8fdzoj_16` — stem `Science lab jobs\n- carry the reading log\n- clean the bookmark.\n- return the seed packet` → **Science lab jobs:\n- carry the reading log\n- clean the bookmark\n- return the seed packet**

> The P14 paragraph marker now enforces sentence-boundary preservation (`countProseSentenceBoundaries`). Any answer that drops a `.!?` boundary present in the model is rejected with the `paragraph.sentence_boundary_missing` misconception tag.

## Skill-detail flow snapshots (guided mode, roundLength = 4)

Each flow is the exact sequence of items the scheduler surfaces when the learner enters the skill-detail panel for that cluster.

### sentence_endings

1. choose `fx12_sentence_endings_006` — *Choose the correctly punctuated question.* → **Who moved the badge from the football pitch?**
2. choose `se_choose_exclaim` — *Choose the best punctuated sentence.* → **What a fantastic goal!**
3. insert `se_insert_question` — stem `why was the hall still locked` → **Why was the hall still locked?**
4. choose `fx12_sentence_endings_001` — *Choose the correctly punctuated question.* → **Where did the lantern land near the library?**

### list_commas

1. choose `fx12_list_commas_021` — *Choose the sentence with commas used correctly in the list.* → **The railway platform had beakers, magnets and weather chart.**
2. choose `lc_choose_picnic` — *Choose the best punctuated sentence.* → **We packed torches, maps and water.**
3. fix `lc_fix_display` — stem `The display showed shells pebbles, and fossils.` → **The display showed shells, pebbles and fossils.**
4. choose `fx12_list_commas_007` — *Choose the sentence with commas used correctly in the list.* → **The harbour had badges, stickers and certificates.**

### apostrophe_contractions

1. choose `fx12_apostrophe_contractions_006` — *Choose the sentence with contractions punctuated correctly.* → **He's bringing the spare batteries.**
2. choose `ac_choose_contractions` — *Choose the best punctuated sentence.* → **She didn't know we'd already left.**
3. fix `gen_apostrophe_contractions_fix_rg1yu0_2` — stem `I cant move the lantern to the library.` → **I can't move the lantern to the library.**
4. choose `fx12_apostrophe_contractions_016` — *Choose the sentence with contractions punctuated correctly.* → **We aren't ready for the rehearsal.**

### speech

1. choose `fx12_speech_021` — *Choose the correctly punctuated direct speech.* → **Mila asked, "Did the puppy escape?"**
2. insert `sp_insert_question` — stem `Ella asked can we start now` → **Ella asked, "Can we start now?"**
3. choose `fx12_speech_001` — *Choose the correctly punctuated direct speech.* → **Ava asked, "Can we start the experiment?"**
4. choose `fx12_speech_008` — *Choose the correctly punctuated direct speech.* → **Omar asked, "Why is the robot beeping?"**

### colon_list

1. choose `fx12_colon_list_025` — *Choose the sentence that uses a colon correctly before the list.* → **The kitchen needed three things: seeds, labels and water bottle.**
2. choose `cl_choose_supplies` — *Choose the sentence where the colon introduces the list correctly.* → **We needed three things: a torch, a map and a whistle.**
3. fix `cl_fix_camp` — stem `We packed three things, tents, food and torches.` → **We packed three things: tents, food and torches.**
4. choose `fx12_colon_list_011` — *Choose the sentence that uses a colon correctly before the list.* → **The garden needed three things: tickets, programmes and wristbands.**

### parenthesis

1. choose `fx12_parenthesis_018` — *Choose the sentence with the parenthesis marked correctly.* → **The theatre, where the play begins, filled with music.**
2. choose `pa_choose_coach` — *Choose the sentence where the parenthesis is marked correctly.* → **Mr Patel, our coach, arrived early.**
3. fix `pa_fix_author` — stem `The author, who won the prize smiled.` → **The author, who won the prize, smiled.**
4. choose `fx12_parenthesis_012` — *Choose the sentence with the parenthesis marked correctly.* → **The harbour, a busy port, smelled of salt.**

> Skill-detail roundLength stays at `'4'` per the Phase D star-pacing decision (always-correct profile reaches Secure within an acceptable session count at both 4 and 6; pacing is not inflated). See `punctuation-p14-star-pacing-simulation.json` for the per-profile breakdown.
