import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  deserialize,
  getView,
  issueOrder,
  planCaptainAction,
  releaseCommand,
  serialize,
  setDoctrine,
  step,
  takeCommand,
} from '../src/sim/engine.js';
import { contactId } from '../src/sim/core.js';
import * as dreadnought from '../src/sim/eras/dreadnought.js';

const ship = (state, id) => state.ships.find((s) => s.id === id);
const contactFor = (state, side, targetId) => contactId(state, side, targetId);
const closeNevis = () => {
  let state = createGame('nevis', 12);
  ship(state, 'b_constellation').q = 7; ship(state, 'b_constellation').r = 6; ship(state, 'b_constellation').facing = 0;
  ship(state, 'r_insurgente').q = 9; ship(state, 'r_insurgente').r = 6; ship(state, 'r_insurgente').facing = 3;
  return step(state); // refresh contacts
};

const closeDogger = () => {
  let state = createGame('dogger', 8);
  ship(state, 'b_lion').q = 8; ship(state, 'b_lion').r = 5; ship(state, 'b_lion').facing = 0;
  ship(state, 'r_seydlitz').q = 12; ship(state, 'r_seydlitz').r = 5; ship(state, 'r_seydlitz').facing = 3;
  return step(state);
};

test('take command is immutable, private to the side view, and cancels only that ship pending orders', () => {
  const initial = createGame('nevis', 4);
  const ordered = issueOrder(initial, ['b_constellation', 'b_baltimore'], { type: 'hold' });
  const commanded = takeCommand(ordered, 'blue', 'b_constellation');
  assert.equal(ordered.captainControl, undefined);
  assert.equal(commanded.pending.some((p) => p.shipId === 'b_constellation'), false);
  assert.equal(commanded.pending.some((p) => p.shipId === 'b_baltimore'), true);
  assert.equal(getView(commanded, 'blue').captainControl.shipId, 'b_constellation');
  assert.equal(getView(commanded, 'red').captainControl, undefined);
  assert.ok(getView(commanded, 'blue').captainOptions.helm.some((o) => o.id === 'ahead'));
});

test('planning stages a one-turn sail captain action without moving or firing until step', () => {
  let state = closeNevis();
  state = takeCommand(state, 'blue', 'b_constellation');
  const before = serialize(state);
  const contactId = contactFor(state, 'blue', 'r_insurgente');
  const beforeFacing = ship(state, 'b_constellation').facing;
  ship(state, 'b_constellation').reloadUntil = state.tick;
  const planned = planCaptainAction(state, 'blue', { helm: 'port', targetId: contactId, weapon: 'hold' });
  assert.equal(ship(planned, 'b_constellation').facing, beforeFacing);
  assert.equal(ship(planned, 'r_insurgente').hull, ship(state, 'r_insurgente').hull);
  assert.notEqual(serialize(planned), before, 'only the plan/report changes');
  const resolved = step(planned);
  assert.equal(ship(resolved, 'b_constellation').facing, (beforeFacing + 5) % 6);
  assert.deepEqual(resolved.captainControl.plan, { helm: 'hold', targetId: null, weapon: 'hold' });
  const once = step(resolved);
  assert.equal(ship(once, 'b_constellation').reloadUntil, ship(resolved, 'b_constellation').reloadUntil, 'held plan does not fire again');
});

test('manual ship ignores fleet orders and auto fire while other ships keep AI doctrine', () => {
  let state = closeNevis();
  state = takeCommand(state, 'blue', 'b_constellation');
  state = issueOrder(state, ['b_constellation', 'b_baltimore'], { type: 'hold' });
  assert.notEqual(ship(state, 'b_constellation').order.type, 'hold');
  assert.ok(state.pending.some((p) => p.shipId === 'b_baltimore'));
  const beforeReload = ship(state, 'b_constellation').reloadUntil;
  state = step(state);
  assert.equal(ship(state, 'b_constellation').reloadUntil, beforeReload, 'manual ship did not auto broadside');
  assert.ok(ship(state, 'b_baltimore'), 'other AI ship remains in simulation');
});

test('captain target validation accepts only public hostile contacts, not hidden internal ids', () => {
  let state = closeNevis();
  state = takeCommand(state, 'blue', 'b_constellation');
  const planned = planCaptainAction(state, 'blue', { targetId: 'r_insurgente', weapon: 'guns' });
  assert.equal(planned.captainControl.plan.targetId, null);
  const valid = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  assert.equal(valid.captainControl.plan.targetId, contactFor(state, 'blue', 'r_insurgente'));
  assert.equal(getView(valid, 'blue').contacts.some((c) => c.targetId), false);
});

test('hold-fire doctrine blocks explicit manual fire', () => {
  let state = closeNevis();
  state = setDoctrine(state, 'b_constellation', { roe: 'hold' });
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  const before = ship(state, 'r_insurgente').hull;
  state = step(state);
  assert.equal(ship(state, 'r_insurgente').hull, before);
  assert.match(state.captainControl.report, /hold-fire/i);
});

test('dreadnought take command fires guns explicitly and exposes no hidden ids', () => {
  let state = closeDogger();
  state = takeCommand(state, 'blue', 'b_lion');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_seydlitz'), weapon: 'guns' });
  const before = ship(state, 'r_seydlitz').hull;
  state = step(state);
  assert.ok(ship(state, 'r_seydlitz').hull <= before);
  assert.deepEqual(state.captainControl.plan, { helm: 'hold', targetId: null, weapon: 'hold' });
  for (const fx of getView(state, 'blue').fx) for (const ref of [fx.from, fx.to]) if (ref && !ref.own) assert.match(ref.id, /^c_blue_/);
});

test('captain control survives save/load and old saves still load; malformed controls are rejected', () => {
  let state = takeCommand(createGame('dogger', 2), 'blue', 'b_lion');
  const loaded = deserialize(serialize(state));
  assert.equal(loaded.captainControl.shipId, 'b_lion');
  const old = JSON.parse(serialize(createGame('nevis', 2)));
  assert.equal(deserialize(JSON.stringify(old)).captainControl, undefined);
  const bad = JSON.parse(serialize(state));
  bad.captainControl.plan.targetId = 'r_seydlitz';
  assert.throws(() => deserialize(JSON.stringify(bad)), /captain target/);
});

test('release restores doctrine control and terminal captain APIs do not mutate', () => {
  let state = takeCommand(createGame('nevis', 9), 'blue', 'b_constellation');
  state = releaseCommand(state, 'blue');
  assert.equal(state.captainControl, undefined);
  state = issueOrder(state, 'b_constellation', { type: 'hold' });
  assert.ok(state.pending.some((p) => p.shipId === 'b_constellation'));
  let terminal = createGame('nevis', 1);
  terminal.outcome = { result: 'draw', title: 'Done', summary: 'Done.' };
  assert.equal(serialize(takeCommand(terminal, 'blue', 'b_constellation')), serialize(terminal));
  assert.equal(serialize(planCaptainAction(terminal, 'blue', { helm: 'ahead' })), serialize(terminal));
  assert.equal(serialize(releaseCommand(terminal, 'blue')), serialize(terminal));
});

test('planning does not overwrite last resolution report; summary carries staged choices', () => {
  let state = takeCommand(createGame('nevis', 3), 'blue', 'b_constellation');
  assert.equal(state.captainControl.report, undefined);
  state = planCaptainAction(state, 'blue', { helm: 'starboard' });
  assert.equal(state.captainControl.report, undefined);
  assert.match(getView(state, 'blue').captainOptions.summary, /come starboard/i);
});

test('squadron AI continues to move while the commanded ship holds station', () => {
  let state = createGame('nevis', 6);
  const start = { q: ship(state, 'b_baltimore').q, r: ship(state, 'b_baltimore').r };
  state = takeCommand(state, 'blue', 'b_constellation');
  for (let i = 0; i < 4; i += 1) state = step(state);
  assert.notDeepEqual({ q: ship(state, 'b_baltimore').q, r: ship(state, 'b_baltimore').r }, start);
});

test('successful dreadnought manual gunfire produces a public salvo effect from the commanded ship', () => {
  let state = closeDogger();
  state = takeCommand(state, 'blue', 'b_lion');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_seydlitz'), weapon: 'guns' });
  state = step(state);
  const salvo = getView(state, 'blue').fx.find((f) => f.type === 'salvo' && f.from?.id === 'b_lion');
  assert.ok(salvo, 'manual gunfire emits the ordinary salvo fx');
});

test('red captain control uses red public contacts and rejects blue-owned contact ids', () => {
  let state = closeDogger();
  state = takeCommand(state, 'red', 'r_seydlitz');
  assert.equal(getView(state, 'blue').captainControl, undefined);
  assert.equal(getView(state, 'red').captainControl.shipId, 'r_seydlitz');
  state = planCaptainAction(state, 'red', { targetId: contactFor(state, 'blue', 'b_lion'), weapon: 'guns' });
  assert.equal(state.captainControl.plan.targetId, null);
  state = planCaptainAction(state, 'red', { targetId: contactFor(state, 'red', 'b_lion'), weapon: 'guns' });
  assert.equal(state.captainControl.plan.targetId, contactFor(state, 'red', 'b_lion'));
});

test('transferring command clears the prior ship staged action without changing its standing doctrine', () => {
  let state = createGame('nevis', 10);
  const beforeOrder = structuredClone(ship(state, 'b_constellation').order);
  const beforeFacing = ship(state, 'b_constellation').facing;
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'starboard' });
  state = takeCommand(state, 'blue', 'b_baltimore');
  assert.equal(state.captainControl.shipId, 'b_baltimore');
  state = step(state);
  assert.deepEqual(ship(state, 'b_constellation').order, beforeOrder);
  assert.notEqual(ship(state, 'b_constellation').facing, (beforeFacing + 1) % 6, 'old staged helm did not get a free extra turn');
});

test('malformed captain action patches are ignored and malformed saved plans are rejected', () => {
  let state = takeCommand(createGame('nevis', 2), 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'teleport', weapon: 'laser', targetId: 42 });
  assert.deepEqual(state.captainControl.plan, { helm: 'hold', targetId: null, weapon: 'hold' });
  const bad = JSON.parse(serialize(state));
  bad.captainControl.plan.helm = 'teleport';
  assert.throws(() => deserialize(JSON.stringify(bad)), /captain plan/);
});

test('manual broadside cooldown prevents repeated fire on the next turn', () => {
  let state = closeNevis();
  ship(state, 'b_constellation').reloadUntil = state.tick;
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  state = step(state);
  const afterFirst = ship(state, 'r_insurgente').hull;
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  state = step(state);
  assert.equal(ship(state, 'r_insurgente').hull, afterFirst);
  assert.match(state.captainControl.report, /not reloaded/i);
});

test('a once-valid but now stale captain target is safely withheld at execution', () => {
  let state = closeNevis();
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  ship(state, 'r_insurgente').status = 'sunk';
  ship(state, 'r_insurgente').hull = 0;
  state = step(state);
  assert.match(state.captainControl.report, /stale|not hostile/i);
});

test('sail captain helm respects wind and terrain blockers', () => {
  let state = createGame('nevis', 1);
  ship(state, 'b_constellation').facing = state.wind;
  const start = { q: ship(state, 'b_constellation').q, r: ship(state, 'b_constellation').r };
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'ahead' });
  assert.equal(getView(state, 'blue').captainOptions.helm.find((o) => o.id === 'ahead').enabled, false);
  state = step(state);
  assert.deepEqual({ q: ship(state, 'b_constellation').q, r: ship(state, 'b_constellation').r }, start);
});

test('dreadnought captain ahead obeys steam move budget and can suffer ordinary mine damage', () => {
  let limited = createGame('dogger', 1);
  ship(limited, 'b_orion').speed = 1;
  limited = takeCommand(limited, 'blue', 'b_orion');
  limited = planCaptainAction(limited, 'blue', { helm: 'ahead' });
  limited = step(limited);
  assert.equal(ship(limited, 'b_orion').q, 2, 'speed-1 ship has no move budget on tick 1');

  let mined = createGame('dogger', 1);
  const dd = ship(mined, 'b_meteor');
  dd.q = 7; dd.r = 12; dd.facing = 0; dd.speed = 4;
  mined.rng = 0;
  mined = takeCommand(mined, 'blue', 'b_meteor');
  mined = planCaptainAction(mined, 'blue', { helm: 'ahead' });
  mined = step(mined);
  assert.ok(ship(mined, 'b_meteor').hull < 100 || mined.fx.some((e) => e.blue?.type === 'mine'));
});

test('sail options mark torpedoes unsupported and ahead reason previews ahead regardless of active helm', () => {
  let state = createGame('nevis', 1);
  ship(state, 'b_constellation').facing = (state.wind + 2) % 6;
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'hold' });
  const options = getView(state, 'blue').captainOptions;
  assert.match(options.weapons.find((o) => o.id === 'torpedoes').reason, /not fitted/i);
  assert.notEqual(options.helm.find((o) => o.id === 'ahead').reason, 'Hold station.');
});

test('captain option summary labels targets from public contact reports, not hidden truth names', () => {
  let state = closeDogger();
  const redContact = state.contacts.blue.find((c) => c.targetId === 'r_seydlitz');
  delete redContact.name;
  redContact.confidence = 'classified';
  redContact.className = 'Battlecruiser';
  state = takeCommand(state, 'blue', 'b_lion');
  state = planCaptainAction(state, 'blue', { targetId: redContact.id, weapon: 'guns' });
  const summary = getView(state, 'blue').captainOptions.summary;
  assert.match(summary, /Battlecruiser/);
  assert.doesNotMatch(summary, /Seydlitz/);
});

test('captain options forecast next turn reload and movement timing', () => {
  let sail = closeNevis();
  ship(sail, 'b_constellation').reloadUntil = sail.tick + 1;
  sail = takeCommand(sail, 'blue', 'b_constellation');
  sail = planCaptainAction(sail, 'blue', { targetId: contactFor(sail, 'blue', 'r_insurgente'), weapon: 'guns' });
  assert.equal(getView(sail, 'blue').captainOptions.weapons.find((o) => o.id === 'guns').enabled, true, 'reload ready exactly on resolving turn');

  let dread = createGame('dogger', 1);
  dread = step(dread); // preview resolves on tick 2, where a speed-4 destroyer moves two hexes
  const startQ = ship(dread, 'b_meteor').q;
  dread = takeCommand(dread, 'blue', 'b_meteor');
  dread = planCaptainAction(dread, 'blue', { helm: 'ahead' });
  const options = getView(dread, 'blue').captainOptions;
  assert.match(options.summary, new RegExp(`Preview ${startQ + 2},3`));
});

test('captain summary does not duplicate last resolution report', () => {
  let state = closeNevis();
  ship(state, 'b_constellation').reloadUntil = state.tick;
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  state = step(state);
  assert.match(state.captainControl.report, /broadside fired/i);
  assert.doesNotMatch(getView(state, 'blue').captainOptions.summary, /broadside fired/i);
});

test('dreadnought weapon options mirror manual ROE and damage gates', () => {
  let state = closeDogger();
  state = setDoctrine(state, 'b_lion', { roe: 'hold' });
  state = takeCommand(state, 'blue', 'b_lion');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_seydlitz'), weapon: 'guns' });
  let options = getView(state, 'blue').captainOptions;
  assert.equal(options.weapons.find((o) => o.id === 'guns').enabled, false);
  assert.match(options.weapons.find((o) => o.id === 'guns').reason, /Hold-fire/);
  assert.equal(options.weapons.find((o) => o.id === 'torpedoes').enabled, false);
  state = setDoctrine(releaseCommand(state, 'blue'), 'b_lion', { roe: 'free' });
  ship(state, 'b_lion').weapons = 5;
  state = takeCommand(state, 'blue', 'b_lion');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_seydlitz'), weapon: 'guns' });
  options = getView(state, 'blue').captainOptions;
  assert.match(options.weapons.find((o) => o.id === 'guns').reason, /Weapons too damaged/);
});

test('torpedo readiness does not reveal hidden target type before classification', () => {
  let state = closeDogger();
  const dd = state.contacts.blue.find((c) => c.targetId === 'r_v186');
  dd.confidence = 'sighted';
  delete dd.className;
  state = takeCommand(state, 'blue', 'b_meteor');
  state = planCaptainAction(state, 'blue', { targetId: dd.id, weapon: 'torpedoes' });
  const reason = getView(state, 'blue').captainOptions.weapons.find((o) => o.id === 'torpedoes').reason;
  assert.match(reason, /Classification required/);
  assert.doesNotMatch(reason, /capital|destroyer|torpedo boat/i);
});

test('manual port and starboard do not invent a dreadnought fire-control penalty', () => {
  let state = takeCommand(createGame('dogger', 2), 'blue', 'b_lion');
  ship(state, 'b_lion').fc = { targetId: 'r_seydlitz', level: 3 };
  state = planCaptainAction(state, 'blue', { helm: 'starboard' });
  state = step(state);
  assert.equal(ship(state, 'b_lion').fc.level, 3);
});

test('dreadnought manual helm turns obey steam move budget at speed one', () => {
  let state = createGame('dogger', 3);
  ship(state, 'b_lion').speed = 1;
  const startFacing = ship(state, 'b_lion').facing;
  state = takeCommand(state, 'blue', 'b_lion');
  state = planCaptainAction(state, 'blue', { helm: 'starboard' });
  const option = getView(state, 'blue').captainOptions.helm.find((o) => o.id === 'starboard');
  assert.equal(option.enabled, false);
  assert.match(option.reason, /next turn/i);
  state = step(state);
  assert.equal(ship(state, 'b_lion').facing, startFacing);
  assert.match(state.captainControl.report, /no effect|speed/i);
});

test('saved captain control rejects inactive, terminal, and arbitrary fake contact ids', () => {
  const badInactive = JSON.parse(serialize(takeCommand(createGame('nevis', 2), 'blue', 'b_constellation')));
  badInactive.ships.find((s) => s.id === 'b_constellation').status = 'sunk';
  badInactive.ships.find((s) => s.id === 'b_constellation').hull = 0;
  assert.throws(() => deserialize(JSON.stringify(badInactive)), /captain control/);

  const badTerminal = JSON.parse(serialize(takeCommand(createGame('nevis', 2), 'blue', 'b_constellation')));
  badTerminal.outcome = { result: 'draw', title: 'Done', summary: 'Done.' };
  assert.throws(() => deserialize(JSON.stringify(badTerminal)), /captain control/);

  const badFake = JSON.parse(serialize(takeCommand(createGame('dogger', 2), 'blue', 'b_lion')));
  badFake.captainControl.plan.targetId = 'c_blue_fake';
  assert.throws(() => deserialize(JSON.stringify(badFake)), /captain target/);
});

test('saved captain target permits real historical contact ids even after target loss', () => {
  const state = takeCommand(createGame('dogger', 2), 'blue', 'b_lion');
  const saved = JSON.parse(serialize(state));
  saved.ships.find((s) => s.id === 'r_seydlitz').status = 'sunk';
  saved.ships.find((s) => s.id === 'r_seydlitz').hull = 0;
  saved.captainControl.plan.targetId = contactFor(state, 'blue', 'r_seydlitz');
  const loaded = deserialize(JSON.stringify(saved));
  assert.equal(loaded.captainControl.plan.targetId, contactFor(state, 'blue', 'r_seydlitz'));
});

test('manual torpedo execution withholds unclassified true target type', () => {
  const state = closeDogger();
  const shooter = ship(state, 'b_meteor');
  const target = ship(state, 'r_seydlitz');
  shooter.q = 10; shooter.r = 5; shooter.reloadUntil = state.tick; shooter.torpedoes = 1;
  const result = dreadnought.manualFire(state, shooter, target, 'torpedoes', null);
  assert.match(result.report, /Classification required/);
  assert.doesNotMatch(result.report, /capital|destroyer|Seydlitz|worth/i);
});

test('manual mine loss clears captain control before the returned state is reused', () => {
  let state = createGame('dogger', 1);
  const dd = ship(state, 'b_meteor');
  dd.q = 7; dd.r = 12; dd.facing = 0; dd.speed = 4; dd.hull = 20; dd.crew = 20;
  state.rng = 0;
  state = takeCommand(state, 'blue', 'b_meteor');
  state = planCaptainAction(state, 'blue', { helm: 'ahead' });
  state = step(state);
  assert.equal(ship(state, 'b_meteor').status === 'active' ? state.captainControl?.shipId : state.captainControl, undefined);
  assert.doesNotThrow(() => getView(state, 'blue'));
  assert.doesNotThrow(() => step(state));
});

test('manual sail broadside in the same slot matches automatic damage cooldown and rng', () => {
  const base = closeNevis();
  for (const s of base.ships) {
    s.order = { type: 'hold' };
    s.doctrine = { ...s.doctrine, roe: s.id === 'b_constellation' ? 'free' : 'hold' };
    s.reloadUntil = base.tick;
  }
  const auto = step(structuredClone(base));
  let manual = takeCommand(structuredClone(base), 'blue', 'b_constellation');
  manual = planCaptainAction(manual, 'blue', { targetId: contactFor(manual, 'blue', 'r_insurgente'), weapon: 'guns' });
  manual = step(manual);
  for (const id of ['r_insurgente', 'b_constellation']) {
    assert.equal(ship(manual, id).hull, ship(auto, id).hull, `${id} hull`);
    assert.equal(ship(manual, id).reloadUntil, ship(auto, id).reloadUntil, `${id} reload`);
  }
  assert.equal(manual.rng, auto.rng);
});

test('manual sail combat log resolves in the commanded ship normal initiative slot', () => {
  let state = closeNevis();
  for (const s of state.ships) {
    s.order = { type: 'hold' };
    s.doctrine = { ...s.doctrine, roe: s.side === 'blue' ? 'free' : 'hold' };
    s.reloadUntil = state.tick;
  }
  ship(state, 'b_baltimore').q = 8; ship(state, 'b_baltimore').r = 7; ship(state, 'b_baltimore').facing = 0;
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  const logStart = state.log.length;
  state = step(state);
  const newCombat = state.log.slice(logStart).filter((e) => e.kind === 'combat').map((e) => e.text);
  const manualIndex = newCombat.findIndex((text) => text.includes('USS Constellation fires a broadside'));
  const autoIndex = newCombat.findIndex((text) => text.includes('USS Baltimore fires a broadside'));
  assert.ok(manualIndex >= 0 && autoIndex >= 0, newCombat.join('\n'));
  assert.ok(manualIndex < autoIndex, newCombat.join('\n'));
});

test('captain report aggregates helm and weapon resolution', () => {
  let state = closeNevis();
  ship(state, 'b_constellation').reloadUntil = state.tick;
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'starboard', targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  state = step(state);
  assert.match(state.captainControl.report, /helm starboard/i);
  assert.match(state.captainControl.report, /broadside fired/i);
});

test('captain ahead preview warns on declared minefield risk while staying enabled', () => {
  let state = createGame('dogger', 1);
  const dd = ship(state, 'b_meteor');
  dd.q = 7; dd.r = 12; dd.facing = 0; dd.speed = 4;
  state = takeCommand(state, 'blue', 'b_meteor');
  const ahead = getView(state, 'blue').captainOptions.helm.find((o) => o.id === 'ahead');
  assert.equal(ahead.enabled, true);
  assert.match(ahead.reason, /mines/i);
});
