// Shared rule primitives: hex geometry, seeded randomness, damage, dispatches and
// visual fx. Used by the engine and by the era rule modules (src/sim/eras/*).
// Deterministic and DOM-free.

export const WIDTH = 20;
export const HEIGHT = 14;
export const DIRECTIONS = Object.freeze([[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]);
export const SIDES = ['blue', 'red'];
export const ALL_SIDES = ['blue', 'red', 'green'];
// Scenarios with a third party list their sides; two-sided games keep the default.
export const sidesOf = (state) => state.sides || SIDES;

// Who may attack whom. Without a hostility table every side is hostile to every other.
export function hostile(state, from, to) {
  if (from === to) return false;
  return !state.hostile || (state.hostile[from] || []).includes(to);
}

// What a captain believes about a contact. In two-sided games every contact is the enemy.
// With third parties a contact's side is only known once identified; until then only a
// reckless captain treats an unknown as a target.
export function believedHostile(state, ship, contact) {
  const target = state.ships.find((s) => s.id === contact.targetId);
  if (!target) return false;
  if (sidesOf(state).length <= 2 || contact.confidence === 'identified') return hostile(state, ship.side, target.side);
  return ship.captain?.trait === 'reckless';
}

// Unknown contacts are worth closing on to find out what they are.
export function worthClosing(state, ship, contact) {
  return believedHostile(state, ship, contact) || (sidesOf(state).length > 2 && contact.confidence !== 'identified');
}

// Opening fire on a side makes the two sides hostile to each other from then on. A side
// that has taken the victim under its command is attacked too: protection is a promise.
export function markAttack(state, attacker, victim) {
  if (!state.hostile || attacker === victim) return state;
  const protectors = Object.entries(state.command || {}).filter(([, list]) => list.includes(victim)).map(([side]) => side);
  if (state.command?.[attacker]?.includes(victim)) state.command[attacker] = state.command[attacker].filter((s) => s !== victim); // you cannot protect the boat you fire on
  for (const [a, b] of [[attacker, victim], [victim, attacker], ...protectors.flatMap((p) => (p === attacker ? [] : [[attacker, p], [p, attacker]]))]) {
    const list = state.hostile[a] || [];
    if (!list.includes(b)) state.hostile[a] = [...list, b].sort();
  }
  return state;
}
export const CONF_RANK = { unknown: 0, sighted: 1, classified: 2, identified: 3 };
export const MAX_LOG = 80;
export const MAX_FX = 60;
export const FX_NEEDS_ID = new Set(['fire', 'ram', 'sunk', 'struck', 'magazine', 'torpedo-hit', 'torpedo-miss', 'mine', 'missile-hit', 'intercept', 'aground']);
export const FX_SEEN_AS_EXPLOSION = new Set(['fire', 'ram', 'sunk', 'magazine', 'torpedo-hit', 'mine', 'missile-hit']);

export function distance(a, b) {
  assertCoord(a); assertCoord(b);
  const as = -a.q - a.r;
  const bs = -b.q - b.r;
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(as - bs));
}

export function isActive(ship) {
  return Boolean(ship && ship.status === 'active' && ship.hull > 0 && ship.crew > 0);
}

export function assertCoord(c) {
  if (!c || !Number.isInteger(c.q) || !Number.isInteger(c.r) || c.q < 0 || c.r < 0 || c.q >= WIDTH || c.r >= HEIGHT) throw new Error('Invalid coordinate');
}

export function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

export function addLog(state, text, kind = 'info', audience = sidesOf(state)) {
  const entry = { tick: state.tick, text, kind };
  entry.reports = Object.fromEntries(sidesOf(state).map(side => [side, audience.includes(side) ? reportText(entry, state, side) : null]));
  state.log = [...state.log, entry].slice(-MAX_LOG);
  return state;
}

// Freeze public reports when events occur. Later identification must not retroactively
// reveal hidden actions or damage in an earlier dispatch.
export function reportText(entry, state, side) {
  let text = entry.text;
  if (entry.kind === 'event') return text; // scripted narrative: the scenario chose who hears it
  const mentioned = state.ships.filter(ship => text.includes(ship.name));
  const hasOwnShip = mentioned.some(ship => ship.side === side);
  if (entry.kind === 'order' && mentioned.length && !hasOwnShip) return null;
  for (const ship of mentioned) {
    if (ship.side === side) continue;
    const contact = state.contacts[side].find(c => c.targetId === ship.id);
    const observed = contact && !contact.stale;
    const identified = observed && contact.confidence === 'identified';
    if (!hasOwnShip && !observed) return null;
    if (['loss', 'damage', 'defense', 'escape'].includes(entry.kind) && !identified) return null;
    text = text.split(ship.name).join(identified ? contact.name : 'enemy contact');
  }
  return text;
}

// Visual combat events for the chart, frozen per side like dispatch reports. Enemy
// positions appear only if that ship was an observed contact when the event happened;
// exact damage appears only on the player's own ships.
export function addFx(state, fx) {
  const shooter = state.ships.find((s) => s.id === fx.shooterId);
  const target = state.ships.find((s) => s.id === fx.targetId);
  const entry = Object.fromEntries(sidesOf(state).map((side) => [side, publicFx(state, side, fx, shooter, target)]));
  state.fx = [...(state.fx || []), entry].slice(-MAX_FX);
  return state;
}

export function publicFx(state, side, fx, shooter, target) {
  const seen = (ship) => ship && (ship.side === side || state.contacts[side].some((c) => c.targetId === ship.id && !c.stale));
  // Other ships are placed where this side's contact report puts them, never at the true
  // position, so effects cannot sharpen an uncertain sonar or sighting report.
  const ref = (ship) => {
    if (!ship || !seen(ship)) return null;
    if (ship.side === side) return { id: ship.id, q: ship.q, r: ship.r, own: true };
    const c = state.contacts[side].find((x) => x.targetId === ship.id && !x.stale);
    return { id: contactId(state, side, ship.id), q: c.q, r: c.r, own: false };
  };
  // Scenario events announce themselves to the sides the scenario names, seen or not.
  if (fx.type === 'event') {
    const told = fx.audience ? fx.audience.includes(side) : target?.side === side;
    return told ? { type: 'event', label: fx.label, from: null, to: ref(target) } : null;
  }
  if (fx.audience && !fx.audience.includes(side)) return null;
  const involved = [shooter, target].filter(Boolean);
  if (!involved.some((s) => s.side === side) && !involved.every(seen)) return null;
  let type = fx.type;
  if (target && target.side !== side && FX_NEEDS_ID.has(type)) {
    // Same rule as dispatches: losses and damage on an enemy need an identified contact.
    const identified = state.contacts[side].some((c) => c.targetId === target.id && !c.stale && c.confidence === 'identified');
    if (!identified) {
      if (!FX_SEEN_AS_EXPLOSION.has(type) || !seen(target)) return null;
      type = 'explosion';
      fx = { at: fx.at };
    }
  }
  const out = { type, from: type === 'explosion' ? null : ref(shooter), to: ref(target) };
  if (!out.from && !out.to && !fx.at) return null;
  // Only the side that fired a torpedo knows where it was aimed; the target sees wakes.
  const hiddenAim = fx.type === 'torpedo' && shooter && shooter.side !== side;
  if (fx.at && !hiddenAim) out.at = { q: fx.at.q, r: fx.at.r };
  for (const k of ['hits', 'shots', 'heavy', 'straddle', 'crossingT', 'smoke', 'eta', 'fc']) if (fx[k] !== undefined) out[k] = fx[k];
  if (target && target.side === side && fx.damage !== undefined) out.damage = fx.damage;
  return out;
}

export function applyDamage(ship, dmg) {
  for (const [keyName, value] of Object.entries(dmg)) ship[keyName] = clamp(Math.round(ship[keyName] - value), 0, 100);
}

export function resolveStatus(state, ship) {
  if (ship.hull <= 0) {
    ship.status = 'sunk'; ship.hull = 0;
    state = addFx(state, { type: 'sunk', targetId: ship.id });
    return addLog(state, `${ship.name} sinks.`, 'loss');
  }
  if (ship.crew <= 12 || (ship.hull <= 18 && ship.weapons <= 20)) {
    ship.status = 'struck';
    state = addFx(state, { type: 'struck', targetId: ship.id });
    return addLog(state, `${ship.name} strikes and falls out of action.`, 'loss');
  }
  return state;
}

export function roll(state, p) { return nextRandom(state) < p; }

export function nextRandom(state) {
  state.rng = (1664525 * (state.rng >>> 0) + 1013904223) >>> 0;
  return state.rng / 0x100000000;
}

export function terrainAt(state, q, r) {
  return terrainAtMap(state.map, q, r);
}

export function terrainAtMap(map, q, r) {
  return map.terrain.find((t) => t.q === q && t.r === r)?.type || 'sea';
}

export function directionToward(a, b) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < DIRECTIONS.length; i += 1) {
    const [dq, dr] = DIRECTIONS[i];
    const d = hexDistanceRaw({ q: a.q + dq, r: a.r + dr }, b);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

export function hexDistanceRaw(a, b) { const as = -a.q - a.r; const bs = -b.q - b.r; return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(as - bs)); }

export function turnDistance(a, b) { const d = Math.abs(a - b) % 6; return Math.min(d, 6 - d); }

export function inBounds(c) { return c.q >= 0 && c.r >= 0 && c.q < WIDTH && c.r < HEIGHT; }

// Stable per-game noise: the same inputs give the same answer within a game, and a
// different seed gives a different game. Used where the game RNG would be consumed
// several times per tick (contact updates) or would couple unrelated rules.
export function seededHash(state, label) {
  let h = (2166136261 ^ state.seed) >>> 0;
  for (let i = 0; i < label.length; i += 1) { h ^= label.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export function chance(state, label, p) {
  return (seededHash(state, label) % 10000) / 10000 < p;
}

// Public contact ids are opaque per game and side: they must not name the ship or its side.
export function contactId(state, side, targetId) {
  return `c_${side}_${seededHash(state, `contact|${side}|${targetId}`).toString(36)}`;
}

export function key(q, r) { return `${q},${r}`; }

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

export function deepClone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

// Cold War captains act on their own sonar track; other eras share side reports.
export function contactsForShip(state, ship) {
  return state.contactTracks ? state.contactTracks[ship.id] || [] : state.contacts[ship.side] || [];
}

export function bestContactFor(state, side, maxRange, allowStale = false, fromShip = null) {
  return (fromShip ? contactsForShip(state, fromShip) : state.contacts[side] || [])
    .filter((c) => (allowStale || !c.stale) && distance(fromShip || c, c) <= (fromShip ? maxRange : Infinity))
    .filter((c) => !fromShip || distance(fromShip, c) <= maxRange)
    .sort((a, b) => (a.stale - b.stale) || distance(fromShip || a, a) - distance(fromShip || b, b) || CONF_RANK[b.confidence] - CONF_RANK[a.confidence])[0] || null;
}
