// Cold War undersea and escort rules: acoustic signatures, sonar, baffles, the thermal
// layer, carrier patrols and sonobuoy fields, torpedo entities (heavyweight, rocket-thrown
// and air-dropped), decoys, datums and counter-fire, and captains.
import {
  DIRECTIONS, distance, isActive, addLog, addFx, applyDamage, resolveStatus, nextRandom,
  directionToward, turnDistance, inBounds, terrainAt, clamp, CONF_RANK, hostile, markAttack, assertCoord, sidesOf, chance, seededHash, believedHostile, worthClosing, contactsForShip,
} from '../core.js';
import { steamMove, headingTo, nearest } from './steam.js';

const TRAITS = new Set(['steady', 'cunning', 'reckless']);
const SUBMARINES = new Set(['ssn', 'ssbn']);
const SURFACE_SHIPS = new Set(['asw_destroyer', 'carrier']);
const TORPEDO_SPEED = 4; // hexes per tick: roughly 55 knots against a 30-knot sprint
const TORPEDO_RUN = 22;
const WIRE_LENGTH = 12; // hexes of run before the guidance wire pays out
const ENABLE_RANGE = 3; // the seeker switches on this close to the aim point
const SEEKER_RANGE = 3; // acquisition range
const TRACK_RANGE = 4; // a locked seeker holds a target a little farther out
const DECOY_SEDUCTION = 0.45; // chance a noisemaker fools a given seeker
const HEAR_TORPEDO = 6;
const MAX_ENTITIES = 40;
const TRACE_RUN = 12; // a torpedo this early in its run still points back at the boat that fired it
const DATUM_AGE = 6; // ticks a last-known position is worth prosecuting
// Lightweight torpedoes (rocket-thrown by escorts, dropped by aircraft): no wire, seeker
// live on splashdown, slower, shorter run, smaller warhead, and a shallow search preset.
const LIGHT = { speed: 3, run: 8, armAt: 1 };
const ASROC_RANGE = 8;
const BUOY_RADIUS = 3;
const BUOY_LIFE = 6;
const AIR_RANGE = 14;

// ---------- Validation ----------

export function validateShip(ship, map) {
  if (!SUBMARINES.has(ship.type) && !SURFACE_SHIPS.has(ship.type)) throw new Error('Invalid ship type');
  for (const k of ['speed', 'quiet', 'sonar', 'torpedoes', 'decoys', 'noise', 'value']) if (!Number.isInteger(ship[k]) || ship[k] < 0) throw new Error(`Invalid ${k}`);
  if (ship.chosenDepth !== undefined && ship.chosenDepth !== 'shallow' && ship.chosenDepth !== 'deep') throw new Error('Invalid chosenDepth');
  for (const k of ['pingAt', 'firedAt', 'ivanAt', 'decoyAt', 'evadingAt', 'driftAt']) if (!Number.isInteger(ship[k])) throw new Error(`Invalid ${k}`);
  if (!ship.captain || typeof ship.captain !== 'object' || typeof ship.captain.name !== 'string' || !TRAITS.has(ship.captain.trait)) throw new Error('Invalid captain');
  if (ship.passiveClass !== undefined && typeof ship.passiveClass !== 'string') throw new Error('Invalid passiveClass');
  if (ship.goal !== undefined && (!Array.isArray(ship.goal) || !ship.goal.every((c) => Array.isArray(c) && c.length === 2 && inBounds({ q: c[0], r: c[1] }, map)))) throw new Error('Invalid goal');
  if (ship.searchAt !== undefined && (!Array.isArray(ship.searchAt) || ship.searchAt.length !== 2 || !inBounds({ q: ship.searchAt[0], r: ship.searchAt[1] }, map))) throw new Error('Invalid search area');
  if (!ship.doctrine.speed || !ship.doctrine.depth) throw new Error('Cold War doctrine needs speed and depth');
  if (SURFACE_SHIPS.has(ship.type) && (ship.doctrine.depth !== 'surface' || ship.doctrine.speed !== 'standard')) throw new Error('Surface ship doctrine must stay on the surface');
  if (ship.type === 'carrier' && (!Number.isInteger(ship.airSorties) || ship.airSorties < 0 || !Number.isInteger(ship.patrolReadyAt) || ship.patrolReadyAt < 0)) throw new Error('Invalid carrier patrol capacity');
  if (ship.type !== 'carrier' && (ship.airSorties !== undefined || ship.patrolReadyAt !== undefined)) throw new Error('Invalid air patrol capacity');
  // Anti-submarine weapons (absent in older saves, which then simply carry none).
  if (ship.asroc !== undefined && (ship.type !== 'asw_destroyer' || !Number.isInteger(ship.asroc) || ship.asroc < 0)) throw new Error('Invalid ASROC load');
  for (const k of ['airTorpedoes', 'airStrikeReadyAt']) if (ship[k] !== undefined && (ship.type !== 'carrier' || !Number.isInteger(ship[k]) || ship[k] < 0)) throw new Error(`Invalid ${k}`);
}

export function validatePatrols(patrols, state) {
  if (!Array.isArray(patrols) || patrols.length > 12) throw new Error('Invalid patrols');
  for (const patrol of patrols) {
    const carrier = state.ships.find((s) => s.id === patrol?.carrierId && s.type === 'carrier');
    if (!carrier || patrol.side !== carrier.side || !Number.isInteger(patrol.resolveAt) || patrol.resolveAt < state.tick) throw new Error('Invalid patrol');
    assertCoord(patrol, state.map);
  }
}

export function validateEntities(entities, shipIds, state) {
  if (!Array.isArray(entities) || entities.length > MAX_ENTITIES) throw new Error('Invalid entities');
  const ids = new Set();
  for (const e of entities) {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || ids.has(e.id)) throw new Error('Invalid entity');
    ids.add(e.id);
    if (!sidesOf(state).includes(e.side)) throw new Error('Invalid entity side');
    assertCoord(e, state.map);
    if (e.kind === 'torpedo') {
      if (!shipIds.has(e.shooterId)) throw new Error('Invalid torpedo shooter');
      if (!Number.isInteger(e.facing) || e.facing < 0 || e.facing > 5) throw new Error('Invalid torpedo facing');
      for (const k of ['travelled', 'run', 'armAt']) if (!Number.isInteger(e[k]) || e[k] < 0) throw new Error(`Invalid torpedo ${k}`);
      assertCoord({ q: e.aimQ, r: e.aimR }, state.map);
      if (e.seeking !== null && typeof e.seeking !== 'string') throw new Error('Invalid torpedo seeker');
      // Guidance state. Saves from before wire guidance lack it: those torpedoes have no
      // wire and a live seeker from the start, and keep the old own-ship rule.
      if (e.targetId !== undefined && e.targetId !== null && !shipIds.has(e.targetId)) throw new Error('Invalid torpedo target');
      for (const k of ['wired', 'enabled']) if (e[k] !== undefined && typeof e[k] !== 'boolean') throw new Error(`Invalid torpedo ${k}`);
      if (e.ignore !== undefined && (!Array.isArray(e.ignore) || e.ignore.length > MAX_ENTITIES || !e.ignore.every((x) => typeof x === 'string'))) throw new Error('Invalid torpedo ignore list');
      if (e.lockQ !== undefined && e.lockQ !== null) assertCoord({ q: e.lockQ, r: e.lockR }, state.map);
      else if (e.lockR !== undefined && e.lockR !== null) throw new Error('Invalid torpedo lock');
      if (e.depth !== undefined && e.depth !== 'shallow' && e.depth !== 'deep') throw new Error('Invalid torpedo depth');
      if (e.speed !== undefined && (!Number.isInteger(e.speed) || e.speed < 1 || e.speed > 6)) throw new Error('Invalid torpedo speed');
      if (e.weight !== undefined && e.weight !== 'heavy' && e.weight !== 'light') throw new Error('Invalid torpedo weight');
      if (e.originQ !== undefined) assertCoord({ q: e.originQ, r: e.originR }, state.map);
    } else if (e.kind === 'buoys') {
      const carrier = state.ships.find((s) => s.id === e.carrierId);
      if (!carrier || carrier.type !== 'carrier' || carrier.side !== e.side || !Number.isInteger(e.until)) throw new Error('Invalid sonobuoy field');
    } else if (e.kind === 'decoy') {
      if (!Number.isInteger(e.until)) throw new Error('Invalid decoy');
    } else throw new Error('Invalid entity kind');
  }
}

// ---------- Signals ----------

export function orderDelay() { return 1; } // VLF/ELF traffic is slow but the abstraction is one tick

// ---------- Contact with the defector ----------

// A ping within earshot of a cunning captain who owes nobody anything is an invitation.
// Ramius answers with one ping of his own and places his boat under the pinger's command.
function answerPing(state, pinger) {
  const defector = state.ships.find((s) => isActive(s) && s.side !== pinger.side && s.captain?.trait === 'cunning'
    && !hostile(state, s.side, pinger.side) && !hostile(state, pinger.side, s.side) && distance(s, pinger) <= 8);
  if (!defector || Object.values(state.command || {}).some((list) => list.includes(defector.side))) return state;
  state.command = { ...(state.command || {}), [pinger.side]: [...(state.command?.[pinger.side] || []), defector.side] };
  const audience = [pinger.side, defector.side];
  state = addLog(state, `${defector.name} answers: one ping. ${defector.captain.name} places his boat under your command.`, 'event', audience);
  return addFx(state, { type: 'event', targetId: defector.id, label: 'ONE PING ONLY — CONTACT', audience });
}

// ---------- Noise and hearing ----------

// Evading boats go to flank; hunters with nothing on sonar sprint and drift, slowing
// every third tick to listen, because a boat at flank speed hears very little.
const speedFor = (ship, tick) => (ship.evadingAt === tick ? 'flank' : ship.driftAt === tick ? 'silent' : ship.doctrine.speed);
function halfHexes(ship, setting) {
  if (setting === 'silent') return 1;
  if (setting === 'standard') return Math.max(1, Math.ceil(ship.speed / 2));
  return ship.speed;
}

export function beforeTick(state) {
  for (const ship of state.ships) if (ship.era === 'coldwar') ship.noise = ship.quiet; // at rest; movement adds to it
  // A boat that crossed the layer to evade returns to her ordered depth once clear.
  for (const ship of state.ships) {
    if (ship.chosenDepth === undefined || ship.evadingAt >= state.tick - 2) continue;
    if (ship.doctrine.depth !== 'surface') ship.doctrine = { ...ship.doctrine, depth: ship.chosenDepth };
    delete ship.chosenDepth;
  }
  state.patrols = (state.patrols || []).filter((patrol) => patrol.resolveAt >= state.tick);
  for (const patrol of state.patrols) if (patrol.resolveAt === state.tick) {
    const carrier = state.ships.find((s) => s.id === patrol.carrierId);
    if (!carrier || !isActive(carrier)) continue;
    const sow = (state.entities || []).length < MAX_ENTITIES && !(state.entities || []).some((e) => e.id === `b${state.tick}_${carrier.id}`);
    state = addLog(state, `${carrier.name} patrol searches sector ${patrol.q}, ${patrol.r}${sow ? ' and sows a sonobuoy field' : ''}.`, 'info', [carrier.side]);
    if (sow) {
      state.entities = [...(state.entities || []), { id: `b${state.tick}_${carrier.id}`, kind: 'buoys', side: carrier.side, carrierId: carrier.id, q: patrol.q, r: patrol.r, until: state.tick + BUOY_LIFE }];
      state = addFx(state, { type: 'buoys', shooterId: carrier.id, at: { q: patrol.q, r: patrol.r }, audience: [carrier.side] });
    }
  }
  // Pings ordered last tick go out now.
  for (const ship of state.ships) {
    if (!isActive(ship) || ship.pingAt !== state.tick) continue;
    state = addLog(state, `${ship.name} pings: one ping only.`, 'combat', [ship.side]);
    state = addFx(state, { type: 'ping', shooterId: ship.id });
    state = answerPing(state, ship);
  }
  state.entities = (state.entities || []).filter((e) => (e.kind !== 'decoy' && e.kind !== 'buoys') || e.until >= state.tick);
  return state;
}

export function detection(observer, enemy, state) {
  const d = distance(observer, enemy);
  if (enemy.pingAt === state.tick && d <= 20) return { confidence: 'sighted', range: d, uncertainty: 1 }; // the pinger gives herself away
  if (observer.pingAt === state.tick && d <= 10) return { confidence: 'identified', range: d, uncertainty: 0 };
  if (d <= 1) return { confidence: 'identified', range: d, uncertainty: 0 };
  if (enemy.doctrine.depth === 'surface' && d <= 10) return { confidence: d <= 6 ? 'identified' : 'classified', range: d, uncertainty: 0 }; // a surfaced boat is seen, not heard
  if (observer.type === 'carrier' && (state.patrols || []).some((p) => p.carrierId === observer.id && p.resolveAt === state.tick && distance(p, enemy) <= 5
    && (enemy.doctrine.depth !== 'deep' || chance(state, `patrol|${state.tick}|${p.carrierId}|${p.q}|${p.r}|${enemy.id}`, 0.55)))) {
    return { confidence: 'sighted', range: d, uncertainty: 2 };
  }
  if (observer.type === 'carrier' && SUBMARINES.has(enemy.type) && buoysHear(state, observer, enemy)) return { confidence: 'sighted', range: d, uncertainty: 1, submerged: enemy.doctrine.depth !== 'surface' };
  const heard = hullSonar(observer, enemy, state, d) || traceTorpedo(observer, enemy, state, d);
  return heard && { ...heard, submerged: enemy.doctrine.depth !== 'surface' };
}

function hullSonar(observer, enemy, state, d) {
  const rel = (directionToward(observer, enemy) - observer.facing + 6) % 6;
  if (rel === 3 && observer.ivanAt !== state.tick) return null; // the baffles: deaf astern
  const layer = observer.doctrine.depth !== enemy.doctrine.depth ? 3 : 0;
  const selfNoise = speedFor(observer, state.tick) === 'flank' ? 3 : 0;
  const transient = enemy.firedAt === state.tick ? 6 : 0;
  const range = enemy.noise * 2 + observer.sonar - selfNoise - layer + transient;
  if (d > range) return null;
  // Near the limit of hearing a contact fades in and out with the water, not on a hard edge.
  if (d > range - 2 && !chance(state, `hear|${state.tick}|${observer.id}|${enemy.id}`, 0.5)) return null;
  return { confidence: d <= 2 ? 'identified' : 'sighted', range: d, uncertainty: d <= 2 ? 0 : Math.min(4, 1 + Math.floor(d / 3)) };
}

// The datum: a torpedo heard running early in its run points back down its track to
// where it was fired. That is a fixed point with a 2-hex uncertainty, not a track: it does
// not sharpen or follow the boat, which has usually moved on.
function traceTorpedo(observer, enemy, state, d) {
  if (observer.side === enemy.side || d > TRACE_RUN + HEAR_TORPEDO) return null;
  const t = (state.entities || []).find((e) => e.kind === 'torpedo' && e.shooterId === enemy.id && e.travelled <= TRACE_RUN && e.weight !== 'light'
    && e.originQ !== undefined && distance(e, observer) <= HEAR_TORPEDO);
  return t ? { confidence: 'sighted', range: d, uncertainty: 2, datum: { q: t.originQ, r: t.originR } } : null;
}

// Sonobuoys listen above the layer: shallow boats are heard reliably, deep ones about
// half the time, and louder boats more often. Reports go only to the carrier that laid them.
function buoysHear(state, carrier, enemy) {
  const depthPenalty = enemy.doctrine.depth === 'deep' ? 0.35 : 0;
  const p = clamp(0.8 - depthPenalty + enemy.noise * 0.03, 0.05, 0.95);
  return (state.entities || []).some((e) => e.kind === 'buoys' && e.carrierId === carrier.id && e.until >= state.tick && distance(e, enemy) <= BUOY_RADIUS
    && chance(state, `buoys|${state.tick}|${e.id}|${enemy.id}`, p));
}

// ---------- Captains ----------

function heardTorpedo(state, ship) {
  return (state.entities || [])
    .filter((e) => e.kind === 'torpedo' && e.shooterId !== ship.id && distance(e, ship) <= HEAR_TORPEDO)
    .sort((a, b) => distance(a, ship) - distance(b, ship))[0] || null;
}

function contactsFor(state, ship, filter) {
  return contactsForShip(state, ship)
    .filter((c) => !c.stale)
    .map((c) => ({ c, s: state.ships.find((x) => x.id === c.targetId) }))
    .filter(({ c, s }) => s && isActive(s) && filter(s, c))
    .sort((a, b) => distance(ship, a.c) - distance(ship, b.c) || (a.s.id < b.s.id ? -1 : 1));
}

// A boat that hears a torpedo coming launches a noisemaker, whether or not she can move.
export function react(state, ship) {
  if (!heardTorpedo(state, ship)) return state;
  ship.evadingAt = state.tick;
  if (ship.decoys > 0 && ship.decoyAt < state.tick - 2 && state.entities.length < MAX_ENTITIES) {
    ship.decoys -= 1;
    ship.decoyAt = state.tick;
    // Classic evasion: drop the noisemaker and go through the layer, leaving the decoy
    // at the depth the torpedo was set for.
    if (ship.doctrine.depth !== 'surface') {
      ship.chosenDepth ??= ship.doctrine.depth; // remembered, restored once the danger passes
      ship.doctrine = { ...ship.doctrine, depth: ship.doctrine.depth === 'deep' ? 'shallow' : 'deep' };
      state = addLog(state, `${ship.name} crosses the layer to evade.`, 'defense', [ship.side]);
    }
    state.entities.push({ id: `d${state.tick}_${ship.id}`, kind: 'decoy', side: ship.side, q: ship.q, r: ship.r, until: state.tick + 3 });
    state = addLog(state, `${ship.name} launches a noisemaker.`, 'defense', [ship.side]);
    state = addFx(state, { type: 'decoy', shooterId: ship.id });
  }
  return state;
}

export function moveShip(state, ship, occupied, destination) {
  const trait = ship.captain.trait;
  const torpedo = heardTorpedo(state, ship);
  if (torpedo) {
    state = react(state, ship);
  } else if (trait === 'cunning' && (state.tick + state.seed) % 6 === 0 && ship.order.type !== 'hold') {
    // Crazy Ivan: a hard turn to listen down the baffles and back onto course. Costs the tick's progress.
    ship.ivanAt = state.tick;
    state = addLog(state, `${ship.name} makes a Crazy Ivan.`, 'info', [ship.side]);
    state = addFx(state, { type: 'ivan', shooterId: ship.id });
    return state;
  } else if (ship.order.type === 'engage' && (state.tick + (state.seed >>> 4)) % 3 === 0 && !contactsFor(state, ship, (s, c) => worthClosing(state, ship, c)).length) {
    ship.driftAt = state.tick;
  }
  const setting = speedFor(ship, state.tick);
  const before = { q: ship.q, r: ship.r };
  state = steamMove(state, ship, occupied, () => desiredFacing(state, ship, destination, torpedo), trait === 'reckless' ? 2 : 1, halfHexes(ship, setting));
  const moved = distance(before, ship);
  ship.noise = ship.quiet + moved * 2 + (setting === 'flank' ? 2 : 0);
  return state;
}

function desiredFacing(state, ship, destination, torpedo) {
  if (torpedo) {
    const dir = directionToward(ship, torpedo);
    // Ramius's trick: turn into a torpedo that has not yet run its arming distance.
    if (ship.captain.trait === 'cunning' && torpedo.travelled < torpedo.armAt + 2 && distance(ship, torpedo) <= 3) return dir;
    return nearest(ship.facing, [(dir + 3) % 6, (dir + 2) % 6, (dir + 4) % 6]);
  }
  if (ship.type === 'asw_destroyer' && ship.doctrine.roe === 'free' && ['engage', 'screen'].includes(ship.order.type)) {
    // Prosecute: close on a fresh submarine contact near the screen, else on a recent datum.
    // On Screen an escort only goes after what threatens the ship she screens.
    const ward = ship.order.type === 'screen' ? state.ships.find((s) => s.side === ship.side && s.type === 'carrier' && isActive(s)) : null;
    const leashed = (c) => !ward || distance(ward, c) <= 8;
    const sub = contactsFor(state, ship, (s, c) => c.submerged && worthClosing(state, ship, c)).find(({ c }) => distance(ship, c) <= 8 && leashed(c));
    if (sub) return distance(ship, sub.c) > 3 ? directionToward(ship, sub.c) : nearest(ship.facing, [(directionToward(ship, sub.c) + 1) % 6, (directionToward(ship, sub.c) + 5) % 6]);
    const datum = recentDatum(state, ship, 6);
    if (datum && leashed(datum)) return directionToward(ship, datum);
  }
  const target = ship.order.type === 'engage' && ship.doctrine.roe === 'free' ? contactsFor(state, ship, (s, c) => worthClosing(state, ship, c))[0] : null;
  if (target) {
    const d = distance(ship, target.c);
    if (d > ship.doctrine.range - 1) return directionToward(ship, target.c);
    return nearest(ship.facing, [(directionToward(ship, target.c) + 1) % 6, (directionToward(ship, target.c) + 5) % 6]);
  }
  if (ship.order.type === 'engage' && ship.doctrine.roe === 'free' && ship.type !== 'carrier') {
    const datum = recentDatum(state, ship, 10);
    if (datum && distance(ship, datum) > 1) return directionToward(ship, datum);
  }
  if (ship.order.type === 'shadow') {
    // Shadow the contact you are not at war with first (the unknown), then anyone.
    const quarry = contactsFor(state, ship, (s, c) => !believedHostile(state, ship, c))[0] || contactsFor(state, ship, () => true)[0];
    if (quarry) return distance(ship, quarry.c) > 3 ? directionToward(ship, quarry.c) : null;
  }
  return headingTo(state, ship, destination);
}

// Snap shot: the contact lying back down the bearing of an incoming hostile heavyweight,
// judged from the torpedo's heading and this boat's own picture (not who really fired it).
function snapTarget(state, ship) {
  const incoming = (state.entities || []).filter((e) => e.kind === 'torpedo' && e.side !== ship.side && e.weight !== 'light' && distance(e, ship) <= HEAR_TORPEDO)
    .sort((a, b) => distance(a, ship) - distance(b, ship))[0];
  if (!incoming) return null;
  const back = (incoming.facing + 3) % 6;
  const candidates = contactsFor(state, ship, (s, c) => c.submerged !== false && turnDistance(directionToward(incoming, c), back) <= 1 && distance(incoming, c) <= TRACE_RUN + 4);
  return candidates.sort((a, b) => distance(incoming, a.c) - distance(incoming, b.c) || (a.s.id < b.s.id ? -1 : 1))[0]?.s.id || null;
}

// The freshest last-known position of a contact worth hunting, if recent and near enough.
function recentDatum(state, ship, maxRange) {
  return contactsForShip(state, ship)
    .filter((c) => c.stale && state.tick - c.lastSeen <= DATUM_AGE && distance(ship, c) <= maxRange && distance(ship, c) > 0)
    .filter((c) => { const s = state.ships.find((x) => x.id === c.targetId); return s && isActive(s) && worthClosing(state, ship, c); })
    .sort((a, b) => b.lastSeen - a.lastSeen || distance(ship, a) - distance(ship, b) || (a.id < b.id ? -1 : 1))[0] || null;
}

function hearers(state, point) {
  return sidesOf(state).filter((side) => state.ships.some((s) => s.side === side && isActive(s) && distance(s, point) <= HEAR_TORPEDO));
}

// ---------- Weapons ----------

export function combat(state) {
  for (const ship of state.ships) {
    if (!isActive(ship) || ship.doctrine.roe === 'hold' || ship.order.type === 'withdraw' || state.entities.length >= MAX_ENTITIES) continue;
    if (ship.type === 'carrier') { state = airStrike(state, ship); continue; }
    if (ship.reloadUntil > state.tick) continue;
    if (ship.type === 'asw_destroyer' && (ship.asroc || 0) > 0) {
      const before = ship.asroc;
      state = asroc(state, ship);
      if (ship.asroc < before) continue;
    }
    if (ship.torpedoes <= 0) continue;
    const reckless = ship.captain.trait === 'reckless';
    // Snap shot: a boat under torpedo attack fires back down the bearing at the shooter's
    // rough position without waiting to classify it.
    const snapAt = SUBMARINES.has(ship.type) && ship.evadingAt === state.tick ? snapTarget(state, ship) : null;
    const range = reckless ? ship.doctrine.range + 2 : ship.doctrine.range;
    // Water-space management: a careful captain won't shoot at a contact with a friendly
    // boat right on top of it, because the seeker cannot tell them apart; she takes the next
    // target instead. The wire operator handles friendlies farther off.
    const friends = friendsOf(state, ship.side);
    const crowded = (c) => state.ships.some((s) => s !== ship && friends.has(s.side) && isActive(s) && distance(s, c) <= 1);
    const target = contactsFor(state, ship, (s, c) => believedHostile(state, ship, c) && (ship.type !== 'asw_destroyer' || SUBMARINES.has(s.type)))
      .sort((a, b) => (b.s.id === snapAt) - (a.s.id === snapAt))
      .find(({ c, s }) => distance(ship, c) <= range + (s.id === snapAt ? 2 : 0) && (reckless || s.id === snapAt || CONF_RANK[c.confidence] >= CONF_RANK.classified) && (reckless || !crowded(c)));
    if (!target) continue;
    ship.torpedoes -= 1;
    ship.reloadUntil = state.tick + 3;
    ship.firedAt = state.tick;
    state.entities.push({
      id: `t${state.tick}_${ship.id}`, kind: 'torpedo', side: ship.side, shooterId: ship.id,
      q: ship.q, r: ship.r, facing: directionToward(ship, target.c), travelled: 0, run: TORPEDO_RUN,
      armAt: reckless ? 0 : 2, aimQ: target.c.q, aimR: target.c.r, seeking: null,
      targetId: target.s.id, wired: true, enabled: reckless, ignore: [], lockQ: null, lockR: null, originQ: ship.q, originR: ship.r,
      // Sonar reports bearing and range, not depth: fire control presets the search depth
      // to the firing boat's own depth (surface ships search shallow).
      depth: ship.doctrine.depth === 'deep' ? 'deep' : 'shallow',
    });
    state = markAttack(state, ship.side, target.s.side);
    state = addLog(state, `${ship.name} fires ${ship.type === 'asw_destroyer' ? 'an ASW torpedo' : 'a torpedo'} at ${target.s.name}${reckless ? ', safeties off' : target.s.id === snapAt ? ', a snap shot down the bearing' : ''}.`, 'combat');
    state = addFx(state, { type: 'torpedo', shooterId: ship.id, targetId: target.s.id, at: { q: target.c.q, r: target.c.r } });
  }
  return state;
}

// A lightweight torpedo put in the water just short of a contact's reported position,
// pointing at it: seeker live, no wire, shallow search preset (neither a rocket nor an
// aircraft knows the depth). Splashing down on top of her would leave the seeker blind.
export function splashPoint(state, launcher, contact) {
  const toward = directionToward(contact, launcher);
  const order = [toward, (toward + 1) % 6, (toward + 5) % 6, (toward + 2) % 6, (toward + 4) % 6, (toward + 3) % 6];
  return order.map((f) => ({ q: contact.q + DIRECTIONS[f][0], r: contact.r + DIRECTIONS[f][1] }))
    .find((c) => inBounds(c, state.map) && terrainAt(state, c.q, c.r) !== 'land' && !state.ships.some((s) => isActive(s) && s.q === c.q && s.r === c.r)) || null;
}

function dropLightweight(state, launcher, contact, target, kind, splash) {
  state.entities.push({
    id: `${kind === 'asroc' ? 'a' : 'p'}${state.tick}_${launcher.id}`, kind: 'torpedo', side: launcher.side, shooterId: launcher.id,
    q: splash.q, r: splash.r, facing: directionToward(splash, contact), travelled: 0, run: LIGHT.run, armAt: LIGHT.armAt,
    aimQ: contact.q, aimR: contact.r, seeking: null, targetId: target.id, wired: false, enabled: true, ignore: [], lockQ: null, lockR: null,
    depth: 'shallow', speed: LIGHT.speed, weight: 'light',
  });
  state = markAttack(state, launcher.side, target.side);
  return addFx(state, { type: kind, shooterId: launcher.id, targetId: target.id, at: { q: contact.q, r: contact.r } });
}

// Escort standoff weapon: a rocket carries a lightweight torpedo to a submarine contact
// out beyond the ship's own tube range, if the fix is good enough to be worth a round.
function asroc(state, ship) {
  const friends = friendsOf(state, ship.side);
  const target = contactsFor(state, ship, (s, c) => c.submerged && believedHostile(state, ship, c))
    .find(({ c }) => distance(ship, c) > ship.doctrine.range && distance(ship, c) <= ASROC_RANGE && (c.uncertainty ?? 0) <= 2
      && !state.ships.some((s) => friends.has(s.side) && isActive(s) && s !== ship && distance(s, c) <= 2));
  const splash = target && splashPoint(state, ship, target.c);
  if (!target || !splash) return state;
  ship.asroc -= 1;
  ship.reloadUntil = state.tick + 3;
  state = addLog(state, `${ship.name} fires an ASROC at a submarine contact.`, 'combat');
  return dropLightweight(state, ship, target.c, target.s, 'asroc', splash);
}

// Carrier aircraft: with a good fix on a submarine from their own sonobuoys or patrol,
// they drop a lightweight torpedo on it. They cannot hunt what the carrier has not heard.
function airStrike(state, carrier) {
  if (!(carrier.airTorpedoes > 0) || (carrier.airStrikeReadyAt ?? 0) > state.tick) return state;
  const friends = friendsOf(state, carrier.side);
  const target = contactsFor(state, carrier, (s, c) => c.submerged && believedHostile(state, carrier, c))
    .find(({ c }) => distance(carrier, c) <= AIR_RANGE && (c.uncertainty ?? 0) <= 1
      && !state.ships.some((s) => friends.has(s.side) && isActive(s) && distance(s, c) <= 2));
  const splash = target && splashPoint(state, carrier, target.c);
  if (!target || !splash) return state;
  carrier.airTorpedoes -= 1;
  carrier.airStrikeReadyAt = state.tick + 2;
  state = addLog(state, `${carrier.name}'s aircraft drop a torpedo on a submarine contact.`, 'combat', [carrier.side]);
  return dropLightweight(state, carrier, target.c, target.s, 'airdrop', splash);
}

// Torpedoes run after ships move. The model follows a wire-guided homing torpedo:
//  1. While the wire holds, the firing boat steers it toward her *current* track of the
//     target (her own sonar picture, with its uncertainty), not the launch-time position.
//  2. The seeker switches on near the aim point (or at once with the safeties off), so it
//     is not seduced by everything it passes on the way out.
//  3. A live seeker takes the loudest thing in its forward cone. It cannot tell friend
//     from foe: only the wire operator can reject a friendly lock, so once the wire is
//     cut friendly boats are fair game. It will not come back for the boat that fired it
//     unless the safeties are off and it has run long enough to circle.
//  4. Locked on, it turns harder and leads the target. Losing lock, it runs to the last
//     position it heard and circles to re-attack. Noisemakers fool some seekers, not all.
export function afterMove(state) {
  const survivors = [];
  for (const t of (state.entities || [])) {
    if (t.kind !== 'torpedo') { survivors.push(t); continue; }
    let alive = true;
    state = updateWire(state, t);
    for (let step = 0; step < (t.speed ?? TORPEDO_SPEED) && alive; step += 1) {
      const aim = { q: t.aimQ, r: t.aimR };
      if (!t.enabled && (t.enabled === undefined || distance(t, aim) <= ENABLE_RANGE || !t.wired)) t.enabled = true;
      const quarry = t.enabled ? acquire(state, t) : null;
      if (quarry) { t.seeking = quarry.id; t.lockQ = quarry.q; t.lockR = quarry.r; }
      else if (t.seeking && !state.ships.some((s) => s.id === t.seeking && isActive(s)) && !(state.entities || []).some((e) => e.id === t.seeking && e.until >= state.tick)) t.seeking = null;
      const goal = steeringGoal(t, quarry, aim);
      const turnRate = quarry && distance(t, quarry) <= 2 ? 2 : 1;
      if (goal) turn(t, directionToward(t, goal), turnRate);
      else turn(t, (t.facing + 1) % 6, 1); // search circle: nothing to steer for, keep turning
      if (!clearHex(state, ahead(t, t.facing))) {
        const around = [1, 5, 2, 4].map((o) => (t.facing + o) % 6).find((f) => clearHex(state, ahead(t, f)));
        if (around === undefined) { state = addLog(state, 'A torpedo runs into the seabed and is lost.', 'info', [t.side]); alive = false; break; }
        t.facing = around;
      }
      // The wire operator steers around her own side's boats when there is water to do it.
      if (t.wired && friendlyAt(state, t, ahead(t, t.facing))) {
        const around = [1, 5, 2, 4].map((o) => (t.facing + o) % 6).find((f) => clearHex(state, ahead(t, f)) && !friendlyAt(state, t, ahead(t, f)));
        if (around !== undefined) t.facing = around;
      }
      const next = ahead(t, t.facing);
      t.q = next.q; t.r = next.r; t.travelled += 1;
      const decoy = (state.entities || []).find((e) => e.kind === 'decoy' && e.q === t.q && e.r === t.r && t.seeking === e.id);
      if (decoy) {
        decoy.until = -1;
        state = addFx(state, { type: 'explosion', at: { q: t.q, r: t.r }, audience: hearers(state, t) });
        state = addLog(state, 'A torpedo detonates on a noisemaker.', 'defense');
        alive = false; break;
      }
      const victim = state.ships.find((s) => isActive(s) && s.q === t.q && s.r === t.r && (s.id !== t.shooterId || ownShipFair(t)));
      if (victim) { state = strike(state, t, victim); alive = false; break; }
      if (t.travelled >= t.run) {
        state = addLog(state, 'A torpedo runs out of fuel and sinks.', 'info', [t.side]);
        alive = false;
      }
    }
    if (alive) survivors.push(t);
  }
  state.entities = survivors.filter((e) => (e.kind !== 'decoy' && e.kind !== 'buoys') || e.until >= state.tick);
  return state;
}

function updateWire(state, t) {
  if (!t.wired) return state;
  const shooter = state.ships.find((s) => s.id === t.shooterId);
  const cut = !shooter || !isActive(shooter) || shooter.evadingAt === state.tick || t.travelled >= WIRE_LENGTH;
  if (cut) {
    t.wired = false;
    if (shooter && isActive(shooter) && t.travelled < WIRE_LENGTH) state = addLog(state, `${shooter.name} cuts a guidance wire to evade.`, 'info', [t.side]);
    return state;
  }
  const track = contactsForShip(state, shooter).find((c) => c.targetId === t.targetId && !c.stale);
  if (track && terrainAt(state, track.q, track.r) !== 'land') { t.aimQ = track.q; t.aimR = track.r; }
  return state;
}

// Where to steer this step. Ships have already moved when torpedoes run, so the quarry's
// hex is where she is: pure pursuit, no lead. A lost lock sends the torpedo to where she
// was last heard; arriving there, that becomes the search point it circles.
function steeringGoal(t, quarry, aim) {
  if (quarry) return quarry;
  if (t.lockQ !== null && t.lockQ !== undefined) {
    if (distance(t, { q: t.lockQ, r: t.lockR }) > 0) return { q: t.lockQ, r: t.lockR };
    t.aimQ = t.lockQ; t.aimR = t.lockR; t.lockQ = null; t.lockR = null;
  }
  return distance(t, aim) > 0 ? aim : null;
}

function turn(t, want, rate) {
  for (let i = 0; i < rate && t.facing !== want; i += 1) t.facing = (t.facing + (((want - t.facing + 6) % 6) <= 3 ? 1 : 5)) % 6;
}

function ahead(p, facing) {
  const [dq, dr] = DIRECTIONS[facing];
  return { q: p.q + dq, r: p.r + dr };
}

function clearHex(state, c) {
  return inBounds(c, state.map) && terrainAt(state, c.q, c.r) !== 'land';
}

function friendlyAt(state, t, c) {
  const friends = friendsOf(state, t.side);
  return state.ships.some((s) => isActive(s) && friends.has(s.side) && s.q === c.q && s.r === c.r);
}

// A side's friends: itself, sides it commands, and sides that command it (the defector and Dallas).
function friendsOf(state, side) {
  const out = new Set([side, ...(state.command?.[side] || [])]);
  for (const [commander, list] of Object.entries(state.command || {})) if (list.includes(side)) out.add(commander);
  return out;
}

// Own-ship safety covers both the seeker and the fuze. Torpedoes from saves made before
// wire guidance (no `wired` field) keep the old rule: fair game after 3 hexes.
function ownShipFair(t) {
  if (t.wired === undefined) return t.travelled > 3;
  return t.armAt === 0 && t.travelled > 8;
}

function acquire(state, t) {
  const inCone = (p) => { const rel = (directionToward(t, p) - t.facing + 6) % 6; return rel === 0 || rel === 1 || rel === 5; };
  const ignore = t.ignore || [];
  const options = [
    // While the wire holds, the firing boat's operator rejects locks on her own side's boats.
    ...state.ships.filter((s) => isActive(s) && (s.id !== t.shooterId || ownShipFair(t)) && !(t.wired && friendsOf(state, t.side).has(s.side)))
      .map((s) => ({ id: s.id, q: s.q, r: s.r, noise: s.noise, facing: s.facing, depth: s.doctrine.depth === 'surface' ? 'shallow' : s.doctrine.depth })),
    ...(state.entities || []).filter((e) => e.kind === 'decoy' && e.until >= state.tick && !ignore.includes(e.id))
      .map((e) => ({ id: e.id, q: e.q, r: e.r, noise: 10, decoy: true })),
  ].filter((p) => distance(t, p) > 0 && inCone(p) && distance(t, p) <= reach(t, p));
  // A noisemaker gets one chance to fool each seeker; a seeker that sees through it ignores it.
  const fooled = options.filter((p) => !p.decoy || chance(state, `decoy|${t.id}|${p.id}`, DECOY_SEDUCTION));
  if (t.ignore) for (const p of options) if (p.decoy && !fooled.includes(p)) t.ignore.push(p.id);
  const score = (p) => distance(t, p) - p.noise * 0.3 - (p.id === t.seeking ? 1.5 : 0); // hold lock rather than flit between targets
  const pick = fooled.sort((a, b) => score(a) - score(b) || (a.id < b.id ? -1 : 1))[0] || null;
  if (pick && pick.depth && t.depth) t.depth = pick.depth; // locked on, the seeker follows her through the layer
  return pick;
}

// A seeker hears less of a boat on the other side of the thermal layer.
function reach(t, p) {
  const base = p.id === t.seeking ? TRACK_RANGE : SEEKER_RANGE;
  return p.depth && t.depth && p.depth !== t.depth ? base - 1 : base;
}

function strike(state, t, victim) {
  const shooter = state.ships.find((s) => s.id === t.shooterId);
  if (t.travelled < t.armAt) {
    applyDamage(victim, { hull: 4, propulsion: 2, weapons: 0, crew: 1 });
    state = addLog(state, `A torpedo strikes ${victim.name} without arming and breaks up.`, 'defense');
    state = addFx(state, { type: 'dud', shooterId: t.shooterId, targetId: victim.id });
    return resolveStatus(state, victim);
  }
  const damage = t.weight === 'light' ? 30 + Math.floor(nextRandom(state) * 15) : 55 + Math.floor(nextRandom(state) * 25);
  applyDamage(victim, { hull: damage, propulsion: damage * 0.7, weapons: damage * 0.4, crew: damage * 0.5 });
  if (shooter && shooter.side !== victim.side) state = markAttack(state, shooter.side, victim.side);
  state = addLog(state, `${victim.name} is hit by a torpedo${shooter && shooter.id === victim.id ? ' — her own' : ''}.`, 'damage');
  state = addFx(state, { type: 'torpedo-hit', shooterId: t.shooterId, targetId: victim.id, hits: 1, damage, heavy: t.weight !== 'light' });
  return resolveStatus(state, victim);
}

// The selected boat knows its own weapons exactly; other weapons are heard only
// nearby and only roughly. The side-wide fallback serves legacy callers.
export function publicEntities(state, side, observerId = null) {
  const own = observerId ? state.ships.filter((s) => s.id === observerId && s.side === side && isActive(s))
    : state.ships.filter((s) => s.side === side && isActive(s));
  return (state.entities || []).flatMap((e) => {
    if (e.kind === 'buoys') return e.side === side && (!observerId || e.carrierId === observerId) ? [{ id: e.id, kind: 'buoys', q: e.q, r: e.r, own: true, radius: BUOY_RADIUS, until: e.until }] : [];
    if (e.side === side && (!observerId || e.shooterId === observerId || (e.kind === 'decoy' && e.id.endsWith(`_${observerId}`)))) {
      return [{ id: e.id, kind: e.kind, q: e.q, r: e.r, facing: e.facing ?? 0, own: true, armed: e.kind === 'torpedo' ? e.travelled >= e.armAt : undefined }];
    }
    if (!own.some((s) => distance(s, e) <= HEAR_TORPEDO)) return [];
    // Heard, not tracked: an opaque id and a position that wanders by up to a hex each tick.
    const h = seededHash(state, `heard|${observerId || side}|${state.tick}|${e.id}`);
    const [dq, dr] = DIRECTIONS[h % 6];
    const off = (h >>> 3) % 2;
    return [{ id: `h_${seededHash(state, `entity|${observerId || side}|${e.id}`).toString(36)}`, kind: e.kind, q: clamp(e.q + dq * off, 0, state.map.width - 1), r: clamp(e.r + dr * off, 0, state.map.height - 1), own: false }];
  });
}
