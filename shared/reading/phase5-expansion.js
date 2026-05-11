// Deterministic Reading Phase 5 expansion: the second 1000-question wave.
// This file is shared/Worker content only. It contains answer keys and marking
// checks, so browser-safe metadata must not import it.

const PHASE5_UNITS = [
  {
    "id": "winter_market",
    "title": "Winter Market Compass",
    "name": "Amina",
    "place": "the winter market",
    "object": "a pocket compass",
    "challenge": "a missing stall sign",
    "clue": "a trail of rosemary leaves beside the fountain",
    "helper": "Mr Bell",
    "advice": "markets have their own maps if you read the small signs",
    "image": "lanterns made amber pools on the cobbles",
    "evidence": "the compass needle settled beside the flower stall",
    "outcome": "Amina returned the sign before the first customers arrived",
    "vibe": "vivid",
    "theme": "community clues"
  },
  {
    "id": "river_theatre",
    "title": "The River Theatre",
    "name": "Jonah",
    "place": "the riverside theatre",
    "object": "a velvet programme",
    "challenge": "a missing prop crown",
    "clue": "gold thread caught on the stage door",
    "helper": "Miss Arlo",
    "advice": "props leave stories in the places they touch",
    "image": "the river threw broken silver across the seats",
    "evidence": "the crown flashed under the orchestra steps",
    "outcome": "Jonah found the crown before the curtain rose",
    "vibe": "suspenseful",
    "theme": "performance preparation"
  },
  {
    "id": "hill_beacon",
    "title": "Hill Beacon at Dusk",
    "name": "Leah",
    "place": "the hill beacon",
    "object": "a tin matchbox",
    "challenge": "a wrongly stacked fire basket",
    "clue": "ashes formed a neat arrow by the wall",
    "helper": "Uncle Ren",
    "advice": "old signals depend on careful hands",
    "image": "clouds bruised purple above the ridge",
    "evidence": "the beacon flame lifted straight in the still air",
    "outcome": "Leah lit the warning beacon safely",
    "vibe": "tense",
    "theme": "responsible action"
  },
  {
    "id": "glasshouse_seed",
    "title": "The Glasshouse Seed",
    "name": "Owen",
    "place": "the botanic glasshouse",
    "object": "a paper seed packet",
    "challenge": "a locked propagator tray",
    "clue": "one label had been written in green ink",
    "helper": "Dr Vale",
    "advice": "plants often solve puzzles more slowly than people",
    "image": "condensation pearled the panes like tiny maps",
    "evidence": "the rare seed packet matched the green label",
    "outcome": "Owen replanted the seed in the correct tray",
    "vibe": "calm",
    "theme": "patient observation"
  },
  {
    "id": "quarry_echo",
    "title": "Echoes in the Old Quarry",
    "name": "Priya",
    "place": "the old quarry",
    "object": "a chalk sketch",
    "challenge": "a cracked safety rope",
    "clue": "fresh chalk dust marked the lower ledge",
    "helper": "Ranger Kipp",
    "advice": "sound tells you where stone is hiding",
    "image": "every footstep came back wearing a second voice",
    "evidence": "the echo returned from the safe ledge",
    "outcome": "Priya guided the walkers away from loose rock",
    "vibe": "alert",
    "theme": "careful listening"
  },
  {
    "id": "bakery_clock",
    "title": "The Bakery Clock",
    "name": "Felix",
    "place": "the bakery kitchen",
    "object": "a copper timer",
    "challenge": "a batch of unsold loaves",
    "clue": "flour prints curved towards the pantry",
    "helper": "Gran Maia",
    "advice": "bread keeps time even when clocks forget",
    "image": "warm yeast breathed softly through the room",
    "evidence": "the timer rang exactly as the crusts turned gold",
    "outcome": "Felix rescued the morning bake",
    "vibe": "warm",
    "theme": "timing and craft"
  },
  {
    "id": "marsh_hide",
    "title": "The Marsh Hide",
    "name": "Nora",
    "place": "the bird hide",
    "object": "a damp field guide",
    "challenge": "a vanished nest marker",
    "clue": "reed seeds clung to one boot print",
    "helper": "Samir",
    "advice": "marshes reward the quietest watcher",
    "image": "mist combed the reeds into silver lines",
    "evidence": "the marker bobbed beside the willow stump",
    "outcome": "Nora restored the marker without disturbing the birds",
    "vibe": "quiet",
    "theme": "respect for wildlife"
  },
  {
    "id": "rooftop_garden",
    "title": "Rooftop Garden Wind",
    "name": "Cass",
    "place": "the rooftop garden",
    "object": "a cracked watering can",
    "challenge": "wilting tomato plants",
    "clue": "string shadows crossed the dry beds",
    "helper": "Aunt Jo",
    "advice": "wind takes water faster than you expect",
    "image": "the roofs shone like islands after rain",
    "evidence": "the water gauge showed yesterday's storm had missed the bed",
    "outcome": "Cass rigged a calmer watering line",
    "vibe": "practical",
    "theme": "urban growing"
  },
  {
    "id": "cavern_lantern",
    "title": "The Cavern Lantern",
    "name": "Milo",
    "place": "the limestone cavern",
    "object": "a blue lantern",
    "challenge": "a hidden side passage",
    "clue": "cool air moved from a crack behind the curtain of stone",
    "helper": "Guide Mara",
    "advice": "caves whisper before they open",
    "image": "drops of water stitched the dark with sound",
    "evidence": "the lantern glow found the narrow side passage",
    "outcome": "Milo helped the group find the safe route",
    "vibe": "mysterious",
    "theme": "slow discovery"
  },
  {
    "id": "archive_key",
    "title": "Archive Key Number Seven",
    "name": "Sofia",
    "place": "the town archive",
    "object": "a numbered brass key",
    "challenge": "a misfiled map drawer",
    "clue": "dust was missing from one handle",
    "helper": "Ms Penn",
    "advice": "records have habits as well as dates",
    "image": "sunlight ruled the floor in golden squares",
    "evidence": "key seven opened the drawer marked waterways",
    "outcome": "Sofia restored the map to its proper drawer",
    "vibe": "orderly",
    "theme": "historical care"
  },
  {
    "id": "sea_pool",
    "title": "The Sea Pool Rescue",
    "name": "Ben",
    "place": "the sea pool",
    "object": "a green bucket",
    "challenge": "a stranded crab",
    "clue": "seaweed pointed towards the drain channel",
    "helper": "Aunt Nessa",
    "advice": "the tide helps if you do not fight it",
    "image": "the water trembled with coins of light",
    "evidence": "the crab followed the shallow channel",
    "outcome": "Ben released the crab before the gulls returned",
    "vibe": "urgent",
    "theme": "kind intervention"
  },
  {
    "id": "observatory_door",
    "title": "The Observatory Door",
    "name": "Clara",
    "place": "the school observatory",
    "object": "a star chart",
    "challenge": "a door that stuck before viewing night",
    "clue": "a scratch lined up with Orion's belt",
    "helper": "Mr Han",
    "advice": "sky patterns can guide earthly locks too",
    "image": "the dome waited like a closed eye",
    "evidence": "Orion's three stars matched the latch marks",
    "outcome": "Clara opened the dome for the viewing night",
    "vibe": "expectant",
    "theme": "patterns and persistence"
  },
  {
    "id": "festival_bridge",
    "title": "The Festival Bridge",
    "name": "Ravi",
    "place": "the footbridge bunting",
    "object": "a box of paper flags",
    "challenge": "a gap in the lantern line",
    "clue": "two blue flags were tied lower than the rest",
    "helper": "Mum",
    "advice": "decorations need rhythm as well as colour",
    "image": "the stream carried lantern reflections downstream",
    "evidence": "the blue flags marked the missing hook",
    "outcome": "Ravi fixed the lantern line before evening",
    "vibe": "festive",
    "theme": "pattern noticing"
  },
  {
    "id": "train_yard",
    "title": "Train Yard Morning",
    "name": "Elise",
    "place": "the railway yard",
    "object": "a grease pencil",
    "challenge": "a delayed maintenance wagon",
    "clue": "fresh oil shone under the third axle",
    "helper": "Mr Crowe",
    "advice": "machines complain in small marks first",
    "image": "the rails caught dawn like cold ribbons",
    "evidence": "the grease mark circled the loose bolt",
    "outcome": "Elise reported the fault before the wagon moved",
    "vibe": "careful",
    "theme": "safety checking"
  },
  {
    "id": "meadow_gate",
    "title": "The Meadow Gate Promise",
    "name": "Kiran",
    "place": "the wildflower meadow",
    "object": "a wooden gate peg",
    "challenge": "a gate left swinging",
    "clue": "pollen dust made a bright line on the peg",
    "helper": "Grandpa Hari",
    "advice": "meadows grow because people keep promises",
    "image": "bees stitched yellow paths through the grass",
    "evidence": "the peg fitted the hidden hinge hole",
    "outcome": "Kiran secured the meadow gate",
    "vibe": "gentle",
    "theme": "stewardship"
  },
  {
    "id": "lighthouse_step",
    "title": "The Lighthouse Step",
    "name": "Mara",
    "place": "the lighthouse stair",
    "object": "a coil of rope",
    "challenge": "a loose step before inspection",
    "clue": "salt crystals sparkled around one screw",
    "helper": "Keeper Dain",
    "advice": "the sea writes warnings in salt",
    "image": "waves folded themselves against the rocks",
    "evidence": "the rope held steady as the step was repaired",
    "outcome": "Mara made the stair safe before sunset",
    "vibe": "brisk",
    "theme": "safety and tradition"
  },
  {
    "id": "museum_courtyard",
    "title": "Courtyard of Fossils",
    "name": "Talia",
    "place": "the museum courtyard",
    "object": "a fossil rubbing",
    "challenge": "a broken display chain",
    "clue": "chalk marks circled the oldest stone",
    "helper": "Dr Moss",
    "advice": "old things can still need quick help",
    "image": "fern shadows trembled over the stone floor",
    "evidence": "the rubbing matched the fossil by the north wall",
    "outcome": "Talia restored the chain around the fossil bed",
    "vibe": "curious",
    "theme": "heritage protection"
  },
  {
    "id": "school_radio",
    "title": "The School Radio Signal",
    "name": "Dylan",
    "place": "the radio room",
    "object": "a pair of headphones",
    "challenge": "a crackling broadcast",
    "clue": "the loose cable ticked against the desk leg",
    "helper": "Ms Ebo",
    "advice": "listen for the smallest repeated fault",
    "image": "red lights blinked like tiny warnings",
    "evidence": "the signal cleared when the cable was clipped",
    "outcome": "Dylan restored the lunchtime broadcast",
    "vibe": "focused",
    "theme": "communication repair"
  },
  {
    "id": "forest_steps",
    "title": "Forest Steps After Rain",
    "name": "Ivy",
    "place": "the forest steps",
    "object": "a yellow raincoat",
    "challenge": "a blocked drainage runnel",
    "clue": "leaves had gathered above one hidden groove",
    "helper": "Ranger Sol",
    "advice": "water always explains the slope",
    "image": "raindrops balanced on the moss like beads",
    "evidence": "clear water ran down the freed groove",
    "outcome": "Ivy cleared the steps for the walking group",
    "vibe": "fresh",
    "theme": "environmental care"
  },
  {
    "id": "pottery_shed",
    "title": "The Pottery Shed Shelf",
    "name": "Luca",
    "place": "the pottery shed",
    "object": "a clay stamp",
    "challenge": "a cracked drying shelf",
    "clue": "one bowl carried a square imprint",
    "helper": "Nan Pearl",
    "advice": "clay remembers pressure",
    "image": "dust rose softly in the strip of window light",
    "evidence": "the square imprint matched the missing shelf brace",
    "outcome": "Luca fixed the shelf before the bowls dried",
    "vibe": "hands-on",
    "theme": "craft problem solving"
  },
  {
    "id": "weather_kiosk",
    "title": "Weather Kiosk Notes",
    "name": "Mina",
    "place": "the park weather kiosk",
    "object": "a rain chart",
    "challenge": "a confusing forecast board",
    "clue": "old raindrops stained only the west side",
    "helper": "Mr Pike",
    "advice": "weather leaves evidence before it leaves numbers",
    "image": "wind tugged the notices into fluttering wings",
    "evidence": "the west-side stain matched the broken seal",
    "outcome": "Mina corrected the forecast board",
    "vibe": "observant",
    "theme": "using data and clues"
  },
  {
    "id": "underground_stream",
    "title": "The Underground Stream",
    "name": "Arun",
    "place": "the dry valley path",
    "object": "a listening stick",
    "challenge": "a missing water marker",
    "clue": "grass grew greener above the buried channel",
    "helper": "Aunt Meera",
    "advice": "hidden water still changes what grows",
    "image": "the valley seemed to breathe under the turf",
    "evidence": "the stick picked up the stream's soft tapping",
    "outcome": "Arun replaced the water marker accurately",
    "vibe": "thoughtful",
    "theme": "hidden systems"
  },
  {
    "id": "carousel_paint",
    "title": "Carousel Paint Day",
    "name": "Jude",
    "place": "the fairground carousel",
    "object": "a jar of blue paint",
    "challenge": "a chipped horse panel",
    "clue": "old brushstrokes curved under the new scratch",
    "helper": "Mrs Vale",
    "advice": "restoring means listening to the first painter",
    "image": "the carousel mirrors caught pieces of sky",
    "evidence": "the old brushstroke guided the new blue line",
    "outcome": "Jude repaired the horse without hiding its age",
    "vibe": "colourful",
    "theme": "respectful restoration"
  },
  {
    "id": "maple_square",
    "title": "Maple Square Leaves",
    "name": "Sana",
    "place": "Maple Square",
    "object": "a city tree tag",
    "challenge": "a young tree leaning sideways",
    "clue": "fresh soil had slipped from the windward root",
    "helper": "Mr Lin",
    "advice": "trees show strain before they fall",
    "image": "red leaves turned the pavement into a small fire",
    "evidence": "the tag number matched the care-list warning",
    "outcome": "Sana helped brace the young maple",
    "vibe": "autumnal",
    "theme": "community care"
  },
  {
    "id": "harp_room",
    "title": "The Harp Room",
    "name": "Ada",
    "place": "the music room",
    "object": "a spare harp string",
    "challenge": "a rehearsal that sounded wrong",
    "clue": "one peg turned more easily than the others",
    "helper": "Miss Rowan",
    "advice": "music tells the truth before words do",
    "image": "notes drifted like threads through the room",
    "evidence": "the loose peg tightened and the chord settled",
    "outcome": "Ada tuned the harp before the concert",
    "vibe": "delicate",
    "theme": "sound and precision"
  },
  {
    "id": "castle_drain",
    "title": "Castle Drain Discovery",
    "name": "Kai",
    "place": "the castle yard",
    "object": "an iron trowel",
    "challenge": "a puddle that would not drain",
    "clue": "moss formed a ring near the old grate",
    "helper": "Guide Otto",
    "advice": "castles survived because water had places to go",
    "image": "the walls rose like sleeping giants",
    "evidence": "the hidden drain gurgled when the moss was cleared",
    "outcome": "Kai uncovered the blocked drain",
    "vibe": "historic",
    "theme": "practical history"
  },
  {
    "id": "basket_workshop",
    "title": "Basket Workshop Pattern",
    "name": "Mae",
    "place": "the basket workshop",
    "object": "a willow strip",
    "challenge": "a lopsided basket rim",
    "clue": "one pale strip crossed over instead of under",
    "helper": "Aunt Lila",
    "advice": "patterns fail at the first missed turn",
    "image": "willow curled like ribbons on the table",
    "evidence": "the pale strip showed where the weave had slipped",
    "outcome": "Mae repaired the rim before it dried",
    "vibe": "patient",
    "theme": "pattern correction"
  },
  {
    "id": "desert_gallery",
    "title": "Desert Gallery Light",
    "name": "Omar",
    "place": "the desert gallery",
    "object": "a shade cloth",
    "challenge": "a sunlit display case",
    "clue": "the hottest patch fell across the old ink",
    "helper": "Curator Sen",
    "advice": "light can be useful and harmful at once",
    "image": "sand colours glowed behind the glass",
    "evidence": "the shade cloth cooled the ink panel",
    "outcome": "Omar protected the display from strong light",
    "vibe": "protective",
    "theme": "museum conservation"
  },
  {
    "id": "orchard_bees",
    "title": "The Orchard Bees",
    "name": "Lena",
    "place": "the orchard hives",
    "object": "a smoker tin",
    "challenge": "a hive entrance blocked by grass",
    "clue": "bees walked around one bent stem",
    "helper": "Grandma Noor",
    "advice": "bees draw maps with their bodies",
    "image": "apple blossom foamed along the branches",
    "evidence": "the bees streamed straight once the grass was trimmed",
    "outcome": "Lena opened the hive entrance safely",
    "vibe": "lively",
    "theme": "animal observation"
  },
  {
    "id": "canopy_walk",
    "title": "The Canopy Walk",
    "name": "Tom",
    "place": "the treetop walkway",
    "object": "a measuring tape",
    "challenge": "a sagging handrail",
    "clue": "lichen was rubbed from one bolt head",
    "helper": "Ranger Fen",
    "advice": "height makes small faults matter more",
    "image": "leaves flickered below like green water",
    "evidence": "the rubbed bolt tightened the sagging rail",
    "outcome": "Tom made the walkway safe for visitors",
    "vibe": "high",
    "theme": "risk awareness"
  },
  {
    "id": "printing_press",
    "title": "The Printing Press Smudge",
    "name": "Eve",
    "place": "the print room",
    "object": "a tray of metal letters",
    "challenge": "a smudged festival poster",
    "clue": "one letter sat upside down in the chase",
    "helper": "Mr Greaves",
    "advice": "printing rewards slow eyes",
    "image": "ink shone like dark water on the roller",
    "evidence": "the upside-down letter explained the smudge",
    "outcome": "Eve reset the poster before the run began",
    "vibe": "absorbing",
    "theme": "accuracy in work"
  },
  {
    "id": "planetarium_mat",
    "title": "Planetarium Floor Mat",
    "name": "Zara",
    "place": "the planetarium entrance",
    "object": "a star-patterned mat",
    "challenge": "a queue slipping on wet tiles",
    "clue": "one corner of the mat curled towards the door",
    "helper": "Dad",
    "advice": "small hazards become big when people rush",
    "image": "stars swam across the dark ceiling",
    "evidence": "the curled corner lay flat under the safety strip",
    "outcome": "Zara fixed the mat before the next group entered",
    "vibe": "busy",
    "theme": "looking after others"
  },
  {
    "id": "reed_boat",
    "title": "Reed Boat at Low Tide",
    "name": "Hugo",
    "place": "the reed boat shed",
    "object": "a bundle of dry reeds",
    "challenge": "a boat seam opening",
    "clue": "fresh fibres stuck out along the stern",
    "helper": "Captain Elin",
    "advice": "water finds the impatient join",
    "image": "low tide left the mud shining like bronze",
    "evidence": "the stern seam tightened after the reed was woven back",
    "outcome": "Hugo helped seal the boat before launch",
    "vibe": "resourceful",
    "theme": "traditional making"
  },
  {
    "id": "stone_circle",
    "title": "Stone Circle Dawn",
    "name": "Nell",
    "place": "the stone circle",
    "object": "a wool scarf",
    "challenge": "a missing path marker",
    "clue": "dew darkened one narrow track between stones",
    "helper": "Ranger Alba",
    "advice": "ancient places need modern care",
    "image": "morning light tipped the stones with gold",
    "evidence": "the dew track led to the fallen marker",
    "outcome": "Nell replaced the marker before visitors arrived",
    "vibe": "reverent",
    "theme": "care for ancient places"
  }
];
const PHASE5_NON_FICTION_TOPICS = [
  [
    "winter market safety",
    "safe market layouts use clear signs, warm lighting and managed crowd routes",
    "cold weather can make surfaces slippery and signs harder to see",
    "stall holders can use repeated colours and fixed meeting points to guide visitors"
  ],
  [
    "riverside theatre acoustics",
    "open-air theatres depend on sound, wind and careful seating",
    "water and stone can reflect voices in useful or confusing ways",
    "simple tests before a performance help crews place speakers and props"
  ],
  [
    "hilltop beacons",
    "beacons were signal fires placed where many people could see them",
    "height made messages travel quickly across valleys",
    "modern safety checks keep ceremonial beacons controlled and useful"
  ],
  [
    "seed conservation",
    "seed banks and glasshouses protect plant varieties for the future",
    "temperature and labels must be checked carefully",
    "recording small changes helps gardeners avoid losing rare plants"
  ],
  [
    "quarry safety",
    "old quarries can be interesting habitats but risky places",
    "loose rock and echoes can mislead walkers",
    "marked routes and inspections reduce accidents"
  ],
  [
    "bread making",
    "bread changes because yeast, heat and time work together",
    "too little time leaves dough heavy",
    "timers and observation both matter to a baker"
  ],
  [
    "wetland bird hides",
    "bird hides let people watch wildlife without disturbing it",
    "quiet behaviour protects nests and feeding birds",
    "markers and field guides help visitors record sightings accurately"
  ],
  [
    "rooftop gardens",
    "rooftop gardens can grow food and cool city buildings",
    "wind and shallow soil make watering difficult",
    "water gauges and sheltering screens help plants survive"
  ],
  [
    "limestone caves",
    "limestone caves form when water slowly dissolves rock",
    "air movement can reveal hidden passages",
    "guides protect visitors and fragile formations"
  ],
  [
    "local archives",
    "archives protect maps, letters and records for future readers",
    "careful catalogues help people find old evidence",
    "light, dust and handling can damage paper"
  ],
  [
    "rock pool rescue",
    "rock pools are small habitats shaped by the tide",
    "creatures can become trapped when water falls",
    "careful rescue returns animals without damaging them"
  ],
  [
    "school observatories",
    "small observatories help pupils study the night sky",
    "star charts turn patterns into useful directions",
    "domes and lenses need regular maintenance"
  ],
  [
    "festival lighting",
    "festival lighting depends on safe spacing and repeated patterns",
    "one missing hook can break a whole line",
    "testing before dusk prevents problems later"
  ],
  [
    "railway yard checks",
    "railway yards use routine inspections to keep wagons safe",
    "oil marks and loose bolts can warn of faults",
    "reporting small signs prevents larger delays"
  ],
  [
    "wildflower meadows",
    "wildflower meadows support insects, birds and soil health",
    "open gates can damage young plants and paths",
    "seasonal care helps flowers seed properly"
  ],
  [
    "lighthouse maintenance",
    "lighthouses need strong stairs, lights and ropes to work safely",
    "salt can loosen metal and hide damage",
    "keepers inspect small details before storms"
  ],
  [
    "fossil displays",
    "fossil displays show evidence of ancient life",
    "barriers stop visitors from damaging fragile material",
    "rubbings can help learners notice shape without lifting fossils"
  ],
  [
    "school radio",
    "school radio systems turn voices into signals and back again",
    "loose cables can make broadcasts crackle",
    "clear checks keep announcements reliable"
  ],
  [
    "forest drainage",
    "forest paths need drainage so rainwater does not damage steps",
    "leaves can block small grooves",
    "clearing water routes protects both walkers and soil"
  ],
  [
    "pottery drying",
    "pottery must dry evenly before firing",
    "weak shelves and pressure marks can spoil bowls",
    "braces and careful stacking reduce cracks"
  ],
  [
    "weather recording",
    "weather kiosks collect local readings over time",
    "wind, leaks and shade can affect instruments",
    "good records compare numbers with visible evidence"
  ],
  [
    "underground streams",
    "underground streams can shape land even when they are hidden",
    "plants may grow greener above buried water",
    "markers help walkers and scientists map the flow"
  ],
  [
    "carousel restoration",
    "restoring old fairground rides means protecting art and safety",
    "new paint must respect older patterns",
    "photographs and brush marks guide repairs"
  ],
  [
    "city tree care",
    "young city trees need supports, water and space for roots",
    "wind can loosen soil around new trees",
    "tree tags help crews record care needs"
  ],
  [
    "string instruments",
    "string instruments depend on tension, wood and careful tuning",
    "a loose peg changes the sound",
    "small repairs before a concert prevent louder problems"
  ],
  [
    "castle water systems",
    "castles used drains to move rainwater away from walls",
    "blocked drains can create damaging puddles",
    "archaeologists study water routes to understand daily life"
  ],
  [
    "willow weaving",
    "willow baskets are made by repeated over-and-under patterns",
    "one missed turn can twist the rim",
    "damp willow is easier to repair before it dries"
  ],
  [
    "display lighting",
    "museum lighting must help visitors see without harming objects",
    "strong sunlight can fade inks and cloth",
    "shade and monitoring protect delicate displays"
  ],
  [
    "bee behaviour",
    "bees use movement and scent to navigate around a hive",
    "blocked entrances can confuse the colony",
    "careful watching lets beekeepers help without panic"
  ],
  [
    "canopy walkways",
    "canopy walkways let visitors study treetop life",
    "height means rails and bolts need careful checks",
    "maintenance protects people and the habitat below"
  ],
  [
    "printing presses",
    "traditional printing presses arrange letters by hand",
    "one upside-down letter can spoil a whole poster",
    "proof copies help printers catch errors early"
  ],
  [
    "planetarium safety",
    "planetariums guide groups through dark spaces",
    "wet floors and curled mats can cause slips",
    "simple checks protect visitors before a show"
  ],
  [
    "reed boat building",
    "reed boats use flexible bundles tied into watertight shapes",
    "seams must be checked before launch",
    "traditional repairs combine touch, timing and local knowledge"
  ],
  [
    "ancient site paths",
    "ancient monuments need clear paths to protect stones and visitors",
    "dew and footmarks can reveal where people stray",
    "markers guide people without crowding the site"
  ]
];
const PHASE5_POETRY_SETTINGS = [
  [
    "Market After Snow",
    "a quiet market after snow",
    "the tarpaulin",
    "the tarpaulin bows like a sleepy blue animal",
    "Lantern light slips over crates of pears",
    "Cold stalls wait; warm voices begin",
    "ordinary trading places can feel tender after bad weather"
  ],
  [
    "The Empty Stage",
    "a theatre before rehearsal",
    "the curtain",
    "the curtain listens with one red ear",
    "Dust turns slowly in the spotlight",
    "Seats are silent; the river mutters outside",
    "a place can feel ready before people enter"
  ],
  [
    "Beacon Hill",
    "a hilltop at dusk",
    "the fire basket",
    "the fire basket lifts its black ribs to the sky",
    "Clouds bruise purple over the grass",
    "The valley darkens; one spark keeps watch",
    "small signals can carry large hope"
  ],
  [
    "Glasshouse Rain",
    "a glasshouse in rain",
    "the panes",
    "the panes blink with hundreds of silver eyes",
    "Leaves press green hands against the air",
    "Outside is grey; inside keeps growing",
    "shelter can make growth feel precious"
  ],
  [
    "Quarry Echo",
    "an old quarry",
    "the echo",
    "the echo runs ahead on invisible feet",
    "Chalk walls hold the light like milk",
    "The path is still; sound keeps moving",
    "quiet places can answer back"
  ],
  [
    "Bakery Dawn",
    "a bakery at dawn",
    "the oven",
    "the oven hums like a patient giant",
    "Steam curls from bread in pale ribbons",
    "The street sleeps; warm work begins",
    "craft can wake a town gently"
  ],
  [
    "Hide in the Reeds",
    "a bird hide at morning",
    "the reeds",
    "the reeds whisper instructions to the mist",
    "A heron folds itself into grey water",
    "People stay quiet; wings do the talking",
    "watching carefully can feel active"
  ],
  [
    "Rooftop Beds",
    "a rooftop garden",
    "the water butt",
    "the water butt keeps yesterday's storm under its lid",
    "Tomato leaves shine like small flags",
    "Traffic growls below; beans climb upward",
    "green spaces can rise above city noise"
  ],
  [
    "Cavern Drops",
    "a limestone cavern",
    "the dark",
    "the dark cups every sound in both hands",
    "Water stitches silver dots through stone",
    "The torch moves; the cave waits",
    "slow natural work can feel alive"
  ],
  [
    "Archive Morning",
    "a town archive",
    "the drawers",
    "the drawers keep their names buttoned tight",
    "Sun squares lie neatly on the floor",
    "Old maps sleep; new questions arrive",
    "records can make the past feel close"
  ],
  [
    "Sea Pool",
    "a rock pool at low tide",
    "the water",
    "the water holds the sky in a trembling dish",
    "Anemones open like tiny umbrellas",
    "The sea leaves; small lives stay busy",
    "small habitats can feel like whole worlds"
  ],
  [
    "Dome Night",
    "a school observatory",
    "the dome",
    "the dome opens one slow eye",
    "Stars prick the dark like careful pins",
    "The playground is ordinary; the sky is immense",
    "looking up can change a familiar place"
  ],
  [
    "Bridge Lanterns",
    "a festival footbridge",
    "the lanterns",
    "the lanterns nod to their twins in the stream",
    "Paper flags chatter along the rail",
    "Daylight fades; colours grow louder",
    "celebrations can join people and places"
  ],
  [
    "Rails at Dawn",
    "a railway yard",
    "the rails",
    "the rails hold cold ribbons of morning",
    "Oil glints in small secret moons",
    "Engines wait; checks begin",
    "safe journeys start before passengers arrive"
  ],
  [
    "Meadow Gate",
    "a wildflower meadow",
    "the gate",
    "the gate sighs open on its wooden shoulder",
    "Bees stitch yellow paths through clover",
    "Footsteps pause; grass keeps working",
    "care can protect delicate abundance"
  ],
  [
    "Lighthouse Salt",
    "a lighthouse stair",
    "the salt",
    "the salt writes white warnings on the screw heads",
    "Waves fold and unfold below",
    "The tower stands still; weather keeps speaking",
    "old buildings need daily attention"
  ],
  [
    "Fossil Courtyard",
    "a museum courtyard",
    "the fossil",
    "the fossil sleeps with a leaf-shaped dream",
    "Fern shadows tremble over stone",
    "Children hurry; ancient time stays patient",
    "old evidence can make today feel larger"
  ],
  [
    "Radio Room",
    "a school radio room",
    "the red light",
    "the red light blinks its small command",
    "Wires curl like sleeping snakes",
    "A voice wobbles; the room listens",
    "clear communication depends on hidden care"
  ],
  [
    "Forest Steps",
    "rain-washed forest steps",
    "the moss",
    "the moss drinks quietly from every edge",
    "Drops balance on leaves like beads",
    "Water rushes; roots hold firm",
    "paths and forests need each other"
  ],
  [
    "Pottery Shelf",
    "a pottery shed",
    "the clay",
    "the clay keeps the thumbprint like a secret",
    "Window light slides over bowls",
    "Hands are busy; shelves must wait",
    "making things well means noticing marks"
  ],
  [
    "Weather Kiosk",
    "a park weather kiosk",
    "the chart",
    "the chart lifts its corners like restless wings",
    "Wind tugs numbers across the board",
    "Clouds move fast; careful notes remain",
    "evidence can steady a changing day"
  ],
  [
    "Hidden Stream",
    "a dry valley",
    "the grass",
    "the grass glows greener above the secret water",
    "The path bends around silence",
    "Nothing shows; everything is shaped",
    "hidden forces can guide visible life"
  ],
  [
    "Carousel Horse",
    "a carousel workshop",
    "the mirror",
    "the mirror catches a torn piece of sky",
    "Blue paint brightens the wooden horse",
    "Music is absent; colour remembers it",
    "repair can honour joy from the past"
  ],
  [
    "Maple Square",
    "a city square in autumn",
    "the leaves",
    "the leaves make small fires on the pavement",
    "A young tree leans into the wind",
    "Buses pass; roots learn the city",
    "urban nature needs shared attention"
  ],
  [
    "Harp String",
    "a music room",
    "the string",
    "the string trembles with a silver question",
    "Notes drift like threads through the air",
    "Silence waits; one peg turns",
    "small adjustments can restore harmony"
  ],
  [
    "Castle Puddle",
    "a castle yard",
    "the puddle",
    "the puddle keeps a broken piece of wall",
    "Moss circles the ancient grate",
    "Tourists pass; rain remembers the drains",
    "history often survives through practical details"
  ],
  [
    "Willow Pattern",
    "a basket workshop",
    "the willow",
    "the willow bends without forgetting its path",
    "Pale strips curl on the table",
    "One turn slips; the pattern speaks",
    "craft depends on repeated attention"
  ],
  [
    "Gallery Shade",
    "a museum gallery",
    "the shade cloth",
    "the shade cloth lowers its soft grey hand",
    "Sand colours glow behind glass",
    "Light helps us see; light can harm",
    "protection can be quiet and careful"
  ],
  [
    "Hive Entrance",
    "an orchard hive",
    "the bees",
    "the bees write quick circles in the air",
    "Blossom foams along the branches",
    "Grass blocks the doorway; wings insist",
    "small creatures show what they need"
  ],
  [
    "Canopy Rail",
    "a treetop walkway",
    "the handrail",
    "the handrail leans towards the leaves",
    "Green light flickers like water below",
    "Visitors look out; bolts hold on",
    "high places need trust and checking"
  ],
  [
    "Print Room",
    "a print room",
    "the roller",
    "the roller spreads ink like dark rain",
    "Metal letters wait in tight rows",
    "One mark is wrong; the page tells on it",
    "accuracy can be seen before it is explained"
  ],
  [
    "Planetarium Queue",
    "a planetarium entrance",
    "the floor mat",
    "the floor mat curls one warning corner",
    "Stars swim across the ceiling beyond",
    "Feet hurry; safety asks quietly",
    "wonder still needs ordinary care"
  ],
  [
    "Reed Boat",
    "a reed boat shed",
    "the reeds",
    "the reeds rustle like dry water",
    "Low tide turns mud to bronze",
    "The boat waits; hands close the seam",
    "traditional knowledge can meet the tide"
  ],
  [
    "Stone Circle Dawn",
    "an ancient stone circle",
    "the stones",
    "the stones wear dawn on their shoulders",
    "Dew draws a secret path through grass",
    "Visitors will come; morning guards the place",
    "care keeps old places open to everyone"
  ]
];

const PUNCT_SKILLS = ['P1', 'P2', 'P3', 'P4'];

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function tokenWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 2)
    .slice(0, 4);
}

function compactId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
}

function makeFictionBlocks(unit, index) {
  const variants = [
    [
      `${unit.name} reached ${unit.place} before the morning had properly begun. ${unit.image}. In one pocket sat ${unit.object}; in the other was a list of jobs that should have been simple. Instead, everyone was talking about ${unit.challenge}.`,
      `At first ${unit.name} wanted to rush towards the loudest complaint, but ${unit.helper} raised one hand and said, "${unit.advice}." That made ${unit.name} slow down. Near the edge of ${unit.place}, ${unit.clue}.`,
      `The small clue changed the whole problem. ${unit.name} compared it with ${unit.object}, checked the nearby marks and asked two careful questions. The answer was not hidden far away; it had been waiting in the ordinary details that most people had stepped around.`,
      `By midday, ${unit.evidence}. People who had been hurrying began to speak more quietly, because the place felt properly understood again. ${unit.outcome}. ${unit.name} left feeling ${unit.end}, no longer ${unit.start}.`
    ],
    [
      `Everyone at ${unit.place} was already talking about ${unit.challenge} when ${unit.name} arrived with ${unit.object}. ${unit.image}. The morning felt ${unit.vibe}, and the easiest answer sounded too quick to be trusted.`,
      `"${unit.advice}," warned ${unit.helper}, so ${unit.name} stopped and listened to the quieter parts of the scene. The important sign was not in the crowd; it was ${unit.clue}.`,
      `${unit.name} tested the clue against ${unit.object}, checked the nearby marks and asked two careful questions. Each answer made the problem smaller. The solution had been waiting in the ordinary details, not in the loudest complaint.`,
      `When ${unit.evidence}, the place seemed to breathe again. ${unit.outcome}. By the end, ${unit.name} felt ${unit.end} rather than ${unit.start}, and understood more about ${unit.theme}.`
    ],
    [
      `${unit.image}. That was the first thing ${unit.name} noticed at ${unit.place}, even before anyone explained ${unit.challenge}. ${unit.object} felt ordinary in one pocket, but it soon became useful.`,
      `${unit.helper} did not give the answer away. Instead, ${unit.helper} said, "${unit.advice}." The advice made ${unit.name} look again until ${unit.clue}.`,
      `The clue gave the investigation a new shape. ${unit.name} compared it with ${unit.object}, checked the nearby marks and asked two careful questions. What looked confusing had been waiting in the ordinary details all along.`,
      `The proof came when ${unit.evidence}. After that, ${unit.outcome}. The change from ${unit.start} to ${unit.end} shows why ${unit.theme} matters in the story.`
    ],
    [
      `${unit.challenge} should have made ${unit.place} noisy and muddled, but ${unit.name} noticed ${unit.image}. ${unit.object} was the only thing ${unit.name} had brought that seemed useful.`,
      `A hurried search would have missed the clue. ${unit.helper} said, "${unit.advice}," and ${unit.name} began again, more slowly. Soon, ${unit.clue}.`,
      `That detail made ${unit.name} compare what was seen with ${unit.object}. After checking the nearby marks, ${unit.name} asked two careful questions. The answer was waiting in the ordinary details, where patient eyes could find it.`,
      `${unit.evidence}, and the earlier worry changed into relief. ${unit.outcome}. The ending leaves ${unit.name} ${unit.end}, no longer ${unit.start}.`
    ],
    [
      `At ${unit.place}, ${unit.name} carried ${unit.object} and tried to understand why ${unit.challenge} had unsettled everyone. ${unit.image}. The scene looked busy, but one detail did not fit.`,
      `${unit.helper}'s advice was brief: "${unit.advice}." It sent ${unit.name} away from the noise and towards the edge of the problem, where ${unit.clue}.`,
      `From there, ${unit.name} worked carefully. ${unit.object} was compared with the marks nearby, and ${unit.name} asked two careful questions. The answer was waiting in the ordinary details, held inside what others had overlooked.`,
      `The investigation ended when ${unit.evidence}. ${unit.outcome}. The story's final feeling is ${unit.end} because ${unit.theme} has been understood.`
    ],
    [
      `${unit.name} began the day feeling ${unit.start}. At ${unit.place}, ${unit.challenge} had turned a simple morning into a puzzle. ${unit.image}, and ${unit.object} rested ready in ${unit.name}'s pocket.`,
      `Instead of solving the problem for ${unit.name}, ${unit.helper} offered a rule: "${unit.advice}." Following it, ${unit.name} found that ${unit.clue}.`,
      `The discovery mattered because it connected to ${unit.object}. ${unit.name} checked the nearby marks and asked two careful questions. The truth had been waiting in the ordinary details, close enough for a careful reader to notice.`,
      `By the time ${unit.evidence}, the puzzle had changed into proof. ${unit.outcome}. ${unit.name} ended the episode feeling ${unit.end}, with a clearer sense of ${unit.theme}.`
    ]
  ];
  return variants[index % variants.length];
}

function makeNonFictionBlocks({ title, titleTopic, main, problem, solution }, index) {
  const variants = [
    [
      `${title} may look simple at first, but it depends on observation, planning and repeated checks. ${main}. This means that people need both practical skill and patient attention.`,
      `One important reason is that ${problem}. When this happens, the problem is usually easier to fix early than late. Careful records, visible labels and agreed routines help people notice the warning signs before they grow.`,
      `A second reason is that ${solution}. The best systems are not dramatic; they are steady. They give people a clear sequence: inspect the place, compare the evidence, make one safe change, then check the result.`,
      `For learners, ${titleTopic} is useful because it shows how evidence works outside a classroom. A small mark, sound, shadow or pattern can explain a bigger process. The main lesson is that careful observation turns a confusing situation into a solvable one.`
    ],
    [
      `${title} begins with a practical idea: ${main}. Observation, planning and repeated checks stop the work becoming guesswork, especially when many people share the same space.`,
      `The risk is clear because ${problem}. When this happens, the problem is usually easier to fix early than late. Records and labels are not decoration; they help people notice the warning signs before they grow.`,
      `${solution}. That response works best when it stays calm and ordered. They give people a clear sequence: inspect the place, compare the evidence, make one safe change, then check the result.`,
      `${titleTopic} therefore teaches a wider reading skill. A small mark, sound, shadow or pattern can explain a bigger process, and careful observation turns a confusing situation into a solvable one.`
    ],
    [
      `To understand ${titleTopic}, start with the evidence. ${main}. The work depends on observation, planning and repeated checks rather than one dramatic action.`,
      `Problems become harder when ${problem}. When this happens, the problem is usually easier to fix early than late. Agreed routines help people notice the warning signs before they grow.`,
      `The practical answer is that ${solution}. They give people a clear sequence: inspect the place, compare the evidence, make one safe change, then check the result.`,
      `The same habit helps readers. In ${titleTopic}, a small mark, sound, shadow or pattern can explain a bigger process, so careful observation turns a confusing situation into a solvable one.`
    ],
    [
      `${title} is not only a list of facts. It explains why ${main}. Observation, planning and repeated checks make the subject safer and easier to understand.`,
      `${problem}. This is the warning part of the explanation. When this happens, the problem is usually easier to fix early than late. People can usually solve it if they notice the warning signs before they grow.`,
      `The response is practical: ${solution}. They give people a clear sequence: inspect the place, compare the evidence, make one safe change, then check the result.`,
      `For learners, ${titleTopic} shows that evidence can be small but powerful. A small mark, sound, shadow or pattern can explain a bigger process and turn confusion into a solvable problem.`
    ],
    [
      `The first thing to know about ${titleTopic} is that ${main}. It depends on observation, planning and repeated checks because a rushed judgement can miss the useful evidence.`,
      `The passage then warns that ${problem}. When this happens, the problem is usually easier to fix early than late. Early action matters because people can notice the warning signs before they grow.`,
      `Finally, ${solution}. The process stays manageable because they give people a clear sequence: inspect the place, compare the evidence, make one safe change, then check the result.`,
      `${titleTopic} is useful beyond the topic itself. It shows how a small mark, sound, shadow or pattern can explain a bigger process when someone observes carefully.`
    ],
    [
      `A careful explanation of ${titleTopic} has to begin with what can be seen. ${main}. Observation, planning and repeated checks give that evidence a reliable pattern.`,
      `The challenge is that ${problem}. When this happens, the problem is usually easier to fix early than late. Careful checks help people notice the warning signs before they grow.`,
      `${solution}. This is why the text values routine. They give people a clear sequence: inspect the place, compare the evidence, make one safe change, then check the result.`,
      `The final lesson is about evidence. In ${titleTopic}, a small mark, sound, shadow or pattern can explain a bigger process and make a confusing situation solvable.`
    ]
  ];
  return variants[index % variants.length];
}

function makePoetryBlocks({ title, place, object, personified, image, contrast, theme }, index) {
  const variants = [
    [
      `At ${place},\n${image}.\n${contrast},\nand the morning waits nearby.`,
      `${personified}.\nA small sound moves like careful footsteps; shadows lean and listen close.\nNo one hurries the hidden work\nthat gathers in the light.`,
      `The ordinary place seems larger\nwhen every detail has a task.\nThe poem leaves the reader thinking\nthat ${theme}.`
    ],
    [
      `${image}\nat ${place}.\nThe air keeps still,\nthough ${contrast}.`,
      `A small sound moves like careful footsteps; shadows lean and listen close.\n${personified}.\nThe hidden work is quiet,\nbut it changes how the morning feels.`,
      `When every detail has a task,\nThe ordinary place seems larger.\nThe poem's last thought is\nthat ${theme}.`
    ],
    [
      `${contrast}\nwhile ${image}.\nAt ${place},\nthe day opens without hurry.`,
      `${personified}.\nNo one names the hidden work at first.\nA small sound moves like careful footsteps; shadows lean and listen close,\nand light gathers piece by piece.`,
      `The ordinary place seems larger\nbecause every detail has a task.\nThe reader is left with the idea\nthat ${theme}.`
    ],
    [
      `At ${place}, the first sign is this:\n${image}.\nThen ${contrast},\nsoftening the edge of the scene.`,
      `${personified}.\nA small sound moves like careful footsteps; shadows lean and listen close.\nThe hidden work continues\nunder ordinary light.`,
      `Every detail has a task,\nso The ordinary place seems larger.\nBy the end, the poem suggests\nthat ${theme}.`
    ],
    [
      `${image}.\nAt ${place},\n${contrast},\nand nothing needs to hurry.`,
      `Hidden work gathers in the quiet.\n${personified}.\nA small sound moves like careful footsteps; shadows lean and listen close,\nas if the place is listening back.`,
      `The ordinary place seems larger\nwhen every detail has a task.\nThe final feeling is\nthat ${theme}.`
    ],
    [
      `The poem begins at ${place},\nwhere ${image}.\n${contrast},\nleaving room for silence.`,
      `A small sound moves like careful footsteps; shadows lean and listen close.\n${personified}.\nThe hidden work is not announced,\nbut the scene keeps changing.`,
      `Because every detail has a task,\nThe ordinary place seems larger.\nThe closing thought is\nthat ${theme}.`
    ]
  ];
  return variants[index % variants.length];
}

function makeFictionPassage(unit, index) {
  const baseId = `phase5_fiction_${unit.id}`;
  const q = (n) => `${baseId}_q${n}`;
  const punctSkill = PUNCT_SKILLS[index % PUNCT_SKILLS.length];
  const objectWords = tokenWords(unit.object);
  const clueWords = tokenWords(unit.clue);
  const outcomeWords = tokenWords(unit.outcome);
  return {
    id: baseId,
    title: unit.title,
    genre: 'fiction',
    difficulty: 3 + (index % 3),
    isLong: true,
    blocks: makeFictionBlocks(unit, index),
    questions: [
      {
        id: q(1), type: 'short', skill: '2b', marks: 1,
        stem: `Before ${unit.challenge}, which pocket object helps ${unit.name} investigate ${unit.theme}?`,
        check: { keywordAny: [objectWords] },
        modelAnswer: `${unit.name} carries ${unit.object}.`,
        explanation: `The opening paragraph says that ${unit.object} is in ${unit.name}'s pocket.`,
        hint: 'Look in the opening paragraph for the object in the pocket.'
      },
      {
        id: q(2), type: 'mcq', skill: '2a', marks: 1,
        stem: `After ${unit.name} notices ${unit.clue}, what does "ordinary details" suggest?`,
        options: ['unimportant facts that should be ignored', 'small clues that are easy to miss but useful', 'expensive objects kept out of sight', 'rules that stop anyone helping'],
        correct: 1,
        modelAnswer: `In ${unit.title}, "ordinary details" means small clues that are easy to miss but useful.`,
        explanation: `${unit.name} solves the problem by slowing down and noticing small evidence.`,
        hint: 'Use what helps the character solve the problem.'
      },
      {
        id: q(3), type: 'evidenceShort', skill: '2d', marks: 2,
        stem: `How does ${unit.name} move from feeling ${unit.start} to feeling ${unit.end} while solving ${unit.challenge}? Use a short quotation or phrase as evidence.`,
        answerCheck: { keywordAny: [['slow', 'down'], ['small', 'clue'], ['careful', 'question'], clueWords] },
        evidenceCheck: { containsAny: [unit.clue, 'asked two careful questions', 'waiting in the ordinary details'] },
        answerMarks: 1,
        evidenceMarks: 1,
        modelAnswer: `${unit.name} solves the problem by slowing down and using small clues, such as "${unit.clue}".`,
        explanation: 'The text shows that careful observation, not rushing, leads to the solution.',
        hint: 'Say what the character does, then quote the clue that proves it.'
      },
      {
        id: q(4), type: 'mcq', skill: '2c', marks: 2,
        stem: `Which summary best links ${unit.challenge} with the clue at ${unit.place}?`,
        options: [`${unit.name} ignores the clue and leaves ${unit.place} unchanged.`, `${unit.name} uses a small clue at ${unit.place} to solve ${unit.challenge}.`, `${unit.helper} solves everything while ${unit.name} refuses to help.`, `${unit.name} hides ${unit.object} because it is too valuable.`],
        correct: 1,
        modelAnswer: `${unit.name} uses a small clue at ${unit.place} to solve ${unit.challenge}.`,
        explanation: 'The summary needs to include both the problem and the way it is solved.',
        hint: 'Choose the option that includes the problem and the evidence-based solution.'
      },
      {
        id: q(5), type: 'open', skill: '2g', marks: 2,
        stem: `Why is the opening image "${unit.image}" effective before ${unit.name} finds ${unit.clue}?`,
        rubric: [
          { label: 'Explains vivid image', check: { keywordAny: [['vivid'], ['picture'], ['imag'], ['see'], ['setting']] } },
          { label: 'Links image to atmosphere', check: { keywordAny: [['mood'], ['atmosphere'], ['feel'], ['place'], ['reader']] } }
        ],
        modelAnswer: `The image "${unit.image}" makes ${unit.place} vivid and helps the reader feel the ${unit.vibe} atmosphere before the problem begins.`,
        explanation: 'A strong answer explains both the picture created and its effect on the reader.',
        hint: 'Think about what the image helps you see and feel.'
      },
      {
        id: q(6), type: 'short', skill: '2e', marks: 1,
        stem: `After ${unit.outcome}, what is ${unit.name} most likely to do next when another small clue appears?`,
        check: { keywordAny: [['notice'], ['careful'], ['help'], ['check'], ['small', 'clue'], outcomeWords] },
        modelAnswer: `${unit.name} is likely to keep noticing small clues carefully when helping again.`,
        explanation: `The ending shows ${unit.name} becoming ${unit.end} after solving the problem by noticing details.`,
        hint: 'Base your prediction on how the character changes by the end.'
      },
      {
        id: q(7), type: 'match', skill: '2h', marks: 2,
        stem: `Match ${unit.object}, ${unit.clue} and ${unit.evidence} to their roles in the investigation.`,
        prompts: [unit.object, unit.clue, unit.evidence],
        options: ['the item carried by the main character', 'the small clue that changes the investigation', 'the proof that the problem has been solved'],
        correctMap: { 0: '0', 1: '1', 2: '2' },
        modelAnswer: `${unit.object} is carried by ${unit.name}; "${unit.clue}" is the clue; "${unit.evidence}" is proof of the solution.`,
        explanation: 'The task compares the job each detail has in the story.',
        hint: 'Ask whether each detail is an object, a clue, or a result.'
      },
      {
        id: q(8), type: 'order', skill: '2f', marks: 2,
        stem: `Put the movement from ${unit.challenge} to "${unit.evidence}" in order.`,
        items: [`${unit.name} hears about ${unit.challenge}.`, `${unit.name} notices ${unit.clue}.`, `${unit.outcome}.`],
        correctPositions: [1, 2, 3],
        modelAnswer: `In ${unit.title}: first the problem appears, then ${unit.name} notices the clue, and finally ${unit.outcome}.`,
        explanation: 'The order follows the story structure from problem to clue to outcome.',
        hint: 'Follow the paragraphs from beginning to end.'
      },
      {
        id: q(9), type: 'multiSelect', skill: '2d', marks: 2,
        stem: `Which two statements about ${unit.name}'s response to ${unit.clue} are supported by the story?`,
        options: [`${unit.name} learns to slow down and observe carefully.`, `${unit.name} uses ${unit.clue} as an important clue.`, `${unit.name} refuses to listen to ${unit.helper}.`, `${unit.name} decides that small details never matter.`],
        correctSet: [0, 1],
        modelAnswer: `${unit.name} observes carefully and uses "${unit.clue}" as an important clue.`,
        explanation: 'Both correct choices are directly supported by the story.',
        hint: 'Choose statements that match what actually happens.'
      },
      {
        id: q(10), type: 'mcq', skill: punctSkill, marks: 2,
        stem: `When ${unit.helper} says "${unit.advice}.", what do the speech marks show?`,
        options: [`They show the exact words spoken by ${unit.helper}.`, 'They show the title of a book.', 'They mark the end of a question.', 'They introduce a list of three things.'],
        correct: 0,
        modelAnswer: `The speech marks show the exact words spoken by ${unit.helper}.`,
        explanation: 'Speech marks are used around direct speech.',
        hint: 'Look at who is speaking in paragraph 2.'
      }
    ]
  };
}

function makeNonFictionPassage(topic, index) {
  const [titleTopic, main, problem, solution] = topic;
  const topicId = titleTopic;
  const baseId = `phase5_nonfiction_${compactId(topicId)}`;
  const q = (n) => `${baseId}_q${n}`;
  const punctSkill = PUNCT_SKILLS[(index + 1) % PUNCT_SKILLS.length];
  const title = titleTopic.replace(/\b\w/g, (c) => c.toUpperCase());
  const keyPhrase = main.split(' ').slice(0, 7).join(' ');
  const problemPhrase = problem.split(' ').slice(0, 8).join(' ');
  const solutionPhrase = solution.split(' ').slice(0, 8).join(' ');
  return {
    id: baseId,
    title: `How ${titleTopic.replace(/^./, (c) => c.toUpperCase())} Works`,
    genre: 'non-fiction',
    difficulty: 3 + (index % 3),
    isLong: true,
    blocks: makeNonFictionBlocks({ title, titleTopic, main, problem, solution }, index),
    questions: [
      {
        id: q(1), type: 'short', skill: '2b', marks: 1,
        stem: `Which three practical habits does ${titleTopic} depend on before ${problemPhrase}?`,
        check: { keywordAny: [['observation', 'planning'], ['repeated', 'check'], ['practical', 'skill']] },
        modelAnswer: `${titleTopic} depends on observation, planning and repeated checks.`,
        explanation: 'The first paragraph lists the three things directly.',
        hint: 'Look at the first sentence after the topic is introduced.'
      },
      {
        id: q(2), type: 'mcq', skill: '2a', marks: 1,
        stem: `When records and labels track "${problemPhrase}" in ${titleTopic}, what does "agreed routines" mean?`,
        options: ['steps that people have decided to follow', 'arguments that never end', 'objects that are too fragile to touch', 'marks that cannot be explained'],
        correct: 0,
        modelAnswer: `In ${titleTopic}, agreed routines are steps that people have decided to follow.`,
        explanation: 'The phrase is used with records and labels that help people check carefully.',
        hint: 'Use the words around records and warning signs.'
      },
      {
        id: q(3), type: 'evidenceShort', skill: '2d', marks: 2,
        stem: `Why is it better to notice "${problemPhrase}" early in ${titleTopic}? Use a short quotation or phrase as evidence.`,
        answerCheck: { keywordAny: [['easier', 'fix', 'early'], ['warning', 'sign'], ['before', 'grow']] },
        evidenceCheck: { containsAny: ['easier to fix early than late', 'notice the warning signs before they grow', problemPhrase] },
        answerMarks: 1,
        evidenceMarks: 1,
        modelAnswer: `In ${titleTopic}, problems are easier to solve before they become bigger; the text says they are "easier to fix early than late".`,
        explanation: 'The second paragraph explains the value of early warning signs.',
        hint: 'Find the sentence that contrasts early and late.'
      },
      {
        id: q(4), type: 'mcq', skill: '2c', marks: 2,
        stem: `Which summary best connects ${keyPhrase} with ${solutionPhrase}?`,
        options: [`${titleTopic} is only about memorising facts.`, `${titleTopic} shows how careful observation and routines help people solve practical problems.`, `${titleTopic} works best when people avoid evidence.`, `${titleTopic} is useful only when there is no problem to solve.`],
        correct: 1,
        modelAnswer: `${titleTopic} shows how careful observation and routines help people solve practical problems.`,
        explanation: 'The whole passage links observation, routines and evidence-based solutions.',
        hint: 'Choose the option that covers the whole passage, not just one detail.'
      },
      {
        id: q(5), type: 'open', skill: '2f', marks: 2,
        stem: `How does the solution paragraph about "${solutionPhrase}" build on the warning in "${problemPhrase}"?`,
        rubric: [
          { label: 'Identifies move from problem to response', check: { keywordAny: [['problem'], ['solution'], ['response'], ['second', 'reason']] } },
          { label: 'Mentions sequence or safe change', check: { keywordAny: [['sequence'], ['inspect'], ['compare'], ['safe', 'change'], ['check', 'result']] } }
        ],
        modelAnswer: `In ${titleTopic}, paragraph 2 explains a possible problem, while paragraph 3 moves to the steady sequence people can use to respond safely.`,
        explanation: 'This asks about structure: problem first, then practical response.',
        hint: 'Look at the first sentence of each paragraph.'
      },
      {
        id: q(6), type: 'open', skill: '2g', marks: 2,
        stem: `Why does the writer connect a small "mark, sound, shadow or pattern" with ${solutionPhrase} in ${titleTopic}?`,
        rubric: [
          { label: 'Shows small evidence can matter', check: { keywordAny: [['small', 'evidence'], ['clue'], ['detail'], ['pattern']] } },
          { label: 'Links to bigger understanding', check: { keywordAny: [['bigger'], ['process'], ['explain'], ['understand'], ['solve']] } }
        ],
        modelAnswer: `In ${titleTopic}, the phrase shows that small evidence can reveal how a bigger process is working, so careful noticing can solve a confusing problem.`,
        explanation: 'The language makes observation feel useful and active.',
        hint: 'Think about how tiny clues help people understand larger systems.'
      },
      {
        id: q(7), type: 'match', skill: '2h', marks: 2,
        stem: `Match the records, labels and sequence around "${keyPhrase}" to their jobs in the explanation.`,
        prompts: ['careful records', 'visible labels', 'a clear sequence'],
        options: ['help people return to evidence', 'make warning signs easier to notice', 'organise the response into safe steps'],
        correctMap: { 0: '0', 1: '1', 2: '2' },
        modelAnswer: `In ${titleTopic}, careful records keep evidence; visible labels help warning signs stand out; a clear sequence organises safe action.`,
        explanation: 'The details have different roles within the explanation.',
        hint: 'Link each detail to what it helps people do.'
      },
      {
        id: q(8), type: 'order', skill: '2f', marks: 2,
        stem: `Put the safe sequence for responding to ${problemPhrase} in order.`,
        items: ['inspect the place', 'compare the evidence', 'make one safe change', 'check the result'],
        correctPositions: [1, 2, 3, 4],
        modelAnswer: `In ${titleTopic}, the sequence is: inspect the place, compare the evidence, make one safe change, then check the result.`,
        explanation: 'The order is stated directly in paragraph 3.',
        hint: 'Use the colon-like list after "clear sequence".'
      },
      {
        id: q(9), type: 'multiSelect', skill: '2b', marks: 2,
        stem: `Which two statements are true about ${keyPhrase} and ${solutionPhrase}?`,
        options: [`${keyPhrase}.`, `${solutionPhrase}.`, 'Evidence is described as useless outside classrooms.', 'Problems should always be left until late.'],
        correctSet: [0, 1],
        modelAnswer: `The text says that ${main} and that ${solution}.`,
        explanation: 'Both correct choices retrieve information from the passage.',
        hint: 'Choose statements that are actually stated in the passage.'
      },
      {
        id: q(10), type: 'mcq', skill: punctSkill, marks: 1,
        stem: `In the sequence for "${solutionPhrase}", what does the colon in "They give people a clear sequence: inspect the place..." do?`,
        options: ['It introduces the steps in the sequence.', 'It shows a character is speaking.', 'It marks a question.', 'It joins two unrelated titles.'],
        correct: 0,
        modelAnswer: `In ${titleTopic}, the colon introduces the steps in the sequence.`,
        explanation: 'The colon prepares the reader for the list of steps that follows.',
        hint: 'Look at what comes immediately after the colon.'
      }
    ]
  };
}

function makePoetryPassage(setting, index) {
  const [title, place, object, personified, image, contrast, theme] = setting;
  const baseId = `phase5_poetry_${compactId(title)}`;
  const q = (n) => `${baseId}_q${n}`;
  const punctSkill = PUNCT_SKILLS[(index + 2) % PUNCT_SKILLS.length];
  return {
    id: baseId,
    title,
    genre: 'poetry',
    difficulty: 3 + (index % 3),
    isLong: true,
    blocks: makePoetryBlocks({ title, place, object, personified, image, contrast, theme }, index),
    questions: [
      {
        id: q(1), type: 'mcq', skill: '2a', marks: 1,
        stem: `At ${place}, what does "hidden work" suggest about ${object}?`,
        options: ['quiet activity that is not immediately obvious', 'a job that has been cancelled', 'a loud argument in the open air', 'a machine that has stopped working'],
        correct: 0,
        modelAnswer: `In ${title}, "hidden work" suggests quiet activity that is not immediately obvious.`,
        explanation: 'The poem shows small details doing something important in a quiet way.',
        hint: 'Use the calm mood of the poem to help.'
      },
      {
        id: q(2), type: 'short', skill: '2b', marks: 1,
        stem: `Which object is personified by the line "${personified}"?`,
        check: { keywordAny: [tokenWords(object)] },
        modelAnswer: `The personified object in ${title} is ${object}.`,
        explanation: `The line "${personified}" gives ${object} a human-like action.`,
        hint: 'Look for the object doing something human-like.'
      },
      {
        id: q(3), type: 'open', skill: '2g', marks: 2,
        stem: `Why is the personified line "${personified}" effective after the image "${image}"?`,
        rubric: [
          { label: 'Recognises personification', check: { keywordAny: [['personif'], ['human'], ['alive'], ['object']] } },
          { label: 'Explains mood or effect', check: { keywordAny: [['mood'], ['effect'], ['feel'], ['reader'], ['image']] } }
        ],
        modelAnswer: `The line personifies ${object}, making ${place} feel alive and helping the reader notice its quiet mood.`,
        explanation: 'The answer should identify the technique and its effect.',
        hint: 'Ask how an object is made to seem almost alive.'
      },
      {
        id: q(4), type: 'mcq', skill: '2c', marks: 2,
        stem: `Which option best summarises the mood created by "${image}" and "${contrast}"?`,
        options: ['rushed and careless', 'quiet, watchful and meaningful', 'angry from beginning to end', 'empty with no activity at all'],
        correct: 1,
        modelAnswer: `${title} has a quiet, watchful and meaningful mood.`,
        explanation: 'The poem is calm, but it gives ordinary details life and purpose.',
        hint: 'Choose the option that fits both quietness and hidden activity.'
      },
      {
        id: q(5), type: 'evidenceShort', skill: '2d', marks: 2,
        stem: `How does the poem make ${place} feel larger after "${contrast}"? Use a short quotation as evidence.`,
        answerCheck: { keywordAny: [['ordinary', 'larger'], ['important'], ['detail', 'task'], ['alive'], ['meaningful']] },
        evidenceCheck: { containsAny: ['The ordinary place seems larger', 'every detail has a task', personified, image] },
        answerMarks: 1,
        evidenceMarks: 1,
        modelAnswer: `In ${title}, the place feels important because every detail has a role; evidence could include "The ordinary place seems larger".`,
        explanation: 'The poem turns small details into meaningful signs.',
        hint: 'Quote a line that changes how the place feels.'
      },
      {
        id: q(6), type: 'short', skill: '2e', marks: 1,
        stem: `What idea about ${theme} is the reader likely to remember after the final stanza?`,
        check: { keywordAny: [tokenWords(theme), ['ordinary', 'place'], ['care'], ['quiet'], ['detail']] },
        modelAnswer: `The reader is likely to remember that ${theme}.`,
        explanation: 'The final line states the idea the poem leaves behind.',
        hint: 'Use the last line of the poem.'
      },
      {
        id: q(7), type: 'match', skill: '2h', marks: 2,
        stem: `Match "${image}", "${personified}" and "${contrast}" to their main effects.`,
        prompts: [image, personified, contrast],
        options: ['creates a visual image', 'personifies an object', 'shows a contrast in the place'],
        correctMap: { 0: '0', 1: '1', 2: '2' },
        modelAnswer: `"${image}" creates a visual image; "${personified}" personifies ${object}; "${contrast}" shows contrast.`,
        explanation: 'Each quotation works in a different way.',
        hint: 'Decide whether each quotation is mainly picture, personification or contrast.'
      },
      {
        id: q(8), type: 'order', skill: '2f', marks: 2,
        stem: `Put the movement from ${place} to the idea that ${theme} in order.`,
        items: [`The poem opens at ${place}.`, `The poem personifies ${object}.`, `The poem leaves the idea that ${theme}.`],
        correctPositions: [1, 2, 3],
        modelAnswer: `The poem moves from ${place}, to personifying ${object}, to the final idea that ${theme}.`,
        explanation: 'The order follows the three stanzas.',
        hint: 'Follow the poem from the first stanza to the last.'
      },
      {
        id: q(9), type: 'multiSelect', skill: '2g', marks: 1,
        stem: `Which choice explains how the language makes ${object} feel active in ${place}?`,
        options: [`It makes ${object} seem almost alive.`, 'It removes all imagery from the poem.', 'It gives only dates and measurements.', 'It tells the reader that the place is meaningless.'],
        correctSet: [0],
        modelAnswer: `In ${title}, the language makes ${object} seem almost alive.`,
        explanation: 'The correct choice describes the effect of personification.',
        hint: 'Choose the option that explains a real language effect.'
      },
      {
        id: q(10), type: 'mcq', skill: punctSkill, marks: 2,
        stem: `In ${title}, near ${object}, what does the semicolon in "A small sound moves like careful footsteps; shadows lean and listen close" help to do?`,
        options: ['It links two closely connected images.', 'It introduces direct speech.', 'It shows the line is a question.', 'It separates a title from an author.'],
        correct: 0,
        modelAnswer: `The semicolon in ${title} links two closely connected images.`,
        explanation: 'Both clauses describe the quiet atmosphere of the poem.',
        hint: 'Look at the ideas on both sides of the semicolon.'
      }
    ]
  };
}

export function buildReadingPhase5Passages() {
  const fiction = PHASE5_UNITS.map(makeFictionPassage);
  const nonFiction = PHASE5_NON_FICTION_TOPICS.map(makeNonFictionPassage);
  const poetry = PHASE5_POETRY_SETTINGS.map(makePoetryPassage);
  return fiction.flatMap((passage, index) => [passage, nonFiction[index], poetry[index]]);
}

export const READING_PHASE5_PASSAGES = deepFreeze(buildReadingPhase5Passages());

export const READING_PHASE5_TEST_PAPERS = deepFreeze(PHASE5_UNITS.map((_, index) => {
  const n = String(index + 1).padStart(2, '0');
  const fiction = READING_PHASE5_PASSAGES[index * 3];
  const nonFiction = READING_PHASE5_PASSAGES[index * 3 + 1];
  const poetry = READING_PHASE5_PASSAGES[index * 3 + 2];
  return {
    id: `paper_phase5_${n}`,
    title: `Reading Expansion Phase 5 Paper ${n}`,
    timeLimitMin: 60,
    totalMarks: 50,
    sections: [
      { passageId: fiction.id, questionIds: fiction.questions.map((question) => question.id) },
      { passageId: nonFiction.id, questionIds: nonFiction.questions.map((question) => question.id) },
      { passageId: poetry.id, questionIds: poetry.questions.map((question) => question.id) },
    ],
  };
}));
