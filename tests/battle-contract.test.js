import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { FX_HANDLED, FX_KNOWN_GAPS, ENTITY_KNOWN_GAPS } from '../src/ui/battle-effects.js';

// The presentation contract (docs/3d-visual-direction.md): every combat event the
// simulation emits or the chart animates, and every entity kind in the view, has a
// 3D representation or is a named known gap. A new sim feature fails here until
// someone decides how it looks on the water.
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const simFiles = ['src/sim/core.js', 'src/sim/engine.js', ...readdirSync(new URL('../src/sim/eras/', import.meta.url)).map(f => `src/sim/eras/${f}`)];
const matches = (text, pattern) => [...text.matchAll(pattern)].map(m => m[1]);

const simEvents = new Set(simFiles.flatMap(f => matches(source(f), /addFx\(state, \{ type: '([a-z-]+)'/g)));
const chartEvents = new Set(matches(source('src/ui/fx.js'), /case '([a-z-]+)':/g));
const entityKinds = new Set(simFiles.flatMap(f => matches(source(f), /id: `[^`]*`, kind: '([a-z]+)'/g)));

test('the scans find the event and entity vocabulary', () => {
  assert.ok(simEvents.size >= 20, `found ${simEvents.size} sim event types`);
  assert.ok(chartEvents.size >= 20, `found ${chartEvents.size} chart event types`);
  assert.deepEqual([...entityKinds].sort(), ['buoys', 'decoy', 'torpedo']);
});

test('every combat event has a 3D handler or a named known gap', () => {
  const covered = new Set([...FX_HANDLED, ...Object.keys(FX_KNOWN_GAPS)]);
  for (const type of new Set([...simEvents, ...chartEvents])) {
    assert.ok(covered.has(type), `"${type}" has no 3D handler; add one in battle-effects.js or list it in FX_KNOWN_GAPS`);
  }
});

test('known gaps stay honest', () => {
  for (const type of Object.keys(FX_KNOWN_GAPS)) {
    assert.ok(!FX_HANDLED.includes(type), `"${type}" is handled now; remove it from FX_KNOWN_GAPS`);
    assert.ok(chartEvents.has(type) || simEvents.has(type), `"${type}" is no longer an event; remove it from FX_KNOWN_GAPS`);
  }
  for (const type of FX_HANDLED) assert.ok(chartEvents.has(type), `3D handler "${type}" has no chart counterpart`);
});

test('every view entity kind has a 3D representation or a named known gap', () => {
  for (const kind of entityKinds) assert.ok(ENTITY_KNOWN_GAPS[kind], `entity kind "${kind}" has no 3D representation or known gap`);
});
