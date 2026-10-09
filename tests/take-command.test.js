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
const option = (state, group, id, side = 'blue') => getView(state, side).captainOptions[group].find((o) => o.id === id);
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

// Two frigates alone at a set range and bearing, both holding position, for gunnery tests.
const sailDuel = ({ shooterFacing = 0, targetFacing = 0, at = { q: 8, r: 7 } } = {}) => {
  let state = createGame('nevis', 5);
  for (const s of state.ships) { s.order = { type: 'hold' }; s.doctrine = { ...s.doctrine, roe: 'hold' }; }
  Object.assign(ship(state, 'b_constellation'), { q: 8, r: 6, facing: shooterFacing });
  Object.assign(ship(state, 'r_insurgente'), at, { facing: targetFacing });
  ship(state, 'b_baltimore').q = 1; ship(state, 'b_baltimore').r = 12;
  ship(state, 'r_volontaire').q = 18; ship(state, 'r_volontaire').r = 1;
  state = step(state); // refresh contacts with every gun silent
  const me = ship(state, 'b_constellation');
  me.doctrine = { ...me.doctrine, roe: 'free' };
  me.reloadUntil = state.tick;
  return state;
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

test('taking command and changing nothing plays out exactly as her captain would', () => {
  for (const [scenario, id] of [['nevis', 'b_constellation'], ['line', 'b_bellerophon'], ['dogger', 'b_lion'], ['dogger', 'b_meteor']]) {
    for (const seed of [1, 7, 23]) {
      let doctrine = createGame(scenario, seed);
      let commanded = takeCommand(createGame(scenario, seed), 'blue', id);
      assert.deepEqual(commanded.captainControl.plan, { helm: 'captain', targetId: null, weapon: 'guns', shot: 'round' });
      while (!doctrine.outcome) { doctrine = step(doctrine); commanded = step(commanded); }
      assert.deepEqual(commanded.ships, doctrine.ships, `${scenario} seed ${seed}`);
      assert.deepEqual(commanded.outcome, doctrine.outcome);
    }
  }
});

test('planning stages a sail captain action without moving or firing until step', () => {
  let state = closeNevis();
  state = takeCommand(state, 'blue', 'b_constellation');
  const before = serialize(state);
  const target = contactFor(state, 'blue', 'r_insurgente');
  const beforeFacing = ship(state, 'b_constellation').facing;
  const planned = planCaptainAction(state, 'blue', { helm: 'port', targetId: target, weapon: 'hold' });
  assert.equal(ship(planned, 'b_constellation').facing, beforeFacing);
  assert.equal(ship(planned, 'r_insurgente').hull, ship(state, 'r_insurgente').hull);
  assert.notEqual(serialize(planned), before, 'only the plan changes');
  const resolved = step(planned);
  assert.equal(ship(resolved, 'b_constellation').facing, (beforeFacing + 5) % 6);
  assert.deepEqual(resolved.captainControl.plan, { helm: 'ahead', targetId: target, weapon: 'hold', shot: 'round' }, 'the helm returns amidships; the rest of the intent stands');
});

test('standing intent carries on: designated fire continues each reload without new clicks', () => {
  let state = sailDuel();
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'hold', targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  const hulls = [ship(state, 'r_insurgente').hull];
  for (let i = 0; i < 4; i += 1) { state = step(state); hulls.push(ship(state, 'r_insurgente').hull); }
  const drops = hulls.slice(1).map((h, i) => hulls[i] - h);
  assert.deepEqual(drops.map((d) => d > 0), [true, false, true, false], 'fires, reloads, fires again');
  assert.equal(state.captainControl.plan.helm, 'hold', 'heave-to persists');
});

test('a designated target that leaves the plot is dropped with a report', () => {
  let state = closeNevis();
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  ship(state, 'r_insurgente').status = 'sunk';
  ship(state, 'r_insurgente').hull = 0;
  state = step(state);
  assert.equal(state.captainControl.plan.targetId, null);
  assert.match(state.captainControl.report, /off the plot|stale/i);
});

test('manual ship ignores fleet orders while other ships keep AI doctrine', () => {
  let state = closeNevis();
  state = takeCommand(state, 'blue', 'b_constellation');
  state = issueOrder(state, ['b_constellation', 'b_baltimore'], { type: 'hold' });
  assert.notEqual(ship(state, 'b_constellation').order.type, 'hold');
  assert.ok(state.pending.some((p) => p.shipId === 'b_baltimore'));
  state = planCaptainAction(state, 'blue', { weapon: 'hold' });
  const beforeReload = ship(state, 'b_constellation').reloadUntil;
  state = step(state);
  assert.equal(ship(state, 'b_constellation').reloadUntil, beforeReload, 'hold fire is obeyed');
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

test('hold-fire doctrine blocks manual fire', () => {
  let state = closeNevis();
  state = setDoctrine(state, 'b_constellation', { roe: 'hold' });
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  assert.equal(option(state, 'weapons', 'guns').enabled, false);
  const before = ship(state, 'r_insurgente').hull;
  state = step(state);
  assert.equal(ship(state, 'r_insurgente').hull, before);
  assert.match(state.captainControl.report, /hold-fire/i);
});

test('dreadnought take command fires guns on the designated target and exposes no hidden ids', () => {
  let state = closeDogger();
  state = takeCommand(state, 'blue', 'b_lion');
  const target = contactFor(state, 'blue', 'r_seydlitz');
  state = planCaptainAction(state, 'blue', { targetId: target, weapon: 'guns' });
  state = step(state);
  assert.equal(ship(state, 'b_lion').fc.targetId, 'r_seydlitz');
  assert.match(state.captainControl.report, /designated target/);
  assert.equal(state.captainControl.plan.targetId, target);
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
  const badShot = JSON.parse(serialize(state));
  badShot.captainControl.plan.shot = 'canister';
  assert.throws(() => deserialize(JSON.stringify(badShot)), /captain plan/);
});

test('a plan saved before shot selection loads with round shot', () => {
  const saved = JSON.parse(serialize(takeCommand(createGame('nevis', 2), 'blue', 'b_constellation')));
  saved.captainControl.plan = { helm: 'hold', targetId: null, weapon: 'hold' };
  const loaded = deserialize(JSON.stringify(saved));
  assert.equal(getView(loaded, 'blue').captainControl.plan.shot, 'round');
  assert.doesNotThrow(() => step(loaded));
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
  state = planCaptainAction(state, 'blue', { helm: 'starboard', shot: 'chain' });
  assert.equal(state.captainControl.report, undefined);
  assert.match(getView(state, 'blue').captainOptions.summary, /come starboard/i);
  assert.match(getView(state, 'blue').captainOptions.summary, /chain shot/i);
});

test('squadron AI continues to move while the commanded ship heaves to', () => {
  let state = createGame('nevis', 6);
  const start = { q: ship(state, 'b_baltimore').q, r: ship(state, 'b_baltimore').r };
  const flag = { q: ship(state, 'b_constellation').q, r: ship(state, 'b_constellation').r };
  state = planCaptainAction(takeCommand(state, 'blue', 'b_constellation'), 'blue', { helm: 'hold' });
  for (let i = 0; i < 4; i += 1) state = step(state);
  assert.notDeepEqual({ q: ship(state, 'b_baltimore').q, r: ship(state, 'b_baltimore').r }, start);
  assert.deepEqual({ q: ship(state, 'b_constellation').q, r: ship(state, 'b_constellation').r }, flag);
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
  state = planCaptainAction(state, 'blue', { helm: 'teleport', weapon: 'laser', targetId: 42, shot: 'canister' });
  assert.deepEqual(state.captainControl.plan, { helm: 'captain', targetId: null, weapon: 'guns', shot: 'round' });
  const bad = JSON.parse(serialize(state));
  bad.captainControl.plan.helm = 'teleport';
  assert.throws(() => deserialize(JSON.stringify(bad)), /captain plan/);
});

test('manual broadside cooldown prevents repeated fire on the next turn', () => {
  let state = closeNevis();
  ship(state, 'b_constellation').reloadUntil = state.tick;
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'hold', targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  state = step(state);
  const afterFirst = ship(state, 'r_insurgente').hull;
  state = step(state);
  assert.equal(ship(state, 'r_insurgente').hull, afterFirst);
  assert.match(state.captainControl.report, /reloading/i);
});

test('sail helm respects wind: steady into the wind is forecast and leaves her in place', () => {
  let state = createGame('nevis', 1);
  ship(state, 'b_constellation').facing = state.wind;
  const start = { q: ship(state, 'b_constellation').q, r: ship(state, 'b_constellation').r };
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'ahead' });
  assert.match(option(state, 'helm', 'ahead').reason, /in irons/i);
  state = step(state);
  assert.deepEqual({ q: ship(state, 'b_constellation').q, r: ship(state, 'b_constellation').r }, start);
  assert.match(state.captainControl.report, /in irons/i);
});

test('dreadnought helm turns while steaming, as her captain does', () => {
  let state = createGame('dogger', 1);
  state = step(state); // tick 2: a speed-3 battlecruiser makes two hexes
  const lion = ship(state, 'b_lion');
  const start = { q: lion.q, r: lion.r, facing: lion.facing };
  state = takeCommand(state, 'blue', 'b_lion');
  state = planCaptainAction(state, 'blue', { helm: 'starboard' });
  const forecast = option(state, 'helm', 'starboard').preview;
  state = step(state);
  assert.equal(ship(state, 'b_lion').facing, (start.facing + 1) % 6);
  assert.ok(ship(state, 'b_lion').q !== start.q || ship(state, 'b_lion').r !== start.r, 'she turned and made way in one tick');
  assert.deepEqual({ q: ship(state, 'b_lion').q, r: ship(state, 'b_lion').r, facing: ship(state, 'b_lion').facing }, forecast);
});

test('a hard turn costs fire control like her captain’s, a one-point turn does not', () => {
  for (const [helm, level] of [['starboard', 3], ['hardport', 1]]) {
    let state = createGame('dogger', 1);
    state = step(state);
    state = takeCommand(state, 'blue', 'b_lion');
    ship(state, 'b_lion').fc = { targetId: 'r_seydlitz', level: 3 };
    state = planCaptainAction(state, 'blue', { helm, weapon: 'hold' });
    if (helm === 'hardport') assert.match(option(state, 'helm', helm).reason, /gunnery range/);
    state = step(state);
    assert.equal(ship(state, 'b_lion').fc.level, level, helm);
  }
});

test('dreadnought helm at speed one waits for her move budget', () => {
  let state = createGame('dogger', 3);
  ship(state, 'b_lion').speed = 1;
  const startFacing = ship(state, 'b_lion').facing;
  state = takeCommand(state, 'blue', 'b_lion');
  state = planCaptainAction(state, 'blue', { helm: 'starboard' });
  const turn = option(state, 'helm', 'starboard');
  assert.equal(turn.enabled, false);
  assert.match(turn.reason, /next turn/i);
  state = step(state);
  assert.equal(ship(state, 'b_lion').facing, startFacing);
  assert.match(state.captainControl.report, /no way/i);
});

test('her captain’s course is forecast and matches what she does', () => {
  for (const [scenario, id, ticks] of [['dogger', 'b_orion', 4], ['nevis', 'b_constellation', 6]]) {
    let state = createGame(scenario, 4);
    for (let i = 0; i < ticks; i += 1) state = step(state);
    state = takeCommand(state, 'blue', id);
    const forecast = option(state, 'helm', 'captain');
    assert.match(forecast.reason, /standing order/);
    state = step(state);
    assert.deepEqual({ q: ship(state, id).q, r: ship(state, id).r, facing: ship(state, id).facing }, forecast.preview, scenario);
  }
});

test('a commanded ship breaks off on doctrine only while her captain has the helm', () => {
  for (const [helm, order] of [['captain', 'withdraw'], ['ahead', 'engage']]) {
    let state = takeCommand(createGame('nevis', 3), 'blue', 'b_constellation');
    ship(state, 'b_constellation').hull = 20;
    state = planCaptainAction(state, 'blue', { helm });
    if (helm === 'captain') assert.match(option(state, 'helm', 'captain').reason, /breaks off/);
    else assert.ok(getView(state, 'blue').captainOptions.forecast.some((l) => l.tone === 'warn' && /withdrawing/.test(l.text)));
    state = step(state);
    assert.equal(ship(state, 'b_constellation').order.type, order, helm);
  }
});

test('captain helm keeps clear of declared minefields unless ordered through them', () => {
  let state = createGame('dogger', 1);
  const dd = ship(state, 'b_meteor');
  dd.q = 7; dd.r = 12; dd.facing = 0; dd.speed = 4;
  state = takeCommand(state, 'blue', 'b_meteor');
  state = planCaptainAction(state, 'blue', { helm: 'ahead' });
  assert.match(option(state, 'helm', 'ahead').reason, /mines keep her off/);
  state = step(state);
  assert.notEqual(state.map.terrain.find((t) => t.q === ship(state, 'b_meteor').q && t.r === ship(state, 'b_meteor').r)?.type, 'mines');
});

test('sail stations offer shot, not torpedoes; dreadnought torpedoes only where fitted', () => {
  const sail = takeCommand(createGame('nevis', 1), 'blue', 'b_constellation');
  const view = getView(sail, 'blue').captainOptions;
  assert.equal(view.weapons.some((o) => o.id === 'torpedoes'), false);
  assert.deepEqual(view.shots.map((o) => o.id), ['round', 'chain', 'grape']);
  const lion = getView(takeCommand(createGame('dogger', 1), 'blue', 'b_lion'), 'blue').captainOptions;
  assert.equal(lion.weapons.some((o) => o.id === 'torpedoes'), false);
  assert.equal(lion.shots.length, 0);
  const meteor = getView(takeCommand(createGame('dogger', 1), 'blue', 'b_meteor'), 'blue').captainOptions;
  assert.ok(meteor.weapons.some((o) => o.id === 'torpedoes'));
});

test('captain option summary labels targets from public contact reports, not hidden truth names', () => {
  let state = closeDogger();
  const redContact = state.contacts.blue.find((c) => c.targetId === 'r_seydlitz');
  delete redContact.name;
  redContact.confidence = 'classified';
  redContact.className = 'Battlecruiser';
  state = takeCommand(state, 'blue', 'b_lion');
  state = planCaptainAction(state, 'blue', { targetId: redContact.id, weapon: 'guns' });
  const options = getView(state, 'blue').captainOptions;
  assert.match(options.summary, /Battlecruiser/);
  assert.doesNotMatch(JSON.stringify(options), /Seydlitz|r_seydlitz|r_posen|r_v186|r_s33/);
});

test('captain options forecast next turn reload and movement timing', () => {
  let sail = closeNevis();
  ship(sail, 'b_constellation').reloadUntil = sail.tick + 2;
  sail = takeCommand(sail, 'blue', 'b_constellation');
  sail = planCaptainAction(sail, 'blue', { targetId: contactFor(sail, 'blue', 'r_insurgente'), weapon: 'guns' });
  assert.match(option(sail, 'weapons', 'guns').reason, /reloading until T/);

  let dread = createGame('dogger', 1);
  dread = step(dread); // preview resolves on tick 2, where a speed-4 destroyer moves two hexes
  const startQ = ship(dread, 'b_meteor').q;
  dread = takeCommand(dread, 'blue', 'b_meteor');
  dread = planCaptainAction(dread, 'blue', { helm: 'ahead' });
  assert.match(getView(dread, 'blue').captainOptions.summary, new RegExp(`Preview ${startQ + 2},3`));
});

test('captain summary does not duplicate last resolution report', () => {
  let state = closeNevis();
  ship(state, 'b_constellation').reloadUntil = state.tick;
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'hold', targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
  state = step(state);
  assert.match(state.captainControl.report, /broadside fired/i);
  assert.doesNotMatch(getView(state, 'blue').captainOptions.summary, /broadside fired/i);
});

test('dreadnought weapon options mirror manual ROE and damage gates', () => {
  let state = closeDogger();
  state = setDoctrine(state, 'b_meteor', { roe: 'hold' });
  state = takeCommand(state, 'blue', 'b_meteor');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_seydlitz'), weapon: 'guns' });
  assert.equal(option(state, 'weapons', 'guns').enabled, false);
  assert.match(option(state, 'weapons', 'guns').reason, /Hold-fire/);
  assert.equal(option(state, 'weapons', 'torpedoes').enabled, false);
  state = setDoctrine(releaseCommand(state, 'blue'), 'b_lion', { roe: 'free' });
  ship(state, 'b_lion').weapons = 5;
  state = takeCommand(state, 'blue', 'b_lion');
  assert.match(option(state, 'weapons', 'guns').reason, /Weapons too damaged/);
});

test('torpedo readiness does not reveal hidden target type before classification', () => {
  let state = closeDogger();
  const dd = state.contacts.blue.find((c) => c.targetId === 'r_v186');
  dd.confidence = 'sighted';
  delete dd.className;
  state = takeCommand(state, 'blue', 'b_meteor');
  state = planCaptainAction(state, 'blue', { targetId: dd.id, weapon: 'torpedoes' });
  const reason = option(state, 'weapons', 'torpedoes').reason;
  assert.match(reason, /Classification required/);
  assert.doesNotMatch(reason, /capital|destroyer|torpedo boat/i);
});

test('a torpedo release is spent after one turn and the guns stay free', () => {
  let state = closeDogger();
  const dd = ship(state, 'b_meteor');
  Object.assign(dd, { q: 10, r: 5, reloadUntil: 0, facing: 0 });
  state = step(state);
  state = takeCommand(state, 'blue', 'b_meteor');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_seydlitz'), weapon: 'torpedoes' });
  assert.equal(option(state, 'weapons', 'torpedoes').enabled, true);
  const tubes = ship(state, 'b_meteor').torpedoes;
  state = step(state);
  assert.equal(ship(state, 'b_meteor').torpedoes, tubes - 1);
  assert.match(state.captainControl.report, /torpedoes away/);
  assert.equal(state.captainControl.plan.weapon, 'guns');
});

test('a destroyer’s light guns stay on light craft while her designated capital is for torpedoes', () => {
  let state = closeDogger();
  Object.assign(ship(state, 'b_meteor'), { q: 10, r: 4, reloadUntil: 99, facing: 0 });
  Object.assign(ship(state, 'r_v186'), { q: 11, r: 3 });
  state = step(state);
  state = takeCommand(state, 'blue', 'b_meteor');
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_seydlitz'), weapon: 'guns' });
  state = step(state);
  assert.notEqual(ship(state, 'b_meteor').fc.targetId, 'r_seydlitz');
});

test('manual torpedo execution withholds unclassified true target type', () => {
  const state = closeDogger();
  const shooter = ship(state, 'b_meteor');
  const target = ship(state, 'r_seydlitz');
  shooter.q = 10; shooter.r = 5; shooter.reloadUntil = state.tick; shooter.torpedoes = 1;
  const result = dreadnought.manualFire(state, shooter, target, 'torpedoes', null);
  assert.match(result.report, /classification required/i);
  assert.doesNotMatch(result.report, /capital|destroyer|Seydlitz|worth/i);
  assert.equal(shooter.torpedoes, 1);
});

test('the XO says whether each course crosses an incoming torpedo track', () => {
  let state = createGame('dogger', 2);
  state = step(state);
  const lion = ship(state, 'b_lion');
  const [dq, dr] = [1, 0];
  state = takeCommand(state, 'blue', 'b_lion');
  const steady = option(state, 'helm', 'ahead').preview;
  state.pending.push({ kind: 'torpedo', shipId: 'r_v186', targetId: 'b_lion', side: 'red', salvo: 1, deliverAt: state.tick + 1, q: lion.q + dq * 3, r: lion.r + dr * 3, aimQ: steady.q, aimR: steady.r });
  const view = getView(state, 'blue').captainOptions;
  assert.ok(view.forecast.some((l) => l.tone === 'warn' && /Torpedo tracks running at us/.test(l.text)));
  assert.equal(view.helm.find((h) => h.id === 'ahead').torpedoRisk, 'high');
  assert.ok(view.helm.some((h) => h.torpedoRisk === 'clear'), 'some course clears the track');
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

test('manual mine loss clears captain control before the returned state is reused', () => {
  let state = createGame('dogger', 1);
  const dd = ship(state, 'b_meteor');
  dd.q = 7; dd.r = 12; dd.facing = 0; dd.speed = 4; dd.hull = 20; dd.crew = 20;
  dd.order = { type: 'proceed', q: 12, r: 12 }; // routed through the field on the admiral's own order
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
  manual = planCaptainAction(manual, 'blue', { helm: 'hold', targetId: contactFor(manual, 'blue', 'r_insurgente'), weapon: 'guns' });
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
  state = planCaptainAction(state, 'blue', { helm: 'hold', targetId: contactFor(state, 'blue', 'r_insurgente'), weapon: 'guns' });
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
  assert.match(state.captainControl.report, /a-starboard/i);
  assert.match(state.captainControl.report, /broadside fired/i);
});

test('raking fire: a broadside from astern strikes harder than the same broadside on the beam', () => {
  // Same shooter, range and dice; only the target's heading changes.
  const beam = step(planCaptainAction(takeCommand(sailDuel({ targetFacing: 0 }), 'blue', 'b_constellation'), 'blue', { helm: 'hold' }));
  const astern = sailDuel({ targetFacing: 1 }); // heading away from us: we lie off her stern
  let raked = takeCommand(astern, 'blue', 'b_constellation');
  raked = planCaptainAction(raked, 'blue', { helm: 'hold', targetId: contactFor(raked, 'blue', 'r_insurgente') });
  assert.ok(getView(raked, 'blue').captainOptions.forecast.some((l) => l.tone === 'good' && /Raking position/.test(l.text)));
  raked = step(raked);
  const lost = (s) => 100 - ship(s, 'r_insurgente').hull;
  assert.ok(lost(raked) > lost(beam), `${lost(raked)} vs ${lost(beam)}`);
  assert.match(raked.captainControl.report, /raking from astern/);
  assert.ok(getView(raked, 'blue').fx.some((f) => f.type === 'broadside' && f.raking));
});

test('shot types: chain cuts rigging, grape sweeps the crew, and each has its reach', () => {
  const fire = (shot, at) => {
    let state = takeCommand(sailDuel({ at }), 'blue', 'b_constellation');
    state = planCaptainAction(state, 'blue', { helm: 'hold', shot, targetId: contactFor(state, 'blue', 'r_insurgente') });
    state = step(state);
    const t = ship(state, 'r_insurgente');
    return { hull: 100 - t.hull, propulsion: 100 - t.propulsion, crew: 100 - t.crew, report: state.captainControl.report };
  };
  const close = { q: 8, r: 7 }; // one hex, abeam
  const round = fire('round', close); const chain = fire('chain', close); const grape = fire('grape', close);
  assert.ok(chain.propulsion > round.propulsion && chain.hull < round.hull, JSON.stringify({ round, chain }));
  assert.ok(grape.crew > round.crew && grape.hull < round.hull, JSON.stringify({ round, grape }));
  const far = fire('grape', { q: 8, r: 8 }); // two hexes
  assert.equal(far.hull + far.crew, 0);
  assert.match(far.report, /grape range/);
});

test('shot-away rigging answers the helm only every other turn, for captains and players alike', () => {
  let state = createGame('nevis', 3);
  state = step(state); // tick 1 resolved; the next tick is even
  const me = ship(state, 'b_constellation');
  me.propulsion = 30;
  state = takeCommand(state, 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'port' });
  state = step(state); // even tick: she answers
  const turned = ship(state, 'b_constellation').facing;
  state = planCaptainAction(state, 'blue', { helm: 'port' });
  assert.match(option(state, 'helm', 'port').reason, /rigging/);
  state = step(state); // odd tick: she does not
  assert.equal(ship(state, 'b_constellation').facing, turned);
  assert.match(state.captainControl.report, /rigging/);
});

test('the XO flags standing orders that would quietly achieve nothing', () => {
  // Chain shot loaded with the enemy abeam at three hexes: the broadside would never fire.
  let state = takeCommand(sailDuel({ at: { q: 8, r: 9 } }), 'blue', 'b_constellation');
  state = planCaptainAction(state, 'blue', { helm: 'hold', shot: 'chain' });
  const lines = getView(state, 'blue').captainOptions.forecast;
  assert.ok(lines.some((l) => l.tone === 'warn' && /chain reaches 2/.test(l.text)), JSON.stringify(lines));
  // Steady into the wind leaves her where she is.
  let irons = createGame('nevis', 1);
  ship(irons, 'b_constellation').facing = irons.wind;
  irons = planCaptainAction(takeCommand(irons, 'blue', 'b_constellation'), 'blue', { helm: 'ahead' });
  assert.ok(getView(irons, 'blue').captainOptions.forecast.some((l) => l.tone === 'warn' && /achieves nothing/.test(l.text)));
});

test('the XO warns that shifting fire throws away the range already found', () => {
  let state = closeDogger();
  state = takeCommand(state, 'blue', 'b_lion');
  ship(state, 'b_lion').fc = { targetId: 'r_seydlitz', level: 2 };
  state = planCaptainAction(state, 'blue', { targetId: contactFor(state, 'blue', 'r_seydlitz') });
  assert.ok(getView(state, 'blue').captainOptions.forecast.some((l) => l.tone === 'good' && /Fire control 2\/3/.test(l.text)));
  const other = state.contacts.blue.find((c) => c.targetId !== 'r_seydlitz' && !c.stale);
  state = planCaptainAction(state, 'blue', { targetId: other.id });
  assert.ok(getView(state, 'blue').captainOptions.forecast.some((l) => l.tone === 'warn' && /throws away the range/.test(l.text)));
});

test('a destroyer report never reveals the true type of an unclassified designation', () => {
  const reports = ['r_v186', 'r_seydlitz'].map((id) => {
    let state = closeDogger();
    Object.assign(ship(state, 'b_meteor'), { q: 10, r: 4, reloadUntil: 99, facing: 0 });
    Object.assign(ship(state, id), { q: 18, r: 4 }); // eight hexes: sighted only, beyond light-gun range
    state = step(state);
    const contact = state.contacts.blue.find((c) => c.targetId === id);
    contact.confidence = 'sighted'; delete contact.className; delete contact.name;
    state = takeCommand(state, 'blue', 'b_meteor');
    state = planCaptainAction(state, 'blue', { targetId: contact.id, weapon: 'guns' });
    return step(state).captainControl.report.replace(/.*?helm \([^)]*\)\. /, '');
  });
  assert.equal(reports[0], reports[1]);
});

test('a turn the rigging will not allow stands for the next turn', () => {
  let state = takeCommand(createGame('nevis', 3), 'blue', 'b_constellation');
  ship(state, 'b_constellation').propulsion = 30; // tick 1 is odd: she will not answer
  const facing = ship(state, 'b_constellation').facing;
  state = step(planCaptainAction(state, 'blue', { helm: 'port' }));
  assert.equal(ship(state, 'b_constellation').facing, facing);
  assert.equal(state.captainControl.plan.helm, 'port');
  state = step(state);
  assert.equal(ship(state, 'b_constellation').facing, (facing + 5) % 6);
  assert.equal(state.captainControl.plan.helm, 'ahead');
});

test('a hard turn ordered for a sailing ship is an ordinary one-point turn', () => {
  const state = planCaptainAction(takeCommand(createGame('nevis', 3), 'blue', 'b_constellation'), 'blue', { helm: 'hardport' });
  assert.equal(state.captainControl.plan.helm, 'port');
});
