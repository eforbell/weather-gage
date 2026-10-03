import { SCENARIO_SETUPS, SCENARIOS, DOCKYARD_SCENARIOS } from './scenarios.js';
import {
  WIDTH, HEIGHT, DEFAULT_MAP, DIRECTIONS, ALL_SIDES, CONF_RANK, MAX_LOG, MAX_FX, sidesOf, hostile, chance, contactId, believedHostile, worthClosing,
  distance, isActive, assertCoord, nonEmptyString, addLog, reportText, addFx, publicFx, applyDamage, resolveStatus, roll, nextRandom, terrainAt, terrainAtMap, directionToward, hexDistanceRaw, turnDistance, inBounds, key, clamp, deepClone, bestContactFor, contactsForShip,
} from './core.js';

export { WIDTH, HEIGHT, DIRECTIONS, distance, isActive };
import * as dreadnought from './eras/dreadnought.js';
import * as ironclad from './eras/ironclad.js';
import * as coldwar from './eras/coldwar.js';
import * as ww2 from './eras/ww2.js';

// Era rule modules. Each may provide: validateShip, onOrder, orderDelay, beforeTick,
// moveShip, afterMove, combat, detection, validateEntities, publicEntities. Sail and modern still use the engine's
// built-in rules below and are the next candidates to move out.
const ERA_RULES = { dreadnought, ironclad, coldwar, ww2 };
const rulesFor = (state) => ERA_RULES[scenarioFor(state.scenarioId).era] || {};

export const VERSION = 1;
const TERRAIN_TYPES = new Set(['land', 'shoal', 'mines']);
const VALID_ORDERS = new Set(['engage', 'hold', 'proceed', 'withdraw', 'line', 'screen', 'shadow']);
const SPEED_SETTINGS = new Set(['silent', 'standard', 'flank']);
const DEPTHS = new Set(['shallow', 'deep', 'surface']);
const CONTACT_SOURCES = new Set(['radar', 'eyes', 'flash', 'receiver', 'sonar', 'hfdf']);
// Fields a scripted scenario event may change on a ship.
const EVENT_FIELDS = new Set(['quiet', 'speed', 'passiveClass', 'depth']);

export function createGame(scenarioId = 'nevis', seed = 1799) {
  const meta = scenarioFor(scenarioId);
  const setup = SCENARIO_SETUPS[meta.id];
  const dimensions = setup.map || DEFAULT_MAP;
  const state = {
    version: VERSION,
    scenarioId: meta.id,
    seed: normalizeSeed(seed),
    rng: normalizeSeed(seed),
    tick: 0,
    wind: setup.wind,
    map: { ...dimensions, terrain: uniqueTerrain(setup.terrain, dimensions) },
    ships: deepClone(setup.ships),
    contacts: Object.fromEntries((setup.sides || ['blue', 'red']).map((side) => [side, []])),
    pending: [],
    fx: [],
    log: [{ tick: 0, text: `${meta.title}: ${meta.objective}`, kind: 'scenario' }],
    outcome: null,
  };
  if (setup.sides) state.sides = [...setup.sides];
  if (setup.hostile) state.hostile = deepClone(setup.hostile);
  if (setup.entities) state.entities = [];
  if (meta.era === 'coldwar') {
    state.contactTracks = Object.fromEntries(state.ships.map((ship) => [ship.id, []]));
    state.patrols = [];
  }
  // Scripted events: each seed picks a tick inside the event's window, so the same
  // mission plays out differently without anything being random at run time.
  if (setup.events) state.events = setup.events.map((e) => ({ ...deepClone(e), at: pickTick(state, e), done: false }));
  return updateContacts(state);
}

export function step(input) {
  let state = validateState(input);
  if (state.outcome) return cloneState(state);
  state = cloneState(state);
  const meta = scenarioFor(state.scenarioId);
  state.tick += 1;
  state.fx = [];
  const rules = rulesFor(state);
  state = arriveReserves(state);
  state = runEvents(state);
  state = shiftWind(state, meta.era);
  if (rules.beforeTick) state = rules.beforeTick(state);
  state = deliverPending(state);
  state = updateContacts(state);
  state = autoDoctrine(state);
  state = moveShips(state, meta.era);
  state = updateContacts(state);
  if (rules.afterMove) state = rules.afterMove(state);
  state = resolveCombat(state, meta.era);
  state = updateContacts(state);
  state = checkOutcome(state, meta);
  return trimLog(state);
}

export function issueOrder(input, shipIds, order) {
  let state = validateState(input);
  state = cloneState(state);
  const ids = Array.isArray(shipIds) ? shipIds : [shipIds];
  const clean = cleanOrder(order, state.map);
  if (!clean) return addLog(state, 'Invalid order rejected.', 'warn');
  if (clean.type === 'proceed' && terrainAt(state, clean.q, clean.r) === 'land') return addLog(state, 'Proceed order rejected: destination is land.', 'warn');
  const idSet = new Set(ids.filter((id) => typeof id === 'string'));
  const ships = state.ships.filter((s) => idSet.has(s.id) && isActive(s));
  if (!ships.length) return addLog(state, 'No active ships could receive that order.', 'warn');
  const replaceIds = new Set(ships.map((s) => s.id));
  state.pending = state.pending.filter((p) => p.kind || !replaceIds.has(p.shipId));
  const extraDelay = rulesFor(state).onOrder?.(state, ships) || 0;
  for (const ship of ships) {
    state.pending.push({ shipId: ship.id, order: clean, deliverAt: state.tick + orderDelay(state, ship) + extraDelay });
  }
  state = addLog(state, signalText(ships, clean), 'order');
  if (extraDelay) state = addLog(state, 'The signal was garbled and is being repeated.', 'order', [ships[0].side]);
  return trimLog(state);
}

export function setDoctrine(input, shipIds, patch) {
  let state = validateState(input);
  state = cloneState(state);
  const ids = new Set(Array.isArray(shipIds) ? shipIds : [shipIds]);
  const clean = cleanDoctrinePatch(patch);
  for (const ship of state.ships) {
    if (!ids.has(ship.id)) continue;
    const patch = { ...clean };
    for (const k of ['speed', 'depth']) if (ship.doctrine[k] === undefined) delete patch[k];
    if (ship.era === 'coldwar' && (ship.type === 'carrier' || ship.type === 'asw_destroyer')) { delete patch.speed; delete patch.depth; }
    if (ship.era === 'ww2') { delete patch.speed; delete patch.depth; } // a WWII U-boat dives on her captain's judgement
    ship.doctrine = { ...ship.doctrine, ...patch };
  }
  return trimLog(addLog(state, `Doctrine updated for ${ids.size} ship(s).`, 'order', state.ships.filter(s => ids.has(s.id)).map(s => s.side)));
}

export function setRadar(input, shipIds, enabled) {
  let state = validateState(input);
  state = cloneState(state);
  const ids = new Set(Array.isArray(shipIds) ? shipIds : [shipIds]);
  // Emission control: modern ships, and WWII ships that carry a search radar.
  for (const ship of state.ships) if (ids.has(ship.id) && (ship.era === 'modern' || (ship.era === 'ww2' && ship.sensors?.search))) ship.radar = Boolean(enabled);
  return updateContacts(trimLog(addLog(state, `Radar ${enabled ? 'enabled' : 'secured'} for ${ids.size} ship(s).`, 'order', state.ships.filter(s => ids.has(s.id)).map(s => s.side))));
}

// Active sonar: one ping next tick gives an exact fix on everything nearby,
// and tells everyone within earshot exactly where the pinging ship is.
export function activePing(input, shipIds) {
  let state = cloneState(validateState(input));
  const ids = new Set(Array.isArray(shipIds) ? shipIds : [shipIds]);
  const ships = state.ships.filter((s) => ids.has(s.id) && isActive(s) && Number.isInteger(s.pingAt) && s.type !== 'carrier');
  if (!ships.length) return addLog(state, 'No ship with active sonar can ping.', 'warn');
  for (const ship of ships) ship.pingAt = state.tick + 1;
  return trimLog(addLog(state, `${ships.map((s) => s.name).join(', ')} ordered to ping.`, 'order', [ships[0].side]));
}

// Carrier aircraft are bounded patrol missions, not autonomous map entities. A
// report returns to the launching carrier's picture two ticks after launch.
export function launchPatrol(input, carrierIds, point) {
  let state = cloneState(validateState(input));
  const ids = new Set(Array.isArray(carrierIds) ? carrierIds : [carrierIds]);
  if (!inBounds(point, state.map)) return addLog(state, 'Patrol launch rejected: choose a chart hex.', 'warn');
  const carriers = state.ships.filter((s) => ids.has(s.id) && s.type === 'carrier' && isActive(s) && s.airSorties > 0
    && s.patrolReadyAt <= state.tick && distance(s, point) <= 14);
  if (!carriers.length) return addLog(state, 'No carrier has a ready patrol within flight range.', 'warn');
  for (const carrier of carriers) {
    carrier.airSorties -= 1;
    carrier.patrolReadyAt = state.tick + 4;
    state.patrols.push({ carrierId: carrier.id, side: carrier.side, q: point.q, r: point.r, resolveAt: state.tick + 2 });
  }
  return trimLog(addLog(state, `${carriers.map((s) => s.name).join(', ')} launches an air patrol toward ${point.q}, ${point.r}.`, 'order', [carriers[0].side]));
}

export function getView(input, side = 'blue', observerId = null) {
  const state = validateState(input);
  const safeSide = sidesOf(state).includes(side) ? side : 'blue';
  const mine = commanded(state, safeSide);
  const observer = state.contactTracks && (state.ships.find((s) => s.id === observerId && mine.includes(s.side) && isActive(s))
    || state.ships.find((s) => mine.includes(s.side) && isActive(s)));
  const ownIds = new Set(state.ships.filter((s) => mine.includes(s.side)).map((s) => s.id));
  const contacts = state.contactTracks ? (observer ? contactsForShip(state, observer).filter((c) => !ownIds.has(c.targetId)) : []) : mergedContacts(state, mine);
  const visibleIds = new Set(contacts.filter((c) => !c.stale).map((c) => contactId(state, safeSide, c.targetId)));
  const effects = (state.fx || []).map((e) => observer ? e?.[observer.side] : mine.map((sd) => e?.[sd]).find(Boolean)).filter(Boolean);
  return {
    version: state.version,
    scenarioId: state.scenarioId,
    tick: state.tick,
    wind: state.wind,
    map: deepClone(state.map),
    ships: state.ships.filter((s) => mine.includes(s.side)).map((s) => publicOwnShip(s, state, safeSide)),
    ...(observer ? { sonarOf: observer.id } : {}),
    contacts: contacts.map((c) => publicContact({ ...c, id: contactId(state, safeSide, c.targetId) })),
    pending: state.pending
      .filter((p) => !p.kind && p.order && state.ships.some((s) => s.id === p.shipId && mine.includes(s.side)))
      .map((p) => ({ shipId: p.shipId, order: deepClone(p.order), deliverAt: p.deliverAt })),
    log: state.log.slice(-MAX_LOG).map((e) => mine.map((sd) => publicLogEntry(e, state, sd)).find(Boolean)).filter(Boolean),
    fx: state.contactTracks ? (observer ? effects.map((e) => observerFx(e, observer, visibleIds, state, safeSide)).filter(Boolean) : []) : effects.map(deepClone),
    entities: state.contactTracks ? (observer ? rulesFor(state).publicEntities?.(state, observer.side, observer.id) || [] : []) : uniqueEntities(mine.flatMap((sd) => rulesFor(state).publicEntities?.(state, sd) || [])),
    hostileFrom: sidesOf(state).filter((s) => hostile(state, s, safeSide)),
    hostileTo: state.hostile ? [...(state.hostile[safeSide] || [])] : sidesOf(state).filter((s) => s !== safeSide),
    outcome: state.outcome ? { ...state.outcome } : null,
  };
}

export function serialize(input) {
  const state = validateState(input);
  return stableStringify(state);
}

export function deserialize(text) {
  if (typeof text !== 'string') throw new Error('Saved game must be a string');
  let parsed;
  try { parsed = JSON.parse(text); } catch (error) { throw new Error(`Invalid saved game JSON: ${error.message}`); }
  return validateState(parsed);
}



function scenarioFor(id) {
  // Dockyard scenarios run in the engine and the tests but are not offered in the launcher yet.
  const meta = SCENARIOS.find((scenario) => scenario.id === id) || DOCKYARD_SCENARIOS.find((scenario) => scenario.id === id);
  if (!meta || !SCENARIO_SETUPS[meta.id]) throw new Error(`Unknown scenario: ${id}`);
  return meta;
}

function normalizeSeed(seed) {
  const n = Number(seed);
  return Number.isFinite(n) ? Math.trunc(n) >>> 0 : 1799;
}

function isUint32(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('State must be an object');
  if (value.version !== VERSION) throw new Error(`Unsupported save version: ${value.version}`);
  const meta = scenarioFor(value.scenarioId);
  if (!isUint32(value.seed) || !isUint32(value.rng)) throw new Error('Invalid seed/rng');
  if (!Number.isInteger(value.tick) || value.tick < 0) throw new Error('Invalid tick');
  if (!Number.isInteger(value.wind) || value.wind < 0 || value.wind > 5) throw new Error('Invalid wind');
  validateMap(value.map, SCENARIO_SETUPS[meta.id].map || DEFAULT_MAP);
  if (!Array.isArray(value.ships) || value.ships.length < 2) throw new Error('Invalid ships');
  const ids = new Set();
  let blue = 0;
  let red = 0;
  for (const ship of value.ships) {
    validateShip(ship, ids, meta.era, value.map);
    if (ship.side === 'blue') blue += 1;
    if (ship.side === 'red') red += 1;
  }
  if (!blue || !red) throw new Error('State requires blue and red ships');
  if (value.sides !== undefined && (!Array.isArray(value.sides) || !value.sides.every((s) => ALL_SIDES.includes(s)) || !value.sides.includes('blue'))) throw new Error('Invalid sides');
  for (const ship of value.ships) if (!sidesOf(value).includes(ship.side)) throw new Error('Ship side not in scenario');
  if (value.hostile !== undefined) {
    if (!value.hostile || typeof value.hostile !== 'object' || Array.isArray(value.hostile)) throw new Error('Invalid hostility');
    for (const [side, list] of Object.entries(value.hostile)) if (!sidesOf(value).includes(side) || !Array.isArray(list) || !list.every((s) => sidesOf(value).includes(s))) throw new Error('Invalid hostility');
  }
  if (value.events !== undefined) {
    if (!Array.isArray(value.events)) throw new Error('Invalid events');
    for (const e of value.events) {
      if (!e || !nonEmptyString(e.id) || !ids.has(e.shipId) || !Number.isInteger(e.at) || typeof e.done !== 'boolean' || !nonEmptyString(e.text)) throw new Error('Invalid event');
      if (!e.set || typeof e.set !== 'object' || !Object.keys(e.set).every((k) => EVENT_FIELDS.has(k))) throw new Error('Invalid event effect');
      if (e.set.depth !== undefined && !DEPTHS.has(e.set.depth)) throw new Error('Invalid event effect');
      for (const k of ['quiet', 'speed']) if (e.set[k] !== undefined && (!Number.isInteger(e.set[k]) || e.set[k] < 0)) throw new Error('Invalid event effect');
      if (e.set.passiveClass !== undefined && e.set.passiveClass !== null && !nonEmptyString(e.set.passiveClass)) throw new Error('Invalid event effect');
      if (e.audience !== undefined && (!Array.isArray(e.audience) || !e.audience.every((s) => sidesOf(value).includes(s)))) throw new Error('Invalid event audience');
      if (e.banner !== undefined && !nonEmptyString(e.banner)) throw new Error('Invalid event banner');
      if (e.at < 0) throw new Error('Invalid event');
    }
  }
  if (value.command !== undefined) {
    if (!value.command || typeof value.command !== 'object' || Array.isArray(value.command)) throw new Error('Invalid command');
    for (const [side, list] of Object.entries(value.command)) if (!sidesOf(value).includes(side) || !Array.isArray(list) || !list.every((s) => sidesOf(value).includes(s) && s !== side)) throw new Error('Invalid command');
  }
  if (value.entities !== undefined) (ERA_RULES[meta.era]?.validateEntities || (() => { throw new Error('Entities are not part of this era'); }))(value.entities, ids, value);
  if (value.patrols !== undefined) {
    if (meta.era !== 'coldwar') throw new Error('Patrols are not part of this era');
    coldwar.validatePatrols(value.patrols, value);
  }
  validateContacts(value.contacts, ids, sidesOf(value), sidesOf(value), value.map);
  if (value.contactTracks !== undefined) {
    if (meta.era !== 'coldwar' || !value.contactTracks || typeof value.contactTracks !== 'object' || Array.isArray(value.contactTracks)) throw new Error('Invalid contact tracks');
    const trackIds = Object.keys(value.contactTracks);
    if (trackIds.length !== ids.size || !trackIds.every((id) => ids.has(id))) throw new Error('Invalid contact tracks');
    validateContacts(value.contactTracks, ids, sidesOf(value), trackIds, value.map);
  }
  validatePending(value.pending, ids, value.tick, value.map, value.ships);
  validateLog(value.log);
  validateOutcome(value.outcome);
  if (value.fx !== undefined) validateFx(value.fx, value.map);
  const cloned = cloneState(value);
  cloned.fx = cloned.fx || [];
  cloned.log = cloned.log.slice(-MAX_LOG);
  if (meta.era === 'coldwar') cloned.patrols = cloned.patrols || [];
  // Version-1 Cold War saves predate per-boat tracks. Re-sense from each boat's
  // current position rather than copying a side-wide report into every captain.
  if (meta.era === 'coldwar' && !cloned.contactTracks) {
    cloned.contactTracks = Object.fromEntries(cloned.ships.map((ship) => [ship.id, []]));
    return updateContacts(cloned);
  }
  return cloned;
}

function validateMap(map, dimensions) {
  if (!map || typeof map !== 'object' || map.width !== dimensions.width || map.height !== dimensions.height || !Array.isArray(map.terrain)) throw new Error('Invalid map');
  const cells = new Set();
  for (const t of map.terrain) {
    assertCoord(t, map);
    if (!TERRAIN_TYPES.has(t.type)) throw new Error('Invalid terrain type');
    const cell = key(t.q, t.r);
    if (cells.has(cell)) throw new Error('Duplicate terrain cell');
    cells.add(cell);
  }
}

function validateShip(ship, ids, era, map) {
  if (!ship || typeof ship !== 'object' || Array.isArray(ship)) throw new Error('Invalid ship');
  if (!nonEmptyString(ship.id) || ids.has(ship.id)) throw new Error('Invalid ship id');
  ids.add(ship.id);
  if (!nonEmptyString(ship.name) || !nonEmptyString(ship.className)) throw new Error('Invalid ship identity');
  if (ship.era !== era) throw new Error('Ship era does not match scenario');
  assertCoord(ship, map);
  if (!ALL_SIDES.includes(ship.side)) throw new Error('Invalid ship side');
  if (!Number.isInteger(ship.facing) || ship.facing < 0 || ship.facing > 5) throw new Error('Invalid ship facing');
  for (const k of ['hull', 'propulsion', 'weapons', 'crew']) if (!Number.isInteger(ship[k]) || ship[k] < 0 || ship[k] > 100) throw new Error(`Invalid ${k}`);
  if (!['active', 'sunk', 'struck', 'escaped', 'reserve'].includes(ship.status)) throw new Error('Invalid ship status');
  if (typeof ship.radar !== 'boolean') throw new Error('Invalid radar');
  if (!Number.isInteger(ship.ammo) || ship.ammo < 0) throw new Error('Invalid ammo');
  if (!Number.isInteger(ship.defense) || ship.defense < 0) throw new Error('Invalid defense');
  if (!Number.isInteger(ship.reloadUntil) || ship.reloadUntil < 0) throw new Error('Invalid reloadUntil');
  validateOrder(ship.order, map);
  validateDoctrine(ship.doctrine);
  if (ship.era === 'sail' && (!Number.isInteger(ship.guns) || ship.guns <= 0)) throw new Error('Invalid guns');
  ERA_RULES[era]?.validateShip?.(ship, map);
  if (ship.goal !== undefined && (!Array.isArray(ship.goal) || !ship.goal.length || !ship.goal.every((c) => Array.isArray(c) && c.length === 2 && inBounds({ q: c[0], r: c[1] }, map)))) throw new Error('Invalid goal');
  for (const k of ['arrived', 'raid']) if (ship[k] !== undefined && typeof ship[k] !== 'boolean') throw new Error(`Invalid ${k}`);
  if (ship.goalText !== undefined && !nonEmptyString(ship.goalText)) throw new Error('Invalid goal text');
  if (ship.arrived && ship.status !== 'escaped') throw new Error('Only a ship that left the chart can have arrived');
  if (ship.arriveAt !== undefined && (!Number.isInteger(ship.arriveAt) || ship.arriveAt < 0)) throw new Error('Invalid reserve arrival');
  if (ship.status === 'reserve' && ship.arriveAt === undefined) throw new Error('Invalid reserve arrival');
}

function validateOrder(order, map = null) {
  if (!order || typeof order !== 'object' || Array.isArray(order) || !VALID_ORDERS.has(order.type)) throw new Error('Invalid order');
  const hasQ = Object.hasOwn(order, 'q');
  const hasR = Object.hasOwn(order, 'r');
  if (order.type === 'proceed') {
    if (!hasQ || !hasR) throw new Error('Proceed order requires q/r');
    assertCoord(order, map);
    if (map && terrainAtMap(map, order.q, order.r) === 'land') throw new Error('Proceed order destination is land');
  } else if (order.type === 'line' || order.type === 'screen') {
    if (hasQ !== hasR) throw new Error('Formation q/r must be paired');
    if (hasQ) assertCoord(order, map);
  } else if (hasQ || hasR) {
    throw new Error('Order type does not accept q/r');
  }
}

function validateDoctrine(doctrine) {
  if (!doctrine || typeof doctrine !== 'object' || Array.isArray(doctrine)) throw new Error('Invalid doctrine');
  if (doctrine.roe !== 'free' && doctrine.roe !== 'hold') throw new Error('Invalid doctrine ROE');
  if (!Number.isInteger(doctrine.range) || doctrine.range < 1 || doctrine.range > 12) throw new Error('Invalid doctrine range');
  if (!Number.isInteger(doctrine.withdraw) || doctrine.withdraw < 0 || doctrine.withdraw > 90) throw new Error('Invalid doctrine withdraw');
  if (doctrine.speed !== undefined && !SPEED_SETTINGS.has(doctrine.speed)) throw new Error('Invalid doctrine speed');
  if (doctrine.depth !== undefined && !DEPTHS.has(doctrine.depth)) throw new Error('Invalid doctrine depth');
}

function validateContacts(contacts, shipIds, sides, keys = sides, map = DEFAULT_MAP) {
  if (!contacts || typeof contacts !== 'object' || !keys.every((key) => Array.isArray(contacts[key]))) throw new Error('Invalid contacts');
  for (const key of keys) {
    const ids = new Set();
    for (const contact of contacts[key]) {
      if (!contact || typeof contact !== 'object' || Array.isArray(contact)) throw new Error('Invalid contact');
      if (!nonEmptyString(contact.id) || ids.has(contact.id)) throw new Error('Invalid contact id');
      ids.add(contact.id);
      if (!nonEmptyString(contact.targetId) || !shipIds.has(contact.targetId)) throw new Error('Invalid contact target');
      assertCoord(contact, map);
      if (!Object.hasOwn(CONF_RANK, contact.confidence)) throw new Error('Invalid contact confidence');
      if (!Number.isInteger(contact.lastSeen) || contact.lastSeen < 0) throw new Error('Invalid contact lastSeen');
      if (typeof contact.stale !== 'boolean') throw new Error('Invalid contact stale');
      if (contact.name !== undefined && !nonEmptyString(contact.name)) throw new Error('Invalid contact name');
      if (contact.className !== undefined && !nonEmptyString(contact.className)) throw new Error('Invalid contact class');
      if (contact.range !== undefined && (!Number.isInteger(contact.range) || contact.range < 0)) throw new Error('Invalid contact range');
      if (contact.emitter !== undefined && typeof contact.emitter !== 'boolean') throw new Error('Invalid contact emitter');
      for (const k of ['uncertainty', 'holdSince']) if (contact[k] !== undefined && (!Number.isInteger(contact[k]) || contact[k] < 0)) throw new Error(`Invalid contact ${k}`);
      if (contact.submerged !== undefined && typeof contact.submerged !== 'boolean') throw new Error('Invalid contact submerged');
      if (contact.by !== undefined && !CONTACT_SOURCES.has(contact.by)) throw new Error('Invalid contact source');
      if (contact.side !== undefined && !sides.includes(contact.side)) throw new Error('Invalid contact side');
    }
  }
}

function validatePending(pending, shipIds, tick, map, ships) {
  if (!Array.isArray(pending)) throw new Error('Invalid pending');
  for (const item of pending) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid pending item');
    if (!Number.isInteger(item.deliverAt) || item.deliverAt < tick) throw new Error('Invalid pending delivery');
    if (item.kind === 'missile') {
      if (!nonEmptyString(item.shipId) || !shipIds.has(item.shipId)) throw new Error('Invalid missile shooter');
      if (!nonEmptyString(item.targetId) || !shipIds.has(item.targetId)) throw new Error('Invalid missile target');
      if (!ALL_SIDES.includes(item.side)) throw new Error('Invalid missile side');
      if (!Number.isInteger(item.salvo) || item.salvo < 1) throw new Error('Invalid missile salvo');
      if (Object.hasOwn(item, 'order')) throw new Error('Missile pending cannot include order');
    } else if (item.kind === 'torpedo') {
      if (!ships.some((s) => s.era === 'dreadnought' || s.era === 'ww2')) throw new Error('Torpedoes are not part of this era');
      if (!nonEmptyString(item.shipId) || !shipIds.has(item.shipId)) throw new Error('Invalid torpedo shooter');
      if (!nonEmptyString(item.targetId) || !shipIds.has(item.targetId)) throw new Error('Invalid torpedo target');
      if (!ALL_SIDES.includes(item.side)) throw new Error('Invalid torpedo side');
      const sideOf = (id) => ships.find((x) => x.id === id)?.side;
      if (sideOf(item.shipId) !== item.side || sideOf(item.targetId) === item.side) throw new Error('Invalid torpedo sides');
      assertCoord(item, map);
      assertCoord({ q: item.aimQ, r: item.aimR }, map);
      const ww2Spread = ships.some((s) => s.era === 'ww2');
      if ((ww2Spread || item.weapon !== undefined) && !Object.hasOwn(ww2.TORPEDOES, item.weapon)) throw new Error('Invalid torpedo weapon');
      if (Object.hasOwn(item, 'order')) throw new Error('Torpedo pending cannot include order');
    } else {
      if (item.kind !== undefined) throw new Error('Invalid pending kind');
      if (!nonEmptyString(item.shipId) || !shipIds.has(item.shipId)) throw new Error('Invalid pending ship');
      validateOrder(item.order, map);
    }
  }
}

function validateFx(fx, map) {
  if (!Array.isArray(fx) || fx.length > MAX_FX) throw new Error('Invalid fx');
  const ref = (r, own) => {
    if (r === null || r === undefined) return;
    assertCoord(r, map);
    if (own && (!nonEmptyString(r.id) || typeof r.own !== 'boolean')) throw new Error('Invalid fx ref');
  };
  for (const entry of fx) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid fx entry');
    for (const side of Object.keys(entry)) {
      if (!ALL_SIDES.includes(side)) throw new Error('Invalid fx entry');
      const e = entry[side];
      if (e === null) continue;
      if (!e || typeof e !== 'object' || !nonEmptyString(e.type)) throw new Error('Invalid fx entry');
      ref(e.from, true); ref(e.to, true); ref(e.at, false);
      for (const k of ['hits', 'shots', 'damage', 'eta', 'fc']) if (e[k] !== undefined && !Number.isInteger(e[k])) throw new Error('Invalid fx value');
    }
  }
}

function validateLog(log) {
  if (!Array.isArray(log) || log.length > MAX_LOG) throw new Error('Invalid log');
  for (const entry of log) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid log entry');
    if (!Number.isInteger(entry.tick) || entry.tick < 0 || !nonEmptyString(entry.text) || !nonEmptyString(entry.kind)) throw new Error('Invalid log entry');
    if (entry.reports !== undefined && (!entry.reports || typeof entry.reports !== 'object' || Object.values(entry.reports).some((r) => r !== null && !nonEmptyString(r)))) throw new Error('Invalid public reports');
  }
}

function validateOutcome(outcome) {
  if (outcome === null) return;
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) throw new Error('Invalid outcome');
  if (!['victory', 'defeat', 'draw'].includes(outcome.result) || !nonEmptyString(outcome.title) || !nonEmptyString(outcome.summary)) throw new Error('Invalid outcome');
}



function cleanOrder(order, map) {
  if (!order || typeof order !== 'object' || !VALID_ORDERS.has(order.type)) return null;
  const clean = { type: order.type };
  if (order.type === 'proceed') {
    if (!Number.isInteger(order.q) || !Number.isInteger(order.r)) return null;
    if (!inBounds(order, map)) return null;
    clean.q = order.q; clean.r = order.r;
  } else if ((order.type === 'line' || order.type === 'screen') && order.q !== undefined && order.r !== undefined) {
    if (!Number.isInteger(order.q) || !Number.isInteger(order.r)) return null;
    if (!inBounds(order, map)) return null;
    clean.q = order.q; clean.r = order.r;
  }
  return clean;
}

function cleanDoctrinePatch(patch) {
  const clean = {};
  if (!patch || typeof patch !== 'object') return clean;
  if (patch.roe === 'free' || patch.roe === 'hold') clean.roe = patch.roe;
  if (Number.isFinite(patch.range)) clean.range = clamp(Math.trunc(patch.range), 1, 12);
  if (Number.isFinite(patch.withdraw)) clean.withdraw = clamp(Math.trunc(patch.withdraw), 0, 90);
  if (SPEED_SETTINGS.has(patch.speed)) clean.speed = patch.speed;
  if (DEPTHS.has(patch.depth)) clean.depth = patch.depth;
  return clean;
}

function orderDelay(state, ship) {
  const era = scenarioFor(state.scenarioId).era;
  const rules = ERA_RULES[era];
  if (rules?.orderDelay) return rules.orderDelay(state, ship);
  if (era === 'modern') return 1;
  const flagship = state.ships.find((s) => s.side === ship.side && isActive(s));
  if (!flagship || flagship.id === ship.id) return 1;
  return distance(flagship, ship) <= 4 ? 2 : 3;
}


function shiftWind(state, era) {
  if (era !== 'sail' || state.tick === 0 || state.tick % 8 !== 0) return state;
  if (!roll(state, 0.45)) return state;
  const old = state.wind;
  state.wind = (state.wind + (roll(state, 0.5) ? 1 : 5)) % 6;
  return addLog(state, `Wind shifts from ${old} to ${state.wind}.`, 'weather');
}

function deliverPending(state) {
  const remaining = [];
  for (const item of state.pending) {
    if (item.deliverAt > state.tick) { remaining.push(item); continue; }
    if (item.kind === 'missile') {
      state = missileImpact(state, item);
      continue;
    }
    if (item.kind === 'torpedo') { remaining.push(item); continue; }
    const ship = state.ships.find((s) => s.id === item.shipId);
    if (ship && isActive(ship) && item.order) {
      ship.order = deepClone(item.order);
      state = addLog(state, `${ship.name} acknowledges ${describeOrder(item.order)}.`, 'order');
    }
  }
  state.pending = remaining;
  return state;
}

function pickTick(state, event) {
  const [lo, hi] = event.window;
  for (let t = lo; t < hi; t += 1) if (chance(state, `event|${event.id}|${t}`, 1 / (hi - t + 1))) return t;
  return hi;
}

function runEvents(state) {
  for (const event of state.events || []) {
    if (event.done || event.at > state.tick) continue;
    const ship = state.ships.find((s) => s.id === event.shipId);
    if (ship?.status === 'reserve') continue; // happens once she arrives
    event.done = true;
    if (!ship || !isActive(ship)) continue;
    for (const [k, v] of Object.entries(event.set)) {
      if (k === 'depth') ship.doctrine.depth = v;
      else if (v === null) delete ship[k];
      else ship[k] = v;
    }
    state = addLog(state, event.text, 'event', event.audience || [ship.side]);
    state = addFx(state, { type: 'event', targetId: ship.id, label: event.banner, audience: event.audience || [ship.side] });
  }
  return state;
}

// Reinforcements: ships held in reserve join the action at their scheduled tick.
function arriveReserves(state) {
  for (const ship of state.ships) {
    if (ship.status !== 'reserve' || ship.arriveAt > state.tick) continue;
    const taken = (c) => state.ships.some((s) => s !== ship && isActive(s) && s.q === c.q && s.r === c.r);
    if (taken(ship)) {
      // Arrival hex blocked: come in on the nearest open water instead of waiting forever.
      const spot = DIRECTIONS.map(([dq, dr]) => ({ q: ship.q + dq, r: ship.r + dr }))
        .find((c) => inBounds(c, state.map) && !taken(c) && terrainAt(state, c.q, c.r) !== 'land' && !(ship.draft === 'deep' && terrainAt(state, c.q, c.r) === 'shoal'));
      if (!spot) continue;
      ship.q = spot.q; ship.r = spot.r;
    }
    ship.status = 'active';
    state = addLog(state, `${ship.name} joins the action.`, 'info', [ship.side]);
  }
  return state;
}

function autoDoctrine(state) {
  for (const ship of state.ships) {
    if (!isActive(ship) || ship.speed === 0) continue; // ships at anchor fight until they strike
    if (ship.hull <= ship.doctrine.withdraw || ship.crew <= ship.doctrine.withdraw || ship.propulsion <= 15) ship.order = { type: 'withdraw' };
  }
  return state;
}

function moveShips(state, era) {
  const occupied = new Set(state.ships.filter(isActive).map((s) => key(s.q, s.r)));
  for (const ship of state.ships) {
    if (!isActive(ship)) continue;
    if (ship.order.type === 'withdraw' && escapeEdge(state, ship)) {
      ship.status = 'escaped';
      state = addLog(state, `${ship.name} withdraws beyond the action.`, 'escape');
      occupied.delete(key(ship.q, ship.r));
      continue;
    }
    const rules = ERA_RULES[era];
    if (ship.order.type === 'hold' || ship.propulsion <= 0) {
      if (rules?.react) state = rules.react(state, ship); // stopped boats still evade and launch decoys
      continue;
    }
    if (rules?.moveShip) {
      state = rules.moveShip(state, ship, occupied, movementTarget(state, ship));
      if (isActive(ship) && ship.order.type === 'withdraw' && escapeEdge(state, ship)) {
        ship.status = 'escaped';
        state = addLog(state, `${ship.name} withdraws beyond the action.`, 'escape');
        occupied.delete(key(ship.q, ship.r));
      } else if (isActive(ship) && !(ship.raid && ship.order.type === 'withdraw') && ship.goal?.some(([q, r]) => q === ship.q && r === ship.r)) {
        ship.status = 'escaped';
        ship.arrived = true; // reached her goal, as opposed to withdrawing off the chart
        state = addLog(state, `${ship.name} ${ship.goalText || 'reaches the rendezvous'}.`, 'escape');
        occupied.delete(key(ship.q, ship.r));
      }
      continue;
    }
    const maneuver = combatManeuver(state, ship, era);
    const target = maneuver?.target || movementTarget(state, ship);
    if (!target && !maneuver) continue;
    const choice = maneuver || bestStep(state, ship, target, occupied, era);
    if (!choice) continue;
    occupied.delete(key(ship.q, ship.r));
    ship.facing = choice.facing;
    if (choice.move) {
      ship.q = choice.q; ship.r = choice.r;
      const terrain = terrainAt(state, ship.q, ship.r);
      if (terrain === 'shoal' && era === 'sail' && roll(state, 0.18)) {
        applyDamage(ship, { hull: 4, propulsion: 8, crew: 0, weapons: 0 });
        state = addLog(state, `${ship.name} scrapes over shoal water.`, 'damage');
        state = addFx(state, { type: 'aground', targetId: ship.id });
      }
    }
    if (ship.order.type === 'withdraw' && escapeEdge(state, ship)) {
      ship.status = 'escaped';
      state = addLog(state, `${ship.name} withdraws beyond the action.`, 'escape');
      occupied.delete(key(ship.q, ship.r));
    } else {
      occupied.add(key(ship.q, ship.r));
    }
  }
  return state;
}

function movementTarget(state, ship) {
  if (ship.order.type === 'proceed') return { q: ship.order.q, r: ship.order.r };
  if (ship.order.type === 'line' || ship.order.type === 'screen') return formationTarget(state, ship, ship.order.type);
  if (ship.order.type === 'withdraw') return withdrawTarget(state, ship);
  if (ship.order.type === 'shadow') {
    const quarry = bestContactFor(state, ship.side, 99, true, ship);
    return quarry ? { q: quarry.q, r: quarry.r } : searchTarget(state, ship);
  }
  const contact = hostileContact(state, ship, ship.doctrine.range + 6);
  if (contact) return { q: contact.q, r: contact.r };
  return searchTarget(state, ship);
}

// Captains close on their own reports of hostile or unknown contacts, not every sound in the water.
function hostileContact(state, ship, maxRange, fresh = false) {
  return contactsForShip(state, ship)
    .filter((c) => distance(ship, c) <= maxRange && (fresh ? !c.stale && believedHostile(state, ship, c) : worthClosing(state, ship, c)))
    .sort((a, b) => (a.stale - b.stale) || distance(ship, a) - distance(ship, b) || (a.id < b.id ? -1 : 1))[0] || null;
}

function combatManeuver(state, ship, era) {
  if (ship.order.type !== 'engage' || ship.doctrine.roe === 'hold') return null;
  const target = targetFromContacts(state, ship, era === 'sail' ? Math.min(ship.doctrine.range, 3) : ship.doctrine.range);
  if (!target) return null;
  if (era === 'modern') return { facing: ship.facing, move: false };
  if (broadsideArc(ship, target)) return { facing: ship.facing, move: false, target: { q: ship.q, r: ship.r } };
  const dir = directionToward(ship, target);
  const facings = [(dir + 1) % 6, (dir + 5) % 6, (dir + 2) % 6, (dir + 4) % 6];
  const desiredFacing = facings.sort((a, b) => turnDistance(ship.facing, a) - turnDistance(ship.facing, b))[0];
  return turnToward(ship, desiredFacing);
}

function formationTarget(state, ship, type) {
  if (Number.isInteger(ship.order.q) && Number.isInteger(ship.order.r)) return { q: ship.order.q, r: ship.order.r };
  const fleet = state.ships.filter((s) => s.side === ship.side && isActive(s));
  const flagship = fleet[0];
  if (!flagship || flagship.id === ship.id) {
    const contact = bestContactFor(state, ship.side, ship.doctrine.range + 6, true, ship);
    return contact ? { q: contact.q, r: contact.r } : searchTarget(state, ship);
  }
  const idx = Math.max(1, fleet.findIndex((s) => s.id === ship.id));
  const offsets = type === 'line'
    ? [scaleDir((flagship.facing + 3) % 6, idx)]
    : [scaleDir((flagship.facing + (idx % 2 ? 2 : 4)) % 6, Math.ceil(idx / 2) + 1), scaleDir((flagship.facing + 3) % 6, idx)];
  for (const [dq, dr] of offsets) {
    const c = { q: flagship.q + dq, r: flagship.r + dr };
    if (inBounds(c, state.map) && terrainAt(state, c.q, c.r) !== 'land') return c;
  }
  return searchTarget(state, ship);
}

function scaleDir(facing, n) {
  const [dq, dr] = DIRECTIONS[facing];
  return [dq * n, dr * n];
}

function searchTarget(state, ship) {
  // Scenario intelligence can point a captain at a search area; otherwise sweep toward the enemy's side.
  if (ship.searchAt) return { q: ship.searchAt[0], r: ship.searchAt[1] };
  if (ship.side === 'blue') return { q: Math.min(state.map.width - 2, Math.round(state.map.width * 0.6) + (state.tick % 4)), r: clamp(ship.r, 4, state.map.height - 5) };
  return { q: Math.max(1, Math.round(state.map.width * 0.35) - (state.tick % 4)), r: clamp(ship.r, 4, state.map.height - 5) };
}


function withdrawTarget(state, ship) {
  if (ship.goal && !ship.raid) return { q: ship.goal[0][0], r: ship.goal[0][1] }; // a ship with a destination limps on toward it; a raider turns for home
  return ship.side === 'blue' ? { q: 0, r: ship.r } : { q: state.map.width - 1, r: ship.r };
}

function escapeEdge(state, ship) {
  return (ship.side === 'blue' && ship.q === 0) || (ship.side === 'red' && ship.q === state.map.width - 1);
}

function bestStep(state, ship, target, occupied, era) {
  if (distance(ship, target) === 0) return null;
  const candidates = DIRECTIONS.map(([dq, dr], facing) => ({ q: ship.q + dq, r: ship.r + dr, facing }))
    .filter((c) => inBounds(c, state.map) && terrainAt(state, c.q, c.r) !== 'land' && !occupied.has(key(c.q, c.r)))
    .map((c) => ({ ...c, dist: distance(c, target), turn: turnDistance(ship.facing, c.facing) }))
    .sort((a, b) => a.dist - b.dist || a.turn - b.turn);
  const best = candidates[0];
  if (!best || best.dist >= distance(ship, target)) return turnToward(ship, candidates[0]?.facing ?? ship.facing);
  const desired = turnToward(ship, best.facing);
  if (desired.facing !== best.facing) return desired;
  if (era === 'sail') {
    if (best.facing === state.wind) return { facing: ship.facing, move: false };
    if (turnDistance(best.facing, state.wind) === 1 && state.tick % 2 === 1) return { facing: ship.facing, move: false };
  }
  const damagedSkip = ship.propulsion < 40 && state.tick % 2 === 1;
  if (damagedSkip) return { facing: ship.facing, move: false };
  return { ...best, move: true };
}

function turnToward(ship, targetFacing) {
  if (ship.facing === targetFacing) return { facing: ship.facing, move: false };
  const cw = (targetFacing - ship.facing + 6) % 6;
  const facing = cw <= 3 ? (ship.facing + 1) % 6 : (ship.facing + 5) % 6;
  return { facing, move: false };
}

function resolveCombat(state, era) {
  if (era === 'modern') return modernCombat(state);
  if (ERA_RULES[era]?.combat) return ERA_RULES[era].combat(state);
  return sailCombat(state);
}

function sailCombat(state) {
  for (const ship of state.ships) {
    if (!isActive(ship) || ship.doctrine.roe === 'hold' || ship.reloadUntil > state.tick || ship.order.type === 'withdraw') continue;
    const target = targetFromContacts(state, ship, Math.min(ship.doctrine.range, 3));
    if (!target || !broadsideArc(ship, target)) continue;
    ship.reloadUntil = state.tick + 2;
    const quality = (ship.weapons / 100) * (ship.crew / 100) * ((ship.guns || 30) / 36);
    const base = 8 + Math.floor(nextRandom(state) * 8);
    const damage = Math.max(3, Math.round(base * quality * (1.15 - distance(ship, target) * 0.18)));
    applyDamage(target, { hull: damage, propulsion: damage * 0.55, weapons: damage * 0.7, crew: damage * 0.5 });
    state = addLog(state, `${ship.name} fires a broadside at ${target.name}.`, 'combat');
    state = addFx(state, { type: 'broadside', shooterId: ship.id, targetId: target.id, hits: 1, damage, heavy: damage >= 12 });
    state = resolveStatus(state, target);
  }
  return state;
}

function modernCombat(state) {
  for (const ship of state.ships) {
    if (!isActive(ship) || ship.doctrine.roe === 'hold' || ship.order.type === 'withdraw' || ship.ammo <= 0 || ship.weapons <= 15 || ship.reloadUntil > state.tick) continue;
    const target = targetFromContacts(state, ship, ship.doctrine.range);
    if (!target) continue;
    ship.ammo -= 1;
    ship.reloadUntil = state.tick + 2;
    state.pending.push({ kind: 'missile', shipId: ship.id, targetId: target.id, side: ship.side, salvo: 1, deliverAt: state.tick + 1 });
    state = addLog(state, `${ship.name} launches a missile salvo.`, 'combat');
    state = addFx(state, { type: 'missile', shooterId: ship.id, targetId: target.id });
  }
  return state;
}

function missileImpact(state, item) {
  const attacker = state.ships.find((s) => s.id === item.shipId);
  const target = state.ships.find((s) => s.id === item.targetId);
  if (!attacker || !target || !isActive(target)) return state;
  if (target.defense > 0) {
    const pd = target.defense * (target.weapons / 100) * (target.crew / 100);
    const interceptChance = clamp(0.22 + pd * 0.1, 0.1, 0.82);
    target.defense = Math.max(0, target.defense - 1);
    if (roll(state, interceptChance)) {
      state = addFx(state, { type: 'intercept', targetId: target.id });
      return addLog(state, `${target.name} defeats an incoming missile.`, 'defense');
    }
  }
  const damage = 28 + Math.floor(nextRandom(state) * 18);
  applyDamage(target, { hull: damage, propulsion: damage * 0.6, weapons: damage * 0.75, crew: damage * 0.7 });
  state = addLog(state, `${target.name} is hit by a missile.`, 'damage');
  state = addFx(state, { type: 'missile-hit', targetId: target.id, hits: 1, damage, heavy: true });
  return resolveStatus(state, target);
}

function targetFromContacts(state, ship, maxRange) {
  const contact = hostileContact(state, ship, maxRange, true);
  if (!contact || CONF_RANK[contact.confidence] < 1) return null;
  const target = state.ships.find((s) => s.id === contact.targetId);
  return target && isActive(target) ? target : null;
}


function broadsideArc(ship, target) {
  const dir = directionToward(ship, target);
  const rel = (dir - ship.facing + 6) % 6;
  return rel === 1 || rel === 2 || rel === 4 || rel === 5;
}


function updateContacts(state) {
  state = cloneState(state);
  if (state.contactTracks) {
    for (const observer of state.ships) {
      // Preserve the legacy bearing scatter for a side's first boat; additional
      // boats get independent scatter without changing existing sorties.
      const scope = state.ships.find((ship) => ship.side === observer.side)?.id === observer.id ? observer.side : observer.id;
      state.contactTracks[observer.id] = scanContacts(state, observer.side, isActive(observer) ? [observer] : [], state.contactTracks[observer.id] || [], scope);
    }
    for (const side of sidesOf(state)) {
      state.contacts[side] = bestContacts(state.ships.filter((ship) => ship.side === side).flatMap((ship) => state.contactTracks[ship.id] || []));
    }
    return state;
  }
  for (const side of sidesOf(state)) state.contacts[side] = updateSideContacts(state, side);
  return state;
}

function updateSideContacts(state, side) {
  const observers = state.ships.filter((s) => s.side === side && isActive(s));
  return scanContacts(state, side, observers, state.contacts?.[side] || [], side);
}

function scanContacts(state, side, observers, previous, scope) {
  const prior = new Map(previous.map((c) => [c.targetId, c]));
  const enemies = state.ships.filter((s) => s.side !== side);
  const contacts = [];
  for (const enemy of enemies) {
    let best = null;
    if (isActive(enemy)) {
      for (const obs of observers) {
        const era = scenarioFor(state.scenarioId).era;
        const detected = ERA_RULES[era]?.detection ? ERA_RULES[era].detection(obs, enemy, state) : detection(obs, enemy, era);
        if (!detected) continue;
        // The clearest report wins, then the closest: a destroyer's glimpse must not
        // replace a cruiser's classified radar track. Any observer that can hear
        // the enemy radiating makes that known.
        const better = !best || CONF_RANK[detected.confidence] > CONF_RANK[best.confidence]
          || (CONF_RANK[detected.confidence] === CONF_RANK[best.confidence] && detected.range < best.range);
        const emitter = Boolean(best?.emitter) || Boolean(detected.emitter);
        if (better) best = detected;
        if (detected.emitter !== undefined || best.emitter !== undefined) best = { ...best, emitter };
      }
    }
    if (best) {
      const contact = {
        id: contactId(state, side, enemy.id),
        targetId: enemy.id,
        q: enemy.q,
        r: enemy.r,
        confidence: best.confidence,
        lastSeen: state.tick,
        stale: false,
        range: best.range,
        // An era can say whether this observer could tell the enemy was radiating (a matching receiver).
        emitter: best.emitter ?? (Boolean(enemy.radar) || (enemy.emitUntil ?? -1) >= state.tick || (enemy.pingAt ?? -1) === state.tick),
      };
      if (best.datum) {
        // A datum is a fixed point with fixed uncertainty: it never sharpens into a track.
        Object.assign(contact, { q: best.datum.q, r: best.datum.r, uncertainty: best.uncertainty });
      } else if (best.uncertainty !== undefined) trackMotion(state, scope, enemy, contact, best, prior.get(enemy.id));
      if (best.submerged !== undefined) contact.submerged = best.submerged; // sonar can tell a hull under water from one on it
      if (best.by) contact.by = best.by; // how the report was made: radar, eyes, flash, receiver
      if (CONF_RANK[contact.confidence] >= 3) { contact.name = enemy.name; if (sidesOf(state).length > 2) contact.side = enemy.side; }
      if (CONF_RANK[contact.confidence] >= 3 && enemy.speed === 0) contact.anchored = true; // a ship at anchor is plain to see once identified
      if (CONF_RANK[contact.confidence] >= 2) contact.className = contact.uncertainty && enemy.passiveClass ? enemy.passiveClass : enemy.className;
      contacts.push(contact);
    } else {
      const old = prior.get(enemy.id);
      if (old) contacts.push({ ...old, stale: true, range: undefined, name: old.name, className: old.className });
    }
  }
  return contacts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function detection(observer, enemy, era) {
  const d = distance(observer, enemy);
  if (era === 'sail') {
    if (d <= 2) return { confidence: 'identified', range: d };
    if (d <= 4) return { confidence: 'classified', range: d };
    if (d <= 7) return { confidence: 'sighted', range: d };
    return null;
  }
  if (observer.radar && d <= 4) return { confidence: 'identified', range: d };
  if (observer.radar && d <= 8) return { confidence: 'classified', range: d };
  if (observer.radar && d <= 11) return { confidence: 'sighted', range: d };
  if (enemy.radar && d <= 12) return { confidence: d <= 7 ? 'classified' : 'sighted', range: d };
  if (d <= 3) return { confidence: 'classified', range: d };
  if (d <= 5) return { confidence: 'sighted', range: d };
  return null;
}

function checkOutcome(state, meta) {
  // A scenario can name the ships that decide it; otherwise every ship counts.
  // Reserves still to arrive keep their side in the fight.
  const alive = (s) => isActive(s) || s.status === 'reserve';
  const decisive = (side) => {
    const ids = meta.victory?.[side === 'blue' ? 'own' : 'enemy'];
    return state.ships.filter((s) => s.side === side && (!ids || ids.includes(s.id)));
  };
  // Escort objectives: a named ship must reach her goal alive.
  const protect = meta.victory?.protect;
  if (protect) {
    const charges = state.ships.filter((s) => protect.includes(s.id));
    if (!charges.length) throw new Error('Scenario protects unknown ships');
    if (charges.some((s) => !isActive(s) && s.status !== 'escaped' && s.status !== 'reserve')) return { ...state, outcome: { result: 'defeat', title: meta.victory.lossTitle || 'The Defector Is Lost', summary: `${charges.map((s) => s.name).join(', ')} did not survive.` } };
    if (charges.every((s) => s.status === 'escaped')) return { ...state, outcome: { result: 'victory', title: meta.victory.successTitle || 'Rendezvous Made', summary: `${charges.map((s) => s.name).join(', ')} reached the rendezvous.` } };
  }
  // A raid: enough of the named enemy ships reach their goal and the defence has failed.
  // A convoy: the escort wins by bringing the merchant ships through, and loses
  // when too many are sunk. Each ship's fate is told in words.
  const convoy = meta.victory?.convoy;
  if (convoy) {
    const charges = state.ships.filter((s) => convoy.ships.includes(s.id));
    const lost = charges.filter((s) => s.status === 'sunk' || s.status === 'struck').length;
    const sailing = charges.filter((s) => isActive(s)).length;
    const fates = `${charges.filter((s) => s.arrived).length} through, ${lost} lost${sailing ? `, ${sailing} still at sea` : ''}`;
    if (lost >= convoy.maxLosses) return { ...state, outcome: { result: 'defeat', title: convoy.lossTitle || 'The Convoy Is Savaged', summary: `${fates}.` } };
    if (!sailing) {
      const result = lost <= (convoy.goodLosses ?? 1) ? 'victory' : 'draw';
      return { ...state, outcome: { result, title: result === 'victory' ? convoy.successTitle || 'The Convoy Is Through' : 'A Battered Convoy Is Through', summary: `${fates}.` } };
    }
    if (state.tick >= meta.maxTicks) {
      const result = lost <= (convoy.goodLosses ?? 1) ? 'victory' : 'draw';
      return { ...state, outcome: { result, title: result === 'victory' ? 'Morning Over a Convoy Intact' : 'Morning Over a Battered Convoy', summary: `${fates}.` } };
    }
  }
  // The raid fails once too few raiders are left who could still get there.
  const raid = meta.victory?.raid;
  if (raid) {
    const raiders = state.ships.filter((s) => raid.ships.includes(s.id));
    const arrived = raiders.filter((s) => s.arrived).length;
    const coming = raiders.filter((s) => (isActive(s) && s.order.type !== 'withdraw') || s.status === 'reserve').length;
    // Each raider's fate in words: the debrief never shows enemy damage.
    const fates = raiders.map((s) => `${s.name} ${s.arrived ? 'reached the line' : s.status === 'sunk' ? 'sunk' : s.status === 'struck' ? 'struck' : !isActive(s) || s.order.type === 'withdraw' ? 'turned back' : 'still coming'}`).join(' · ');
    if (arrived >= raid.count) return { ...state, outcome: { result: 'defeat', title: raid.title, summary: `${raid.summary} ${fates}.` } };
    if (arrived + coming < raid.count) return { ...state, outcome: { result: 'victory', title: raid.repulsedTitle || 'The Raid Is Turned Back', summary: `${fates}.` } };
    if (state.tick >= meta.maxTicks) return { ...state, outcome: { result: 'draw', title: 'Still Coming On', summary: `Time ran out with the raid neither through nor beaten off. ${fates}.` } };
  }
  const blueActive = decisive('blue').some(alive);
  const redActive = protect ? true : decisive('red').some(alive); // with an escort goal, sinking the hunter is not the win
  if (!blueActive && !redActive) return { ...state, outcome: { result: 'draw', title: 'Mutual Destruction', summary: 'Neither squadron has ships remaining in action.' } };
  if (!redActive) return { ...state, outcome: { result: 'victory', title: 'Enemy Squadron Defeated', summary: 'Blue retains fighting power and the opposing force is out of action.' } };
  if (!blueActive) return { ...state, outcome: { result: 'defeat', title: 'Squadron Lost', summary: meta.victory ? 'The ships your orders depended on are out of action.' : 'Blue has no ships remaining in action.' } };
  if (state.tick >= meta.maxTicks && protect) return { ...state, outcome: { result: 'draw', title: meta.victory.timeoutTitle || 'Still at Sea', summary: meta.victory.timeoutTitle ? 'Time ran out before the escorted ship reached the rendezvous.' : 'Time ran out before the rendezvous. The defector is still out there.' } };
  if (state.tick >= meta.maxTicks) {
    // With named decisive ships, compare each side's surviving share of its own starting strength.
    const pct = (side, ids) => { const max = state.ships.filter((s) => s.side === side && ids.includes(s.id)).reduce((n, s) => n + 100 * (s.value || 1), 0); return Math.round((100 * forceScore(state, side, ids)) / max); };
    const blueScore = meta.victory ? pct('blue', meta.victory.own) : forceScore(state, 'blue');
    const redScore = meta.victory ? pct('red', meta.victory.enemy) : forceScore(state, 'red');
    const delta = blueScore - redScore;
    const result = Math.abs(delta) < (meta.victory ? 10 : 20) ? 'draw' : delta > 0 ? 'victory' : 'defeat';
    return { ...state, outcome: { result, title: result === 'draw' ? 'Indecisive Action' : result === 'victory' ? 'Favorable Dispatch' : 'Unfavorable Dispatch', summary: `Blue score ${blueScore}, Red score ${redScore}.` } };
  }
  return state;
}

function forceScore(state, side, decisive) {
  return Math.round(state.ships.filter((s) => s.side === side && (!decisive || decisive.includes(s.id))).reduce((sum, s) => sum + (isActive(s) ? (s.hull + s.weapons + s.crew + s.propulsion) * (s.value || 1) : 0) / 4, 0));
}





function publicOwnShip(s, state, side) {
  const out = deepClone(s);
  if (out.fc?.targetId) out.fc.targetId = contactId(state, side, out.fc.targetId); // the target as your contact, not its true id
  return out;
}


// A side can take other sides' ships under command (the defector answering a ping):
// their ships, sonar picture, dispatches and weapons join its view.
function commanded(state, side) {
  return [side, ...(state.command?.[side] || [])];
}

function mergedContacts(state, sides) {
  const ownIds = new Set(state.ships.filter((s) => sides.includes(s.side)).map((s) => s.id));
  return bestContacts(sides.flatMap((sd) => state.contacts[sd] || []).filter((c) => !ownIds.has(c.targetId)));
}

function bestContacts(contacts) {
  const best = new Map();
  for (const c of contacts) {
    const prev = best.get(c.targetId);
    const better = !prev || (prev.stale && !c.stale) || (prev.stale === c.stale && (CONF_RANK[c.confidence] > CONF_RANK[prev.confidence] || (CONF_RANK[c.confidence] === CONF_RANK[prev.confidence] && (c.uncertainty ?? 0) < (prev.uncertainty ?? 0))));
    if (better) best.set(c.targetId, c);
  }
  return [...best.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

// The same weapon can reach a merged view twice (heard by one side, owned by another): keep the owner's.
function uniqueEntities(items) {
  const owned = items.filter((x) => x.own);
  const ownedAt = new Set(owned.map((x) => `${x.kind}|${x.q}|${x.r}`));
  return [...owned, ...items.filter((x) => !x.own && !ownedAt.has(`${x.kind}|${x.q}|${x.r}`))];
}

function publicLogEntry(entry, state, side) {
  const text = entry.reports ? entry.reports[side] : reportText(entry, state, side);
  return text === null ? null : { tick: entry.tick, text, kind: entry.kind };
}

// Side dispatches remain shared command reports, but chart effects must not reveal
// a contact or weapon heard only by another submarine.
function observerFx(effect, observer, visibleIds, state, viewSide) {
  const out = deepClone(effect);
  if (observer.side !== viewSide) {
    for (const ref of [out.from, out.to]) {
      if (!ref || ref.own) continue;
      const target = (state.contacts[observer.side] || []).find((c) => contactId(state, observer.side, c.targetId) === ref.id);
      if (target) ref.id = contactId(state, viewSide, target.targetId);
    }
  }
  const seen = (ref) => !ref || (ref.own ? ref.id === observer.id : visibleIds.has(ref.id));
  if (out.type === 'event') {
    if (!seen(out.to)) out.to = null;
    return out;
  }
  if (!seen(out.from) || !seen(out.to)) return null;
  if (!out.from && !out.to && out.at && distance(observer, out.at) > 6) return null;
  return out;
}

// Bearing-only tracking: a passive contact is reported somewhere inside an uncertainty
// ring that shrinks while it is held (target motion analysis); held long enough it
// is classified. The scatter is a stable hash of tick and contact, not the game RNG,
// so the three contact updates in a tick agree and no randomness is consumed.
function trackMotion(state, scope, enemy, contact, best, prior) {
  const holdSince = prior && !prior.stale && prior.holdSince !== undefined ? prior.holdSince : state.tick;
  const held = state.tick - holdSince;
  const unc = Math.max(0, best.uncertainty - held);
  contact.holdSince = holdSince;
  contact.uncertainty = unc;
  if (held >= 3 && contact.confidence === 'sighted') contact.confidence = 'classified';
  if (unc > 0) {
    const h = hashString(`${state.seed}|${state.tick}|${scope}|${enemy.id}`);
    const [dq, dr] = DIRECTIONS[h % 6];
    const dist = (h >>> 3) % (unc + 1);
    contact.q = clamp(enemy.q + dq * dist, 0, state.map.width - 1);
    contact.r = clamp(enemy.r + dr * dist, 0, state.map.height - 1);
  }
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

function publicContact(c) {
  const out = { id: c.id, q: c.q, r: c.r, confidence: c.confidence, lastSeen: c.lastSeen, stale: c.stale };
  if (c.uncertainty !== undefined) out.uncertainty = c.uncertainty;
  if (c.side) out.side = c.side;
  if (c.name) out.name = c.name;
  if (c.className) out.className = c.className;
  if (typeof c.emitter === 'boolean') out.emitter = c.emitter;
  if (c.by && !c.stale) out.by = c.by;
  if (typeof c.submerged === 'boolean' && !c.stale) out.submerged = c.submerged;
  if (c.anchored && !c.stale) out.anchored = true;
  return out;
}




function trimLog(state) { state.log = state.log.slice(-MAX_LOG); return state; }
function signalText(ships, order) { return `${ships.map((s) => s.name).join(', ')} signaled to ${describeOrder(order)}.`; }
function describeOrder(order) { return order.type === 'proceed' ? `proceed to ${order.q},${order.r}` : order.type; }
function cloneState(state) { return deepClone(state); }
function uniqueTerrain(terrain, map) {
  const byKey = new Map();
  for (const t of terrain) if (inBounds(t, map)) byKey.set(key(t.q, t.r), { q: t.q, r: t.r, type: t.type });
  return [...byKey.values()].sort((a, b) => a.r - b.r || a.q - b.q);
}
function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
}
