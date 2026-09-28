// Steam-era movement shared by the ironclad and dreadnought rule modules: speed in
// half-hexes per tick, limited turn rate, draught vs shoals, captains avoiding
// declared minefields. Each era supplies its own desired-heading logic.
import { DIRECTIONS, distance, isActive, addLog, addFx, applyDamage, resolveStatus, roll, terrainAt, directionToward, turnDistance, inBounds, key } from '../core.js';

// Speed is in half-hexes per tick, so a 3 steams 1, 2, 1, 2… hexes.
export function movesThisTick(state, ship) {
  if (ship.speed === 0) return 0; // at anchor
  let speed = ship.speed;
  if (ship.propulsion < 50) speed -= 1;
  if (ship.propulsion <= 15) speed = Math.min(speed, 1);
  speed = Math.max(1, speed);
  return Math.floor((state.tick * speed) / 2) - Math.floor(((state.tick - 1) * speed) / 2);
}

export function steamMove(state, ship, occupied, desiredFacing, turnRate = 1) {
  const moves = movesThisTick(state, ship);
  for (let i = 0; i < moves; i += 1) {
    const desired = desiredFacing();
    if (desired === null) break;
    const options = [0, 1, 5, 2, 4, 3]
      .map((offset) => (desired + offset) % 6)
      .filter((f) => turnDistance(ship.facing, f) <= turnRate)
      .sort((a, b) => turnDistance(a, desired) - turnDistance(b, desired) || turnDistance(ship.facing, a) - turnDistance(ship.facing, b));
    // Captains keep clear of declared minefields unless the admiral explicitly routes them through.
    const clear = (f) => passable(state, ahead(ship, f), occupied, ship) && (ship.order.type === 'proceed' || terrainAt(state, ship.q + DIRECTIONS[f][0], ship.r + DIRECTIONS[f][1]) !== 'mines');
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
  return state;
}

// Keep the enemy abeam so every turret bears: close obliquely when too far, open when too close.
export function beamCourse(ship, target, preferred) {
  const dir = directionToward(ship, target);
  const d = distance(ship, target);
  if (d > preferred + 2) return dir;
  if (d > preferred) return nearest(ship.facing, [(dir + 1) % 6, (dir + 5) % 6]);
  if (d >= preferred - 1) return nearest(ship.facing, [(dir + 1) % 6, (dir + 5) % 6, (dir + 2) % 6, (dir + 4) % 6]);
  return nearest(ship.facing, [(dir + 2) % 6, (dir + 4) % 6]);
}

export function nearest(current, facings) {
  return [...facings].sort((a, b) => turnDistance(current, a) - turnDistance(current, b))[0];
}

export function ahead(ship, facing) {
  const [dq, dr] = DIRECTIONS[facing];
  return { q: ship.q + dq, r: ship.r + dr };
}

// Deep-draught ships treat shoals like land; shallow-draught ships cross them.
export function passable(state, c, occupied, ship = null) {
  if (!inBounds(c) || occupied.has(key(c.q, c.r))) return false;
  const t = terrainAt(state, c.q, c.r);
  return t !== 'land' && !(t === 'shoal' && ship?.draft === 'deep');
}

// Best heading toward a destination, steering around minefields and water too shallow for this hull.
export function headingTo(state, ship, destination) {
  if (!destination || distance(ship, destination) === 0) return null;
  let best = null;
  for (let f = 0; f < 6; f += 1) {
    const c = ahead(ship, f);
    if (!inBounds(c)) continue;
    const t = terrainAt(state, c.q, c.r);
    if (t === 'land' || (t === 'shoal' && ship.draft === 'deep')) continue;
    const score = distance(c, destination) * 10 + turnDistance(ship.facing, f) + (t === 'mines' ? 25 : 0);
    if (!best || score < best.score) best = { f, score };
  }
  return best ? best.f : null;
}

