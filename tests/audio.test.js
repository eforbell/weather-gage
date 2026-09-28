import test from 'node:test';
import assert from 'node:assert/strict';
import { createSound } from '../src/ui/fx.js';

class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}

class Node {
  gain = new Param();
  frequency = new Param();
  starts = [];
  stops = [];
  connect() {}
  disconnect() {}
  start(...args) { this.starts.push(args); }
  stop(...args) { this.stops.push(args); }
}

class AudioContextStub {
  static instances = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate = 40;
  destination = new Node();
  sources = [];
  constructor() { AudioContextStub.instances.push(this); }
  createDynamicsCompressor() { return new Node(); }
  createGain() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createBuffer() { return { getChannelData: () => new Float32Array(100) }; }
  createBufferSource() { const source = new Node(); this.sources.push(source); return source; }
  createOscillator() { const source = new Node(); this.sources.push(source); return source; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

test('sound stays silent until enabled and unlock starts an era-specific ambient bed', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: AudioContextStub };
  try {
    AudioContextStub.instances = [];
    const sound = createSound();
    sound.unlock();
    assert.equal(AudioContextStub.instances.length, 0);

    sound.setScene('sail');
    sound.enable(true);
    sound.unlock();
    await Promise.resolve();
    const ctx = AudioContextStub.instances[0];
    assert.equal(ctx.state, 'running');
    assert.equal(ctx.sources.length, 3, 'waves, spray and their slow modulation start');
    assert.ok(ctx.sources.every(source => source.starts.length === 1));

    sound.setScene('coldwar');
    assert.ok(ctx.sources.slice(0, 3).every(source => source.stops.length === 1));
    assert.equal(ctx.sources.length, 7, 'underwater bed adds a machinery tone');

    sound.enable(false);
    assert.equal(ctx.state, 'suspended');
    assert.ok(ctx.sources.slice(3).every(source => source.stops.length === 1));
    sound.play('gun');
    assert.equal(ctx.sources.length, 7, 'combat effects do not play while off');
  } finally { globalThis.window = previousWindow; }
});

test('enabling sound again resumes ambience and combat effects', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: AudioContextStub };
  try {
    const sound = createSound();
    sound.setScene('dreadnought');
    sound.enable(true);
    sound.unlock();
    await Promise.resolve();
    const ctx = AudioContextStub.instances.at(-1);
    sound.enable(false);
    sound.enable(true);
    sound.unlock();
    await Promise.resolve();
    assert.equal(ctx.state, 'running');
    assert.equal(ctx.sources.length, 8, 'ambience restarts without creating another context');
    sound.play('gun');
    assert.equal(ctx.sources.length, 9);
    assert.equal(ctx.sources.at(-1).starts.length, 1);
    sound.pause();
    assert.equal(ctx.state, 'suspended');
  } finally { globalThis.window = previousWindow; }
});
