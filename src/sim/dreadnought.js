// Dreadnought-era rules (c. 1905–1918): turrets, fire-control ranging, armour, speed
// classes, torpedoes, wireless and funnel/gun smoke. The engine calls in here for
// movement, combat, detection and torpedo resolution; everything else (ticks,
// contacts, signals, outcomes, saves) is the shared platform.
import {
  DIRECTIONS, distance, isActive, addLog, addFx, applyDamage, resolveStatus, roll, nextRandom, terrainAt,
  directionToward, turnDistance, inBounds, key, clamp, CONF_RANK, assertCoord,
} from './engine.js';

export const SHIP_TYPES = new Set(['battleship', 'battlecruiser', 'destroyer']);
const CALIBRES = {
  heavy: { dmg: [4, 8], vs: { battleship: 0.7, battlecruiser: 0.9, destroyer: 1.8 } },
  light: { dmg: [2, 5], vs: { battleship: 0.12, battlecruiser: 0.2, destroyer: 1 } },
};
const TORPEDO_RANGE = 3;
const SECONDARY_RANGE = 4;

export function validateShip(ship) {
  if (!SHIP_TYPES.has(ship.type)) throw new Error('Invalid ship type');
  if (!Number.isInteger(ship.speed) || ship.speed < 1 || ship.speed > 4) throw new Error('Invalid speed');
  if (!Number.isInteger(ship.guns) || ship.guns < 0) throw new Error('Invalid guns');
  if (!Number.isInteger(ship.gunRange) || ship.gunRange < 1 || ship.gunRange > 12) throw new Error('Invalid gun range');
  if (!Object.hasOwn(CALIBRES, ship.calibre)) throw new Error('Invalid calibre');
  for (const k of ['secondary', 'torpedoes', 'value']) if (!Number.isInteger(ship[k]) || ship[k] < 0) throw new Error(`Invalid ${k}`);
  if (typeof ship.flashRisk !== 'boolean') throw new Error('Invalid flashRisk');
  if (!Number.isInteger(ship.emitUntil) || !Number.isInteger(ship.firedAt)) throw new Error('Invalid emission state');
  const fc = ship.fc;
  if (!fc || typeof fc !== 'object' || !(fc.targetId === null || typeof fc.targetId === 'string') || !Number.isInteger(fc.level) || fc.level < 0 || fc.level > 3) throw new Error('Invalid fire control');
}

// ---------- Movement ----------

// Speed is in half-hexes per tick, so a 3 steams 1, 2, 1, 2… hexes.
export function movesThisTick(state, ship) {
  let speed = ship.speed;
  if (ship.propulsion < 50) speed -= 1;
  if (ship.propulsion <= 15) speed = Math.min(speed, 1);
  speed = Math.max(1, speed);
  return Math.floor((state.tick * speed) / 2) - Math.floor(((state.tick - 1) * speed) / 2);
}

export function moveShip(state, ship, occupied, destination) {
  const startFacing = ship.facing;
  const turnRate = ship.type === 'destroyer' ? 2 : 1;
  const moves = movesThisTick(state, ship);
  for (let i = 0; i < moves; i += 1) {
    const desired = desiredFacing(state, ship, destination);
    if (desired === null) break;
    const options = [0, 1, 5, 2, 4, 3]
      .map((offset) => (desired + offset) % 6)
      .filter((f) => turnDistance(ship.facing, f) <= turnRate)
      .sort((a, b) => turnDistance(a, desired) - turnDistance(b, desired) || turnDistance(ship.facing, a) - turnDistance(ship.facing, b));
    // Captains keep clear of declared minefields unless the admiral explicitly routes them through.
    const clear = (f) => passable(state, ahead(ship, f), occupied) && (ship.order.type === 'proceed' || terrainAt(state, ship.q + DIRECTIONS[f][0], ship.r + DIRECTIONS[f][1]) !== 'mines');
    const choice = options.find(clear);
    if (choice === undefined) {
      // Boxed in (map edge, land, traffic): turn toward the closest open heading instead.
      const open = [0, 1, 5, 2, 4, 3].map((o) => (desired + o) % 6).find(clear);
      if (open !== undefined) ship.facing = (ship.facing + (((open - ship.facing + 6) % 6) <= 3 ? 1 : 5)) % 6;
      break;
    }
    const next = ahead(ship, choice);
    occupied.delete(key(ship.q, ship.r));
    ship.facing = choice;
    ship.q = next.q; ship.r = next.r;
    occupied.add(key(ship.q, ship.r));
    if (terrainAt(state, ship.q, ship.r) === 'mines' && roll(state, 0.3)) {
      applyDamage(ship, { hull: 26, propulsion: 30, weapons: 8, crew: 12 });
      state = addLog(state, `${ship.name} strikes a mine.`, 'damage');
      state = addFx(state, { type: 'mine', targetId: ship.id, hits: 1, damage: 26, heavy: true });
      state = resolveStatus(state, ship);
      if (!isActive(ship)) { occupied.delete(key(ship.q, ship.r)); break; }
    }
  }
  // Fire control depends on a steady platform: a hard turn throws the range off.
  if (turnDistance(startFacing, ship.facing) >= 2) ship.fc.level = Math.max(0, ship.fc.level - 2);
  return state;
}

function desiredFacing(state, ship, destination) {
  const engaged = ship.order.type === 'engage' && ship.doctrine.roe === 'free';
  if (engaged && ship.type === 'destroyer') {
    const prey = pickTarget(state, ship, 12, 'capital');
    if (prey && ship.torpedoes > 0) {
      const d = distance(ship, prey);
      const dir = directionToward(ship, prey);
      // Attack run: close at full speed, fire, then turn away and open the range.
      if (ship.reloadUntil > state.tick) return nearest(ship.facing, [(dir + 2) % 6, (dir + 4) % 6, (dir + 3) % 6]);
      return d > TORPEDO_RANGE - 1 ? dir : nearest(ship.facing, [(dir + 1) % 6, (dir + 5) % 6]);
    }
  }
  const inFormation = (ship.order.type === 'line' || ship.order.type === 'screen') && ship.doctrine.roe === 'free';
  if (ship.type !== 'destroyer' && (engaged || inFormation)) {
    // Ships in formation still turn to open their arcs once the enemy is inside gun range.
    const target = pickTarget(state, ship, engaged ? ship.gunRange + 1 : ship.gunRange, 'capital');
    if (target) return beamCourse(ship, target, Math.min(ship.doctrine.range, ship.gunRange));
  }
  if (ship.type === 'destroyer' && inFormation) {
    // A screening destroyer turns on torpedo craft closing the line, then returns to station.
    const flag = state.ships.find((s) => s.side === ship.side && isActive(s));
    const raider = pickTarget(state, ship, 6, 'light');
    if (raider && flag && distance(flag, raider) <= 6) {
      const d = distance(ship, raider);
      const dir = directionToward(ship, raider);
      return d > 2 ? dir : nearest(ship.facing, [(dir + 1) % 6, (dir + 5) % 6]);
    }
  }
  if (!destination || distance(ship, destination) === 0) return null;
  let best = null;
  for (let f = 0; f < 6; f += 1) {
    const c = ahead(ship, f);
    if (!inBounds(c)) continue;
    const score = distance(c, destination) * 10 + turnDistance(ship.facing, f) + (terrainAt(state, c.q, c.r) === 'mines' ? 25 : 0);
    if (!best || score < best.score) best = { f, score };
  }
  return best ? best.f : null;
}

// Keep the enemy abeam so every turret bears: close obliquely when too far, open when too close.
function beamCourse(ship, target, preferred) {
  const dir = directionToward(ship, target);
  const d = distance(ship, target);
  if (d > preferred + 2) return dir;
  if (d > preferred) return nearest(ship.facing, [(dir + 1) % 6, (dir + 5) % 6]);
  if (d >= preferred - 1) return nearest(ship.facing, [(dir + 1) % 6, (dir + 5) % 6, (dir + 2) % 6, (dir + 4) % 6]);
  return nearest(ship.facing, [(dir + 2) % 6, (dir + 4) % 6]);
}

function nearest(current, facings) {
  return [...facings].sort((a, b) => turnDistance(current, a) - turnDistance(current, b))[0];
}

function ahead(ship, facing) {
  const [dq, dr] = DIRECTIONS[facing];
  return { q: ship.q + dq, r: ship.r + dr };
}

function passable(state, c, occupied) {
  return inBounds(c) && terrainAt(state, c.q, c.r) !== 'land' && !occupied.has(key(c.q, c.r));
}

// ---------- Detection ----------

export function detection(observer, enemy, state) {
  const d = distance(observer, enemy);
  const small = enemy.type === 'destroyer' ? 2 : 0;
  if (d <= 4 - small / 2) return { confidence: 'identified', range: d };
  if (d <= 7 - small) return { confidence: 'classified', range: d };
  if (d <= 10 - small) return { confidence: 'sighted', range: d }; // smoke on the horizon
  if (enemy.firedAt >= 0 && enemy.firedAt >= state.tick - 1 && d <= 13) return { confidence: 'sighted', range: d }; // gun flashes
  if (enemy.emitUntil >= state.tick && d <= 18) return { confidence: 'sighted', range: d }; // wireless direction-finding
  return null;
}

// ---------- Combat ----------

function isCapital(ship) { return ship.type !== 'destroyer'; }

// Captains pick from fresh contact reports; the class is only known once classified.
function pickTarget(state, ship, maxRange, prefer) {
  const candidates = (state.contacts[ship.side] || [])
    .filter((c) => !c.stale && distance(ship, c) <= maxRange)
    .map((c) => ({ c, s: state.ships.find((x) => x.id === c.targetId) }))
    .filter(({ s }) => s && isActive(s));
  if (!candidates.length) return null;
  const known = (x) => CONF_RANK[x.c.confidence] >= CONF_RANK.classified;
  const rank = (x) => {
    let score = distance(ship, x.c);
    if (x.s.id === ship.fc?.targetId) score -= 2.5;
    if (known(x)) {
      if (prefer === 'capital' && !isCapital(x.s)) score += ship.type === 'destroyer' && ship.torpedoes === 0 ? -2 : 6;
      if (prefer === 'light' && isCapital(x.s)) score += 20;
    }
    return score;
  };
  const best = candidates.sort((a, b) => rank(a) - rank(b) || a.s.id.localeCompare(b.s.id))[0];
  if (prefer === 'light' && !(known(best) && !isCapital(best.s))) return null;
  if (prefer === 'capital' && ship.type === 'destroyer' && ship.torpedoes > 0 && known(best) && !isCapital(best.s)) {
    return candidates.find((x) => known(x) && isCapital(x.s))?.s || null;
  }
  return best.s;
}

export function combat(state) {
  for (const ship of state.ships) {
    if (!isActive(ship) || ship.doctrine.roe === 'hold' || ship.weapons <= 10) continue;
    if (ship.guns > 0) {
      const target = pickTarget(state, ship, isCapital(ship) ? ship.gunRange : Math.min(ship.gunRange, ship.doctrine.range + 1), isCapital(ship) ? 'capital' : 'any');
      if (target) state = fireBattery(state, ship, target, ship.calibre, ship.guns, true);
    }
    if (ship.secondary > 0) {
      const target = pickTarget(state, ship, SECONDARY_RANGE, 'light');
      if (target && isActive(target)) state = fireBattery(state, ship, target, 'light', ship.secondary, false);
    }
    if (ship.torpedoes > 0 && ship.reloadUntil <= state.tick && ship.order.type !== 'withdraw') {
      const target = pickTarget(state, ship, TORPEDO_RANGE, 'capital');
      if (target && isCapital(target)) state = launchTorpedoes(state, ship, target);
    }
  }
  return state;
}

function fireBattery(state, ship, target, calibre, guns, main) {
  const d = distance(ship, target);
  const bearing = directionToward(ship, target);
  const rel = (bearing - ship.facing + 6) % 6;
  const arc = rel === 0 || rel === 3 ? 0.5 : 1; // end-on, the fore or aft turrets are masked
  const shots = Math.max(1, Math.round((guns * arc * (ship.weapons / 100)) / 2));
  if (main) {
    ship.fc = ship.fc.targetId === target.id ? { targetId: target.id, level: Math.min(3, ship.fc.level + 1) } : { targetId: target.id, level: 0 };
  }
  const fcLevel = main ? ship.fc.level : 1;
  const theirRel = (directionToward(target, ship) - target.facing + 6) % 6;
  const crossingT = main && isCapital(ship) && arc === 1 && (theirRel === 0 || theirRel === 3) && isCapital(target);
  // Smoke blows downwind: firing into your own funnel and gun smoke spoils spotting.
  const smoke = turnDistance(bearing, (state.wind + 3) % 6) === 0;
  let p = (d <= 3 ? 0.45 : d <= 6 ? 0.3 : 0.18) * (0.55 + 0.2 * fcLevel) * (0.5 + 0.5 * (ship.crew / 100));
  if (smoke) p *= 0.7;
  if (crossingT) p *= 1.2;
  if (calibre === 'heavy' && target.type === 'destroyer') p *= 0.5;
  let hits = 0;
  for (let i = 0; i < shots; i += 1) if (roll(state, p)) hits += 1;
  ship.firedAt = state.tick;
  const straddle = hits === 0 && fcLevel >= 2;
  let damage = 0;
  if (hits) {
    const { dmg, vs } = CALIBRES[calibre];
    for (let i = 0; i < hits; i += 1) damage += (dmg[0] + nextRandom(state) * (dmg[1] - dmg[0])) * vs[target.type];
    damage = Math.max(1, Math.round(damage));
    applyDamage(target, { hull: damage, propulsion: damage * 0.4, weapons: damage * 0.5, crew: damage * 0.35 });
  }
  const verb = main ? 'fires' : 'turns her secondaries';
  if (main || hits) {
    const result = hits ? `${hits} hit${hits > 1 ? 's' : ''}` : straddle ? 'straddling' : 'no hits';
    state = addLog(state, `${ship.name} ${verb} on ${target.name}: ${result}${crossingT ? ', crossing the T' : ''}.`, 'combat');
  }
  state = addFx(state, { type: 'salvo', shooterId: ship.id, targetId: target.id, shots, hits, damage, heavy: calibre === 'heavy', straddle, crossingT, smoke, fc: main ? fcLevel : undefined });
  if (hits && calibre === 'heavy' && target.flashRisk && isActive(target) && roll(state, 0.015 * hits)) {
    target.hull = 0;
    state = addLog(state, `${target.name}: a turret flash reaches the magazine. She blows up.`, 'loss');
    state = addFx(state, { type: 'magazine', targetId: target.id, heavy: true });
  }
  return resolveStatus(state, target);
}

function launchTorpedoes(state, ship, target) {
  const d = distance(ship, target);
  const eta = Math.max(1, Math.ceil(d / 2));
  // Aim where the target will be if she holds her course: a turn away spoils the solution.
  const [dq, dr] = DIRECTIONS[target.facing];
  const lead = Math.round((eta * target.speed) / 2);
  const aim = { q: clamp(target.q + dq * lead, 0, state.map.width - 1), r: clamp(target.r + dr * lead, 0, state.map.height - 1) };
  ship.torpedoes -= 1;
  ship.reloadUntil = state.tick + 3;
  ship.firedAt = state.tick;
  state.pending.push({ kind: 'torpedo', shipId: ship.id, targetId: target.id, side: ship.side, salvo: 1, deliverAt: state.tick + eta, q: ship.q, r: ship.r, aimQ: aim.q, aimR: aim.r });
  state = addLog(state, `${ship.name} fires a spread of torpedoes at ${target.name}.`, 'combat');
  return addFx(state, { type: 'torpedo', shooterId: ship.id, targetId: target.id, at: aim, eta });
}

export function torpedoRun(state, item) {
  const target = state.ships.find((s) => s.id === item.targetId);
  const aim = { q: item.aimQ, r: item.aimR };
  assertCoord(aim);
  if (!target || !isActive(target)) return state;
  const miss = distance(target, aim);
  const p = miss === 0 ? 0.45 : miss === 1 ? 0.2 : 0;
  if (!roll(state, p)) {
    state = addLog(state, `Torpedo tracks run wide of ${target.name}.`, 'defense');
    return addFx(state, { type: 'torpedo-miss', targetId: target.id, at: aim });
  }
  const damage = 18 + Math.floor(nextRandom(state) * 12);
  applyDamage(target, { hull: damage, propulsion: damage * 0.8, weapons: damage * 0.3, crew: damage * 0.4 });
  state = addLog(state, `${target.name} is struck by a torpedo.`, 'damage');
  state = addFx(state, { type: 'torpedo-hit', targetId: target.id, hits: 1, damage, heavy: true });
  return resolveStatus(state, target);
}
