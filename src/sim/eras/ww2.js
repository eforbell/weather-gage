// Second World War surface rules (c. 1939–1945): radar, night fighting and the
// long torpedo. The defining change from 1915 is information: a ship with radar
// sees in the dark and through haze, a ship that radiates can be heard by a
// matching warning receiver, and gunnery splits into radar-directed fire and
// optical fire that needs starshell or searchlights at night. Movement is the
// steam-era model; the engine supplies ticks, contacts, signals and outcomes.
//
// Scale: 1 hex ≈ 1 nautical mile, 1 tick ≈ 3 minutes. Every number here is a
// game abstraction; docs/design/ww2-radar-night-action.md records the history
// each one stands in for.
import { SCENARIO_SETUPS } from '../scenarios.js';
import {
  DIRECTIONS, distance, isActive, addLog, addFx, applyDamage, resolveStatus, roll, nextRandom, terrainAt,
  directionToward, turnDistance, clamp, CONF_RANK, contactsForShip,
} from '../core.js';
import { steamMove, headingTo, beamCourse, nearest } from './steam.js';

export { movesThisTick } from './steam.js';

export const SHIP_TYPES = new Set(['battleship', 'cruiser', 'destroyer']);

// Hull size as a radar or lookout target.
const SIZE = { battleship: 'large', cruiser: 'large', destroyer: 'small' };

// Search radars by set. `range` is hexes against a large / small hull; inside
// `classify` the echo's size and the formation give a class. `band` decides
// which warning receivers can hear the set when it radiates.
export const RADARS = Object.freeze({
  // US metric air/surface set (SC, 1941–42): long but coarse, easily heard.
  sc: { range: { large: 10, small: 6 }, classify: 0, band: 'metric' },
  // US centimetric surface search (SG, 1942): the set that won the night battles of late 1942.
  sg: { range: { large: 15, small: 11 }, classify: 10, band: 'cm' }, // echo size tells a cruiser from a destroyer
  // British centimetric (Type 271/273, 1941): battleship ~13 nm, destroyer ~7 nm.
  type271: { range: { large: 12, small: 7 }, classify: 6, band: 'cm' },
  // German metric (FuMO Seetakt, 1939): good ranging, heard by any metric receiver.
  seetakt: { range: { large: 12, small: 7 }, classify: 3, band: 'metric' },
  // Japanese centimetric (Type 22, 1944): late, short and temperamental.
  type22: { range: { large: 9, small: 5 }, classify: 0, band: 'cm' },
});

// Warning receivers hear a radiating set of their band well beyond its own reach.
export const ESM = Object.freeze({ metric: { bands: ['metric'] }, cm: { bands: ['metric', 'cm'] } });
const ESM_REACH = 1.5;

// Gun calibres: damage per hit and the multiplier against each hull.
const CALIBRES = {
  heavy: { dmg: [10, 18], vs: { battleship: 0.8, cruiser: 1.1, destroyer: 1.6 } }, // 14–16 in
  medium: { dmg: [5, 10], vs: { battleship: 0.35, cruiser: 0.9, destroyer: 1.4 } }, // 8 in
  light: { dmg: [3, 6], vs: { battleship: 0.15, cruiser: 0.7, destroyer: 1.3 } }, // 5–6 in, fired fast
};

// Torpedoes: reach in hexes and run in hexes per tick.
// `hit` is the chance a spread finds a target that held her course (half of it
// one hex off); `dud` is the share of hits that fail to explode; `dmg` the damage.
export const TORPEDOES = Object.freeze({
  mk15: { range: 4, speed: 2.4, hit: 0.4, dud: 0.35, dmg: [16, 26] }, // US, 45 kn, ~4.5 nm; ran deep and failed to fire in 1942
  type93: { range: 8, speed: 2.4, hit: 0.55, dud: 0.05, dmg: [28, 42] }, // Japanese oxygen "Long Lance": 48 kn, ~12 nm, no wake, huge warhead
  mk9: { range: 5, speed: 2.2, hit: 0.45, dud: 0.05, dmg: [18, 28] }, // British 21-inch
});

const FC_RANGE = 12; // radar fire control (Mk 3/Mk 8, Type 284) reaches about this far
const STARSHELL_RANGE = 6;
const STARSHELL_LIGHTS = 0.6;
const SEARCHLIGHT_RANGE = 4;
const FLASH_RANGE = { night: 10, day: 14 };
const FLASH_UNCERTAINTY = 2;

// ---------- Conditions ----------

// Scenario light: 'day' or 'night', and optionally a tick at which dawn breaks.
export function lightAt(state) {
  const c = SCENARIO_SETUPS[state.scenarioId]?.conditions || {};
  if (c.light === 'night' && Number.isInteger(c.dawnAt) && state.tick >= c.dawnAt) return 'day';
  return c.light === 'night' ? 'night' : 'day';
}

export function illuminated(state, ship) {
  return (ship.illuminatedUntil ?? -1) >= state.tick || ship.hull <= 45; // starshell, searchlight, or burning
}

function landNear(state, c) {
  return DIRECTIONS.some(([dq, dr]) => terrainAt(state, c.q + dq, c.r + dr) === 'land');
}

// ---------- Validation ----------

export function validateShip(ship) {
  if (!SHIP_TYPES.has(ship.type)) throw new Error('Invalid ship type');
  if (!Number.isInteger(ship.speed) || ship.speed < 1 || ship.speed > 4) throw new Error('Invalid speed');
  if (!Number.isInteger(ship.guns) || ship.guns < 0) throw new Error('Invalid guns');
  if (!Number.isInteger(ship.gunRange) || ship.gunRange < 1 || ship.gunRange > 20) throw new Error('Invalid gun range');
  if (!Object.hasOwn(CALIBRES, ship.calibre)) throw new Error('Invalid calibre');
  for (const k of ['torpedoes', 'value']) if (!Number.isInteger(ship[k]) || ship[k] < 0) throw new Error(`Invalid ${k}`);
  if (ship.torpedoes > 0 && !Object.hasOwn(TORPEDOES, ship.torpedo)) throw new Error('Invalid torpedo type');
  const s = ship.sensors;
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('Invalid sensors');
  if (s.search !== null && !Object.hasOwn(RADARS, s.search)) throw new Error('Invalid search radar');
  if (typeof s.fireControl !== 'boolean') throw new Error('Invalid fire-control radar');
  if (s.esm !== null && !Object.hasOwn(ESM, s.esm)) throw new Error('Invalid warning receiver');
  if (ship.radar && !s.search) throw new Error('A ship without radar cannot radiate');
  if (typeof ship.nightTraining !== 'boolean' || typeof ship.searchlight !== 'boolean') throw new Error('Invalid night doctrine');
  for (const k of ['firedAt', 'illuminatedUntil']) if (!Number.isInteger(ship[k])) throw new Error(`Invalid ${k}`);
  const fc = ship.fc;
  if (!fc || typeof fc !== 'object' || !(fc.targetId === null || typeof fc.targetId === 'string') || !Number.isInteger(fc.level) || fc.level < 0 || fc.level > 3) throw new Error('Invalid fire control');
}

// ---------- Detection ----------

// The best of three senses: eyes (light, silhouette, illumination, gun flashes),
// the observer's own search radar if she is radiating, and a warning receiver
// hearing the enemy's radar. Radar gives range and bearing but never a name.
export function detection(observer, enemy, state) {
  const found = [
    optical(observer, enemy, state),
    radarEcho(observer, enemy, state),
    intercept(observer, enemy, state),
  ].filter(Boolean);
  if (!found.length) return null;
  const best = found.sort((a, b) => CONF_RANK[b.confidence] - CONF_RANK[a.confidence] || (a.uncertainty ?? 0) - (b.uncertainty ?? 0))[0];
  // Whether the enemy is radiating is only known to a receiver that can hear her.
  return { ...best, emitter: Boolean(intercept(observer, enemy, state)) };
}

export function optical(observer, enemy, state) {
  const d = distance(observer, enemy);
  const night = lightAt(state) === 'night';
  if (!night || illuminated(state, enemy)) {
    const reach = night ? 8 : 14;
    if (d <= Math.min(reach, SIZE[enemy.type] === 'small' ? 4 : 6)) return { confidence: 'identified', range: d, by: 'eyes' };
    if (d <= Math.min(reach, 10)) return { confidence: 'classified', range: d, by: 'eyes' };
    if (d <= reach) return { confidence: 'sighted', range: d, by: 'eyes' };
  } else {
    // Night lookouts: a big silhouette carries further, and trained night lookouts
    // with big binoculars (the Imperial Navy's speciality) see further still.
    const lookout = 2 + (SIZE[enemy.type] === 'large' ? 1 : 0) + (observer.nightTraining ? 2 : 0);
    if (d <= lookout - 1) return { confidence: 'identified', range: d, by: 'eyes' };
    if (d <= lookout) return { confidence: 'classified', range: d, by: 'eyes' };
    if (d <= lookout + 1) return { confidence: 'sighted', range: d, by: 'eyes' };
  }
  // Gun flashes: a bearing and a rough range, firmed up only while they keep coming.
  if (enemy.firedAt >= 0 && enemy.firedAt >= state.tick - 1 && d <= FLASH_RANGE[night ? 'night' : 'day']) return { confidence: 'sighted', range: d, uncertainty: FLASH_UNCERTAINTY, by: 'flash' };
  return null;
}

export function radarReach(observer, enemy, state) {
  const set = RADARS[observer.sensors.search];
  if (!set || !observer.radar || observer.weapons <= 10) return 0;
  const reach = set.range[SIZE[enemy.type]];
  return landNear(state, enemy) ? Math.ceil(reach / 2) : reach; // an island behind the echo swamps it
}

export function radarEcho(observer, enemy, state) {
  const set = RADARS[observer.sensors.search];
  const reach = radarReach(observer, enemy, state);
  const d = distance(observer, enemy);
  if (!set || !reach || d > reach) return null;
  return { confidence: d <= set.classify ? 'classified' : 'sighted', range: d, by: 'radar' };
}

// A radiating enemy set is heard on its bearing well beyond its own reach; the
// position firms up while the signal is held (target motion analysis).
export function intercept(observer, enemy, state) {
  const esm = ESM[observer.sensors?.esm];
  const set = RADARS[enemy.sensors?.search];
  if (!esm || !set || !enemy.radar || !esm.bands.includes(set.band)) return null;
  const d = distance(observer, enemy);
  if (d > Math.round(set.range.large * ESM_REACH)) return null;
  return { confidence: 'sighted', range: d, uncertainty: 3, by: 'receiver' };
}

// ---------- Signals ----------

// Talk-between-ships radio: next tick, no direction-finding at these ranges.
export function orderDelay() { return 1; }

// ---------- Movement ----------

export function moveShip(state, ship, occupied, destination) {
  const startFacing = ship.facing;
  state = steamMove(state, ship, occupied, () => desiredFacing(state, ship, destination), ship.type === 'destroyer' ? 2 : 1);
  // Optical ranging is lost in a hard turn; a radar solution is held through it.
  if (turnDistance(startFacing, ship.facing) >= 2) ship.fc.level = Math.max(0, ship.fc.level - (hasRadarFc(ship) ? 1 : 2));
  return state;
}

function desiredFacing(state, ship, destination) {
  const engaged = ship.order.type === 'engage' && ship.doctrine.roe === 'free';
  if (engaged && ship.torpedoes > 0) {
    const reach = TORPEDOES[ship.torpedo].range;
    const prey = pickTarget(state, ship, reach + 4, 'large')?.contact;
    if (prey && ship.type === 'destroyer') {
      const d = distance(ship, prey);
      const dir = directionToward(ship, prey);
      // Attack run: close to torpedo range, fire, then turn away.
      if (ship.reloadUntil > state.tick) return nearest(ship.facing, [(dir + 2) % 6, (dir + 4) % 6, (dir + 3) % 6]);
      return d > reach - 1 ? dir : nearest(ship.facing, [(dir + 1) % 6, (dir + 5) % 6]);
    }
  }
  const inFormation = (ship.order.type === 'line' || ship.order.type === 'screen') && ship.doctrine.roe === 'free';
  if (ship.type !== 'destroyer' && (engaged || inFormation)) {
    // Heavy ships go for the heavy ships: inside gun range they keep them abeam,
    // further out they steer for where the target will be, not where she is.
    const target = pickTarget(state, ship, ship.gunRange + 1, 'large')?.contact;
    if (target) return beamCourse(ship, target, Math.min(ship.doctrine.range, ship.gunRange));
    const blip = engaged && pickQuarry(state, ship, SEARCH_RADIUS);
    if (blip) return headingTo(state, ship, interceptPoint(state, ship, blip));
  }
  return headingTo(state, ship, destination);
}

const SEARCH_RADIUS = 16;

// Any fresh report will do for closing, but a known heavy ship comes first and a
// known destroyer last.
function pickQuarry(state, ship, maxRange) {
  const rank = (c) => distance(ship, c) + (c.className ? (/cruiser|battleship/i.test(c.className) ? -6 : 6) : 0);
  return contactsForShip(state, ship).filter((c) => !c.stale && distance(ship, c) <= maxRange).sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1))[0] || null;
}

// Steer for where the contact will be. Course comes from a held track (a radar
// plot or a ship in sight), so a contact only heard or glimpsed is chased as is.
export function interceptPoint(state, ship, contact) {
  const target = state.ships.find((s) => s.id === contact.targetId);
  if (!target || !heldTrack(state, ship, target)) return { q: contact.q, r: contact.r };
  return leadPoint(state, contact, target, Math.min(4, Math.round(distance(ship, contact) / 3)));
}

// A course is known from this ship's own radar echo or a clear sight of her, not
// from gun flashes or an intercepted bearing.
function heldTrack(state, ship, target) {
  const seen = optical(ship, target, state);
  return Boolean(radarEcho(ship, target, state) || (seen && CONF_RANK[seen.confidence] >= CONF_RANK.classified));
}

function leadPoint(state, from, target, lead) {
  const [dq, dr] = DIRECTIONS[target.facing];
  return { q: clamp(from.q + dq * lead, 0, state.map.width - 1), r: clamp(from.r + dr * lead, 0, state.map.height - 1) };
}

// ---------- Combat ----------

function hasRadarFc(ship) { return Boolean(ship.sensors.fireControl && ship.radar && ship.weapons > 10); }

// Captains choose and steer by their side's fresh contact reports, never by where
// the enemy truly is; the class is known only once classified. Captains hold fire
// on unclassified echoes: with no way to tell friend from foe on a radar scope,
// the 1942 Navy shot at its own destroyers (Duncan at Cape Esperance). Returns the
// report and the ship it stands for (the guns' shells land on the real ship).
function pickTarget(state, ship, maxRange, prefer) {
  const rank = (c) => distance(ship, c) - (c.targetId === ship.fc?.targetId ? 2.5 : 0) + (prefer === 'large' && c.className && !/cruiser|battleship/i.test(c.className) ? 8 : 0);
  const contact = contactsForShip(state, ship)
    .filter((c) => !c.stale && CONF_RANK[c.confidence] >= CONF_RANK.classified && distance(ship, c) <= maxRange)
    .filter((c) => { const s = state.ships.find((x) => x.id === c.targetId); return s && isActive(s) && s.side !== ship.side; })
    .sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1))[0];
  return contact ? { contact, target: state.ships.find((x) => x.id === contact.targetId) } : null;
}

// How the guns can be laid on a target this tick, best first: by radar, by eye
// (daylight, starshell, searchlight or fires), or not at all.
export function firingSolution(state, ship, target) {
  const d = distance(ship, target);
  if (hasRadarFc(ship) && d <= FC_RANGE && d <= radarReach(ship, target, state)) return 'radar';
  const night = lightAt(state) === 'night';
  if (!night && d <= 14) return 'visual';
  if (night && illuminated(state, target) && d <= 8) return 'visual';
  if (night && optical(ship, target, state)?.confidence === 'identified') return 'visual';
  return null;
}

export function combat(state) {
  for (const ship of state.ships) {
    if (!isActive(ship) || ship.doctrine.roe === 'hold' || ship.weapons <= 10) continue;
    if (ship.torpedoes > 0 && ship.reloadUntil <= state.tick && ship.order.type !== 'withdraw') {
      // A spread needs only a bearing and a rough range: gun flashes will do.
      const contact = pickQuarry(state, ship, TORPEDOES[ship.torpedo].range);
      const target = contact && state.ships.find((x) => x.id === contact.targetId);
      if (target && isActive(target)) state = launchTorpedoes(state, ship, target, contact);
    }
    if (ship.guns <= 0) continue;
    const target = pickTarget(state, ship, ship.gunRange, ship.type === 'destroyer' ? 'any' : 'large')?.target;
    if (!target) continue;
    const solution = firingSolution(state, ship, target);
    if (solution) { state = fireBattery(state, ship, target, solution); continue; }
    state = illuminate(state, ship, target);
  }
  return state;
}

// No solution at night: light the target up. A searchlight is certain but marks
// the ship holding it for every gun in range; starshell is uncertain, and its
// burst is a flash that gives the firing ship away.
function illuminate(state, ship, target) {
  const d = distance(ship, target);
  if (ship.searchlight && d <= SEARCHLIGHT_RANGE) {
    target.illuminatedUntil = state.tick + 1;
    ship.illuminatedUntil = state.tick + 1;
    state = addLog(state, `${ship.name} switches on her searchlight and holds ${target.name} in the beam.`, 'combat');
    return addFx(state, { type: 'searchlight', shooterId: ship.id, targetId: target.id });
  }
  if (d > STARSHELL_RANGE) return state;
  ship.firedAt = state.tick;
  // Starshell bursts in the wrong place as often as not.
  const lit = roll(state, STARSHELL_LIGHTS);
  if (lit) target.illuminatedUntil = state.tick + 1;
  state = addLog(state, `${ship.name} fires starshell over ${target.name}${lit ? '' : ', but it bursts wide'}.`, 'combat');
  return addFx(state, { type: 'starshell', shooterId: ship.id, targetId: target.id, hits: lit ? 1 : 0 });
}

export function hitChance(ship, target, solution, fcLevel, d, night = false) {
  const f = d / ship.gunRange;
  let p = (f <= 0.3 ? 0.4 : f <= 0.6 ? 0.28 : 0.15) * (0.55 + 0.2 * fcLevel) * (0.5 + 0.5 * (ship.crew / 100));
  if (solution === 'visual' && d > 8) p *= 0.85; // laying by eye at the edge of what can be seen
  if (solution === 'visual' && night && !ship.nightTraining) p *= 0.7; // untrained crews under starshell
  if (ship.calibre === 'heavy' && target.type === 'destroyer') p *= 0.5;
  return clamp(p, 0, 0.9);
}

function fireBattery(state, ship, target, solution) {
  const d = distance(ship, target);
  const bearing = directionToward(ship, target);
  const rel = (bearing - ship.facing + 6) % 6;
  const arc = rel === 0 || rel === 3 ? 0.5 : 1; // end-on, half the turrets bear
  const shots = Math.max(1, Math.round((ship.guns * arc * (ship.weapons / 100)) / 2));
  // Radar ranging walks onto the target in a salvo or two; optical ranging takes longer.
  const step = solution === 'radar' ? 2 : 1;
  ship.fc = ship.fc.targetId === target.id ? { targetId: target.id, level: Math.min(3, ship.fc.level + step) } : { targetId: target.id, level: solution === 'radar' ? 1 : 0 };
  const p = hitChance(ship, target, solution, ship.fc.level, d, lightAt(state) === 'night');
  let hits = 0;
  for (let i = 0; i < shots; i += 1) if (roll(state, p)) hits += 1;
  ship.firedAt = state.tick;
  let damage = 0;
  if (hits) {
    const { dmg, vs } = CALIBRES[ship.calibre];
    for (let i = 0; i < hits; i += 1) damage += (dmg[0] + nextRandom(state) * (dmg[1] - dmg[0])) * vs[target.type];
    damage = Math.max(1, Math.round(damage));
    applyDamage(target, { hull: damage, propulsion: damage * 0.4, weapons: damage * 0.5, crew: damage * 0.35 });
  }
  const result = hits ? `${hits} hit${hits > 1 ? 's' : ''}` : ship.fc.level >= 2 ? 'straddling' : 'no hits';
  state = addLog(state, `${ship.name} opens ${solution === 'radar' ? 'radar-directed' : 'visual'} fire on ${target.name}: ${result}.`, 'combat');
  state = addFx(state, { type: 'salvo', shooterId: ship.id, targetId: target.id, shots, hits, damage, heavy: ship.calibre !== 'light', straddle: !hits && ship.fc.level >= 2, fc: ship.fc.level });
  return resolveStatus(state, target);
}

// A torpedo spread aimed at the reported position, led along her course only
// when the side holds a track (radar or a clear sight), as interceptPoint does.
// Launching makes no flash; only the firing side knows the fish are running.
function launchTorpedoes(state, ship, target, contact) {
  const kind = TORPEDOES[ship.torpedo];
  const d = distance(ship, contact);
  const eta = Math.max(1, Math.ceil(d / kind.speed));
  const aim = heldTrack(state, ship, target) ? leadPoint(state, contact, target, Math.round((eta * target.speed) / 2)) : { q: contact.q, r: contact.r };
  ship.torpedoes -= 1;
  ship.reloadUntil = state.tick + 3;
  state.pending.push({ kind: 'torpedo', shipId: ship.id, targetId: target.id, side: ship.side, salvo: 1, deliverAt: state.tick + eta, q: ship.q, r: ship.r, aimQ: aim.q, aimR: aim.r, weapon: ship.torpedo });
  state = addLog(state, `${ship.name} fires a spread of torpedoes at ${target.name}.`, 'combat', [ship.side]);
  return addFx(state, { type: 'torpedo', shooterId: ship.id, targetId: target.id, at: aim, eta, audience: [ship.side] });
}

// Torpedoes resolve after ships move, so they hit where the target now is.
export function afterMove(state) {
  const due = state.pending.filter((p) => p.kind === 'torpedo' && p.deliverAt <= state.tick);
  if (!due.length) return state;
  state.pending = state.pending.filter((p) => !due.includes(p));
  for (const item of due) state = torpedoRun(state, item);
  return state;
}

export function torpedoRun(state, item) {
  const target = state.ships.find((s) => s.id === item.targetId);
  if (!target || !isActive(target)) return state;
  const kind = TORPEDOES[item.weapon];
  const miss = distance(target, { q: item.aimQ, r: item.aimR });
  const p = miss === 0 ? kind.hit : miss === 1 ? kind.hit / 2 : 0;
  if (!roll(state, p)) {
    // A miss in the dark is known only to the side that fired, from its own plot.
    state = addLog(state, `Torpedo tracks run wide of ${target.name}.`, 'defense', [item.side]);
    return addFx(state, { type: 'torpedo-miss', targetId: target.id, at: { q: item.aimQ, r: item.aimR }, audience: [item.side] });
  }
  if (roll(state, kind.dud)) {
    // A dud thuds into the hull: her crew know it; the firing side sees no explosion.
    state = addLog(state, `A torpedo strikes ${target.name} and fails to explode.`, 'defense', [target.side]);
    return addFx(state, { type: 'torpedo-miss', targetId: target.id, at: { q: target.q, r: target.r }, audience: [target.side] });
  }
  const damage = Math.round(kind.dmg[0] + nextRandom(state) * (kind.dmg[1] - kind.dmg[0]));
  applyDamage(target, { hull: damage, propulsion: damage * 0.8, weapons: damage * 0.3, crew: damage * 0.4 });
  state = addLog(state, `${target.name} is struck by a torpedo.`, 'damage');
  state = addFx(state, { type: 'torpedo-hit', targetId: target.id, hits: 1, damage, heavy: true });
  return resolveStatus(state, target);
}
