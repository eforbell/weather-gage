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
