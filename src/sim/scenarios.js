const RENDEZVOUS = [[18, 8], [19, 8], [18, 9], [19, 7], [17, 9]];
const SCREEN_EXIT = [[27, 8], [27, 9], [28, 8], [28, 9], [29, 8], [29, 9]];

export const SCENARIOS = [
  {
    id: 'nevis',
    title: 'Weather Gage off Nevis',
    subtitle: 'Frigate divisions under signal delay, 1799',
    era: 'sail',
    briefing:
      'Command two frigates in confused trade-wind waters. Preserve the squadron, gain the weather gage, and force the opposing division to strike before nightfall.',
    objective: 'Disable or force both enemy frigates to strike while keeping at least one blue frigate in action. At time limit, surviving fighting strength decides.',
    maxTicks: 64,
    year: 1799,
    difficulty: 1,
    teaches: 'The weather gage, broadside arcs, signal delay',
    hexScale: '1 hex ≈ 400 yards',
    tickLabel: 'turn',
  },
  {
    id: 'hampton',
    title: 'Iron at Hampton Roads',
    subtitle: 'The first ironclad sortie against a wooden blockade, 1862',
    era: 'ironclad',
    briefing:
      'CSS Virginia steams out of the Elizabeth River to break the Union blockade. Her iron shrugs off broadsides that would sink any wooden ship, and her ram can hole a frigate. But she is slow, draws 22 feet, and there are rumours of a Yankee ironclad on its way south.',
    objective: 'Sink, burn or force the surrender of the three wooden blockaders (Cumberland, Congress, Minnesota). Virginia must survive. The unknown contact does not count.',
    maxTicks: 60,
    year: 1862,
    difficulty: 1,
    teaches: 'Armour against shell, the ram, shoal water, raking fire',
    victory: { enemy: ['r_cumberland', 'r_congress', 'r_minnesota'], own: ['b_virginia'] },
    hexScale: '1 hex ≈ 600 yards',
    tickLabel: '5-minute',
  },
  {
    id: 'dogger',
    title: 'Smoke over the Dogger Bank',
    subtitle: 'Dreadnoughts and destroyers under wireless command, 1915',
    era: 'dreadnought',
    briefing:
      'Wireless intercepts put a German raiding force at sea before dawn. You have a battlecruiser, a battleship and two destroyers. Find them first, bring every turret to bear, and mind your battlecruiser: British magazines are not what they should be.',
    objective: 'Sink or drive off both enemy capital ships while keeping one of yours in action. At the time limit, only the capital ships are scored.',
    maxTicks: 50,
    year: 1915,
    difficulty: 2,
    teaches: 'Crossing the T, fire control, torpedo attacks, the lee gage',
    victory: { enemy: ['r_seydlitz', 'r_posen'], own: ['b_lion', 'b_orion'] },
    hexScale: '1 hex ≈ 1 nautical mile',
    tickLabel: '3-minute',
  },
  {
    id: 'defector',
    title: 'The Defector',
    subtitle: 'Three submarines, two navies, one quiet drive, 1984',
    era: 'coldwar',
    briefing:
      'A new Typhoon-class boat with a near-silent drive is running for the American coast, and her captain may be defecting. Moscow has sent an Alfa after her with orders to sink her. You command USS Dallas: find a submarine nobody can hear, keep her alive to the rendezvous, and do not start a war.',
    objective: 'Get Red October to the rendezvous (the marked water in the east) alive. Losing her or Dallas is a defeat. Peacetime rules: Dallas holds fire unless you change it, and firing first makes Konovalov hostile to you.',
    maxTicks: 45,
    year: 1984,
    difficulty: 2,
    teaches: 'Passive sonar, bearings without range, the baffles, one ping only, torpedo seekers',
    victory: { own: ['b_dallas'], protect: ['g_red_october'] },
    marks: [{ label: 'RENDEZVOUS', cells: RENDEZVOUS }],
    hexScale: '1 hex ≈ 1 nautical mile',
    tickLabel: '4-minute',
  },
  {
    id: 'northern_screen',
    title: 'The Northern Screen',
    subtitle: 'Fictional carrier escort through a submarine cordon, 1986',
    era: 'coldwar',
    briefing:
      'A small carrier group must cross contested northern waters. Two destroyers guard the surface screen while two attack submarines range ahead. Hostile boats are somewhere in the approaches; your carrier can launch a handful of patrol flights to search distant sectors. Keep her moving and get her to the eastern rendezvous.',
    objective: 'Escort the carrier Steadfast to the eastern rendezvous. Her loss is a defeat; reaching the marked water is a victory. Each ship sees only its own contacts, and patrol reports return to the carrier after two ticks.',
    maxTicks: 48,
    year: 1986,
    difficulty: 3,
    teaches: 'ASW screens, separate sensor pictures, delayed carrier patrol reports',
    victory: { own: ['b_steadfast'], protect: ['b_steadfast'], lossTitle: 'Carrier Lost', successTitle: 'Escort Reaches Rendezvous', timeoutTitle: 'Escort Still at Sea' },
    marks: [{ label: 'RENDEZVOUS', cells: SCREEN_EXIT }],
    hexScale: '1 hex ≈ 3 nautical miles',
    tickLabel: '4-minute',
  },
  {
    id: 'strait',
    title: 'The Strait of Qamar',
    subtitle: 'Fictional EMCON missile action, near future',
    era: 'modern',
    briefing:
      'A compact surface action group must contest a narrow strait under emission control. Radar reveals; missiles decide; point defense buys time.',
    objective: 'Win the missile duel or force the hostile screen to disengage without losing both blue ships. At time limit, surviving fighting strength decides.',
    maxTicks: 48,
    year: 2030,
    difficulty: 3,
    teaches: 'Emission control, missile salvos against finite defences',
    hexScale: '1 hex ≈ 5 nautical miles',
    tickLabel: 'minute',
  },
  {
    id: 'esperance',
    title: 'Night off Cape Esperance',
    subtitle: 'Radar against night optics, October 1942',
    era: 'ww2',
    briefing:
      'A Japanese cruiser division is coming down the Slot in the dark to shell Henderson Field, the airfield on the south shore. Two cruisers on the bombardment line off Lunga Point (marked on the chart) and the airfield burns. Your cruisers carry radar: two of them the new centimetric SG sets that can see a destroyer at eleven miles. The enemy has none, but his lookouts see further in the dark than yours, and his torpedoes reach twice as far as your guns can see.',
    objective: 'Stop the Japanese cruisers reaching the bombardment line off Lunga Point: sink them or turn them back before two get through. If time runs out with the raid neither through nor beaten off, the action is indecisive.',
    maxTicks: 30,
    year: 1942,
    difficulty: 2,
    teaches: 'Radar search and emission control, radar-directed gunnery, starshell and searchlights, the long torpedo',
    hexScale: '1 hex ≈ 1 nautical mile',
    tickLabel: '3-minute turn',
    victory: { raid: { ships: ['r_aoba', 'r_furutaka', 'r_kinugasa'], count: 2, title: 'The Airfield Is Shelled', summary: 'Japanese cruisers reached the bombardment line off Lunga Point.' } },
    marks: [
      { label: 'BOMBARDMENT LINE', cells: [[16, 14], [17, 14], [18, 14], [19, 14], [20, 14], [21, 14]] },
      { label: 'HENDERSON FIELD', cells: [[22, 15], [23, 15]] },
    ],
  },
  {
    id: 'line',
    title: 'The Line of Battle',
    subtitle: 'Ships of the line in the Atlantic, 1794',
    era: 'sail',
    briefing:
      'Three British seventy-fours have the weather gage of a French division of three. Each of them carries two full gun decks: seventy-four guns, more than a frigate’s whole broadside on one side. Bear down in line, break theirs if you can, and fight it out yardarm to yardarm.',
    objective: 'Disable or force the French ships of the line to strike while keeping your own fighting. At the time limit, surviving fighting strength decides.',
    maxTicks: 64,
    year: 1794,
    difficulty: 2,
    teaches: 'The line of battle, concentrating on part of the enemy line, the weather gage',
    hexScale: '1 hex ≈ 400 yards',
    tickLabel: 'turn',
    region: ' / NORTH ATLANTIC',
  },
  {
    id: 'convoy',
    title: 'The Wolf Pack',
    region: ' / NORTH ATLANTIC',
    subtitle: 'A night convoy battle in the North Atlantic, 1942',
    era: 'ww2',
    briefing:
      'Six merchant ships, four escorts, one long night. U-boat command has a pack of four boats across your track. They attack on the surface in the dark, where ASDIC cannot hear them and a lookout sees only a wake. Two of your escorts carry the new centimetric Type 271 radar, which the U-boats cannot hear; Sackville has an old metric set that their Metox receivers can. Walker carries HF/DF: every time a U-boat radios the convoy’s position, she gets a bearing.',
    objective: 'Bring the convoy through to the next escort group at the eastern edge of the chart. Losing three merchant ships is a defeat; arriving, or still sailing when the night ends, with no more than one loss is a victory.',
    maxTicks: 48,
    year: 1942,
    difficulty: 2,
    teaches: 'Centimetric radar against Metox, HF/DF, ASDIC and depth charges, screening a convoy',
    hexScale: '1 hex ≈ 1 nautical mile',
    tickLabel: '3-minute turn',
    marks: [{ label: 'NEXT ESCORT GROUP', cells: [[27, 0], [27, 4], [27, 8], [27, 12], [27, 16]] }],
    victory: { convoy: { ships: ['b_empire_ocelot', 'b_baron_ogilvy', 'b_clan_macnab', 'b_trevisa', 'b_hartington', 'b_bretwalda'], maxLosses: 3, goodLosses: 1 } },
  },
];

// Scenarios still in the dockyard: the engine and the tests run them, the
// launcher does not offer them yet (docs/design/ww2-radar-night-action.md).
export const DOCKYARD_SCENARIOS = [];

export const SCENARIO_SETUPS = {
  nevis: {
    wind: 5,
    terrain: [
      ...disc(14, 10, 1, 'land'),
      ...ring(14, 10, 2, 'shoal'),
      ...disc(6, 4, 1, 'shoal'),
      { q: 3, r: 10, type: 'shoal' },
      { q: 4, r: 10, type: 'shoal' },
    ],
    ships: [
      sailShip('b_constellation', 'blue', 'USS Constellation', 'Heavy frigate', 3, 6, 0, 38),
      sailShip('b_baltimore', 'blue', 'USS Baltimore', 'Frigate', 2, 8, 0, 32),
      sailShip('r_insurgente', 'red', 'L’Insurgente', 'Heavy frigate', 16, 6, 3, 40),
      sailShip('r_volontaire', 'red', 'Volontaire', 'Frigate', 17, 8, 3, 32),
    ],
  },
  hampton: {
    wind: 0,
    terrain: [
      ...row(0, 0, 19, 'land'), ...row(1, 0, 9, 'land'), ...row(2, 0, 3, 'land'), // Newport News peninsula
      ...row(1, 17, 19, 'land'), ...row(2, 18, 19, 'land'), // Old Point Comfort
      ...row(13, 0, 19, 'land'), ...row(12, 0, 7, 'land'), ...row(12, 11, 19, 'land'), ...row(11, 0, 4, 'land'), ...row(11, 14, 19, 'land'), // south shore, Elizabeth River mouth
      ...row(2, 4, 12, 'shoal'), ...row(3, 5, 9, 'shoal'), ...row(3, 12, 14, 'shoal'), // northern flats
      ...row(6, 9, 12, 'shoal'), ...row(7, 10, 13, 'shoal'), ...row(8, 11, 12, 'shoal'), // the Middle Ground
      ...row(11, 5, 7, 'shoal'), ...row(11, 11, 13, 'shoal'), ...row(10, 3, 5, 'shoal'), ...row(10, 13, 15, 'shoal'), // southern flats
    ],
    ships: [
      ironShip('b_virginia', 'blue', 'CSS Virginia', 'Casemate ironclad', 'ironclad', 9, 12, 4, { battery: 12, speed: 1, ram: true, draft: 'deep', ammunition: 'shell', value: 3 }),
      ironShip('b_patrick_henry', 'blue', 'CSS Patrick Henry', 'Side-wheel gunboat', 'wooden', 0, 7, 0, { battery: 5, speed: 3, order: 'screen' }),
      ironShip('b_jamestown', 'blue', 'CSS Jamestown', 'Side-wheel gunboat', 'wooden', 0, 9, 0, { battery: 3, speed: 3, order: 'screen' }),
      ironShip('r_cumberland', 'red', 'USS Cumberland', 'Sloop of war', 'wooden', 4, 4, 0, { battery: 12, speed: 0, signature: 'sail', ammunition: 'shot' }),
      ironShip('r_congress', 'red', 'USS Congress', 'Sail frigate', 'wooden', 7, 4, 0, { battery: 13, speed: 0, signature: 'sail', ammunition: 'shot' }),
      ironShip('r_minnesota', 'red', 'USS Minnesota', 'Steam frigate', 'wooden', 16, 4, 3, { battery: 16, speed: 2, draft: 'deep', ammunition: 'shot', value: 2 }),
      { ...ironShip('r_monitor', 'red', 'USS Monitor', 'Turret ironclad', 'ironclad', 18, 3, 3, { battery: 14, speed: 2, turret: true, signature: 'low', ammunition: 'shot', value: 2 }), status: 'reserve', arriveAt: 7 },
    ],
  },
  dogger: {
    wind: 3,
    terrain: [
      ...disc(10, 1, 1, 'mines'),
      { q: 8, r: 12, type: 'mines' },
      { q: 9, r: 12, type: 'mines' },
      { q: 8, r: 13, type: 'mines' },
    ],
    ships: [
      dreadShip('b_lion', 'blue', 'HMS Lion', 'Battlecruiser', 'battlecruiser', 3, 5, { guns: 8, speed: 3, secondary: 2, flashRisk: true }),
      dreadShip('b_orion', 'blue', 'HMS Orion', 'Dreadnought battleship', 'battleship', 2, 7, { guns: 10, speed: 2, secondary: 2 }),
      dreadShip('b_meteor', 'blue', 'HMS Meteor', 'Destroyer', 'destroyer', 4, 3),
      dreadShip('b_laurel', 'blue', 'HMS Laurel', 'Destroyer', 'destroyer', 3, 9),
      dreadShip('r_seydlitz', 'red', 'SMS Seydlitz', 'Battlecruiser', 'battlecruiser', 16, 4, { guns: 10, speed: 3, secondary: 3, facing: 3 }),
      dreadShip('r_posen', 'red', 'SMS Posen', 'Dreadnought battleship', 'battleship', 17, 6, { guns: 8, speed: 2, secondary: 3, facing: 3 }),
      dreadShip('r_v186', 'red', 'SMS V186', 'Torpedo boat', 'destroyer', 15, 3, { facing: 3 }),
      dreadShip('r_s33', 'red', 'SMS S33', 'Torpedo boat', 'destroyer', 15, 8, { facing: 3 }),
    ],
  },
  esperance: {
    wind: 1,
    map: { width: 26, height: 16 },
    conditions: { light: 'night' }, // moonless; no dawn inside the action
    terrain: [
      ...disc(10, 3, 1, 'land'), // Savo Island
      ...row(15, 0, 25, 'land'), ...row(14, 0, 7, 'land'), ...row(13, 0, 3, 'land'), // Guadalcanal: Cape Esperance in the west, Lunga Point and the airfield to the east
    ],
    ships: [
      ww2Ship('b_san_francisco', 'blue', 'USS San Francisco', 'Heavy cruiser', 'cruiser', 12, 9, 5, { guns: 9, gunRange: 12, calibre: 'medium', search: 'sc' }),
      ww2Ship('b_boise', 'blue', 'USS Boise', 'Light cruiser', 'cruiser', 11, 10, 5, { guns: 15, gunRange: 10, calibre: 'light', search: 'sg', fireControl: true }),
      ww2Ship('b_salt_lake_city', 'blue', 'USS Salt Lake City', 'Heavy cruiser', 'cruiser', 10, 11, 5, { guns: 10, gunRange: 12, calibre: 'medium', search: 'sc' }),
      ww2Ship('b_helena', 'blue', 'USS Helena', 'Light cruiser', 'cruiser', 9, 12, 5, { guns: 15, gunRange: 10, calibre: 'light', search: 'sg', fireControl: true }),
      ww2Ship('b_farenholt', 'blue', 'USS Farenholt', 'Destroyer', 'destroyer', 14, 8, 5, { guns: 4, gunRange: 6, calibre: 'light', torpedoes: 2, torpedo: 'mk15', search: 'sc' }),
      ww2Ship('b_duncan', 'blue', 'USS Duncan', 'Destroyer', 'destroyer', 13, 9, 5, { guns: 4, gunRange: 6, calibre: 'light', torpedoes: 2, torpedo: 'mk15' }),
      ww2Ship('b_laffey', 'blue', 'USS Laffey', 'Destroyer', 'destroyer', 8, 13, 5, { guns: 4, gunRange: 6, calibre: 'light', torpedoes: 2, torpedo: 'mk15', search: 'sc' }),
      raider(ww2Ship('r_aoba', 'red', 'Aoba', 'Heavy cruiser', 'cruiser', 23, 0, 2, { guns: 6, gunRange: 12, calibre: 'medium', torpedoes: 1, torpedo: 'type93', japanese: true })),
      raider(ww2Ship('r_furutaka', 'red', 'Furutaka', 'Heavy cruiser', 'cruiser', 24, 0, 2, { guns: 6, gunRange: 12, calibre: 'medium', torpedoes: 1, torpedo: 'type93', japanese: true })),
      raider(ww2Ship('r_kinugasa', 'red', 'Kinugasa', 'Heavy cruiser', 'cruiser', 25, 0, 2, { guns: 6, gunRange: 12, calibre: 'medium', torpedoes: 1, torpedo: 'type93', japanese: true })),
      ww2Ship('r_fubuki', 'red', 'Fubuki', 'Destroyer', 'destroyer', 22, 1, 2, { guns: 6, gunRange: 6, calibre: 'light', torpedoes: 2, torpedo: 'type93', japanese: true }),
      ww2Ship('r_hatsuyuki', 'red', 'Hatsuyuki', 'Destroyer', 'destroyer', 25, 1, 2, { guns: 6, gunRange: 6, calibre: 'light', torpedoes: 2, torpedo: 'type93', japanese: true }),
    ],
  },
  line: {
    wind: 3, // from the west: the British, to the west, have the weather gage
    terrain: [],
    ships: [
      sailShip('b_bellerophon', 'blue', 'HMS Bellerophon', 'Ship of the line', 4, 4, 1, 74),
      sailShip('b_marlborough', 'blue', 'HMS Marlborough', 'Ship of the line', 3, 6, 1, 74),
      sailShip('b_russell', 'blue', 'HMS Russell', 'Ship of the line', 2, 8, 1, 74),
      { ...sailShip('r_vengeur', 'red', 'Le Vengeur du Peuple', 'Ship of the line', 14, 3, 1, 74), crew: 92 }, // the Revolution's navy had lost much of its officer corps and trained gunners
      { ...sailShip('r_achille', 'red', 'L’Achille', 'Ship of the line', 13, 5, 1, 74), crew: 92 },
      { ...sailShip('r_northumberland', 'red', 'Le Northumberland', 'Ship of the line', 12, 7, 1, 74), crew: 92 },
    ],
  },
  convoy: {
    wind: 2,
    map: { width: 30, height: 18 },
    conditions: { light: 'night', dawnAt: 42 },
    terrain: [],
    ships: [
      merchant('b_empire_ocelot', 'SS Empire Ocelot', 9, 9),
      merchant('b_baron_ogilvy', 'SS Baron Ogilvy', 9, 7),
      merchant('b_clan_macnab', 'SS Clan Macnab', 9, 11),
      merchant('b_trevisa', 'SS Trevisa', 7, 8),
      merchant('b_hartington', 'SS Hartington', 7, 10),
      merchant('b_bretwalda', 'SS Bretwalda', 7, 12),
      { ...escort(ww2Ship('b_walker', 'blue', 'HMS Walker', 'Destroyer', 'destroyer', 13, 9, 0, { guns: 4, gunRange: 6, calibre: 'light', search: 'type271', speed: 4 }), { hfdf: true }), order: { type: 'engage' } }, // the escort group's striking force ranges out
      escort(ww2Ship('b_stork', 'blue', 'HMS Stork', 'Sloop', 'destroyer', 11, 5, 0, { guns: 6, gunRange: 6, calibre: 'light', search: 'type271', speed: 3 })),
      escort(ww2Ship('b_sackville', 'blue', 'HMCS Sackville', 'Corvette', 'destroyer', 11, 14, 0, { guns: 1, gunRange: 5, calibre: 'light', search: 'type286', speed: 3 })),
      escort(ww2Ship('b_gentian', 'blue', 'HMS Gentian', 'Corvette', 'destroyer', 5, 10, 0, { guns: 1, gunRange: 5, calibre: 'light', search: 'type271', speed: 3 })),
      uboat('r_u96', 'U-96', 24, 4),
      uboat('r_u201', 'U-201', 27, 10),
      uboat('r_u552', 'U-552', 23, 15),
      uboat('r_u432', 'U-432', 28, 6),
    ],
  },
  defector: {
    wind: 0,
    sides: ['blue', 'red', 'green'],
    hostile: { blue: ['red'], red: ['green'], green: [] },
    entities: true,
    events: [
      { id: 'sabotage', window: [8, 14], shipId: 'g_red_october', set: { quiet: 3, passiveClass: null }, banner: 'CATERPILLAR DRIVE SABOTAGED', text: 'Red October: the caterpillar drive has failed, sabotage. Running on the reactor pumps; she can be heard now.', audience: ['green', 'blue'] },
      { id: 'surface', window: [24, 32], shipId: 'g_red_october', set: { depth: 'surface', speed: 2 }, banner: 'RED OCTOBER FORCED TO SURFACE', text: 'Red October is forced to the surface. Anyone within ten miles can see her.', audience: ['green', 'blue'] },
    ],
    terrain: [
      // Red Route One: a canyon between seabed ridges, then open water to the east.
      ...row(3, 2, 11, 'land'), ...row(7, 1, 10, 'land'), ...row(2, 12, 13, 'land'), ...row(8, 11, 12, 'land'),
      ...row(11, 4, 7, 'land'), ...row(12, 3, 6, 'land'), { q: 15, r: 11, type: 'land' }, { q: 16, r: 1, type: 'land' },
    ],
    ships: [
      subShip('b_dallas', 'blue', 'USS Dallas', 'Los Angeles-class attack submarine', 'ssn', 15, 4, 3, { speed: 4, quiet: 2, sonar: 5, torpedoes: 4, decoys: 2, captain: { name: 'Cdr. Mancuso', trait: 'steady' }, order: { type: 'shadow' }, roe: 'hold' }),
      { ...subShip('r_konovalov', 'red', 'V. K. Konovalov', 'Alfa-class attack submarine', 'ssn', 0, 9, 0, { speed: 5, quiet: 4, sonar: 2, torpedoes: 3, decoys: 1, captain: { name: 'Capt. Tupolev', trait: 'reckless' }, order: { type: 'engage' }, speedSetting: 'flank' }), searchAt: [12, 5] },
      { ...subShip('g_red_october', 'green', 'Red October', 'Typhoon-class missile submarine', 'ssbn', 0, 5, 0, { speed: 3, quiet: 0, sonar: 3, torpedoes: 2, decoys: 2, captain: { name: 'Capt. Ramius', trait: 'cunning' }, order: { type: 'proceed', q: 18, r: 8 }, speedSetting: 'standard', depth: 'deep' }), passiveClass: 'Seismic noise (magma displacement?)', goal: RENDEZVOUS },
    ],
  },
  northern_screen: {
    map: { width: 30, height: 18 },
    wind: 0,
    entities: true,
    terrain: [
      ...row(2, 12, 14, 'land'), ...row(15, 16, 18, 'land'),
      { q: 15, r: 3, type: 'shoal' }, { q: 19, r: 14, type: 'shoal' },
    ],
    ships: [
      { ...subShip('b_steadfast', 'blue', 'BNS Steadfast', 'Light carrier', 'carrier', 4, 8, 0, { speed: 4, quiet: 7, sonar: 0, torpedoes: 0, decoys: 0, captain: { name: 'Capt. Vale', trait: 'steady' }, order: { type: 'proceed', q: 27, r: 8 }, depth: 'surface' }), airSorties: 4, patrolReadyAt: 0, airTorpedoes: 4, airStrikeReadyAt: 0, value: 4, goal: SCREEN_EXIT },
      { ...subShip('b_meridian', 'blue', 'BNS Meridian', 'ASW destroyer', 'asw_destroyer', 5, 5, 0, { speed: 6, quiet: 6, sonar: 4, torpedoes: 4, decoys: 0, captain: { name: 'Cdr. Hale', trait: 'steady' }, order: { type: 'screen' }, depth: 'surface', range: 4 }), asroc: 3 },
      { ...subShip('b_ward', 'blue', 'BNS Ward', 'ASW destroyer', 'asw_destroyer', 5, 11, 0, { speed: 6, quiet: 6, sonar: 4, torpedoes: 4, decoys: 0, captain: { name: 'Cdr. Sen', trait: 'steady' }, order: { type: 'screen' }, depth: 'surface', range: 4 }), asroc: 3 },
      subShip('b_sable', 'blue', 'BNS Sable', 'Attack submarine', 'ssn', 8, 3, 0, { speed: 4, quiet: 2, sonar: 5, torpedoes: 4, decoys: 2, captain: { name: 'Cdr. Imani', trait: 'steady' }, order: { type: 'engage' } }),
      subShip('b_kite', 'blue', 'BNS Kite', 'Attack submarine', 'ssn', 8, 14, 0, { speed: 4, quiet: 2, sonar: 5, torpedoes: 4, decoys: 2, captain: { name: 'Cdr. Orlov', trait: 'steady' }, order: { type: 'engage' }, depth: 'deep' }),
      { ...subShip('r_razor', 'red', 'RNS Razor', 'Attack submarine', 'ssn', 23, 4, 3, { speed: 4, quiet: 3, sonar: 4, torpedoes: 4, decoys: 2, captain: { name: 'Capt. Soren', trait: 'steady' }, order: { type: 'engage' } }), searchAt: [10, 7] },
      { ...subShip('r_echo', 'red', 'RNS Echo', 'Attack submarine', 'ssn', 24, 10, 3, { speed: 4, quiet: 2, sonar: 5, torpedoes: 4, decoys: 2, captain: { name: 'Capt. Varin', trait: 'steady' }, order: { type: 'engage' }, depth: 'deep' }), searchAt: [14, 9] },
      { ...subShip('r_dart', 'red', 'RNS Dart', 'Fast attack submarine', 'ssn', 26, 15, 3, { speed: 5, quiet: 4, sonar: 3, torpedoes: 4, decoys: 1, captain: { name: 'Capt. Taran', trait: 'reckless' }, order: { type: 'engage' }, speedSetting: 'flank' }), searchAt: [12, 11] },
    ],
  },
  strait: {
    wind: 0,
    terrain: [
      ...disc(8, 3, 1, 'land'),
      ...disc(12, 10, 1, 'land'),
      ...ring(8, 3, 2, 'shoal'),
      ...ring(12, 10, 2, 'shoal'),
      { q: 10, r: 6, type: 'shoal' },
      { q: 9, r: 7, type: 'shoal' },
    ],
    ships: [
      modernShip('b_valiant', 'blue', 'BNS Valiant', 'Area-defense destroyer', 3, 4, 0, 8, 5),
      modernShip('b_kestrel', 'blue', 'BNS Kestrel', 'Littoral frigate', 3, 9, 0, 6, 4),
      modernShip('r_shahin', 'red', 'RNS Shahin', 'Missile destroyer', 12, 4, 3, 8, 5),
      modernShip('r_miraj', 'red', 'RNS Miraj', 'Missile corvette', 14, 8, 3, 6, 3),
    ],
  },
};

function baseShip(id, side, name, className, q, r, facing) {
  return {
    id,
    side,
    name,
    className,
    q,
    r,
    facing,
    hull: 100,
    propulsion: 100,
    weapons: 100,
    crew: 100,
    status: 'active',
    radar: false,
    ammo: 0,
    defense: 0,
    order: { type: 'engage' },
    doctrine: { roe: 'free', range: 4, withdraw: 30 },
    reloadUntil: 0,
    spottedBy: null,
  };
}

function sailShip(id, side, name, className, q, r, facing, guns) {
  return {
    ...baseShip(id, side, name, className, q, r, facing),
    era: 'sail',
    guns,
    ammo: 999,
    defense: 0,
    doctrine: { roe: 'free', range: 3, withdraw: 28 },
  };
}

function modernShip(id, side, name, className, q, r, facing, ammo, defense) {
  return {
    ...baseShip(id, side, name, className, q, r, facing),
    era: 'modern',
    radar: false,
    ammo,
    defense,
    doctrine: { roe: 'free', range: 9, withdraw: 35 },
  };
}

function ironShip(id, side, name, className, type, q, r, facing, opts = {}) {
  return {
    ...baseShip(id, side, name, className, q, r, facing),
    era: 'ironclad',
    type,
    battery: opts.battery ?? 4,
    speed: opts.speed ?? 2,
    draft: opts.draft ?? 'shallow',
    ammunition: opts.ammunition ?? 'shell',
    signature: opts.signature ?? 'smoke',
    turret: Boolean(opts.turret),
    ram: Boolean(opts.ram),
    burning: false,
    value: opts.value ?? 1,
    firedAt: -1,
    ramReadyAt: 0,
    order: opts.speed === 0 ? { type: 'hold' } : { type: opts.order ?? 'engage' },
    doctrine: { roe: 'free', range: 2, withdraw: type === 'ironclad' ? 20 : 30 },
  };
}

function subShip(id, side, name, className, type, q, r, facing, opts) {
  return {
    ...baseShip(id, side, name, className, q, r, facing),
    era: 'coldwar',
    type,
    speed: opts.speed,
    quiet: opts.quiet,
    noise: opts.quiet,
    sonar: opts.sonar,
    torpedoes: opts.torpedoes,
    decoys: opts.decoys,
    captain: opts.captain,
    value: type === 'ssbn' ? 3 : 2,
    pingAt: -1,
    firedAt: -1,
    ivanAt: -1,
    decoyAt: -9,
    evadingAt: -1,
    driftAt: -1,
    order: opts.order,
    doctrine: { roe: opts.roe ?? 'free', range: opts.range ?? 6, withdraw: 25, speed: opts.speedSetting ?? 'standard', depth: opts.depth ?? 'shallow' },
  };
}

function row(r, q0, q1, type) {
  const cells = [];
  for (let q = q0; q <= q1; q += 1) cells.push({ q, r, type });
  return cells;
}

function dreadShip(id, side, name, className, type, q, r, opts = {}) {
  const destroyer = type === 'destroyer';
  return {
    ...baseShip(id, side, name, className, q, r, opts.facing ?? 0),
    era: 'dreadnought',
    type,
    speed: opts.speed ?? (destroyer ? 4 : 2),
    guns: opts.guns ?? 3,
    gunRange: destroyer ? 4 : 9,
    calibre: destroyer ? 'light' : 'heavy',
    secondary: opts.secondary ?? 0,
    torpedoes: destroyer ? 2 : 0,
    flashRisk: Boolean(opts.flashRisk),
    value: destroyer ? 1 : 3,
    emitUntil: -1,
    firedAt: -1,
    fc: { targetId: null, level: 0 },
    doctrine: destroyer ? { roe: 'free', range: 3, withdraw: 35 } : { roe: 'free', range: 7, withdraw: 25 },
  };
}

// Convoy action. Merchant ships steam east for the far edge of the chart.
function merchant(id, name, q, r) {
  const ship = ww2Ship(id, 'blue', name, 'Merchant ship', 'merchant', q, r, 0, { guns: 0, gunRange: 1, calibre: 'light', speed: 1 });
  const goal = [27, 28, 29].flatMap((q) => Array.from({ length: 18 }, (_, row) => [q, row]));
  return { ...ship, value: 1, goal, goalText: 'reaches the meeting point with the next escort group', order: { type: 'proceed', q: 28, r }, doctrine: { ...ship.doctrine, withdraw: 0 } };
}

// An escort: ASDIC, depth charges, and a screening station on the convoy.
function escort(ship, sensors = {}) {
  return { ...ship, sensors: { ...ship.sensors, sonar: true, ...sensors }, depthCharges: 6, order: { type: 'screen' }, doctrine: { ...ship.doctrine, range: 4 } };
}

// A Type VII U-boat: surfaces to attack at night, carries Metox, and reports the convoy home.
function uboat(id, name, q, r) {
  const ship = ww2Ship(id, 'red', name, 'Type VII U-boat', 'submarine', q, r, 3, { guns: 0, gunRange: 1, calibre: 'light', torpedoes: 4, torpedo: 'g7e', esm: 'metric', speed: 2 });
  return { ...ship, value: 1, searchAt: [10, 9], doctrine: { roe: 'free', range: 3, withdraw: 40, depth: 'surface' } };
}

// The bombardment line off Lunga Point: a Japanese cruiser that gets here shells the airfield.
function raider(ship) {
  // A bombardment force is not there to fight: badly hurt, it turns for home.
  // It keeps formation speed (about 20 knots), not the 30-plus of a cruiser running free.
  return { ...ship, raid: true, speed: 2, doctrine: { ...ship.doctrine, withdraw: 30 }, goal: [[16, 14], [17, 14], [18, 14], [19, 14], [20, 14], [21, 14]], goalText: 'reaches the bombardment line and opens fire on the airfield', order: { type: 'proceed', q: 18, r: 14 } };
}

// A WWII surface ship. `search` names a radar set (eras/ww2.js RADARS); ships with
// one start radiating, which the player can stop with emission control.
// `japanese` gives the Imperial Navy's night-fighting doctrine: trained night
// lookouts, searchlights instead of starshell at close range.
function ww2Ship(id, side, name, className, type, q, r, facing, opts = {}) {
  const destroyer = type === 'destroyer';
  const search = opts.search ?? null;
  return {
    ...baseShip(id, side, name, className, q, r, facing),
    era: 'ww2',
    type,
    speed: opts.speed ?? (destroyer ? 4 : 3),
    guns: opts.guns,
    gunRange: opts.gunRange,
    calibre: opts.calibre,
    torpedoes: opts.torpedoes ?? 0,
    ...(opts.torpedo ? { torpedo: opts.torpedo } : {}),
    sensors: { search, fireControl: Boolean(opts.fireControl), esm: opts.esm ?? null },
    radar: Boolean(search),
    nightTraining: Boolean(opts.japanese),
    searchlight: Boolean(opts.japanese),
    value: destroyer ? 1 : type === 'battleship' ? 3 : 2,
    firedAt: -1,
    illuminatedUntil: -1,
    fc: { targetId: null, level: 0 },
    doctrine: destroyer ? { roe: 'free', range: 3, withdraw: 30 } : { roe: 'free', range: 6, withdraw: 25 },
  };
}

function disc(cq, cr, radius, type) {
  const cells = [];
  for (let q = 0; q < 20; q += 1) for (let r = 0; r < 14; r += 1) {
    if (hexDistance({ q, r }, { q: cq, r: cr }) <= radius) cells.push({ q, r, type });
  }
  return cells;
}

function ring(cq, cr, radius, type) {
  const cells = [];
  for (let q = 0; q < 20; q += 1) for (let r = 0; r < 14; r += 1) {
    if (hexDistance({ q, r }, { q: cq, r: cr }) === radius) cells.push({ q, r, type });
  }
  return cells;
}

function hexDistance(a, b) {
  const as = -a.q - a.r;
  const bs = -b.q - b.r;
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(as - bs));
}
