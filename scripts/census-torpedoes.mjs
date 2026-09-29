// Torpedo census: play many seeds with default captains and follow every torpedo from
// launch to its end (hit, other enemy, friendly fire, own boat, dud, noisemaker, fuel,
// seabed). Misses that run out of fuel report their closest approach to the target.
// usage: npm run census:torpedoes -- [scenarios, comma separated] [seeds]
import { createGame, step, distance } from '../src/sim/engine.js';

const scenarios = (process.argv[2] || 'defector,northern_screen').split(',');
const N = Number(process.argv[3] || 200);
for (const id of scenarios) {
  const fate = { hit: 0, hitOtherEnemy: 0, friendly: 0, own: 0, dud: 0, decoy: 0, fuel: 0, seabed: 0, unresolved: 0 };
  let fired = 0; const closest = []; const outcomes = {};
  for (let seed = 1; seed <= N; seed++) {
    let s = createGame(id, seed);
    const live = new Map(); // id -> {intended, best}
    while (!s.outcome) {
      const before = new Map((s.entities || []).filter((e) => e.kind === 'torpedo').map((e) => [e.id, e]));
      s = step(s);
      const newLogs = s.log.filter((e) => e.tick === s.tick);
      for (const e of (s.entities || []).filter((x) => x.kind === 'torpedo')) {
        if (!live.has(e.id)) {
          fired++;
          const shooter = s.ships.find((x) => x.id === e.shooterId);
          const line = newLogs.find((l) => l.text.startsWith(shooter.name) && /fires .*torpedo at/.test(l.text));
          const name = line ? line.text.replace(/.* at /, '').replace(/, safeties off\.|\.$/g, '') : null;
          live.set(e.id, { side: e.side, intended: e.targetId || s.ships.find((x) => x.name === name)?.id, best: 99 });
        }
        const rec = live.get(e.id);
        const tgt = s.ships.find((x) => x.id === rec.intended);
        if (tgt) rec.best = Math.min(rec.best, distance(e, tgt));
      }
      // Torpedoes launched and resolved within one tick never appear in entities.
      const launchedGone = newLogs.filter((l) => /fires .*torpedo at/.test(l.text)).length
        - [...(s.entities || [])].filter((e) => e.kind === 'torpedo' && e.id.startsWith(`t${s.tick}_`)).length;
      const gone = [...live.keys()].filter((k) => !(s.entities || []).some((e) => e.id === k));
      const texts = newLogs.map((l) => l.text);
      const classify = (rec) => {
        const intendedName = s.ships.find((x) => x.id === rec?.intended)?.name;
        let i;
        let kind = 'unresolved';
        if ((i = texts.findIndex((t) => /is hit by a torpedo — her own/.test(t))) >= 0) kind = 'own';
        else if (intendedName && (i = texts.findIndex((t) => t.startsWith(`${intendedName} is hit by a torpedo`))) >= 0) kind = 'hit';
        else if ((i = texts.findIndex((t) => /is hit by a torpedo/.test(t))) >= 0) {
          const victim = s.ships.find((x) => texts[i].startsWith(`${x.name} is hit`));
          const shooterSide = rec?.side;
          kind = victim && shooterSide && victim.side === shooterSide ? 'friendly' : 'hitOtherEnemy';
        }
        else if ((i = texts.findIndex((t) => /without arming/.test(t))) >= 0) kind = 'dud';
        else if ((i = texts.findIndex((t) => /detonates on a noisemaker/.test(t))) >= 0) kind = 'decoy';
        else if ((i = texts.findIndex((t) => /runs out of fuel/.test(t))) >= 0) { kind = 'fuel'; if (rec) closest.push(rec.best); }
        else if ((i = texts.findIndex((t) => /seabed/.test(t))) >= 0) kind = 'seabed';
        if (i >= 0) texts.splice(i, 1);
        fate[kind]++;
      };
      for (const k of gone) { classify(live.get(k)); live.delete(k); }
      for (let j = 0; j < launchedGone; j++) { fired++; classify(null); }
    }
    fate.unresolved += live.size;
    outcomes[s.outcome.result] = (outcomes[s.outcome.result] || 0) + 1;
  }
  const pct = (k) => `${k} ${((100 * fate[k]) / fired).toFixed(0)}%`;
  const hist = {};
  for (const d of closest) { const b = d >= 4 ? '4+' : String(d); hist[b] = (hist[b] || 0) + 1; }
  console.log(`${id}: fired ${fired} (${(fired / N).toFixed(1)}/game) | ${Object.keys(fate).map(pct).join(' · ')}`);
  console.log(`   fuel-outs: closest approach to intended target ${JSON.stringify(hist)} | outcomes ${JSON.stringify(outcomes)}`);
}
