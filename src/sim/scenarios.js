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
    hexScale: '1 hex ≈ 400 yards',
    tickLabel: 'turn',
  },
  {
    id: 'dogger',
    title: 'Smoke over the Dogger Bank',
    subtitle: 'Dreadnoughts and destroyers under wireless command, 1915',
    era: 'dreadnought',
    briefing:
      'Wireless intercepts put a German raiding force at sea before dawn. You have a battlecruiser, a battleship and two destroyers. Find them first, bring every turret to bear, and mind your battlecruiser: British magazines are not what they should be.',
    objective: 'Sink or drive off both enemy capital ships while keeping one of yours in action. At the time limit, capital ships count triple.',
    maxTicks: 50,
    victory: 'capitals',
    hexScale: '1 hex ≈ 1 nautical mile',
    tickLabel: '3-minute',
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
    hexScale: '1 hex ≈ 5 nautical miles',
    tickLabel: 'minute',
  },
];

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
