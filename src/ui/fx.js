// Presentation-only combat effects: muzzle flashes, shells in flight, splashes, hits,
// torpedo wakes, sinkings, callout banners and synthesized sound. Driven by the
// per-side `view.fx` events the engine records each tick. UI randomness here is
// cosmetic and never touches the deterministic simulation.
const NS = 'http://www.w3.org/2000/svg';

export function createFx({ layer, tracks, wrap, banner, pt }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const timers = new Set();
  const observed = new Map();
  let torpedoes = [];
  let stats = blankStats();
  let bannerQueue = [];
  let bannerBusy = false;
  let lastTee = -99;
  let generation = 0;
  const sfx = createSound();

  function blankStats() { return { fired: 0, hits: 0, taken: 0, torpedoHits: 0, tees: 0 }; }
  function later(ms, fn) { const gen = generation; const id = setTimeout(() => { timers.delete(id); if (gen === generation) fn(); }, Math.max(0, ms)); timers.add(id); }
  function el(tag, attrs, parent = layer) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent.appendChild(node);
    return node;
  }
  function temp(node, ms) { later(ms, () => node.remove()); return node; }
  function tween(ms, fn, done) {
    if (reduced.matches) { fn(1); done?.(); return; }
    const start = performance.now();
    const gen = generation;
    const frame = (now) => {
      if (gen !== generation) return; // sortie was reset mid-flight
      const t = Math.min(1, (now - start) / ms);
      fn(t);
      if (t < 1) requestAnimationFrame(frame); else done?.();
    };
    requestAnimationFrame(frame);
  }
  const jitter = (p, r) => { const a = Math.random() * Math.PI * 2; const d = r * (0.35 + Math.random() * 0.65); return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d }; };

  // ---------- primitives ----------
  function flash(p, size) {
    temp(el('circle', { cx: p.x, cy: p.y, r: size, class: 'fx-flash', fill: 'url(#g-flash)' }), 600);
  }
  function smokePuff(p, size = 7) {
    temp(el('circle', { cx: p.x, cy: p.y, r: size, class: 'fx-puff', fill: 'url(#g-smoke)' }), 2200);
  }
  function explosion(p, heavy) {
    const g = el('g', { class: `fx-boom ${heavy ? 'heavy' : ''}`, transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` });
    let debris = '';
    for (let i = 0; i < (heavy ? 7 : 4); i++) {
      const a = Math.random() * Math.PI * 2, len = (heavy ? 16 : 10) + Math.random() * 8;
      debris += `<line class="debris" x1="0" y1="0" x2="${(Math.cos(a) * len).toFixed(1)}" y2="${(Math.sin(a) * len).toFixed(1)}"/>`;
    }
    g.innerHTML = `<circle class="core" r="${heavy ? 15 : 9}" fill="url(#g-flash)"/><circle class="ring" r="${heavy ? 10 : 6}"/>${debris}`;
    temp(g, 1300);
    later(250, () => smokePuff(p, heavy ? 12 : 8));
  }
  function splash(p, big = false) {
    const g = el('g', { class: `fx-splash ${big ? 'big' : ''}`, transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` });
    g.innerHTML = `<ellipse class="col" rx="${big ? 4 : 2.2}" ry="${big ? 14 : 7}"/><circle class="ripple" r="${big ? 5 : 3}"/>`;
    temp(g, 1200);
  }
  function floatText(p, text, cls = '') {
    const t = el('text', { x: (p.x + 24).toFixed(1), y: (p.y - 6).toFixed(1), class: `fx-float ${cls}` });
    t.textContent = text;
    temp(t, 1500);
  }
  function shell(a, b, ms, heavy, onArrive) {
    if (reduced.matches) { onArrive(); return; }
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const lift = Math.min(55, dist * 0.2);
    const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * lift });
    const trail = el('path', { class: `fx-trail ${heavy ? 'heavy' : ''}` });
    const dot = el('circle', { r: heavy ? 2.4 : 1.6, class: 'fx-shell' });
    tween(ms, (t) => {
      const h = at(t), tail = at(Math.max(0, t - 0.18));
      dot.setAttribute('cx', h.x.toFixed(1)); dot.setAttribute('cy', h.y.toFixed(1));
      trail.setAttribute('d', `M${tail.x.toFixed(1)},${tail.y.toFixed(1)} L${h.x.toFixed(1)},${h.y.toFixed(1)}`);
    }, () => { dot.remove(); trail.remove(); onArrive(); });
  }
  function missile(a, b, ms, onArrive) {
    if (reduced.matches) { onArrive(); return; }
    const trail = el('path', { class: 'fx-missile-trail' });
    const dot = el('circle', { r: 2.2, class: 'fx-missile' });
    const bend = { x: (a.x + b.x) / 2 + (b.y - a.y) * 0.15, y: (a.y + b.y) / 2 - (b.x - a.x) * 0.15 };
    const at = (t) => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * bend.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * bend.y + t * t * b.y });
    tween(ms, (t) => {
      const h = at(t);
      dot.setAttribute('cx', h.x.toFixed(1)); dot.setAttribute('cy', h.y.toFixed(1));
      let d = ''; for (let i = 0; i <= 8; i++) { const q = at(Math.max(0, t - 0.4 + (i * 0.4) / 8)); d += `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`; }
      trail.setAttribute('d', d);
    }, () => { dot.remove(); later(400, () => trail.remove()); onArrive(); });
  }
  function shake(strong) {
    if (reduced.matches) return;
    wrap.classList.remove('shake', 'shake-strong');
    void wrap.offsetWidth;
    wrap.classList.add(strong ? 'shake-strong' : 'shake');
  }
  function showBanner(text, tone = '') {
    if (bannerBusy) { if (bannerQueue.length < 3 && !bannerQueue.some(b => b.text === text)) bannerQueue.push({ text, tone }); return; }
    bannerBusy = true;
    banner.textContent = text;
    banner.className = `banner show ${tone}`;
    later(1400, () => {
      banner.className = `banner ${tone}`;
      later(250, () => { bannerBusy = false; const next = bannerQueue.shift(); if (next) showBanner(next.text, next.tone); });
    });
  }

  // ---------- torpedo wakes persist across ticks ----------
  // Enemy torpedoes are never tracked exactly: a bearing wedge fades in at launch, then
  // lookouts report wakes now and then, somewhere near the likely track.
  function pingTorpedo(t, tick) {
    const p = Math.min(0.95, (tick - t.launch + 0.5) / (t.arrive - t.launch));
    if (tick > t.launch && Math.random() < 0.4) return; // not every sweep finds the wake
    const guess = t.a === t.b ? jitter(t.b, 26) : jitter({ x: t.a.x + (t.b.x - t.a.x) * p, y: t.a.y + (t.b.y - t.a.y) * p }, 14);
    const g = el('g', { class: 'fx-ping', transform: `translate(${guess.x.toFixed(1)} ${guess.y.toFixed(1)})` }, tracks);
    g.innerHTML = '<circle class="ping-ring" r="5"/><circle class="ping-dot" r="1.6"/><text y="-8">WAKE</text>';
    temp(g, 1600);
  }

  function drawTorpedoes(tick, ms) {
    torpedoes = torpedoes.filter(t => tick < t.arrive + 1);
    for (const t of torpedoes.filter(x => !x.own)) {
      if (tick === t.launch && t.a !== t.b) {
        const ang = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x), len = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) * 1.2, spread = 0.38;
        const pt2 = (d) => `${(t.a.x + Math.cos(ang + d) * len).toFixed(1)},${(t.a.y + Math.sin(ang + d) * len).toFixed(1)}`;
        temp(el('path', { class: 'fx-bearing', d: `M${t.a.x.toFixed(1)},${t.a.y.toFixed(1)} L${pt2(-spread)} L${pt2(spread)} Z` }, tracks), ms * 3);
      }
      if (tick < t.arrive) later(ms * 0.3, () => pingTorpedo(t, tick));
    }
    for (const t of torpedoes.filter(x => x.own)) {
      if (!t.node) {
        t.node = el('g', { class: `fx-torpedo ${t.own ? 'own' : 'hostile'}` }, tracks);
        t.node.innerHTML = '<path class="wake"/><circle class="head" r="2"/>';
        t.p = 0;
      }
      const target = Math.min(1, (tick - t.launch) / (t.arrive - t.launch));
      const from = t.p;
      const update = (k) => {
        const p = from + (target - from) * k;
        const x = t.a.x + (t.b.x - t.a.x) * p, y = t.a.y + (t.b.y - t.a.y) * p;
        t.node.querySelector('.wake').setAttribute('d', `M${t.a.x.toFixed(1)},${t.a.y.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)}`);
        t.node.querySelector('.head').setAttribute('cx', x.toFixed(1));
        t.node.querySelector('.head').setAttribute('cy', y.toFixed(1));
      };
      tween(ms, update, () => { t.p = target; });
      if (tick >= t.arrive) { const node = t.node; later(ms + 900, () => node.remove()); }
    }
    torpedoes = torpedoes.filter(t => tick < t.arrive);
  }

  // ---------- per-tick choreography ----------
  function play(view, tickMs, names) {
    const n = view.fx.length;
    const start = tickMs * 0.38;
    const gap = n ? Math.min(110, (tickMs * 0.35) / n) : 0;
    const flight = Math.max(160, tickMs * 0.3);
    const label = (ref) => (ref ? (ref.own ? names.shipName(ref.id) : names.contactName(ref.id)) : 'ENEMY').toUpperCase();
    let sounds = 0;
    const sound = (kind, delay) => { if (sounds++ < 10) sfx.play(kind, delay); };

    view.fx.forEach((f, i) => {
      const t0 = start + i * gap;
      const from = f.from && pt(f.from);
      const to = f.to && pt(f.to);
      const at = f.at && pt(f.at);
      if (f.to && !f.to.own && f.hits && f.type !== 'ram') observed.set(f.to.id, (observed.get(f.to.id) || 0) + f.hits * (f.type === 'salvo' && !f.heavy ? 0.4 : f.type === 'salvo' || f.type === 'broadside' ? 1 : 3));
      if (f.from?.own && (f.type === 'salvo' || f.type === 'broadside')) { stats.fired += 1; stats.hits += f.hits || 0; if (f.crossingT) stats.tees += 1; }
      if (f.to?.own && f.hits) stats.taken += f.hits;

      switch (f.type) {
        case 'salvo':
        case 'broadside': {
          const heavy = f.type === 'broadside' || f.heavy;
          later(t0, () => {
            if (from) {
              if (f.type === 'broadside') { flash(jitter(from, 6), 9); flash(jitter(from, 6), 8); later(60, () => flash(jitter(from, 6), 8)); }
              else flash(from, heavy ? 11 : 6);
              smokePuff(jitter(from, 5), heavy ? 9 : 5);
              sound(heavy ? 'heavy' : 'gun', 0);
            }
            if (!to) return;
            const land = () => {
              if (f.hits) {
                explosion(jitter(to, 4), heavy && f.hits > 1);
                for (let k = 1; k < Math.min(f.hits, 3); k++) later(k * 90, () => explosion(jitter(to, 8), false));
                floatText(to, f.to.own ? `−${f.damage}` : f.hits > 1 ? `HIT ×${f.hits}` : 'HIT', f.to.own ? 'own' : 'enemy');
                sound('hit', 0);
                if (f.to.own && heavy) shake(false);
              } else {
                const spread = f.straddle ? 10 : 22;
                for (let k = 0; k < Math.min(f.shots || 2, 4); k++) later(k * 70, () => splash(jitter(to, spread)));
                if (f.straddle) floatText(to, f.type === 'broadside' ? 'GLANCES OFF' : 'STRADDLE', 'muted');
                sound('splash', 0);
              }
              if (f.crossingT && f.from?.own && view.tick - lastTee > 5) { lastTee = view.tick; showBanner('CROSSING THE T', 'good'); }
            };
            if (from) shell(from, to, flight, heavy, land); else later(flight * 0.5, land);
          });
          break;
        }
        case 'missile':
          later(t0, () => { if (from) { flash(from, 7); smokePuff(from, 8); sound('whoosh', 0); if (to) missile(from, to, tickMs * 0.9, () => {}); } });
          break;
        case 'intercept':
          if (to) later(start * 0.5 + i * gap, () => { const p = jitter(to, 16); explosion(p, false); floatText(p, 'INTERCEPTED', 'muted'); sound('pop', 0); });
          break;
        case 'missile-hit':
        case 'torpedo-hit':
        case 'mine':
          if (to) later(start * 0.5 + i * gap, () => {
            if (f.type !== 'missile-hit') splash(to, true);
            explosion(to, true);
            floatText(to, f.to.own ? `−${f.damage}` : 'HIT', f.to.own ? 'own' : 'enemy');
            sound('explode', 0);
            if (f.to.own) shake(true);
            if (f.type === 'torpedo-hit') { showBanner(f.to.own ? `${label(f.to)} TORPEDOED` : 'TORPEDO HIT!', f.to.own ? 'alert' : 'good'); if (!f.to.own) stats.torpedoHits += 1; }
            if (f.type === 'mine') showBanner(`${label(f.to)} STRIKES A MINE`, f.to.own ? 'alert' : 'good');
          });
          break;
        case 'torpedo': {
          // Own spreads: exact aim point. Hostile: only the launch point (if seen) and whom it threatens.
          if (!f.eta) { // submarines: the weapon itself is drawn from view.entities
            later(t0, () => { if (from) { splash(from); sound('whoosh', 0); } });
            if (f.to?.own) showBanner('TORPEDO IN THE WATER', 'alert');
            break;
          }
          const aim = at || to;
          if (!aim) break;
          const a = from || aim;
          torpedoes.push({ a, b: aim, launch: view.tick, arrive: view.tick + (f.eta || 1), own: Boolean(f.from?.own) });
          later(t0, () => { if (from) { splash(from); sound('splash', 0); } });
          if (f.to?.own) showBanner('TORPEDOES IN THE WATER', 'alert');
          break;
        }
        case 'ram':
          if (to) later(t0, () => {
            explosion(jitter(to, 3), f.heavy);
            for (let k = 0; k < 3; k++) later(k * 80, () => splash(jitter(to, 10), k === 0));
            floatText(to, f.to.own ? `−${f.damage}` : f.heavy ? 'RAMMED!' : 'GLANCING', f.to.own ? 'own' : 'enemy');
            sound('explode', 0);
            if (f.to.own) shake(true);
            if (f.heavy) showBanner(f.to.own ? `${label(f.to)} IS RAMMED` : `${label(f.to)} RAMMED AMIDSHIPS`, f.to.own ? 'alert' : 'good');
            if (f.to && !f.to.own) observed.set(f.to.id, (observed.get(f.to.id) || 0) + (f.heavy ? 4 : 1));
          });
          break;
        case 'fire':
          if (to) later(start + flight + i * gap, () => { smokePuff(jitter(to, 6), 14); floatText(to, 'FIRE!', f.to.own ? 'own' : 'enemy'); });
          if (f.to && !f.to.own) observed.set(f.to.id, Math.max(6, observed.get(f.to.id) || 0));
          if (f.to) showBanner(`${label(f.to)} IS ON FIRE`, f.to.own ? 'alert' : 'good');
          break;
        case 'ping':
          if (from) later(start * 0.3, () => {
            for (let k = 0; k < 3; k++) later(k * 260, () => { const c = el('circle', { cx: from.x, cy: from.y, r: 12, class: 'fx-ping-wave' }); temp(c, 2200); });
            if (f.from?.own) sfx.play('sonar', 0);
          });
          break;
        case 'ivan':
          if (from) later(start * 0.4, () => floatText(from, 'CRAZY IVAN', 'muted'));
          break;
        case 'decoy':
          if (from) later(start * 0.4, () => { for (let k = 0; k < 4; k++) later(k * 90, () => splash(jitter(from, 9))); floatText(from, 'NOISEMAKER', 'muted'); });
          break;
        case 'dud':
          if (to) later(start * 0.5, () => { splash(to, true); floatText(to, 'DUD — DID NOT ARM', f.to.own ? 'own' : 'enemy'); sound('hit', 0); showBanner('THE TORPEDO DID NOT ARM', f.to.own ? 'good' : 'alert'); });
          break;
        case 'event':
          if (f.label) showBanner(f.label, 'alert');
          break;
        case 'explosion': {
          // Something big happened aboard an unidentified contact; what, exactly, is unknown.
          const p = to || at;
          if (p) later(start + flight + i * gap, () => { explosion(p, true); later(200, () => smokePuff(jitter(p, 8), 14)); sound('explode', 0); });
          if (f.to) observed.set(f.to.id, (observed.get(f.to.id) || 0) + 3);
          break;
        }
        case 'torpedo-miss':
          if (at) later(start * 0.5, () => { splash(at); floatText(at, 'RAN WIDE', 'muted'); });
          break;
        case 'sunk':
        case 'magazine':
          if (to) later(start + flight + 150 + i * gap, () => {
            explosion(to, true);
            later(160, () => explosion(jitter(to, 10), true));
            for (let k = 0; k < 3; k++) later(300 + k * 220, () => smokePuff(jitter(to, 10), 16));
            sound('explode', 0);
            if (f.type === 'magazine') { flash(to, 60); shake(true); showBanner(`${label(f.to)} BLOWS UP`, f.to.own ? 'alert' : 'good'); }
            else showBanner(`${label(f.to)} SINKS`, f.to.own ? 'alert' : 'good');
          });
          break;
        case 'struck':
          if (to) later(start + flight + 150, () => { floatText(to, '⚑ STRUCK', f.to.own ? 'own' : 'enemy'); showBanner(`${label(f.to)} STRIKES HER COLOURS`, f.to.own ? 'alert' : 'good'); });
          break;
        case 'aground':
          if (to) later(start, () => floatText(to, 'AGROUND', 'muted'));
          break;
        default:
          break;
      }
    });
    drawTorpedoes(view.tick, tickMs * 0.9);
  }

  return {
    play,
    banner: showBanner,
    stats: () => ({ ...stats }),
    observedDamage: (id) => observed.get(id) || 0,
    reset() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      observed.clear();
      torpedoes = [];
      stats = blankStats();
      lastTee = -99;
      generation += 1;
      bannerQueue = [];
      bannerBusy = false;
      banner.className = 'banner';
      layer.innerHTML = '';
      tracks.innerHTML = '';
    },
    setSound: (on) => sfx.enable(on),
    soundOn: () => sfx.enabled(),
    unlock: () => sfx.unlock(),
    setScene: (era) => sfx.setScene(era),
    pauseAudio: () => sfx.pause(),
  };
}

// Tiny Web Audio synth: quiet environmental beds and event sounds. No assets.
export function createSound() {
  let ctx = null, out = null, noise = null, on = false, scene = 'sail', ambient = null;
  const scenes = {
    sail: { wash: 650, level: 0.26, spray: 0.035, pulse: 0.11 },
    ironclad: { wash: 470, level: 0.18, spray: 0.025, pulse: 0.13, motor: 54, motorLevel: 0.04 },
    dreadnought: { wash: 540, level: 0.18, spray: 0.03, pulse: 0.12, motor: 48, motorLevel: 0.035 },
    coldwar: { wash: 190, level: 0.15, spray: 0.003, pulse: 0.08, motor: 61, motorLevel: 0.035 },
    modern: { wash: 510, level: 0.18, spray: 0.03, pulse: 0.12, motor: 64, motorLevel: 0.03 },
  };
  function stopAmbient(immediate = false) {
    if (!ambient || !ctx) return;
    const { gate, sources } = ambient;
    ambient = null;
    gate.gain.cancelScheduledValues(ctx.currentTime);
    if (immediate) {
      gate.gain.setValueAtTime(0, ctx.currentTime);
      for (const source of sources) source.stop();
      gate.disconnect();
    } else {
      gate.gain.setValueAtTime(gate.gain.value, ctx.currentTime);
      gate.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
      for (const source of sources) source.stop(ctx.currentTime + 0.16);
      setTimeout(() => gate.disconnect(), 220);
    }
  }
  function startAmbient() {
    if (!on || !ctx || ctx.state !== 'running' || ambient) return;
    const p = scenes[scene] || scenes.sail;
    const gate = ctx.createGain();
    gate.gain.setValueAtTime(0, ctx.currentTime);
    gate.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.2);
    gate.connect(out);
    const wash = ctx.createBufferSource(); wash.buffer = noise; wash.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = p.wash;
    const level = ctx.createGain(); level.gain.value = p.level;
    wash.connect(filter); filter.connect(level); level.connect(gate);
    const spray = ctx.createBufferSource(); spray.buffer = noise; spray.loop = true;
    const sprayFilter = ctx.createBiquadFilter(); sprayFilter.type = 'highpass'; sprayFilter.frequency.value = 1100;
    const sprayLevel = ctx.createGain(); sprayLevel.gain.value = p.spray;
    spray.connect(sprayFilter); sprayFilter.connect(sprayLevel); sprayLevel.connect(gate);
    const pulse = ctx.createOscillator(); pulse.type = 'sine'; pulse.frequency.value = p.pulse;
    const depth = ctx.createGain(); depth.gain.value = p.level * 0.6;
    pulse.connect(depth); depth.connect(level.gain);
    const sources = [wash, spray, pulse];
    if (p.motor) {
      const motor = ctx.createOscillator(); motor.type = 'triangle'; motor.frequency.value = p.motor;
      const motorGain = ctx.createGain(); motorGain.gain.value = p.motorLevel;
      motor.connect(motorGain); motorGain.connect(gate);
      sources.push(motor);
    }
    for (const source of sources) source.start();
    ambient = { gate, sources };
  }
  function unlock() {
    if (!on) return null;
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ctx.createDynamicsCompressor();
        out = ctx.createGain(); out.gain.value = 0.45;
        out.connect(comp); comp.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') {
        const current = ctx;
        Promise.resolve(ctx.resume()).then(() => { if (ctx === current) startAmbient(); }).catch(() => {});
      } else startAmbient();
    } catch { ctx = null; }
    return ctx;
  }
  function burst({ dur, freq, vol, delay = 0, type = 'lowpass' }) {
    const c = ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime + delay / 1000;
    const src = c.createBufferSource(); src.buffer = noise;
    const filter = c.createBiquadFilter(); filter.type = type; filter.frequency.setValueAtTime(freq, t); filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.35), t + dur);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(vol, t + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  function tone({ dur, from, to, vol, delay = 0 }) {
    const c = ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime + delay / 1000;
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(from, t); osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = c.createGain(); gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(vol, t + 0.05); gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1400;
    osc.connect(filter); filter.connect(gain); gain.connect(out);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  const kinds = {
    heavy: (d) => { burst({ dur: 0.9, freq: 260, vol: 0.9, delay: d }); burst({ dur: 0.12, freq: 2400, vol: 0.25, delay: d }); },
    gun: (d) => burst({ dur: 0.32, freq: 900, vol: 0.45, delay: d }),
    hit: (d) => { burst({ dur: 0.18, freq: 3200, vol: 0.35, delay: d }); burst({ dur: 0.7, freq: 300, vol: 0.55, delay: d + 20 }); },
    splash: (d) => burst({ dur: 0.45, freq: 2200, vol: 0.14, delay: d, type: 'bandpass' }),
    explode: (d) => { burst({ dur: 2.2, freq: 180, vol: 1, delay: d }); burst({ dur: 0.4, freq: 1600, vol: 0.4, delay: d }); },
    pop: (d) => burst({ dur: 0.2, freq: 1800, vol: 0.3, delay: d }),
    sonar: (d) => { const c = ctx; if (!c || c.state !== 'running') return; const t = c.currentTime + d / 1000; const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1180, t); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4); o.connect(g); g.connect(out); o.start(t); o.stop(t + 2.5); },
    whoosh: (d) => { tone({ dur: 0.9, from: 180, to: 520, vol: 0.12, delay: d }); burst({ dur: 0.8, freq: 1200, vol: 0.2, delay: d, type: 'bandpass' }); },
  };
  return {
    unlock,
    enable(v) { on = Boolean(v); if (!on && ctx) { stopAmbient(true); ctx.suspend?.(); } },
    enabled: () => on,
    setScene(era) { if (scene !== era) { scene = era; stopAmbient(); startAmbient(); } },
    pause() { if (ctx) { stopAmbient(true); ctx.suspend?.(); } },
    play(kind, delay = 0) { if (on && ctx) kinds[kind]?.(delay); },
  };
}
