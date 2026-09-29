// Cold War undersea and escort rules: acoustic signatures, sonar, baffles,
// the thermal layer, carrier patrol reports, torpedo entities, decoys, and captains.
import {
  DIRECTIONS, distance, isActive, addLog, addFx, applyDamage, resolveStatus, nextRandom,
  directionToward, turnDistance, inBounds, terrainAt, clamp, CONF_RANK, hostile, markAttack, assertCoord, sidesOf, chance, seededHash, believedHostile, worthClosing, contactsForShip,
} from '../core.js';
import { steamMove, headingTo, nearest } from './steam.js';

const TRAITS = new Set(['steady', 'cunning', 'reckless']);
const SUBMARINES = new Set(['ssn', 'ssbn']);
const SURFACE_SHIPS = new Set(['asw_destroyer', 'carrier']);
const TORPEDO_SPEED = 3; // hexes per tick
const TORPEDO_RUN = 18;
const SEEKER_RANGE = 3;
const HEAR_TORPEDO = 6;
const MAX_ENTITIES = 40;

// ---------- Validation ----------

export function validateShip(ship, map) {
  if (!SUBMARINES.has(ship.type) && !SURFACE_SHIPS.has(ship.type)) throw new Error('Invalid ship type');
  for (const k of ['speed', 'quiet', 'sonar', 'torpedoes', 'decoys', 'noise', 'value']) if (!Number.isInteger(ship[k]) || ship[k] < 0) throw new Error(`Invalid ${k}`);
  for (const k of ['pingAt', 'firedAt', 'ivanAt', 'decoyAt', 'evadingAt', 'driftAt']) if (!Number.isInteger(ship[k])) throw new Error(`Invalid ${k}`);
  if (!ship.captain || typeof ship.captain !== 'object' || typeof ship.captain.name !== 'string' || !TRAITS.has(ship.captain.trait)) throw new Error('Invalid captain');
  if (ship.passiveClass !== undefined && typeof ship.passiveClass !== 'string') throw new Error('Invalid passiveClass');
  if (ship.goal !== undefined && (!Array.isArray(ship.goal) || !ship.goal.every((c) => Array.isArray(c) && c.length === 2 && inBounds({ q: c[0], r: c[1] }, map)))) throw new Error('Invalid goal');
  if (ship.searchAt !== undefined && (!Array.isArray(ship.searchAt) || ship.searchAt.length !== 2 || !inBounds({ q: ship.searchAt[0], r: ship.searchAt[1] }, map))) throw new Error('Invalid search area');
  if (!ship.doctrine.speed || !ship.doctrine.depth) throw new Error('Cold War doctrine needs speed and depth');
  if (SURFACE_SHIPS.has(ship.type) && (ship.doctrine.depth !== 'surface' || ship.doctrine.speed !== 'standard')) throw new Error('Surface ship doctrine must stay on the surface');
  if (ship.type === 'carrier' && (!Number.isInteger(ship.airSorties) || ship.airSorties < 0 || !Number.isInteger(ship.patrolReadyAt) || ship.patrolReadyAt < 0)) throw new Error('Invalid carrier patrol capacity');
  if (ship.type !== 'carrier' && (ship.airSorties !== undefined || ship.patrolReadyAt !== undefined)) throw new Error('Invalid air patrol capacity');
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
  state.patrols = (state.patrols || []).filter((patrol) => patrol.resolveAt >= state.tick);
  for (const patrol of state.patrols) if (patrol.resolveAt === state.tick) {
    const carrier = state.ships.find((s) => s.id === patrol.carrierId);
    if (carrier && isActive(carrier)) state = addLog(state, `${carrier.name} patrol searches sector ${patrol.q}, ${patrol.r}.`, 'info', [carrier.side]);
  }
  // Pings ordered last tick go out now.
  for (const ship of state.ships) {
    if (!isActive(ship) || ship.pingAt !== state.tick) continue;
    state = addLog(state, `${ship.name} pings: one ping only.`, 'combat', [ship.side]);
    state = addFx(state, { type: 'ping', shooterId: ship.id });
    state = answerPing(state, ship);
  }
  state.entities = (state.entities || []).filter((e) => e.kind !== 'decoy' || e.until >= state.tick);
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
  const target = ship.order.type === 'engage' && ship.doctrine.roe === 'free' ? contactsFor(state, ship, (s, c) => worthClosing(state, ship, c))[0] : null;
  if (target) {
    const d = distance(ship, target.c);
    if (d > ship.doctrine.range - 1) return directionToward(ship, target.c);
    return nearest(ship.facing, [(directionToward(ship, target.c) + 1) % 6, (directionToward(ship, target.c) + 5) % 6]);
  }
  if (ship.order.type === 'shadow') {
    // Shadow the contact you are not at war with first (the unknown), then anyone.
    const quarry = contactsFor(state, ship, (s, c) => !believedHostile(state, ship, c))[0] || contactsFor(state, ship, () => true)[0];
    if (quarry) return distance(ship, quarry.c) > 3 ? directionToward(ship, quarry.c) : null;
  }
  return headingTo(state, ship, destination);
}

function hearers(state, point) {
  return sidesOf(state).filter((side) => state.ships.some((s) => s.side === side && isActive(s) && distance(s, point) <= HEAR_TORPEDO));
}

// ---------- Weapons ----------

export function combat(state) {
  for (const ship of state.ships) {
    if (!isActive(ship) || ship.doctrine.roe === 'hold' || ship.torpedoes <= 0 || ship.reloadUntil > state.tick || ship.order.type === 'withdraw' || state.entities.length >= MAX_ENTITIES) continue;
    const reckless = ship.captain.trait === 'reckless';
    const range = reckless ? ship.doctrine.range + 2 : ship.doctrine.range;
    const target = contactsFor(state, ship, (s, c) => believedHostile(state, ship, c) && (ship.type !== 'asw_destroyer' || SUBMARINES.has(s.type)))
      .find(({ c }) => distance(ship, c) <= range && (reckless || CONF_RANK[c.confidence] >= CONF_RANK.classified));
    if (!target) continue;
    ship.torpedoes -= 1;
    ship.reloadUntil = state.tick + 3;
    ship.firedAt = state.tick;
    state.entities.push({
      id: `t${state.tick}_${ship.id}`, kind: 'torpedo', side: ship.side, shooterId: ship.id,
      q: ship.q, r: ship.r, facing: directionToward(ship, target.c), travelled: 0, run: TORPEDO_RUN,
      armAt: reckless ? 0 : 2, aimQ: target.c.q, aimR: target.c.r, seeking: null,
    });
    state = markAttack(state, ship.side, target.s.side);
    state = addLog(state, `${ship.name} fires ${ship.type === 'asw_destroyer' ? 'an ASW torpedo' : 'a torpedo'} at ${target.s.name}${reckless ? ', safeties off' : ''}.`, 'combat');
    state = addFx(state, { type: 'torpedo', shooterId: ship.id, targetId: target.s.id, at: { q: target.c.q, r: target.c.r } });
  }
  return state;
}

// Torpedoes run after ships move: wire-guided toward the aim point, then the seeker
// takes the loudest thing in its forward cone. The seeker cannot tell friend from foe.
export function afterMove(state) {
  const survivors = [];
  for (const t of (state.entities || [])) {
    if (t.kind !== 'torpedo') { survivors.push(t); continue; }
    let alive = true;
    for (let step = 0; step < TORPEDO_SPEED && alive; step += 1) {
      const quarry = acquire(state, t);
      t.seeking = quarry ? quarry.id : t.seeking;
      const goal = quarry || (distance(t, { q: t.aimQ, r: t.aimR }) > 0 ? { q: t.aimQ, r: t.aimR } : null);
      if (goal) {
        const want = directionToward(t, goal);
        if (turnDistance(t.facing, want) > 0) t.facing = (t.facing + (((want - t.facing + 6) % 6) <= 3 ? 1 : 5)) % 6;
      }
      const [dq, dr] = DIRECTIONS[t.facing];
      const next = { q: t.q + dq, r: t.r + dr };
      if (!inBounds(next, state.map) || terrainAt(state, next.q, next.r) === 'land') { state = addLog(state, 'A torpedo runs into the seabed and is lost.', 'info', [t.side]); alive = false; break; }
      t.q = next.q; t.r = next.r; t.travelled += 1;
      const decoy = (state.entities || []).find((e) => e.kind === 'decoy' && e.q === t.q && e.r === t.r && t.seeking === e.id);
      if (decoy) {
        decoy.until = -1;
        state = addFx(state, { type: 'explosion', at: { q: t.q, r: t.r }, audience: hearers(state, t) });
        state = addLog(state, 'A torpedo detonates on a noisemaker.', 'defense');
        alive = false; break;
      }
      const victim = state.ships.find((s) => isActive(s) && s.q === t.q && s.r === t.r && (s.id !== t.shooterId || t.travelled > 3));
      if (victim) { state = strike(state, t, victim); alive = false; break; }
      if (t.travelled >= t.run) {
        state = addLog(state, 'A torpedo runs out of fuel and sinks.', 'info', [t.side]);
        alive = false;
      }
    }
    if (alive) survivors.push(t);
  }
  state.entities = survivors.filter((e) => e.kind !== 'decoy' || e.until >= state.tick);
  return state;
}

function acquire(state, t) {
  const inCone = (p) => { const rel = (directionToward(t, p) - t.facing + 6) % 6; return rel === 0 || rel === 1 || rel === 5; };
  const options = [
    ...state.ships.filter((s) => isActive(s) && (s.id !== t.shooterId || t.travelled > 3)).map((s) => ({ id: s.id, q: s.q, r: s.r, noise: s.noise })),
    ...(state.entities || []).filter((e) => e.kind === 'decoy' && e.until >= state.tick).map((e) => ({ id: e.id, q: e.q, r: e.r, noise: 10 })),
  ].filter((p) => distance(t, p) <= SEEKER_RANGE && distance(t, p) > 0 && inCone(p));
  return options.sort((a, b) => (distance(t, a) - a.noise * 0.3) - (distance(t, b) - b.noise * 0.3) || (a.id < b.id ? -1 : 1))[0] || null;
}

function strike(state, t, victim) {
  const shooter = state.ships.find((s) => s.id === t.shooterId);
  if (t.travelled < t.armAt) {
    applyDamage(victim, { hull: 4, propulsion: 2, weapons: 0, crew: 1 });
    state = addLog(state, `A torpedo strikes ${victim.name} without arming and breaks up.`, 'defense');
    state = addFx(state, { type: 'dud', shooterId: t.shooterId, targetId: victim.id });
    return resolveStatus(state, victim);
  }
  const damage = 55 + Math.floor(nextRandom(state) * 25);
  applyDamage(victim, { hull: damage, propulsion: damage * 0.7, weapons: damage * 0.4, crew: damage * 0.5 });
  if (shooter && shooter.side !== victim.side) state = markAttack(state, shooter.side, victim.side);
  state = addLog(state, `${victim.name} is hit by a torpedo${shooter && shooter.id === victim.id ? ' — her own' : ''}.`, 'damage');
  state = addFx(state, { type: 'torpedo-hit', shooterId: t.shooterId, targetId: victim.id, hits: 1, damage, heavy: true });
  return resolveStatus(state, victim);
}

// The selected boat knows its own weapons exactly; other weapons are heard only
// nearby and only roughly. The side-wide fallback serves legacy callers.
export function publicEntities(state, side, observerId = null) {
  const own = observerId ? state.ships.filter((s) => s.id === observerId && s.side === side && isActive(s))
    : state.ships.filter((s) => s.side === side && isActive(s));
  return (state.entities || []).flatMap((e) => {
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
