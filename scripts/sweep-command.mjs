// Take Command sweep: plays many seeds with scripted "players" on one commanded ship
// and compares them with leaving her captain on doctrine. Players see only what the
// station shows: the public view, contact reports and the XO's forecasts.
//
//   node scripts/sweep-command.mjs [seeds=200] [scenario=nevis] [shipId]
//
// doctrine  never takes command (the baseline)
// idle      takes command and changes nothing: must equal doctrine exactly
// careless  takes the helm and holds a steady course all battle
// skilled   sail: looks three turns ahead for broadside, rake and shot choices;
//           dreadnought: designates a capital, crosses the T, dodges torpedo tracks
import { createGame, step, takeCommand, planCaptainAction, getView } from '../src/sim/engine.js';
import { distance, directionToward, turnDistance, DIRECTIONS, inBounds, terrainAtMap } from '../src/sim/core.js';

const seeds = Number(process.argv[2] || 200);
const scenario = process.argv[3] || 'nevis';
const shipId = process.argv[4] || { nevis: 'b_constellation', line: 'b_bellerophon', dogger: 'b_orion' }[scenario];
if (!shipId) throw new Error(`Name a ship to command in ${scenario}`);

const view = (s) => getView(s, 'blue', shipId);
const own = (v) => v.ships.find((x) => x.id === shipId);
const rel = (from, to, facing) => (directionToward(from, to) - facing + 6) % 6;
const abeam = (r) => r === 1 || r === 2 || r === 4 || r === 5;
const capital = (c) => c.className && !/destroyer|torpedo/i.test(c.className);

// ---------- Sail: a three-turn look-ahead over her own helm ----------
// Assumes each enemy holds position and turns one point a turn to bring her
// broadside on us, as captains on Engage do. Scores expected damage given and taken.
const RANGE_FACTOR = (d) => Math.max(0, 1.15 - d * 0.18);
const RAKE = (r) => (r === 0 ? 1.25 : r === 3 ? 1.5 : 1);
function sailAhead(v, p, tick, me) {
  const [dq, dr] = DIRECTIONS[p.facing];
  const n = { q: p.q + dq, r: p.r + dr, facing: p.facing };
  if (!inBounds(n, v.map) || terrainAtMap(v.map, n.q, n.r) === 'land') return null;
  if (v.ships.some((x) => x.status === 'active' && x.id !== me.id && x.q === n.q && x.r === n.r)) return null;
  if (v.contacts.some((c) => !c.stale && c.q === n.q && c.r === n.r)) return null;
  if (p.facing === v.wind || (turnDistance(p.facing, v.wind) === 1 && tick % 2 === 1) || (me.propulsion < 40 && tick % 2 === 1)) return null;
  return n;
}
function sailPlan(v, me) {
  const foes = v.contacts.filter((c) => !c.stale && Number.isInteger(c.facing) && distance(me, c) <= 6);
  if (!foes.length) return null;
  let best = null;
  const search = (p, depth, first, shot, reload, theirs, score) => {
    if (depth === 3) {
      const closing = -Math.min(...theirs.map((f) => distance(p, f))) * 0.3;
      if (!best || score + closing > best.score) best = { score: score + closing, helm: first, shot };
      return;
    }
    const tick = v.tick + 1 + depth;
    const moves = [['hold', p], ['port', { ...p, facing: (p.facing + 5) % 6 }], ['starboard', { ...p, facing: (p.facing + 1) % 6 }]];
    const ahead = sailAhead(v, p, tick, me);
    if (ahead) moves.push(['ahead', ahead]);
    for (const [helm, np] of moves) {
      let sc = score; let rl = reload; let load = shot;
      const nt = theirs.map((f) => ({ ...f }));
      const bearing = nt.map((f) => ({ f, d: distance(np, f) })).filter(({ f, d }) => abeam(rel(np, f, np.facing)) && d <= 3).sort((a, b) => a.d - b.d)[0];
      if (rl <= tick && bearing) {
        const pick = bearing.d <= 1 ? 'grape' : 'round';
        sc += 11.5 * (me.guns / 36) * RANGE_FACTOR(bearing.d) * RAKE(rel(bearing.f, np, bearing.f.facing)) * (pick === 'grape' ? 1.3 : 1);
        rl = tick + 2;
        if (depth === 0) load = pick;
      }
      for (const f of nt) {
        const d = distance(np, f);
        if (d <= 3 && abeam(rel(f, np, f.facing)) && (f.next ?? tick) <= tick) { sc -= 11.5 * RANGE_FACTOR(d) * RAKE(rel(np, f, np.facing)) * 0.9; f.next = tick + 2; }
        else if (d <= 4 && !abeam(rel(f, np, f.facing))) {
          const dir = directionToward(f, np);
          const want = [(dir + 1) % 6, (dir + 5) % 6].sort((a, b) => turnDistance(f.facing, a) - turnDistance(f.facing, b))[0];
          f.facing = ((want - f.facing + 6) % 6) <= 3 ? (f.facing + 1) % 6 : (f.facing + 5) % 6;
        }
      }
      search(np, depth + 1, first ?? helm, load, rl, nt, sc);
    }
  };
  search({ q: me.q, r: me.r, facing: me.facing }, 0, null, null, me.reloadUntil, foes.map((c) => ({ q: c.q, r: c.r, facing: c.facing })), 0);
  return best;
}

// ---------- Dreadnought: designate, cross the T, keep off torpedo tracks ----------
function dreadSkilled(s) {
  let v = view(s); const me = own(v);
  // Keep a designation while it stands: shifting fire throws away the range.
  const kept = v.contacts.find((c) => !c.stale && c.id === v.captainControl.plan.targetId);
  const target = kept || v.contacts.filter((c) => !c.stale && (me.type === 'destroyer' || capital(c))).sort((a, b) => distance(me, a) - distance(me, b))[0];
  s = planCaptainAction(s, 'blue', { helm: 'captain', targetId: target?.id ?? null });
  v = view(s);
  if (v.captainOptions.weapons.find((w) => w.id === 'torpedoes')?.enabled) s = planCaptainAction(s, 'blue', { weapon: 'torpedoes' });
  const helm = v.captainOptions.helm;
  if (helm.find((h) => h.id === 'captain')?.torpedoRisk === 'high') {
    const dodge = helm.find((h) => h.enabled && h.torpedoRisk === 'clear' && h.id !== 'hold');
    if (dodge) return planCaptainAction(s, 'blue', { helm: dodge.id });
  }
  if (!target || !Number.isInteger(target.facing) || !capital(target)) return s;
  const crossing = helm.find((h) => h.enabled && h.preview && h.id !== 'hold' && h.torpedoRisk !== 'high'
    && abeam(rel(h.preview, target, h.preview.facing)) && [0, 3].includes(rel(target, h.preview, target.facing)) && distance(h.preview, target) <= me.gunRange);
  return crossing ? planCaptainAction(s, 'blue', { helm: crossing.id }) : s;
}

const PLAYERS = {
  doctrine: null,
  idle: (s) => s,
  careless: (s) => planCaptainAction(s, 'blue', { helm: 'ahead' }),
  skilled: (s) => {
    const v = view(s); const me = own(v);
    if (me.era !== 'sail') return dreadSkilled(s);
    const plan = sailPlan(v, me);
    return plan && plan.score > 0.5
      ? planCaptainAction(s, 'blue', { helm: plan.helm, shot: plan.shot || 'round', targetId: null, weapon: 'guns' })
      : planCaptainAction(s, 'blue', { helm: 'captain', shot: 'round', targetId: null, weapon: 'guns' });
  },
};

const pct = (n) => `${Math.round((100 * n) / seeds)}%`.padStart(4);
console.log(`${scenario}, commanding ${shipId}, ${seeds} seeds`);
for (const [name, player] of Object.entries(PLAYERS)) {
  const tally = { victory: 0, draw: 0, defeat: 0 };
  let fired = 0, rakes = 0, tees = 0, survived = 0, prizes = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    let s = createGame(scenario, seed);
    if (player) s = takeCommand(s, 'blue', shipId);
    while (!s.outcome) {
      if (player && s.captainControl) s = player(s);
      s = step(s);
      for (const fx of s.fx || []) {
        const e = fx.blue;
        if (e?.from?.id !== shipId || !['broadside', 'salvo'].includes(e.type)) continue;
        fired += 1; if (e.raking) rakes += 1; if (e.crossingT) tees += 1;
      }
    }
    tally[s.outcome.result] += 1;
    prizes += s.ships.filter((x) => x.side !== 'blue' && x.status === 'struck').length;
    if (['active', 'escaped'].includes(s.ships.find((x) => x.id === shipId).status)) survived += 1;
  }
  console.log(`  ${name.padEnd(9)} win/draw/loss ${pct(tally.victory)}/${pct(tally.draw)}/${pct(tally.defeat)}; her guns: ${(fired / seeds).toFixed(1)} fired, ${(rakes / seeds).toFixed(1)} raking, ${(tees / seeds).toFixed(1)} crossing the T; prizes ${(prizes / seeds).toFixed(2)}; she survives ${pct(survived)}`);
}
