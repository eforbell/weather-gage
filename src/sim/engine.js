import { SCENARIO_SETUPS, SCENARIOS } from './scenarios.js';
import {
  WIDTH, HEIGHT, DIRECTIONS, SIDES, CONF_RANK, MAX_LOG, MAX_FX,
  distance, isActive, assertCoord, nonEmptyString, addLog, reportText, addFx, publicFx, applyDamage, resolveStatus, roll, nextRandom, terrainAt, terrainAtMap, directionToward, hexDistanceRaw, turnDistance, inBounds, key, clamp, deepClone, bestContactFor,
} from './core.js';

export { WIDTH, HEIGHT, DIRECTIONS, distance, isActive };
import * as dreadnought from './eras/dreadnought.js';
import * as ironclad from './eras/ironclad.js';

// Era rule modules. Each may provide: validateShip, onOrder, orderDelay, beforeTick,
// moveShip, afterMove, combat, detection. Sail and modern still use the engine's
// built-in rules below and are the next candidates to move out.
const ERA_RULES = { dreadnought, ironclad };
const rulesFor = (state) => ERA_RULES[scenarioFor(state.scenarioId).era] || {};

export const VERSION = 1;
const TERRAIN_TYPES = new Set(['land', 'shoal', 'mines']);
const VALID_ORDERS = new Set(['engage', 'hold', 'proceed', 'withdraw', 'line', 'screen']);

export function createGame(scenarioId = 'nevis', seed = 1799) {
  const meta = scenarioFor(scenarioId);
  const setup = SCENARIO_SETUPS[meta.id];
  const state = {
    version: VERSION,
    scenarioId: meta.id,
    seed: normalizeSeed(seed),
    rng: normalizeSeed(seed),
    tick: 0,
    wind: setup.wind,
    map: { width: WIDTH, height: HEIGHT, terrain: uniqueTerrain(setup.terrain) },
    ships: deepClone(setup.ships),
    contacts: { blue: [], red: [] },
    pending: [],
    fx: [],
    log: [{ tick: 0, text: `${meta.title}: ${meta.objective}`, kind: 'scenario' }],
    outcome: null,
  };
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
  const clean = cleanOrder(order);
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
  for (const ship of state.ships) if (ids.has(ship.id)) ship.doctrine = { ...ship.doctrine, ...clean };
  return trimLog(addLog(state, `Doctrine updated for ${ids.size} ship(s).`, 'order', state.ships.filter(s => ids.has(s.id)).map(s => s.side)));
}

export function setRadar(input, shipIds, enabled) {
  let state = validateState(input);
  state = cloneState(state);
  const ids = new Set(Array.isArray(shipIds) ? shipIds : [shipIds]);
  for (const ship of state.ships) if (ids.has(ship.id) && ship.era === 'modern') ship.radar = Boolean(enabled);
  return updateContacts(trimLog(addLog(state, `Radar ${enabled ? 'enabled' : 'secured'} for ${ids.size} ship(s).`, 'order', state.ships.filter(s => ids.has(s.id)).map(s => s.side))));
}

export function getView(input, side = 'blue') {
  const state = validateState(input);
  const safeSide = side === 'red' ? 'red' : 'blue';
  return {
    version: state.version,
    scenarioId: state.scenarioId,
    tick: state.tick,
    wind: state.wind,
    map: deepClone(state.map),
    ships: state.ships.filter((s) => s.side === safeSide).map(publicOwnShip),
    contacts: (state.contacts[safeSide] || []).map(publicContact),
    pending: state.pending
      .filter((p) => !p.kind && p.order && state.ships.some((s) => s.id === p.shipId && s.side === safeSide))
      .map((p) => ({ shipId: p.shipId, order: deepClone(p.order), deliverAt: p.deliverAt })),
    log: state.log.slice(-MAX_LOG).map((e) => publicLogEntry(e, state, safeSide)).filter(Boolean),
    fx: (state.fx || []).map((e) => e?.[safeSide]).filter(Boolean).map(deepClone),
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
  const meta = SCENARIOS.find((scenario) => scenario.id === id);
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
  validateMap(value.map);
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
  validateContacts(value.contacts, ids);
  validatePending(value.pending, ids, value.tick, value.map, value.ships);
  validateLog(value.log);
  validateOutcome(value.outcome);
  if (value.fx !== undefined) validateFx(value.fx);
  const cloned = cloneState(value);
  cloned.fx = cloned.fx || [];
  cloned.log = cloned.log.slice(-MAX_LOG);
  return cloned;
}

function validateMap(map) {
  if (!map || typeof map !== 'object' || map.width !== WIDTH || map.height !== HEIGHT || !Array.isArray(map.terrain)) throw new Error('Invalid map');
  const cells = new Set();
  for (const t of map.terrain) {
    assertCoord(t);
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
  assertCoord(ship);
  if (!SIDES.includes(ship.side)) throw new Error('Invalid ship side');
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
  ERA_RULES[era]?.validateShip?.(ship);
  if (ship.arriveAt !== undefined && (!Number.isInteger(ship.arriveAt) || ship.arriveAt < 0)) throw new Error('Invalid reserve arrival');
  if (ship.status === 'reserve' && ship.arriveAt === undefined) throw new Error('Invalid reserve arrival');
}

function validateOrder(order, map = null) {
  if (!order || typeof order !== 'object' || Array.isArray(order) || !VALID_ORDERS.has(order.type)) throw new Error('Invalid order');
  const hasQ = Object.hasOwn(order, 'q');
  const hasR = Object.hasOwn(order, 'r');
  if (order.type === 'proceed') {
    if (!hasQ || !hasR) throw new Error('Proceed order requires q/r');
    assertCoord(order);
    if (map && terrainAtMap(map, order.q, order.r) === 'land') throw new Error('Proceed order destination is land');
  } else if (order.type === 'line' || order.type === 'screen') {
    if (hasQ !== hasR) throw new Error('Formation q/r must be paired');
    if (hasQ) assertCoord(order);
  } else if (hasQ || hasR) {
    throw new Error('Order type does not accept q/r');
  }
}

function validateDoctrine(doctrine) {
  if (!doctrine || typeof doctrine !== 'object' || Array.isArray(doctrine)) throw new Error('Invalid doctrine');
  if (doctrine.roe !== 'free' && doctrine.roe !== 'hold') throw new Error('Invalid doctrine ROE');
  if (!Number.isInteger(doctrine.range) || doctrine.range < 1 || doctrine.range > 12) throw new Error('Invalid doctrine range');
  if (!Number.isInteger(doctrine.withdraw) || doctrine.withdraw < 0 || doctrine.withdraw > 90) throw new Error('Invalid doctrine withdraw');
}

function validateContacts(contacts, shipIds) {
  if (!contacts || typeof contacts !== 'object' || !Array.isArray(contacts.blue) || !Array.isArray(contacts.red)) throw new Error('Invalid contacts');
  for (const side of SIDES) {
    const ids = new Set();
    for (const contact of contacts[side]) {
      if (!contact || typeof contact !== 'object' || Array.isArray(contact)) throw new Error('Invalid contact');
      if (!nonEmptyString(contact.id) || ids.has(contact.id)) throw new Error('Invalid contact id');
      ids.add(contact.id);
      if (!nonEmptyString(contact.targetId) || !shipIds.has(contact.targetId)) throw new Error('Invalid contact target');
      assertCoord(contact);
      if (!Object.hasOwn(CONF_RANK, contact.confidence)) throw new Error('Invalid contact confidence');
      if (!Number.isInteger(contact.lastSeen) || contact.lastSeen < 0) throw new Error('Invalid contact lastSeen');
      if (typeof contact.stale !== 'boolean') throw new Error('Invalid contact stale');
      if (contact.name !== undefined && !nonEmptyString(contact.name)) throw new Error('Invalid contact name');
      if (contact.className !== undefined && !nonEmptyString(contact.className)) throw new Error('Invalid contact class');
      if (contact.range !== undefined && (!Number.isInteger(contact.range) || contact.range < 0)) throw new Error('Invalid contact range');
      if (contact.emitter !== undefined && typeof contact.emitter !== 'boolean') throw new Error('Invalid contact emitter');
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
      if (!SIDES.includes(item.side)) throw new Error('Invalid missile side');
      if (!Number.isInteger(item.salvo) || item.salvo < 1) throw new Error('Invalid missile salvo');
      if (Object.hasOwn(item, 'order')) throw new Error('Missile pending cannot include order');
    } else if (item.kind === 'torpedo') {
      if (!ships.some((s) => s.era === 'dreadnought')) throw new Error('Torpedoes are not part of this era');
      if (!nonEmptyString(item.shipId) || !shipIds.has(item.shipId)) throw new Error('Invalid torpedo shooter');
      if (!nonEmptyString(item.targetId) || !shipIds.has(item.targetId)) throw new Error('Invalid torpedo target');
      if (!SIDES.includes(item.side)) throw new Error('Invalid torpedo side');
      const sideOf = (id) => ships.find((x) => x.id === id)?.side;
      if (sideOf(item.shipId) !== item.side || sideOf(item.targetId) === item.side) throw new Error('Invalid torpedo sides');
      assertCoord(item);
      assertCoord({ q: item.aimQ, r: item.aimR });
      if (Object.hasOwn(item, 'order')) throw new Error('Torpedo pending cannot include order');
    } else {
      if (item.kind !== undefined) throw new Error('Invalid pending kind');
      if (!nonEmptyString(item.shipId) || !shipIds.has(item.shipId)) throw new Error('Invalid pending ship');
      validateOrder(item.order, map);
    }
  }
}

function validateFx(fx) {
  if (!Array.isArray(fx) || fx.length > MAX_FX) throw new Error('Invalid fx');
  const ref = (r, own) => {
    if (r === null || r === undefined) return;
    assertCoord(r);
    if (own && (!nonEmptyString(r.id) || typeof r.own !== 'boolean')) throw new Error('Invalid fx ref');
  };
  for (const entry of fx) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid fx entry');
    for (const side of SIDES) {
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
    if (entry.reports !== undefined && (!entry.reports || SIDES.some(side => entry.reports[side] !== null && !nonEmptyString(entry.reports[side])))) throw new Error('Invalid public reports');
  }
}

function validateOutcome(outcome) {
  if (outcome === null) return;
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) throw new Error('Invalid outcome');
  if (!['victory', 'defeat', 'draw'].includes(outcome.result) || !nonEmptyString(outcome.title) || !nonEmptyString(outcome.summary)) throw new Error('Invalid outcome');
}



function cleanOrder(order) {
  if (!order || typeof order !== 'object' || !VALID_ORDERS.has(order.type)) return null;
  const clean = { type: order.type };
  if (order.type === 'proceed') {
    if (!Number.isInteger(order.q) || !Number.isInteger(order.r)) return null;
    if (order.q < 0 || order.r < 0 || order.q >= WIDTH || order.r >= HEIGHT) return null;
    clean.q = order.q; clean.r = order.r;
  } else if ((order.type === 'line' || order.type === 'screen') && order.q !== undefined && order.r !== undefined) {
    if (!Number.isInteger(order.q) || !Number.isInteger(order.r)) return null;
    if (order.q < 0 || order.r < 0 || order.q >= WIDTH || order.r >= HEIGHT) return null;
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

// Reinforcements: ships held in reserve join the action at their scheduled tick.
function arriveReserves(state) {
  for (const ship of state.ships) {
    if (ship.status !== 'reserve' || ship.arriveAt > state.tick) continue;
    const taken = (c) => state.ships.some((s) => s !== ship && isActive(s) && s.q === c.q && s.r === c.r);
    if (taken(ship)) {
      // Arrival hex blocked: come in on the nearest open water instead of waiting forever.
      const spot = DIRECTIONS.map(([dq, dr]) => ({ q: ship.q + dq, r: ship.r + dr }))
        .find((c) => inBounds(c) && !taken(c) && terrainAt(state, c.q, c.r) !== 'land' && !(ship.draft === 'deep' && terrainAt(state, c.q, c.r) === 'shoal'));
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
    if (ship.order.type === 'withdraw' && escapeEdge(ship)) {
      ship.status = 'escaped';
      state = addLog(state, `${ship.name} withdraws beyond the action.`, 'escape');
      occupied.delete(key(ship.q, ship.r));
      continue;
    }
    if (ship.order.type === 'hold' || ship.propulsion <= 0) continue;
    const rules = ERA_RULES[era];
    if (rules?.moveShip) {
      state = rules.moveShip(state, ship, occupied, movementTarget(state, ship));
      if (isActive(ship) && ship.order.type === 'withdraw' && escapeEdge(ship)) {
        ship.status = 'escaped';
        state = addLog(state, `${ship.name} withdraws beyond the action.`, 'escape');
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
    if (ship.order.type === 'withdraw' && escapeEdge(ship)) {
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
  if (ship.order.type === 'withdraw') return withdrawTarget(ship);
  const contact = bestContactFor(state, ship.side, ship.doctrine.range + 6, true, ship);
  if (contact) return { q: contact.q, r: contact.r };
  return searchTarget(state, ship);
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
    if (inBounds(c) && terrainAt(state, c.q, c.r) !== 'land') return c;
  }
  return searchTarget(state, ship);
}

function scaleDir(facing, n) {
  const [dq, dr] = DIRECTIONS[facing];
  return [dq * n, dr * n];
}

function searchTarget(state, ship) {
  if (ship.side === 'blue') return { q: Math.min(WIDTH - 2, 12 + (state.tick % 4)), r: clamp(ship.r, 4, HEIGHT - 5) };
  return { q: Math.max(1, 7 - (state.tick % 4)), r: clamp(ship.r, 4, HEIGHT - 5) };
}


function withdrawTarget(ship) {
  return ship.side === 'blue' ? { q: 0, r: ship.r } : { q: WIDTH - 1, r: ship.r };
}

function escapeEdge(ship) {
  return (ship.side === 'blue' && ship.q === 0) || (ship.side === 'red' && ship.q === WIDTH - 1);
}

function bestStep(state, ship, target, occupied, era) {
  if (distance(ship, target) === 0) return null;
  const candidates = DIRECTIONS.map(([dq, dr], facing) => ({ q: ship.q + dq, r: ship.r + dr, facing }))
    .filter((c) => inBounds(c) && terrainAt(state, c.q, c.r) !== 'land' && !occupied.has(key(c.q, c.r)))
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
  const contact = bestContactFor(state, ship.side, maxRange, false, ship);
  if (!contact || contact.stale || CONF_RANK[contact.confidence] < 1 || !contact.targetId) return null;
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
  for (const side of SIDES) state.contacts[side] = updateSideContacts(state, side);
  return state;
}

function updateSideContacts(state, side) {
  const prior = new Map((state.contacts?.[side] || []).map((c) => [c.targetId || c.id, c]));
  const observers = state.ships.filter((s) => s.side === side && isActive(s));
  const enemies = state.ships.filter((s) => s.side !== side);
  const contacts = [];
  for (const enemy of enemies) {
    let best = null;
    if (isActive(enemy)) {
      for (const obs of observers) {
        const era = scenarioFor(state.scenarioId).era;
        const detected = ERA_RULES[era]?.detection ? ERA_RULES[era].detection(obs, enemy, state) : detection(obs, enemy, era);
        if (!detected) continue;
        if (!best || CONF_RANK[detected.confidence] > CONF_RANK[best.confidence] || detected.range < best.range) best = detected;
      }
    }
    if (best) {
      contacts.push({
        id: `c_${side}_${enemy.id}`,
        targetId: enemy.id,
        q: enemy.q,
        r: enemy.r,
        confidence: best.confidence,
        name: CONF_RANK[best.confidence] >= 3 ? enemy.name : undefined,
        className: CONF_RANK[best.confidence] >= 2 ? enemy.className : undefined,
        lastSeen: state.tick,
        stale: false,
        range: best.range,
        emitter: Boolean(enemy.radar) || (enemy.emitUntil ?? -1) >= state.tick,
      });
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
  const blueActive = decisive('blue').some(alive);
  const redActive = decisive('red').some(alive);
  if (!blueActive && !redActive) return { ...state, outcome: { result: 'draw', title: 'Mutual Destruction', summary: 'Neither squadron has ships remaining in action.' } };
  if (!redActive) return { ...state, outcome: { result: 'victory', title: 'Enemy Squadron Defeated', summary: 'Blue retains fighting power and the opposing force is out of action.' } };
  if (!blueActive) return { ...state, outcome: { result: 'defeat', title: 'Squadron Lost', summary: meta.victory ? 'The ships your orders depended on are out of action.' : 'Blue has no ships remaining in action.' } };
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





function publicOwnShip(s) {
  return deepClone(s);
}


function publicLogEntry(entry, state, side) {
  const text = entry.reports ? entry.reports[side] : reportText(entry, state, side);
  return text === null ? null : { tick: entry.tick, text, kind: entry.kind };
}

function publicContact(c) {
  const out = { id: c.id, q: c.q, r: c.r, confidence: c.confidence, lastSeen: c.lastSeen, stale: c.stale };
  if (c.name) out.name = c.name;
  if (c.className) out.className = c.className;
  if (typeof c.emitter === 'boolean') out.emitter = c.emitter;
  return out;
}




function trimLog(state) { state.log = state.log.slice(-MAX_LOG); return state; }
function signalText(ships, order) { return `${ships.map((s) => s.name).join(', ')} signaled to ${describeOrder(order)}.`; }
function describeOrder(order) { return order.type === 'proceed' ? `proceed to ${order.q},${order.r}` : order.type; }
function cloneState(state) { return deepClone(state); }
function uniqueTerrain(terrain) {
  const byKey = new Map();
  for (const t of terrain) if (inBounds(t)) byKey.set(key(t.q, t.r), { q: t.q, r: t.r, type: t.type });
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

