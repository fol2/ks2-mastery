// Deterministic next-stage Reading expansion. This file is intentionally
// Worker/shared-content only: it contains answer keys and marking checks, so it
// must not be imported from browser-safe metadata modules.

const FICTION_SPECS = [
  {
    "id": "harbour_signal",
    "title": "The Harbour Signal",
    "name": "Eli",
    "place": "the harbour steps",
    "object": "a brass whistle",
    "challenge": "a torn signal flag",
    "clue": "the tide board had been turned backwards",
    "helper": "Old Mina",
    "advice": "check the quiet clue before chasing the loud one",
    "image": "the gulls stitched white loops over the water",
    "evidence": "the green lamp blinked twice from the pier",
    "outcome": "Eli marked the true landing place before the supply boat arrived",
    "start": "uncertain",
    "end": "steady"
  },
  {
    "id": "clockmaker_roof",
    "title": "The Clockmaker's Roof",
    "name": "Rosa",
    "place": "the clock tower roof",
    "object": "a leather tool roll",
    "challenge": "a missing minute hand",
    "clue": "a scratch beside the service hatch",
    "helper": "Mr Vale",
    "advice": "old machines leave small honest signs",
    "image": "the city roofs folded into one grey sea",
    "evidence": "the smallest cog clicked back into place",
    "outcome": "Rosa restored the clock before noon struck",
    "start": "anxious",
    "end": "proud"
  },
  {
    "id": "orchard_gate",
    "title": "The Orchard Gate",
    "name": "Maya",
    "place": "the frosty orchard",
    "object": "a blue notebook",
    "challenge": "a gate that would not open",
    "clue": "the latch was tied with red wool",
    "helper": "Grandma Tess",
    "advice": "trees remember hands that care for them",
    "image": "the branches held the sunrise like warm glass",
    "evidence": "the first robin landed on the repaired gate",
    "outcome": "Maya found the key hidden in the beehive box",
    "start": "impatient",
    "end": "thoughtful"
  },
  {
    "id": "canal_moon",
    "title": "Canal Under the Moon",
    "name": "Noah",
    "place": "the canal towpath",
    "object": "a paper lantern",
    "challenge": "a drifting rowing boat",
    "clue": "fresh mud showed one narrow boot print",
    "helper": "Aunt Safa",
    "advice": "follow what the water carries back",
    "image": "the moon laid a silver road along the canal",
    "evidence": "the rope knocked softly against the old ring",
    "outcome": "Noah secured the boat before it reached the lock",
    "start": "worried",
    "end": "relieved"
  },
  {
    "id": "mural_morning",
    "title": "Mural Morning",
    "name": "Iris",
    "place": "the estate wall",
    "object": "a tin of yellow paint",
    "challenge": "a missing corner of the mural",
    "clue": "a line of pencil dots climbed behind the drainpipe",
    "helper": "Mr Obi",
    "advice": "every picture begins with a patient mark",
    "image": "the wall woke slowly under the colour",
    "evidence": "the painted sunflower faced the playground again",
    "outcome": "Iris repaired the mural without covering the older names",
    "start": "nervous",
    "end": "confident"
  },
  {
    "id": "station_bench",
    "title": "The Station Bench",
    "name": "Theo",
    "place": "platform four",
    "object": "a folded timetable",
    "challenge": "a lost violin case",
    "clue": "one sticker showed the village music hall",
    "helper": "Mrs Kaur",
    "advice": "people leave routes in the things they forget",
    "image": "the rails hummed like a faraway bee",
    "evidence": "the case label matched the concert poster",
    "outcome": "Theo returned the violin before the evening train",
    "start": "curious",
    "end": "useful"
  },
  {
    "id": "snow_library",
    "title": "Snow at the Library",
    "name": "Hana",
    "place": "the closed library porch",
    "object": "a canvas book bag",
    "challenge": "a box of returned books left in snow",
    "clue": "a receipt fluttered from the top book",
    "helper": "Mr Reed",
    "advice": "books tell you where they have travelled",
    "image": "the snow hushed the street into a white page",
    "evidence": "the library light came on behind the frosted glass",
    "outcome": "Hana saved the books from the wet steps",
    "start": "startled",
    "end": "determined"
  },
  {
    "id": "kite_hill",
    "title": "The Kite on Hilltop Field",
    "name": "Ben",
    "place": "Hilltop Field",
    "object": "a spool of red string",
    "challenge": "a kite tangled on the weather vane",
    "clue": "a scrap of ribbon pointed towards the sheep gate",
    "helper": "Lena",
    "advice": "wind has habits if you watch it",
    "image": "the grass ran in waves under the gusts",
    "evidence": "the kite dipped once and rose cleanly",
    "outcome": "Ben freed the kite and learned to wait for the wind",
    "start": "frustrated",
    "end": "patient"
  },
  {
    "id": "theatre_trapdoor",
    "title": "The Theatre Trapdoor",
    "name": "Amara",
    "place": "the old theatre stage",
    "object": "a torch with weak batteries",
    "challenge": "a jammed trapdoor",
    "clue": "chalk arrows curved beneath the dust",
    "helper": "Uncle Jay",
    "advice": "stages hide answers in plain sight",
    "image": "the curtains breathed like sleeping giants",
    "evidence": "the brass handle turned after the final arrow",
    "outcome": "Amara opened the trapdoor and found the missing props",
    "start": "excited",
    "end": "careful"
  },
  {
    "id": "river_notebook",
    "title": "The River Notebook",
    "name": "Sam",
    "place": "the river bank",
    "object": "a waterproof notebook",
    "challenge": "a sudden rise in the water",
    "clue": "leaves were caught high on the fence wire",
    "helper": "Dr Lin",
    "advice": "rivers explain themselves in small leftovers",
    "image": "the brown water shouldered past the stones",
    "evidence": "the notebook page stayed dry inside its oilskin cover",
    "outcome": "Sam warned the rowing club before the landing flooded",
    "start": "unsure",
    "end": "alert"
  },
  {
    "id": "market_puzzle",
    "title": "Market Day Puzzle",
    "name": "Zara",
    "place": "the covered market",
    "object": "a basket of apples",
    "challenge": "a stall sign turned the wrong way",
    "clue": "a trail of flour crossed the blue tiles",
    "helper": "Mr Pinto",
    "advice": "busy places still have quiet patterns",
    "image": "the market roof rang with morning voices",
    "evidence": "the flour stopped at the baker's empty crate",
    "outcome": "Zara helped return the mixed-up deliveries",
    "start": "overwhelmed",
    "end": "clear-headed"
  },
  {
    "id": "bird_hide_wait",
    "title": "Waiting in the Bird Hide",
    "name": "Caleb",
    "place": "the reed-bed hide",
    "object": "a pair of binoculars",
    "challenge": "a rare bird that would not appear",
    "clue": "a broken reed showed where something had landed",
    "helper": "Auntie Mo",
    "advice": "waiting is also a way of looking",
    "image": "the reeds whispered in one long green breath",
    "evidence": "the kingfisher flashed like a dropped jewel",
    "outcome": "Caleb saw the bird because he stayed still",
    "start": "restless",
    "end": "amazed"
  },
  {
    "id": "compass_drawer",
    "title": "Compass in the Drawer",
    "name": "Luca",
    "place": "the map room",
    "object": "a dented compass",
    "challenge": "a route marked with no destination",
    "clue": "the needle settled towards the old quarry",
    "helper": "Ms Finch",
    "advice": "maps ask questions before they answer them",
    "image": "dust rose in soft golden ropes",
    "evidence": "the compass shadow crossed the quarry symbol",
    "outcome": "Luca found the survey marker everyone had missed",
    "start": "puzzled",
    "end": "focused"
  },
  {
    "id": "festival_lanterns",
    "title": "Festival Lanterns",
    "name": "Sofia",
    "place": "the riverside square",
    "object": "a box of paper stars",
    "challenge": "a string of lanterns that would not light",
    "clue": "one wire had been tucked under the stage board",
    "helper": "Grandad Noor",
    "advice": "light travels best when its path is clear",
    "image": "the lanterns waited like folded birds",
    "evidence": "the first star-lantern glowed above the water",
    "outcome": "Sofia fixed the lantern string before the procession",
    "start": "embarrassed",
    "end": "brave"
  },
  {
    "id": "mountain_hut",
    "title": "The Mountain Hut Logbook",
    "name": "Jude",
    "place": "the mountain hut",
    "object": "a pencil stub",
    "challenge": "a visitor logbook with one page torn out",
    "clue": "wet ash lay beside the cold stove",
    "helper": "Ranger Beth",
    "advice": "a shelter tells the truth if you read it gently",
    "image": "cloud shadows climbed the slope like slow animals",
    "evidence": "the torn page had left fibres along the ring binder",
    "outcome": "Jude helped identify who had sheltered there overnight",
    "start": "uneasy",
    "end": "resourceful"
  },
  {
    "id": "foggy_causeway",
    "title": "Across the Foggy Causeway",
    "name": "Nell",
    "place": "the stone causeway",
    "object": "a yellow raincoat",
    "challenge": "a path hidden by sea fog",
    "clue": "the marker posts rang faintly in the wind",
    "helper": "Dad",
    "advice": "trust the markers when you cannot trust the view",
    "image": "the fog wrapped the rocks in pale wool",
    "evidence": "the last bell-post answered with a soft chime",
    "outcome": "Nell crossed safely by counting the bell-posts",
    "start": "afraid",
    "end": "calm"
  },
  {
    "id": "school_newsroom",
    "title": "The School Newsroom",
    "name": "Aisha",
    "place": "the school newsroom",
    "object": "a recorder",
    "challenge": "a missing headline board",
    "clue": "a pressed flower slipped from the notices",
    "helper": "Mr Bell",
    "advice": "good reporters notice what does not fit",
    "image": "the computers blinked like patient eyes",
    "evidence": "the flower matched the gardening club display",
    "outcome": "Aisha found the story hidden behind the missing headline",
    "start": "rushed",
    "end": "observant"
  },
  {
    "id": "clay_dragon",
    "title": "The Clay Dragon",
    "name": "Tom",
    "place": "the pottery shed",
    "object": "a damp cloth",
    "challenge": "a cracked clay dragon",
    "clue": "a thumbprint curved under one wing",
    "helper": "Mrs Alvarez",
    "advice": "repairs should show care, not panic",
    "image": "the shelves smelled of rain and warm clay",
    "evidence": "the wing settled back without losing its shape",
    "outcome": "Tom repaired the dragon before the exhibition opened",
    "start": "guilty",
    "end": "careful"
  },
  {
    "id": "lighthouse_radio",
    "title": "The Lighthouse Radio",
    "name": "Marnie",
    "place": "the lighthouse stairwell",
    "object": "a coil of cable",
    "challenge": "a radio that only hissed",
    "clue": "salt crystals glittered around the plug",
    "helper": "Keeper Rowan",
    "advice": "the sea leaves clues even indoors",
    "image": "the beam swept the wall like a slow white brush",
    "evidence": "the cleaned plug sparked into a clear voice",
    "outcome": "Marnie restored the radio before the fog thickened",
    "start": "tense",
    "end": "capable"
  },
  {
    "id": "rooftop_telescope",
    "title": "Rooftop Telescope",
    "name": "Owen",
    "place": "the rooftop observatory",
    "object": "a star chart",
    "challenge": "a telescope pointing at a blank sky",
    "clue": "one screw was warmer than the others",
    "helper": "Professor Iqbal",
    "advice": "instruments remember the last hand that touched them",
    "image": "the city lights trembled below like coins",
    "evidence": "the lens turned and caught Saturn's ring",
    "outcome": "Owen realigned the telescope for the younger pupils",
    "start": "disappointed",
    "end": "wonderstruck"
  },
  {
    "id": "allotment_bell",
    "title": "The Allotment Bell",
    "name": "Priya",
    "place": "the allotment lane",
    "object": "a seed tray",
    "challenge": "a bell that rang at the wrong time",
    "clue": "muddy pawprints crossed the onion bed",
    "helper": "Mrs Hughes",
    "advice": "gardens have visitors before gardeners arrive",
    "image": "the bean canes clicked softly together",
    "evidence": "the bell rope had snagged on a fox's fur",
    "outcome": "Priya solved the mystery and protected the seedlings",
    "start": "annoyed",
    "end": "amused"
  },
  {
    "id": "winter_bus_stop",
    "title": "Winter Bus Stop",
    "name": "Miles",
    "place": "the hill bus stop",
    "object": "a thermos flask",
    "challenge": "a bus that seemed to vanish",
    "clue": "fresh tyre marks ended before the bend",
    "helper": "Nana Grace",
    "advice": "snow hides noise but not direction",
    "image": "the road shone like a sheet of tin",
    "evidence": "the timetable note explained the diverted route",
    "outcome": "Miles guided the waiting passengers to the safe stop",
    "start": "lonely",
    "end": "helpful"
  },
  {
    "id": "forgotten_recipe",
    "title": "The Forgotten Recipe",
    "name": "Leila",
    "place": "the community kitchen",
    "object": "a wooden spoon",
    "challenge": "a recipe with the middle line missing",
    "clue": "cinnamon dust marked the page fold",
    "helper": "Aunt Robin",
    "advice": "families remember through repeated hands",
    "image": "steam clouded the windows with silver breath",
    "evidence": "the spice tin held the missing line on its label",
    "outcome": "Leila finished the soup for the winter meal",
    "start": "worried",
    "end": "connected"
  },
  {
    "id": "chess_clock",
    "title": "The Chess Clock",
    "name": "Fin",
    "place": "the chess club room",
    "object": "a black chess clock",
    "challenge": "a final move no one understood",
    "clue": "one knight had a green felt mark",
    "helper": "Coach Mira",
    "advice": "a game records choices even after players leave",
    "image": "the room held its breath between two ticks",
    "evidence": "the marked knight explained the winning move",
    "outcome": "Fin saw the plan hidden in the old match",
    "start": "confused",
    "end": "impressed"
  },
  {
    "id": "underpass_violin",
    "title": "Violin in the Underpass",
    "name": "Nico",
    "place": "the tiled underpass",
    "object": "a phone light",
    "challenge": "music coming from an empty corner",
    "clue": "a rosin smudge shone on the bench",
    "helper": "Mrs Dane",
    "advice": "sound can point as clearly as a sign",
    "image": "the tiles sent the notes back like rain",
    "evidence": "the open case had slipped behind the poster frame",
    "outcome": "Nico found the busker's lost violin bow",
    "start": "uneasy",
    "end": "kind"
  },
  {
    "id": "sea_glass_shop",
    "title": "The Sea-Glass Shop",
    "name": "Poppy",
    "place": "the small seafront shop",
    "object": "a jar of green glass",
    "challenge": "a display that had been rearranged",
    "clue": "one wet pebble lay under the counter",
    "helper": "Mr Ellis",
    "advice": "the sea sends back what people overlook",
    "image": "the glass pieces glowed like bottled summer",
    "evidence": "the pebble matched the cracked harbour step",
    "outcome": "Poppy discovered how the window had blown open",
    "start": "suspicious",
    "end": "satisfied"
  },
  {
    "id": "final_relay",
    "title": "The Final Relay",
    "name": "Kai",
    "place": "the school track",
    "object": "a blue baton",
    "challenge": "a relay practice that kept going wrong",
    "clue": "chalk dust marked the inside lane",
    "helper": "Coach Nessa",
    "advice": "speed is wasted if the handover is careless",
    "image": "the track curved like a red ribbon",
    "evidence": "the baton clicked neatly into the next hand",
    "outcome": "Kai fixed the team's handover before sports day",
    "start": "angry",
    "end": "composed"
  },
  {
    "id": "hidden_courtyard",
    "title": "The Hidden Courtyard",
    "name": "Mila",
    "place": "the museum courtyard",
    "object": "a visitor badge",
    "challenge": "a door no visitor could open",
    "clue": "ivy had been freshly cut beside the frame",
    "helper": "Mr Stone",
    "advice": "old buildings prefer patient questions",
    "image": "sunlight pooled quietly on the worn bricks",
    "evidence": "the badge number matched the caretaker's key list",
    "outcome": "Mila found the courtyard prepared for the school tour",
    "start": "excluded",
    "end": "included"
  }
];

const NON_FICTION_SPECS = [
  {
    "id": "urban_fox_paths",
    "title": "Urban Fox Paths",
    "topic": "urban fox routes",
    "main": "foxes use alleyways, railway edges and quiet gardens as linked corridors",
    "vocabWord": "corridor",
    "vocabMeaning": "a safe route that connects separate places",
    "problem": "bright security lights can break the route and make hunting harder",
    "solution": "planting hedge gaps and leaving calm corners can help foxes pass without conflict",
    "evidence": "Foxes often repeat the same quiet route for weeks.",
    "image": "the route is a living map through the town",
    "features": "quiet corridors, hedge gaps, repeated scent marks"
  },
  {
    "id": "rain_garden_power",
    "title": "How Rain Gardens Slow Floods",
    "topic": "rain gardens",
    "main": "shallow planted dips hold storm water so drains are not overwhelmed at once",
    "vocabWord": "absorbs",
    "vocabMeaning": "soaks in and holds liquid",
    "problem": "hard paving sends rain quickly into drains during storms",
    "solution": "schools and streets can add planted basins beside paths",
    "evidence": "A rain garden releases water slowly after the heaviest shower has passed.",
    "image": "the garden acts like a sponge with roots",
    "features": "planted dips, slow release, drain pressure"
  },
  {
    "id": "bee_hotel_rules",
    "title": "Bee Hotels That Work",
    "topic": "bee hotels",
    "main": "small tubes and drilled blocks can shelter solitary bees when they are kept dry and clean",
    "vocabWord": "solitary",
    "vocabMeaning": "living or nesting alone rather than in a colony",
    "problem": "dirty tubes can spread disease between young bees",
    "solution": "replacing old tubes and facing hotels towards morning sun improves survival",
    "evidence": "A useful bee hotel is dry, sunny and cleaned each year.",
    "image": "a tiny terrace for wild bees",
    "features": "dry tubes, morning sun, clean nesting spaces"
  },
  {
    "id": "roman_road_lines",
    "title": "Why Roman Roads Look Straight",
    "topic": "Roman road building",
    "main": "surveyors chose firm ground and direct lines so soldiers and messages could travel quickly",
    "vocabWord": "survey",
    "vocabMeaning": "measure land carefully before building",
    "problem": "marshes and steep hills forced builders to adjust the route",
    "solution": "modern paths and field boundaries sometimes still follow Roman lines",
    "evidence": "Straight roads helped people and supplies move at reliable speed.",
    "image": "a ruler drawn across the landscape",
    "features": "firm ground, direct lines, surviving boundaries"
  },
  {
    "id": "river_plastic_journey",
    "title": "A Plastic Bottle's River Journey",
    "topic": "plastic in rivers",
    "main": "light rubbish can travel from streets to drains and then into rivers after rain",
    "vocabWord": "fragment",
    "vocabMeaning": "a small broken piece of something larger",
    "problem": "plastic can break into tiny pieces that animals mistake for food",
    "solution": "litter traps and careful recycling reduce what reaches the water",
    "evidence": "One bottle can become many fragments before it reaches the sea.",
    "image": "the river carries the city's mistakes downstream",
    "features": "street drains, fragments, litter traps"
  },
  {
    "id": "tidal_energy_bays",
    "title": "Tidal Energy in Bays",
    "topic": "tidal energy",
    "main": "moving tides turn underwater turbines in places where water flows strongly",
    "vocabWord": "turbine",
    "vocabMeaning": "a machine turned by moving water, wind or steam",
    "problem": "machines must be placed where they do not block wildlife routes",
    "solution": "careful site surveys help engineers choose safer locations",
    "evidence": "Tides are predictable, so engineers can plan when energy will be produced.",
    "image": "the sea becomes a clockwork engine",
    "features": "underwater turbines, predictable tides, wildlife routes"
  },
  {
    "id": "community_orchards",
    "title": "Community Orchards",
    "topic": "community orchards",
    "main": "shared fruit trees give neighbourhoods food, shade and a reason to care for a place together",
    "vocabWord": "maintain",
    "vocabMeaning": "look after something so it stays useful",
    "problem": "young trees can fail if no one waters or prunes them",
    "solution": "rotas and harvest days help neighbours share the work",
    "evidence": "An orchard succeeds when people care for it after the planting day.",
    "image": "the trees become a calendar for the street",
    "features": "shared fruit, pruning rotas, harvest days"
  },
  {
    "id": "chalk_fossil_clues",
    "title": "Fossils in Chalk",
    "topic": "chalk fossils",
    "main": "tiny sea creatures became trapped in soft mud that later hardened into chalk",
    "vocabWord": "fossil",
    "vocabMeaning": "the preserved remains or mark of a living thing",
    "problem": "fossils can be damaged if collectors hammer cliffs carelessly",
    "solution": "photographing finds and staying away from unstable cliffs keeps people safer",
    "evidence": "A chalk fossil can show that the rock was once under warm shallow sea.",
    "image": "a shell is a message from an older sea",
    "features": "tiny creatures, chalk cliffs, safe collecting"
  },
  {
    "id": "origami_engineering",
    "title": "Origami Engineering",
    "topic": "folding in engineering",
    "main": "engineers use folding patterns to make large structures pack small and open reliably",
    "vocabWord": "compact",
    "vocabMeaning": "taking up little space",
    "problem": "a fold that is too weak may tear when the structure opens",
    "solution": "testing paper models helps designers improve real devices",
    "evidence": "Solar panels and airbags can both use folding ideas.",
    "image": "paper thinking becomes practical design",
    "features": "folding patterns, compact storage, reliable opening"
  },
  {
    "id": "cocoa_bean_route",
    "title": "From Cocoa Bean to Chocolate",
    "topic": "cocoa processing",
    "main": "cocoa beans are fermented, dried, roasted and ground before they become chocolate",
    "vocabWord": "ferment",
    "vocabMeaning": "change through natural action by yeasts or bacteria",
    "problem": "rushing the drying stage can spoil the flavour",
    "solution": "careful drying and fair payment both matter to growers",
    "evidence": "Fermentation helps develop the flavour before the beans are roasted.",
    "image": "each bean carries a long journey of work",
    "features": "fermenting beans, careful drying, roasting"
  },
  {
    "id": "moths_and_lamps",
    "title": "Moths and Street Lamps",
    "topic": "moths near lights",
    "main": "artificial lights can confuse moths that normally use natural light to navigate",
    "vocabWord": "navigate",
    "vocabMeaning": "find the way from one place to another",
    "problem": "constant bright light can draw moths away from feeding and breeding",
    "solution": "warmer-coloured bulbs and timed lights can reduce harm",
    "evidence": "Many moths fly in circles because the lamp disrupts their normal guidance.",
    "image": "the lamp turns night into a trap",
    "features": "navigation, warm bulbs, timed lighting"
  },
  {
    "id": "school_compost_cycle",
    "title": "The School Compost Cycle",
    "topic": "school composting",
    "main": "food scraps and dry leaves break down into material that improves soil",
    "vocabWord": "decompose",
    "vocabMeaning": "rot or break down into simpler parts",
    "problem": "too much wet waste can make a compost bin smell and slow down",
    "solution": "mixing cardboard or dry leaves balances the compost",
    "evidence": "Finished compost returns nutrients to the school garden.",
    "image": "waste becomes food for the soil",
    "features": "food scraps, dry leaves, nutrients"
  },
  {
    "id": "peat_bog_memory",
    "title": "Peat Bogs Store Water",
    "topic": "peat bogs",
    "main": "wet mossy bogs store water and carbon in deep layers of peat",
    "vocabWord": "carbon",
    "vocabMeaning": "an element stored in living things and soils",
    "problem": "draining a bog releases carbon and increases flood risk",
    "solution": "rewetting damaged bogs helps the moss grow again",
    "evidence": "A healthy bog is wet enough to slow decay.",
    "image": "the bog is a dark sponge of time",
    "features": "wet moss, stored water, rewetting"
  },
  {
    "id": "forest_firebreaks",
    "title": "Forest Firebreaks",
    "topic": "firebreaks",
    "main": "clear strips or managed paths can slow a fire by removing fuel from its route",
    "vocabWord": "fuel",
    "vocabMeaning": "material that can burn and keep a fire going",
    "problem": "a neglected firebreak can fill with dry grass and stop working",
    "solution": "regular cutting and grazing keep the strip effective",
    "evidence": "A firebreak does not stop every fire, but it can give firefighters time.",
    "image": "a gap in the forest works like a pause",
    "features": "clear strips, dry grass, time to respond"
  },
  {
    "id": "waterwheel_mills",
    "title": "How Waterwheels Worked",
    "topic": "waterwheels",
    "main": "flowing water pushed paddles round so mills could grind grain or power tools",
    "vocabWord": "paddle",
    "vocabMeaning": "a broad blade pushed by water or air",
    "problem": "low water in dry months could reduce the mill's power",
    "solution": "millers stored water in ponds to make the flow steadier",
    "evidence": "The wheel turned movement in the river into useful work.",
    "image": "the river lent its strength to the mill",
    "features": "paddles, mill ponds, grain grinding"
  },
  {
    "id": "container_ships",
    "title": "Inside a Shipping Container Port",
    "topic": "container ports",
    "main": "standard metal boxes let cranes move goods quickly between ships, trains and lorries",
    "vocabWord": "standard",
    "vocabMeaning": "made to the same agreed size or rule",
    "problem": "a delay at one crane can slow many connected journeys",
    "solution": "tracking systems and planned stacks keep boxes moving",
    "evidence": "Containers save time because machines can handle them in the same way.",
    "image": "the port is a giant puzzle of boxes",
    "features": "standard boxes, cranes, planned stacks"
  },
  {
    "id": "aquaponic_classroom",
    "title": "Aquaponics in a Classroom",
    "topic": "aquaponics",
    "main": "fish waste feeds plants while plants help clean the water for the fish",
    "vocabWord": "cycle",
    "vocabMeaning": "a process that repeats in a connected loop",
    "problem": "too many fish can pollute the water faster than plants can clean it",
    "solution": "testing water and balancing fish numbers keeps the system healthy",
    "evidence": "The plants and fish depend on each other in the same tank system.",
    "image": "a small classroom ecosystem in glass",
    "features": "fish waste, plant roots, water testing"
  },
  {
    "id": "cave_paintings",
    "title": "Reading Cave Paintings",
    "topic": "cave paintings",
    "main": "ancient images can show animals, tools and beliefs from people long ago",
    "vocabWord": "interpret",
    "vocabMeaning": "explain the possible meaning of something",
    "problem": "we cannot always know exactly why a painting was made",
    "solution": "scientists compare images, tools and cave marks for clues",
    "evidence": "A cave painting gives evidence, but it does not answer every question.",
    "image": "a wall becomes a record of vanished hands",
    "features": "animal images, tool marks, careful interpretation"
  },
  {
    "id": "soundproof_rooms",
    "title": "How Rooms Are Soundproofed",
    "topic": "soundproofing",
    "main": "soft materials and sealed gaps reduce how much sound travels between rooms",
    "vocabWord": "seal",
    "vocabMeaning": "close a gap tightly",
    "problem": "even a small crack can let sound leak through",
    "solution": "thick curtains, carpets and door seals can all help",
    "evidence": "Sound travels less easily when surfaces absorb it or gaps are closed.",
    "image": "noise is caught before it can escape",
    "features": "soft materials, sealed gaps, absorbing sound"
  },
  {
    "id": "seaweed_farms",
    "title": "Seaweed Farms",
    "topic": "seaweed farming",
    "main": "ropes in coastal water grow seaweed that can be harvested for food and other products",
    "vocabWord": "harvest",
    "vocabMeaning": "collect a crop when it is ready",
    "problem": "farms must avoid blocking boats or damaging local habitats",
    "solution": "careful mapping helps farmers place ropes safely",
    "evidence": "Seaweed grows without needing fresh water or fertiliser.",
    "image": "ropes become underwater fields",
    "features": "coastal ropes, habitat maps, harvest"
  },
  {
    "id": "satellite_maps",
    "title": "Satellite Maps After Storms",
    "topic": "satellite mapping",
    "main": "images from space help people see flooded roads, damaged roofs and blocked routes",
    "vocabWord": "image",
    "vocabMeaning": "a picture or recording of what can be seen",
    "problem": "clouds can hide the ground from some satellites",
    "solution": "combining images with reports from people on the ground improves decisions",
    "evidence": "Satellite maps can guide help to places that are hardest to reach.",
    "image": "the view from space helps the street below",
    "features": "flooded roads, cloud cover, ground reports"
  },
  {
    "id": "bookbinding_steps",
    "title": "How a Book Is Bound",
    "topic": "bookbinding",
    "main": "pages are folded, gathered, sewn or glued, then attached to a cover",
    "vocabWord": "gather",
    "vocabMeaning": "bring separate parts together in order",
    "problem": "a weak spine can make pages fall out after use",
    "solution": "strong thread, glue and careful pressing make the book last",
    "evidence": "Binding turns loose printed sheets into a book that can be handled.",
    "image": "loose pages become something that can travel",
    "features": "folded pages, strong spine, cover"
  },
  {
    "id": "cycle_lane_design",
    "title": "Designing Safer Cycle Lanes",
    "topic": "cycle lanes",
    "main": "clear lanes give riders space and make their route more predictable for drivers",
    "vocabWord": "predictable",
    "vocabMeaning": "easy to expect or understand in advance",
    "problem": "paint alone may not protect riders on busy roads",
    "solution": "kerbs, planters or parking buffers can create safer separation",
    "evidence": "A good cycle lane helps everyone know where to move.",
    "image": "the road gains a calmer line",
    "features": "clear lanes, separation, predictable movement"
  },
  {
    "id": "mangrove_roots",
    "title": "Mangrove Roots and Coasts",
    "topic": "mangroves",
    "main": "trees with tangled roots can slow waves and trap mud along tropical coasts",
    "vocabWord": "trap",
    "vocabMeaning": "hold something so it cannot move away easily",
    "problem": "cutting mangroves can leave shores more exposed to storms",
    "solution": "replanting and protecting roots helps rebuild shelter for wildlife and people",
    "evidence": "Mangrove roots protect coasts while creating nursery spaces for fish.",
    "image": "roots make a woven wall against the sea",
    "features": "tangled roots, trapped mud, storm shelter"
  },
  {
    "id": "wind_tunnel_tests",
    "title": "Testing in Wind Tunnels",
    "topic": "wind tunnels",
    "main": "engineers blow controlled air over models to study how shapes move through wind",
    "vocabWord": "model",
    "vocabMeaning": "a smaller version used for testing or explaining",
    "problem": "a model that is not accurate can give misleading results",
    "solution": "measurements from sensors help designers compare different shapes",
    "evidence": "Wind tunnels let engineers test ideas before building the full-size object.",
    "image": "invisible air becomes something engineers can read",
    "features": "controlled air, sensors, model shapes"
  },
  {
    "id": "glacier_clues",
    "title": "What Glaciers Leave Behind",
    "topic": "glaciers",
    "main": "slow rivers of ice move rocks and carve valleys over long periods",
    "vocabWord": "carve",
    "vocabMeaning": "cut or shape something gradually",
    "problem": "melting glaciers can change water supply for people downstream",
    "solution": "measuring ice and rocks helps scientists track change",
    "evidence": "Scratched stones can show which way the ice once moved.",
    "image": "ice writes its journey on the land",
    "features": "scratched rocks, valleys, meltwater"
  },
  {
    "id": "terraced_farms",
    "title": "Terraced Farming on Hillsides",
    "topic": "terraced farming",
    "main": "flat steps cut into slopes help farmers grow crops on steep land",
    "vocabWord": "terrace",
    "vocabMeaning": "a flat level area made on a slope",
    "problem": "heavy rain can wash soil away if terrace walls fail",
    "solution": "repairing walls and planting cover crops protects the soil",
    "evidence": "Terraces slow water and give crops a level place to grow.",
    "image": "a hillside is turned into a staircase for plants",
    "features": "flat steps, terrace walls, soil protection"
  },
  {
    "id": "repair_cafes",
    "title": "Repair Cafes",
    "topic": "repair cafes",
    "main": "volunteers help people mend objects instead of throwing them away",
    "vocabWord": "repair",
    "vocabMeaning": "fix something so it can be used again",
    "problem": "some items are unsafe to mend without specialist knowledge",
    "solution": "checking safety and teaching simple skills keeps the cafe useful",
    "evidence": "A repair cafe saves waste and helps people learn how things work.",
    "image": "a broken toaster becomes a lesson",
    "features": "volunteer skills, safety checks, less waste"
  }
];

const POETRY_SPECS = [
  {
    "id": "window_at_dawn",
    "title": "Window at Dawn",
    "setting": "the bedroom window",
    "mainImage": "the first light",
    "object": "the curtain",
    "personified": "the curtain lifted one pale hand",
    "contrast": "the street was quiet, yet the glass held tiny sparks",
    "theme": "morning is gentle but expectant",
    "image": "silver thread of light",
    "ending": "the room wakes slowly"
  },
  {
    "id": "canal_keeps_secrets",
    "title": "The Canal Keeps Secrets",
    "setting": "the canal",
    "mainImage": "dark water",
    "object": "the lock gate",
    "personified": "the lock gate muttered under its breath",
    "contrast": "barges slept, yet rings of water kept widening",
    "theme": "still water can feel full of hidden movement",
    "image": "green-black mirror",
    "ending": "secrets move slowly"
  },
  {
    "id": "rain_on_playground",
    "title": "Rain on the Playground",
    "setting": "the playground",
    "mainImage": "falling rain",
    "object": "the climbing frame",
    "personified": "the climbing frame wore beads on every bar",
    "contrast": "no children shouted, yet puddles practised their circles",
    "theme": "emptiness can still seem lively",
    "image": "drumming silver coins",
    "ending": "the yard listens back"
  },
  {
    "id": "winter_tree_voice",
    "title": "Winter Tree Voice",
    "setting": "the winter tree",
    "mainImage": "bare branches",
    "object": "the ash tree",
    "personified": "the ash tree counted the wind on its fingers",
    "contrast": "leaves were gone, yet the tree stood busy with sky",
    "theme": "loss can also show strength",
    "image": "black lace against cloud",
    "ending": "the tree keeps working"
  },
  {
    "id": "evening_bus",
    "title": "Evening Bus",
    "setting": "the bus stop",
    "mainImage": "amber headlights",
    "object": "the timetable",
    "personified": "the timetable blinked in the wet glass",
    "contrast": "people waited quietly, yet every bag held a journey",
    "theme": "ordinary travel can feel full of stories",
    "image": "small moons on the road",
    "ending": "the bus gathers lives"
  },
  {
    "id": "library_lamps",
    "title": "Library Lamps",
    "setting": "the library",
    "mainImage": "warm pools of light",
    "object": "the reading lamps",
    "personified": "the reading lamps leaned over the pages",
    "contrast": "voices were hushed, yet ideas moved from table to table",
    "theme": "quiet places can be mentally busy",
    "image": "honey-coloured circles",
    "ending": "thoughts cross silently"
  },
  {
    "id": "harvest_moon_field",
    "title": "Harvest Moon Field",
    "setting": "the stubble field",
    "mainImage": "a low moon",
    "object": "the scarecrow",
    "personified": "the scarecrow kept watch with one bent arm",
    "contrast": "the field was cut, yet it shone with leftover gold",
    "theme": "an ending can feel generous",
    "image": "round lantern in the furrows",
    "ending": "the field gives back"
  },
  {
    "id": "train_tunnel_song",
    "title": "Train Tunnel Song",
    "setting": "the railway tunnel",
    "mainImage": "echoing wheels",
    "object": "the tunnel wall",
    "personified": "the tunnel swallowed the train and sang it out again",
    "contrast": "darkness closed in, yet the rhythm pushed forward",
    "theme": "movement can turn fear into energy",
    "image": "iron heartbeat",
    "ending": "the tunnel releases sound"
  },
  {
    "id": "garden_after_frost",
    "title": "Garden After Frost",
    "setting": "the garden",
    "mainImage": "white frost",
    "object": "the rosemary bush",
    "personified": "the rosemary bush held frost like a borrowed coat",
    "contrast": "the air was sharp, yet one green smell escaped",
    "theme": "cold can make small signs of life clearer",
    "image": "glass needles on leaves",
    "ending": "green survives quietly"
  },
  {
    "id": "market_roof_rain",
    "title": "Rain on the Market Roof",
    "setting": "the market roof",
    "mainImage": "rain above stalls",
    "object": "the canvas awning",
    "personified": "the awning beat a quick drum for the traders",
    "contrast": "the lane was grey, yet oranges burned in their crates",
    "theme": "bad weather can make colours stronger",
    "image": "bright fruit under thunder",
    "ending": "colour answers rain"
  },
  {
    "id": "sea_wall_evening",
    "title": "Sea Wall Evening",
    "setting": "the sea wall",
    "mainImage": "incoming tide",
    "object": "the railings",
    "personified": "the railings caught the last red light",
    "contrast": "waves grew louder, yet the town behind them softened",
    "theme": "a place can feel both exposed and safe",
    "image": "red fire on metal",
    "ending": "the wall holds two worlds"
  },
  {
    "id": "attic_dust",
    "title": "Attic Dust",
    "setting": "the attic",
    "mainImage": "floating dust",
    "object": "the suitcase",
    "personified": "the suitcase waited with its buckles closed",
    "contrast": "nothing spoke, yet labels remembered old journeys",
    "theme": "forgotten objects can suggest memory",
    "image": "gold dust in a beam",
    "ending": "the past breathes lightly"
  },
  {
    "id": "school_hall_empty",
    "title": "Empty School Hall",
    "setting": "the school hall",
    "mainImage": "stacked chairs",
    "object": "the piano",
    "personified": "the piano kept one dark note under its lid",
    "contrast": "the floor was bare, yet footsteps seemed to linger",
    "theme": "empty spaces can keep echoes of people",
    "image": "polished lake of wood",
    "ending": "the hall remembers noise"
  },
  {
    "id": "bicycle_shed",
    "title": "Bicycle Shed",
    "setting": "the bicycle shed",
    "mainImage": "morning mist",
    "object": "the handlebars",
    "personified": "the handlebars wore drops like tiny bells",
    "contrast": "no wheels turned, yet chains held yesterday's hurry",
    "theme": "still objects can suggest stored motion",
    "image": "cold beads of metal",
    "ending": "journeys wait in rows"
  },
  {
    "id": "bakery_before_open",
    "title": "Bakery Before Opening",
    "setting": "the bakery",
    "mainImage": "early warmth",
    "object": "the oven",
    "personified": "the oven breathed softly behind the door",
    "contrast": "the street was asleep, yet bread was already rising",
    "theme": "work can begin before anyone notices",
    "image": "warm cloud of yeast",
    "ending": "morning is being made"
  },
  {
    "id": "fox_in_snow",
    "title": "Fox Prints in Snow",
    "setting": "the alley",
    "mainImage": "fresh snow",
    "object": "the fox tracks",
    "personified": "the fox tracks stitched the alley corner",
    "contrast": "the bins were silent, yet the snow told a story",
    "theme": "marks can reveal unseen movement",
    "image": "dark thread on white cloth",
    "ending": "the night leaves proof"
  },
  {
    "id": "river_under_bridge",
    "title": "River Under the Bridge",
    "setting": "the bridge",
    "mainImage": "brown water",
    "object": "the bridge arch",
    "personified": "the bridge arch held the river's voice",
    "contrast": "traffic crossed above, yet water kept its older road",
    "theme": "old natural movement continues under busy life",
    "image": "stone cup of sound",
    "ending": "the river goes on"
  },
  {
    "id": "greenhouse_night",
    "title": "Greenhouse at Night",
    "setting": "the greenhouse",
    "mainImage": "moonlit panes",
    "object": "the tomato vines",
    "personified": "the tomato vines tapped softly at the glass",
    "contrast": "the garden slept, yet leaves made small plans",
    "theme": "growth can feel secret and active",
    "image": "green shadows in moonlight",
    "ending": "plants work after dark"
  },
  {
    "id": "museum_stairs",
    "title": "Museum Stairs",
    "setting": "the museum stairs",
    "mainImage": "closing time",
    "object": "the marble steps",
    "personified": "the marble steps cooled their pale shoulders",
    "contrast": "visitors had gone, yet stories climbed the banister",
    "theme": "history can feel present in quiet spaces",
    "image": "white steps under dust",
    "ending": "the building keeps telling"
  },
  {
    "id": "clouds_over_rooftops",
    "title": "Clouds Over Rooftops",
    "setting": "the rooftops",
    "mainImage": "moving clouds",
    "object": "the chimney pots",
    "personified": "the chimney pots watched the weather pass",
    "contrast": "streets stayed still, yet the sky kept travelling",
    "theme": "change can happen above ordinary places",
    "image": "grey ships over brick",
    "ending": "the sky has a route"
  },
  {
    "id": "pond_ice",
    "title": "Pond Ice",
    "setting": "the pond",
    "mainImage": "thin ice",
    "object": "the reeds",
    "personified": "the reeds whispered through frozen teeth",
    "contrast": "the surface was still, yet bubbles waited underneath",
    "theme": "stillness can hide life below",
    "image": "clear skin over water",
    "ending": "life waits under glass"
  },
  {
    "id": "path_through_bluebells",
    "title": "Path Through Bluebells",
    "setting": "the woodland path",
    "mainImage": "bluebells",
    "object": "the path",
    "personified": "the path bent kindly between blue flowers",
    "contrast": "feet were careful, yet scent ran ahead of them",
    "theme": "gentleness can guide movement",
    "image": "blue smoke at ankle height",
    "ending": "spring shows the way"
  },
  {
    "id": "street_after_match",
    "title": "Street After the Match",
    "setting": "the street",
    "mainImage": "evening litter",
    "object": "the corner flag",
    "personified": "the corner flag drooped beside the kerb",
    "contrast": "chants were gone, yet wrappers shivered with excitement",
    "theme": "events leave traces after people leave",
    "image": "paper flags in gutters",
    "ending": "noise fades into evidence"
  },
  {
    "id": "lighthouse_beam",
    "title": "The Lighthouse Beam",
    "setting": "the headland",
    "mainImage": "turning light",
    "object": "the lighthouse beam",
    "personified": "the lighthouse beam combed the dark water",
    "contrast": "rocks stayed hidden, yet each sweep made a path",
    "theme": "warning can also feel comforting",
    "image": "white arm over waves",
    "ending": "light makes a promise"
  },
  {
    "id": "classroom_globe",
    "title": "Classroom Globe",
    "setting": "the classroom",
    "mainImage": "afternoon sun",
    "object": "the globe",
    "personified": "the globe turned its blue cheek to the window",
    "contrast": "chairs were still, yet countries slid through light",
    "theme": "learning can make the room feel larger",
    "image": "blue cheek of the world",
    "ending": "places spin quietly"
  },
  {
    "id": "meadow_bees",
    "title": "Meadow Bees",
    "setting": "the meadow",
    "mainImage": "summer heat",
    "object": "the bees",
    "personified": "the bees stitched gold between the flowers",
    "contrast": "the grass barely moved, yet the air was busy",
    "theme": "small creatures can make a quiet place active",
    "image": "gold thread in clover",
    "ending": "work hums softly"
  },
  {
    "id": "old_bridge_fog",
    "title": "Old Bridge in Fog",
    "setting": "the old bridge",
    "mainImage": "river fog",
    "object": "the lamp posts",
    "personified": "the lamp posts floated in their own small halos",
    "contrast": "the far bank vanished, yet footsteps kept crossing",
    "theme": "trust can continue when sight is limited",
    "image": "soft milk around stone",
    "ending": "the bridge believes in distance"
  },
  {
    "id": "rooftop_rain_song",
    "title": "Rooftop Rain Song",
    "setting": "the rooftop",
    "mainImage": "summer rain",
    "object": "the drainpipe",
    "personified": "the drainpipe gargled a quick reply",
    "contrast": "heat lifted, yet every tile began to sing",
    "theme": "rain can refresh a tired place",
    "image": "silver tapping on slate",
    "ending": "the roof learns music"
  }
];

const PUNCTUATION_SKILLS = ['P1', 'P2', 'P3', 'P4'];

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function words(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 3);
}

function skill(index, offset = 0) {
  return PUNCTUATION_SKILLS[(index + offset) % PUNCTUATION_SKILLS.length];
}

function stemVariant(variants, index, ...args) {
  return variants[index % variants.length](...args);
}

function sentenceCase(value) {
  const text = String(value || '').trim();
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1)}` : text;
}

function makeFictionPassage(spec, index) {
  const prefix = `p4f${String(index + 1).padStart(2, '0')}`;
  const id = `${prefix}_${spec.id}`;
  const q = (n) => `${id}_q${n}`;
  const keyWords = words(spec.object);
  const clueWords = words(spec.clue);
  const outcomeWords = words(spec.outcome);
  const adviceSentence = sentenceCase(spec.advice);
  const blocks = [
    `At first light, ${spec.name} reached ${spec.place} carrying ${spec.object}. The place felt ${spec.start}, and every sound seemed larger than it should. ${spec.helper} had once told ${spec.name}, "${adviceSentence}."`,
    `The difficulty appeared quickly: ${spec.challenge}. A small clue - ${spec.clue} - made ${spec.name} pause instead of rushing. The clue did not solve everything, but it gave the next sensible step.`,
    `As ${spec.name} worked, ${spec.image}. Then ${spec.evidence}. That detail changed the problem from a guess into something ${spec.name} could test carefully.`,
    `By the end of the morning, ${spec.outcome}. ${spec.name} felt ${spec.end}, not because the task had become easy, but because the clues had been read in the right order.`
  ];
  const punctSkill = skill(index, 0);
  const punctLabel = punctSkill === 'P1' ? 'dash around the clue' : punctSkill === 'P2' ? 'speech punctuation in the advice' : punctSkill === 'P3' ? 'parenthesis-like dash phrase' : 'colon before the difficulty';
  return {
    id,
    title: spec.title,
    genre: 'fiction',
    difficulty: 2 + (index % 4),
    isLong: index % 2 === 0,
    blocks,
    questions: [
      {
        id: q(1), type: 'short', skill: '2b', marks: 1,
        stem: stemVariant([
          (s) => `In ${s.title}, what was ${s.name} carrying when the passage opened?`,
          (s) => `Which object does ${s.name} bring into ${s.place} in ${s.title}?`,
          (s) => `Name the item ${s.name} has at the start of ${s.title}.`,
          (s) => `What practical thing is with ${s.name} at the beginning of ${s.title}?`
        ], index, spec),
        check: { keywordAny: [keyWords, [spec.object.split(' ')[0].toLowerCase()]] },
        modelAnswer: `In ${spec.title}, ${spec.name} is carrying ${spec.object}.`,
        explanation: `The opening sentence names ${spec.object} as the item ${spec.name} brings.`,
        hint: 'Reread the first sentence of the passage.'
      },
      {
        id: q(2), type: 'mcq', skill: '2a', marks: 1,
        stem: `In ${spec.title}, what does the phrase "${spec.advice}" suggest about solving the problem?`,
        options: [
          'The loudest event is always the most important.',
          'Careful observation can be more useful than rushing.',
          'The problem should be ignored until someone else arrives.',
          'Only expensive equipment can solve the difficulty.'
        ],
        correct: 1,
        modelAnswer: `In ${spec.title}, careful observation can be more useful than rushing.`,
        explanation: `The advice prepares ${spec.name} to slow down and use the clue rather than panic.`,
        hint: 'Think about the contrast between rushing and noticing.'
      },
      {
        id: q(3), type: 'evidenceShort', skill: '2d', marks: 2,
        stem: `How does ${spec.name} become more confident in ${spec.title}? Use a short quotation from the passage.`,
        answerCheck: { keywordAny: [['notice', 'clue'], ['read', 'order'], ['careful'], ['confident'], ['test']] },
        evidenceCheck: { containsAny: [spec.evidence, spec.clue] },
        answerMarks: 1,
        evidenceMarks: 1,
        modelAnswer: `${spec.name} becomes more confident by slowing down and using small clues. Evidence could include: "${spec.evidence}".`,
        explanation: 'The answer needs both the change in confidence and a phrase that proves it from the text.',
        hint: 'Find the detail that turns the problem from a guess into something testable.',
        reread: [2, 3]
      },
      {
        id: q(4), type: 'mcq', skill: '2c', marks: 2,
        stem: `Which option best summarises the middle of ${spec.title}?`,
        options: [
          `${spec.name} gives up because ${spec.challenge}.`,
          `${spec.name} notices ${spec.clue} and uses it to think more carefully.`,
          `${spec.helper} arrives and solves the whole problem alone.`,
          `${spec.name} decides the problem is not worth solving.`
        ],
        correct: 1,
        modelAnswer: `${spec.name} notices ${spec.clue} and uses it to think more carefully.`,
        explanation: 'The middle section is about noticing a clue and using it to decide what to do next.',
        hint: 'Choose the option that includes both the clue and the thinking it causes.'
      },
      {
        id: q(5), type: 'open', skill: '2g', marks: 2,
        stem: `Why does the writer include the image "${spec.image}" in ${spec.title}?`,
        rubric: [
          { label: 'Explains the picture or atmosphere', check: { keywordAny: [['picture'], ['atmosphere'], ['imag'], ['feel'], ['vivid']] } },
          { label: 'Links the image to the character or setting', check: { keywordAny: [['setting'], ['character'], ['mood'], ['problem'], ['clue'], ['reader']] } }
        ],
        modelAnswer: `The image makes ${spec.place} feel vivid and helps the reader sense ${spec.name}'s careful attention.`,
        explanation: 'A strong answer explains the picture created and links it to the mood or problem.',
        hint: 'Say what picture the words create, then explain its effect.'
      },
      {
        id: q(6), type: 'short', skill: '2e', marks: 1,
        stem: `What is ${spec.name} most likely to do next after ${spec.title} ends?`,
        check: { keywordAny: [['keep', 'notic'], ['use', 'clue'], ['tell'], ['help'], outcomeWords] },
        modelAnswer: `${spec.name} is likely to keep using careful clues and explain what happened, because ${spec.outcome}.`,
        explanation: 'The ending shows the character has learned to trust careful observation.',
        hint: 'Use the final paragraph, not just your own idea.'
      },
      {
        id: q(7), type: 'match', skill: '2h', marks: 2,
        stem: `In ${spec.title}, match each detail to its job in the story.`,
        prompts: [spec.object, spec.clue, spec.evidence],
        options: ['shows the starting situation', 'points towards the solution', 'confirms the clue is useful'],
        correctMap: { 0: '0', 1: '1', 2: '2' },
        modelAnswer: `${spec.object} shows the starting situation; ${spec.clue} points towards the solution; "${spec.evidence}" confirms the clue is useful.`,
        explanation: 'Each detail has a different role: opening, clue, and confirmation.',
        hint: 'Ask what job each detail does in the story.'
      },
      {
        id: q(8), type: 'order', skill: '2f', marks: 2,
        stem: `Put these moments from ${spec.title} in the order they happen.`,
        items: [`${spec.name} arrives at ${spec.place}.`, `${spec.name} notices ${spec.clue}.`, `${spec.name} reaches the outcome: ${spec.outcome}.`],
        correctPositions: [1, 2, 3],
        modelAnswer: `1. Arrival at ${spec.place}. 2. Noticing ${spec.clue}. 3. ${spec.outcome}.`,
        explanation: 'The structure moves from arrival to clue to resolution.',
        hint: 'Track the beginning, middle and end.'
      },
      {
        id: q(9), type: 'multiSelect', skill: '2b', marks: 2,
        stem: `Which two details from ${spec.title} show that careful noticing matters?`,
        options: [spec.clue, spec.evidence, `${spec.name} felt ${spec.start} at first`, `the task had become easy`],
        correctSet: [0, 1],
        modelAnswer: `The important details are "${spec.clue}" and "${spec.evidence}".`,
        explanation: 'Both correct choices are clues that help solve the problem.',
        hint: 'Pick details that directly help the character think.'
      },
      {
        id: q(10), type: 'mcq', skill: punctSkill, marks: 1,
        stem: `In ${spec.title}, what does the ${punctLabel} help the reader understand?`,
        options: [
          'It introduces a random extra scene with no link to the story.',
          'It separates or highlights a useful clue, advice or explanation.',
          'It proves the whole passage is written as a list.',
          'It shows that the passage has finished.'
        ],
        correct: 1,
        modelAnswer: `The punctuation highlights a useful clue, advice or explanation in ${spec.title}.`,
        explanation: 'The punctuation guides how the reader groups the information.',
        hint: 'Look at what the punctuation is placed around or before.'
      }
    ]
  };
}

function makeNonFictionPassage(spec, index) {
  const prefix = `p4n${String(index + 1).padStart(2, '0')}`;
  const id = `${prefix}_${spec.id}`;
  const q = (n) => `${id}_q${n}`;
  const topicWords = words(spec.topic);
  const problemWords = words(spec.problem);
  const solutionWords = words(spec.solution);
  const blocks = [
    `${spec.title} explains ${spec.topic}. In simple terms, ${spec.main}. The idea may sound specialised, but it connects to everyday choices in towns, schools or landscapes.`,
    `A key word is ${spec.vocabWord}: ${spec.vocabMeaning}. The process works best when people understand the small parts as well as the whole system. ${spec.evidence}`,
    `There is also a challenge: ${sentenceCase(spec.problem)}. This matters because one weak point can affect the wider system, even when the main idea is useful.`,
    `One practical response is clear: ${spec.solution}. The best solutions do not simply add equipment; they match the local place, the people using it and the living things nearby.`
  ];
  const punctSkill = skill(index, 1);
  return {
    id,
    title: spec.title,
    genre: 'non-fiction',
    difficulty: 2 + (index % 4),
    isLong: true,
    blocks,
    questions: [
      {
        id: q(1), type: 'short', skill: '2b', marks: 1,
        stem: `According to ${spec.title}, what is the main idea being explained?`,
        check: { keywordAny: [topicWords, words(spec.main), ['system']] },
        modelAnswer: `${spec.title} explains ${spec.topic}: ${spec.main}.`,
        explanation: 'The first paragraph introduces the main idea directly.',
        hint: 'Reread the first two sentences.'
      },
      {
        id: q(2), type: 'mcq', skill: '2a', marks: 1,
        stem: `In ${spec.title}, what does "${spec.vocabWord}" mean?`,
        options: ['a decorative label for a diagram', spec.vocabMeaning, 'a place where every problem has already been solved', 'a warning that the topic is impossible to understand'],
        correct: 1,
        modelAnswer: spec.vocabMeaning,
        explanation: `The passage defines ${spec.vocabWord} after the colon.`,
        hint: 'Use the definition in paragraph 2.'
      },
      {
        id: q(3), type: 'evidenceShort', skill: '2d', marks: 2,
        stem: `Why does ${spec.title} say the challenge matters? Use a short quotation or phrase from the passage.`,
        answerCheck: { keywordAny: [problemWords, ['weak', 'point'], ['wider', 'system'], ['matter']] },
        evidenceCheck: { containsAny: [spec.problem, 'one weak point can affect the wider system'] },
        answerMarks: 1,
        evidenceMarks: 1,
        modelAnswer: `The challenge matters because it can affect the wider system. Evidence could include: "${spec.problem}".`,
        explanation: 'The answer should link the problem to its consequence.',
        hint: 'Find the paragraph that begins with the challenge.'
      },
      {
        id: q(4), type: 'mcq', skill: '2c', marks: 2,
        stem: `Which option best summarises ${spec.title}?`,
        options: [
          `${spec.topic} is simple and has no problems.`,
          `${spec.topic} has a useful purpose, but people must manage a challenge carefully.`,
          `${spec.topic} is only useful in places far from people.`,
          `The passage is mainly a story about one child solving a mystery.`
        ],
        correct: 1,
        modelAnswer: `${spec.topic} has a useful purpose, but people must manage a challenge carefully.`,
        explanation: 'The whole text explains a useful idea, a challenge and a practical response.',
        hint: 'Choose the option that covers the idea, problem and solution.'
      },
      {
        id: q(5), type: 'open', skill: '2f', marks: 2,
        stem: `How is ${spec.title} organised to help the reader understand the topic?`,
        rubric: [
          { label: 'Identifies the explanation sequence', check: { keywordAny: [['introduc'], ['define'], ['first'], ['then'], ['explain'], ['sequence']] } },
          { label: 'Mentions problem and response', check: { keywordAny: [['problem'], ['challenge'], ['solution'], ['response'], ['practical']] } }
        ],
        modelAnswer: `${spec.title} starts by introducing ${spec.topic}, defines a key word, explains a challenge, and ends with a practical response.`,
        explanation: 'The structure moves from main idea to key word, then problem and solution.',
        hint: 'Look at what each paragraph is doing.'
      },
      {
        id: q(6), type: 'short', skill: '2e', marks: 1,
        stem: `What is likely to happen if people follow the practical response in ${spec.title}?`,
        check: { keywordAny: [solutionWords, ['improve'], ['help'], ['safer'], ['reduce'], ['protect']] },
        modelAnswer: `The system is likely to work better because people would follow the response: ${spec.solution}.`,
        explanation: 'A prediction should be based on the solution in the final paragraph.',
        hint: 'Use the last paragraph for your prediction.'
      },
      {
        id: q(7), type: 'match', skill: '2h', marks: 2,
        stem: `Match each part of ${spec.title} to its role in the explanation.`,
        prompts: [spec.topic, spec.problem, spec.solution],
        options: ['main subject of the text', 'challenge that needs careful management', 'practical response suggested by the text'],
        correctMap: { 0: '0', 1: '1', 2: '2' },
        modelAnswer: `${spec.topic} is the subject; "${spec.problem}" is the challenge; "${spec.solution}" is the response.`,
        explanation: 'The question checks comparison between idea, problem and solution.',
        hint: 'Decide whether each phrase names the topic, the problem or the response.'
      },
      {
        id: q(8), type: 'order', skill: '2f', marks: 2,
        stem: `Put the explanation steps from ${spec.title} in the order they appear.`,
        items: [`The text introduces ${spec.topic}.`, `The text explains the challenge: ${spec.problem}`, `The text gives a practical response: ${spec.solution}`],
        correctPositions: [1, 2, 3],
        modelAnswer: `In ${spec.title}: 1. main idea about ${spec.topic}. 2. challenge. 3. practical response.`,
        explanation: 'The passage is organised as idea, challenge and response.',
        hint: 'Follow the paragraph order.'
      },
      {
        id: q(9), type: 'multiSelect', skill: '2b', marks: 2,
        stem: `Which two statements are supported by ${spec.title}?`,
        options: [spec.evidence, spec.solution, `${spec.topic} has no connection to real places`, `The passage says the challenge cannot be managed`],
        correctSet: [0, 1],
        modelAnswer: `The supported statements are "${spec.evidence}" and "${spec.solution}".`,
        explanation: 'Both correct options are stated in the passage.',
        hint: 'Choose only statements that the text actually supports.'
      },
      {
        id: q(10), type: 'mcq', skill: punctSkill, marks: 2,
        stem: `In ${spec.title}, what job does the colon after "${spec.vocabWord}" do?`,
        options: ['It introduces the meaning of the key word.', 'It shows direct speech from a character.', 'It marks the end of the whole passage.', 'It separates two unrelated titles.'],
        correct: 0,
        modelAnswer: `The colon introduces the definition of ${spec.vocabWord}.`,
        explanation: 'The colon prepares the reader for the definition that follows.',
        hint: 'Look at what comes immediately after the colon.'
      }
    ]
  };
}

function makePoetryPassage(spec, index) {
  const prefix = `p4p${String(index + 1).padStart(2, '0')}`;
  const id = `${prefix}_${spec.id}`;
  const q = (n) => `${id}_q${n}`;
  const objectWords = words(spec.object);
  const imageWords = words(spec.image);
  const blocks = [
    `At ${spec.setting},
${sentenceCase(spec.mainImage)} gathers near the edge,
${sentenceCase(spec.image)}
where the quiet minutes pledge.`,
    `${sentenceCase(spec.object)} waits and watches,
${sentenceCase(spec.personified)}.
The ordinary place seems larger
than it seemed at first.`,
    `${sentenceCase(spec.contrast)}.
Small sounds move like careful footsteps;
shadows lean and listen close.`,
    `By the final line, the poem suggests that ${spec.theme}.
${sentenceCase(spec.ending)},
and the reader carries that feeling away.`
  ];
  const punctSkill = skill(index, 2);
  return {
    id,
    title: spec.title,
    genre: 'poetry',
    difficulty: 2 + (index % 4),
    isLong: index % 2 === 1,
    blocks,
    questions: [
      {
        id: q(1), type: 'mcq', skill: '2a', marks: 1,
        stem: `In ${spec.title}, what does the image "${spec.image}" suggest?`,
        options: ['a plain factual instruction', 'a vivid way of seeing light, colour or movement', 'a warning that the speaker is angry', 'a list of exact measurements'],
        correct: 1,
        modelAnswer: `It creates a vivid way of seeing light, colour or movement in ${spec.title}.`,
        explanation: 'The phrase is figurative and helps the reader picture the scene.',
        hint: 'Think about the picture the phrase makes in your mind.'
      },
      {
        id: q(2), type: 'short', skill: '2b', marks: 1,
        stem: `Which object is personified in ${spec.title}?`,
        check: { keywordAny: [objectWords] },
        modelAnswer: `The personified object is ${spec.object}.`,
        explanation: `The poem gives ${spec.object} human-like action.`,
        hint: 'Look in the second stanza.'
      },
      {
        id: q(3), type: 'open', skill: '2g', marks: 2,
        stem: `Why does the poet write "${spec.personified}" in ${spec.title}?`,
        rubric: [
          { label: 'Recognises personification', check: { keywordAny: [['personif'], ['human'], ['person'], ['alive']] } },
          { label: 'Explains effect on mood or image', check: { keywordAny: [['mood'], ['image'], ['picture'], ['feel'], ['reader']] } }
        ],
        modelAnswer: `The poet personifies ${spec.object}, making the scene feel alive and helping the reader notice the mood of the place.`,
        explanation: 'A strong answer names the technique and explains its effect.',
        hint: 'Ask how the object is made to seem almost human.'
      },
      {
        id: q(4), type: 'mcq', skill: '2c', marks: 2,
        stem: `Which option best summarises the mood of ${spec.title}?`,
        options: ['loud, rushed and careless', `quiet but alive with meaning`, 'angry and violent throughout', 'empty with no feeling at all'],
        correct: 1,
        modelAnswer: `${spec.title} feels quiet but alive with meaning.`,
        explanation: 'The poem balances stillness with hidden movement or feeling.',
        hint: 'Choose the option that fits both quietness and life.'
      },
      {
        id: q(5), type: 'evidenceShort', skill: '2d', marks: 2,
        stem: `How does ${spec.title} make an ordinary place feel special? Use a short quotation from the poem.`,
        answerCheck: { keywordAny: [['ordinary', 'special'], ['larger'], ['alive'], ['meaning'], ['quiet']] },
        evidenceCheck: { containsAny: [spec.personified, spec.image, 'The ordinary place seems larger'] },
        answerMarks: 1,
        evidenceMarks: 1,
        modelAnswer: `It makes the place special by giving ordinary things vivid life. Evidence could include: "${spec.personified}".`,
        explanation: 'The answer should explain the change in feeling and support it with a quotation.',
        hint: 'Use one image or personified detail as evidence.'
      },
      {
        id: q(6), type: 'short', skill: '2e', marks: 1,
        stem: `What feeling is the reader likely to carry away after ${spec.title}?`,
        check: { keywordAny: [['quiet'], ['thought'], ['wonder'], ['calm'], ['meaning'], words(spec.theme)] },
        modelAnswer: `The reader is likely to carry away a thoughtful, quiet sense that ${spec.theme}.`,
        explanation: 'The final stanza states the feeling the poem leaves behind.',
        hint: 'Use the final stanza.'
      },
      {
        id: q(7), type: 'match', skill: '2h', marks: 2,
        stem: `Match each image from ${spec.title} to its effect.`,
        prompts: [spec.image, spec.personified, spec.contrast],
        options: ['creates a vivid picture', 'makes an object seem alive', 'shows a contrast in the place'],
        correctMap: { 0: '0', 1: '1', 2: '2' },
        modelAnswer: `"${spec.image}" creates a vivid picture; "${spec.personified}" personifies ${spec.object}; "${spec.contrast}" shows contrast.`,
        explanation: 'Each image has a different effect in the poem.',
        hint: 'Decide whether each quotation is mainly picture, personification or contrast.'
      },
      {
        id: q(8), type: 'order', skill: '2f', marks: 2,
        stem: `Put the movement of ${spec.title} in order.`,
        items: [`The poem opens at ${spec.setting}.`, `The poem personifies ${spec.object}.`, `The poem leaves the reader with the idea that ${spec.theme}.`],
        correctPositions: [1, 2, 3],
        modelAnswer: `In ${spec.title}: 1. opening at ${spec.setting}. 2. personified ${spec.object}. 3. final idea that ${spec.theme}.`,
        explanation: 'The poem moves from place, to image, to final meaning.',
        hint: 'Follow the stanzas in order.'
      },
      {
        id: q(9), type: 'multiSelect', skill: '2g', marks: 2,
        stem: `Which two choices explain the effect of the language in ${spec.title}?`,
        options: [`It turns ${spec.object} into something almost alive.`, `It uses images such as "${spec.image}" to create atmosphere.`, 'It removes all description from the poem.', 'It gives only dates and measurements.'],
        correctSet: [0, 1],
        modelAnswer: `The language personifies ${spec.object} and uses images such as "${spec.image}" to create atmosphere.`,
        explanation: "Both correct choices describe effects of the poet\'s language.",
        hint: 'Choose effects that are actually created by the poem.'
      },
      {
        id: q(10), type: 'mcq', skill: punctSkill, marks: 2,
        stem: `In ${spec.title}, what does the semicolon in the line "Small sounds move like careful footsteps; shadows lean and listen close" help to do?`,
        options: ['It links two closely connected images.', 'It introduces a speaker in direct speech.', 'It shows the line is a question.', 'It separates a title from an author name.'],
        correct: 0,
        modelAnswer: `In ${spec.title}, the semicolon links two closely connected images.`,
        explanation: 'The two linked clauses both describe the quiet, living atmosphere of the poem.',
        hint: 'Look at the two ideas on either side of the semicolon.'
      }
    ]
  };
}

export function buildReadingPhase4Passages() {
  const fiction = FICTION_SPECS.map(makeFictionPassage);
  const nonFiction = NON_FICTION_SPECS.map(makeNonFictionPassage);
  const poetry = POETRY_SPECS.map(makePoetryPassage);
  return fiction.flatMap((passage, index) => [passage, nonFiction[index], poetry[index]]);
}

export const READING_PHASE4_PASSAGES = deepFreeze(buildReadingPhase4Passages());

export const READING_PHASE4_TEST_PAPERS = deepFreeze(FICTION_SPECS.map((_, index) => {
  const n = String(index + 1).padStart(2, '0');
  const fiction = READING_PHASE4_PASSAGES[index * 3];
  const nonFiction = READING_PHASE4_PASSAGES[index * 3 + 1];
  const poetry = READING_PHASE4_PASSAGES[index * 3 + 2];
  return {
    id: `paper_phase4_${n}`,
    title: `Reading Expansion Paper ${n}`,
    timeLimitMin: 60,
    totalMarks: 50,
    sections: [
      { passageId: fiction.id, questionIds: fiction.questions.map((question) => question.id) },
      { passageId: nonFiction.id, questionIds: nonFiction.questions.map((question) => question.id) },
      { passageId: poetry.id, questionIds: poetry.questions.map((question) => question.id) },
    ],
  };
}));
