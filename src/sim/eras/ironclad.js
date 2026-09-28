// Ironclad-era rules (c. 1850–1890): armour against shell, the ram, draught and
// shoal water, anchored wooden ships, fire aboard wooden hulls, flag signals
// obscured by gun smoke, and simultaneous (WEGO) fire resolution.
import {
  distance, isActive, addLog, addFx, applyDamage, resolveStatus, roll, nextRandom,
  directionToward, turnDistance, CONF_RANK,
} from '../core.js';
import { steamMove, headingTo, beamCourse, nearest } from './steam.js';

export const SHIP_TYPES = new Set(['ironclad', 'wooden']);
const SIGNATURES = new Set(['smoke', 'sail', 'low']);
const GUN_RANGE = 3;
// Hull multiplier by what the gun fires and what it hits. Shell shatters on iron but
// splinters and burns wood; solid shot is the (poor) answer to armour.
const ARMOUR = { ironclad: { shell: 0.08, shot: 0.16 }, wooden: { shell: 1.3, shot: 1 } };

export function validateShip(ship) {
  if (!SHIP_TYPES.has(ship.type)) throw new Error('Invalid ship type');
  if (!Number.isInteger(ship.speed) || ship.speed < 0 || ship.speed > 4) throw new Error('Invalid speed');
  if (!Number.isInteger(ship.battery) || ship.battery < 0) throw new Error('Invalid battery');
  if (ship.ammunition !== 'shell' && ship.ammunition !== 'shot') throw new Error('Invalid ammunition');
  if (ship.draft !== 'deep' && ship.draft !== 'shallow') throw new Error('Invalid draft');
  if (!SIGNATURES.has(ship.signature)) throw new Error('Invalid signature');
  for (const k of ['turret', 'ram', 'burning']) if (typeof ship[k] !== 'boolean') throw new Error(`Invalid ${k}`);
  if (!Number.isInteger(ship.value) || ship.value < 1) throw new Error('Invalid value');
  if (!Number.isInteger(ship.firedAt) || !Number.isInteger(ship.ramReadyAt)) throw new Error('Invalid firedAt/ramReadyAt');
}

// ---------- Signals ----------

// Flag hoists: the flagship's own orders are immediate-ish, others must read the flags,
// and gun smoke around the flagship makes that slower still.
export function orderDelay(state, ship) {
  const flag = state.ships.find((s) => s.side === ship.side && isActive(s));
  if (!flag || flag.id === ship.id) return 1;
  const smoke = flag.firedAt >= state.tick - 1 ? 1 : 0;
  return (distance(flag, ship) <= 4 ? 2 : 3) + smoke;
}

// ---------- Fire aboard ----------

export function beforeTick(state) {
  for (const ship of state.ships) {
    if (!isActive(ship) || !ship.burning) continue;
    applyDamage(ship, { hull: 3, propulsion: 0, weapons: 1, crew: 2 });
    if (roll(state, 0.18)) {
      ship.burning = false;
      state = addLog(state, `Fire aboard ${ship.name} is brought under control.`, 'damage');
    }
    state = resolveStatus(state, ship);
  }
  return state;
}

// ---------- Movement ----------

export function moveShip(state, ship, occupied, destination) {
  const prey = ramTarget(state, ship, 4);
  if (prey && distance(ship, prey) === 1) {
    // Alongside: swing the bow onto her instead of steaming past.
    const dir = directionToward(ship, prey);
    if (ship.facing !== dir && ship.speed > 0) ship.facing = (ship.facing + (((dir - ship.facing + 6) % 6) <= 3 ? 1 : 5)) % 6;
    return state;
  }
  return steamMove(state, ship, occupied, () => desiredFacing(state, ship, destination), ship.draft === 'shallow' ? 2 : 1);
}

function desiredFacing(state, ship, destination) {
  const fighting = ship.doctrine.roe === 'free' && ['engage', 'line', 'screen'].includes(ship.order.type);
  const prey = ramTarget(state, ship, 4);
  if (prey) return directionToward(ship, prey); // ram run: bow straight at her
  if (fighting) {
    const target = pickTarget(state, ship, ship.order.type === 'engage' ? GUN_RANGE + 3 : GUN_RANGE);
    if (target) {
      const preferred = Math.min(ship.doctrine.range, GUN_RANGE);
      if (!ship.turret) return beamCourse(ship, target, preferred);
      const d = distance(ship, target);
      const dir = directionToward(ship, target);
      return d > preferred ? dir : nearest(ship.facing, [(dir + 1) % 6, (dir + 5) % 6]); // a turret bears anywhere
    }
  }
  return headingTo(state, ship, destination);
}

// While the ram is recovering (backing off to build up way again) she fights with her guns.
function ramTarget(state, ship, maxRange) {
  if (!ship.ram || ship.order.type !== 'engage' || ship.doctrine.roe !== 'free' || ship.ramReadyAt > state.tick || ship.propulsion <= 0) return null;
  const target = pickTarget(state, ship, maxRange, (s) => s.type === 'wooden');
  const contact = target && state.contacts[ship.side].find((c) => c.targetId === target.id);
  return target && target.type === 'wooden' && contact && CONF_RANK[contact.confidence] >= CONF_RANK.classified ? target : null;
}

function pickTarget(state, ship, maxRange, prefer = null) {
  const options = (state.contacts[ship.side] || [])
    .filter((c) => !c.stale && distance(ship, c) <= maxRange)
    .map((c) => ({ c, s: state.ships.find((x) => x.id === c.targetId) }))
    .filter(({ s }) => s && isActive(s));
  const known = (x) => CONF_RANK[x.c.confidence] >= CONF_RANK.classified;
  const rank = (x) => distance(ship, x.c) + (prefer && known(x) && !prefer(x.s) ? 5 : 0);
  return options.sort((a, b) => rank(a) - rank(b) || (a.s.id < b.s.id ? -1 : 1))[0]?.s || null;
}

// ---------- Detection ----------

export function detection(observer, enemy, state) {
  const d = distance(observer, enemy);
  const [ident, cls, sight] = enemy.signature === 'low' ? [2, 3, 6] : enemy.signature === 'sail' ? [3, 6, 8] : [3, 6, 9];
  if (d <= ident) return { confidence: 'identified', range: d };
  if (d <= cls) return { confidence: 'classified', range: d };
  if (d <= sight) return { confidence: 'sighted', range: d };
  if (enemy.firedAt >= 0 && enemy.firedAt >= state.tick - 1 && d <= 10) return { confidence: 'sighted', range: d }; // gun smoke
  return null;
}

// ---------- Combat ----------

// Simultaneous resolution: every ship chooses and rolls against the same picture,
// then all damage lands together. A ship sunk this turn still gets her broadside off.
export function combat(state) {
  const blows = [];
  for (const ship of state.ships) {
    if (!isActive(ship) || ship.doctrine.roe === 'hold' || ship.order.type === 'withdraw') continue;
    const prey = ramTarget(state, ship, 1);
    if (prey && directionToward(ship, prey) === ship.facing) {
      ship.ramReadyAt = state.tick + 4; // back engines, draw off, build up way again
      blows.push(ramBlow(state, ship, prey));
    }
    if (ship.reloadUntil > state.tick || ship.battery === 0 || ship.weapons <= 10) continue;
    const target = pickTarget(state, ship, Math.min(ship.doctrine.range + 1, GUN_RANGE));
    if (!target) continue;
    const rel = (directionToward(ship, target) - ship.facing + 6) % 6;
    if (!ship.turret && (rel === 0 || rel === 3)) continue; // broadside guns cannot bear ahead or astern
    ship.reloadUntil = state.tick + (ship.turret ? 3 : 2);
    ship.firedAt = state.tick;
    const d = distance(ship, target);
    const quality = (ship.weapons / 100) * (0.4 + 0.6 * (ship.crew / 100));
    const raw = ship.battery * (0.6 + nextRandom(state) * 0.8) * (d <= 1 ? 1.25 : d === 2 ? 1 : 0.7) * quality;
    const raking = !target.turret && (((directionToward(target, ship) - target.facing + 6) % 6) % 3 === 0);
    blows.push({ kind: 'gun', ship, target, raw: raking ? raw * 1.3 : raw, raking, fire: target.type === 'wooden' && ship.ammunition === 'shell' && roll(state, 0.22) });
  }
  for (const blow of blows) state = land(state, blow);
  for (const s of new Set(blows.flatMap((b) => (b.kind === 'ram' ? [b.target, b.ship] : [b.target])))) if (s.status === 'active') state = resolveStatus(state, s);
  return state;
}

function ramBlow(state, ship, target) {
  const theirRel = (directionToward(target, ship) - target.facing + 6) % 6;
  const beamOn = theirRel % 3 !== 0;
  const raw = (beamOn ? 48 : 18) + nextRandom(state) * 12;
  const lost = beamOn && target.type === 'wooden' && roll(state, 0.45);
  return { kind: 'ram', ship, target, raw, beamOn, lost };
}

function land(state, blow) {
  const { ship, target } = blow;
  if (blow.kind === 'ram') {
    const hull = Math.round(blow.raw * (target.type === 'ironclad' ? 0.25 : 1));
    applyDamage(target, { hull, propulsion: hull * 0.4, weapons: hull * 0.2, crew: hull * 0.3 });
    applyDamage(ship, { hull: 2, propulsion: 8, weapons: 0, crew: 3 });
    state = addLog(state, `${ship.name} rams ${target.name}${blow.beamOn ? ' squarely amidships' : ', a glancing blow'}.`, 'combat');
    state = addFx(state, { type: 'ram', shooterId: ship.id, targetId: target.id, hits: 1, damage: hull, heavy: blow.beamOn });
    if (blow.lost) {
      ship.ram = false;
      state = addLog(state, `${ship.name}'s ram is wrenched off in ${target.name}'s side.`, 'damage', [ship.side]);
    }
    return state;
  }
  if (target.hull === 0) return state; // already going down under someone else's fire this turn
  const iron = target.type === 'ironclad';
  const hull = Math.max(1, Math.round(blow.raw * ARMOUR[target.type][ship.ammunition]));
  const soft = iron ? 0.45 : 1; // shot still wrecks funnels, gun ports and the men behind them
  applyDamage(target, { hull, propulsion: blow.raw * 0.3 * soft, weapons: blow.raw * 0.35 * soft, crew: blow.raw * 0.35 * (iron ? 0.4 : 1) });
  const bounce = iron && hull <= 2;
  state = addLog(state, `${ship.name} fires ${ship.turret ? 'her turret' : 'a broadside'} at ${target.name}${blow.raking ? ', raking her' : ''}${bounce ? '; the shot glances off her armour' : ''}.`, 'combat');
  state = addFx(state, { type: 'broadside', shooterId: ship.id, targetId: target.id, hits: bounce ? 0 : 1, shots: 2, damage: hull, heavy: hull >= 10, straddle: bounce });
  if (blow.fire && !target.burning && isActive(target)) {
    target.burning = true;
    state = addLog(state, `${target.name} is on fire.`, 'damage');
    state = addFx(state, { type: 'fire', targetId: target.id });
  }
  return state;
}
