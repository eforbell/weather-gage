// Plan sweep for the WWII dockyard scenario: run many seeds of a plan and report
// win/draw/loss, ships lost, when the guns opened, and torpedo hits each way.
//
//   node scripts/sweep-ww2.mjs [seeds=200] [esperance|convoy]
import { createGame, step, setRadar, issueOrder } from '../src/sim/engine.js';

const seeds = Number(process.argv[2] || 200);
const scenario = process.argv[3] || 'esperance';
const CONVOY_PLANS = {
  'Walker ranges out, the rest screen (default)': (s) => s,
  'All escorts screen the convoy': (s) => issueOrder(s, s.ships.filter((x) => x.side === 'blue' && x.type === 'destroyer').map((x) => x.id), { type: 'screen' }),
  'All escorts hunt freely (Engage)': (s) => issueOrder(s, s.ships.filter((x) => x.side === 'blue' && x.type === 'destroyer').map((x) => x.id), { type: 'engage' }),
  'Sackville silences her metric radar': (s) => setRadar(s, ['b_sackville'], false),
  'All radar off': (s) => setRadar(s, s.ships.filter((x) => x.side === 'blue').map((x) => x.id), false),
};
const ESPERANCE_PLANS = {
  'Let the captains fight (radar on)': (s) => s,
  'Emission control (radar off)': (s) => setRadar(s, s.ships.filter((x) => x.side === 'blue').map((x) => x.id), false),
  'Cruisers in line, destroyers screen': (s) => {
    const blue = s.ships.filter((x) => x.side === 'blue');
    s = issueOrder(s, blue.filter((x) => x.type === 'cruiser').map((x) => x.id), { type: 'line' });
    return issueOrder(s, blue.filter((x) => x.type === 'destroyer').map((x) => x.id), { type: 'screen' });
  },
};

const PLANS = scenario === 'convoy' ? CONVOY_PLANS : ESPERANCE_PLANS;
for (const [plan, setup] of Object.entries(PLANS)) {
  const tally = { victory: 0, draw: 0, defeat: 0 }, lost = { blue: 0, red: 0 }, firstShot = [], torpedoHits = { blue: 0, red: 0 }, ticks = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    let s = setup(createGame(scenario, seed));
    let opened = null;
    while (!s.outcome) {
      s = step(s);
      const now = s.log.filter((e) => e.tick === s.tick);
      if (opened === null && now.some((e) => /opens/.test(e.text))) opened = s.tick;
      for (const e of now) {
        const hit = e.text.match(/^(.+) is struck by a torpedo/);
        const victim = hit && s.ships.find((x) => x.name === hit[1]);
        if (victim) torpedoHits[victim.side === 'blue' ? 'red' : 'blue'] += 1;
      }
    }
    tally[s.outcome.result] += 1;
    ticks.push(s.tick);
    for (const sh of s.ships) if (sh.status === 'sunk' || sh.status === 'struck') lost[sh.side] += 1;
    if (opened !== null) firstShot.push(opened);
  }
  const pct = (n) => `${Math.round((100 * n) / seeds)}%`;
  const mean = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
  console.log(`${plan}\n  win/draw/loss ${pct(tally.victory)} / ${pct(tally.draw)} / ${pct(tally.defeat)}; ships lost per game blue ${(lost.blue / seeds).toFixed(2)}, red ${(lost.red / seeds).toFixed(2)}; guns open at tick ${mean(firstShot)}; game ends tick ${mean(ticks)}; torpedo hits per game by blue ${(torpedoHits.blue / seeds).toFixed(2)}, by red ${(torpedoHits.red / seeds).toFixed(2)}`);
}
