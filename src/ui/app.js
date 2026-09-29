import { createGame, step, issueOrder, setDoctrine, setRadar, activePing, launchPatrol, getView, serialize, deserialize, isActive, distance, DIRECTIONS } from '../sim/engine.js';
import { SCENARIOS, SCENARIO_SETUPS } from '../sim/scenarios.js';
import { createFx } from './fx.js';
import { renderBattleScene } from './battle-view.js';
import { advise, primer, lesson } from './advisor.js';

const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dirs = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];
const storageKey = 'weather-gage.save.v1';
const SPEEDS = { slow: 1900, normal: 1150, fast: 600 };
const ERA = {
  sail: { label: 'AGE OF SAIL / TRAINING ACTION', region: ' / LEEWARD ISLANDS', propulsion: 'Rigging', stamp: '1799', sensor: () => 7 },
  ironclad: { label: 'IRONCLAD ERA / FLAG SIGNALS', region: ' / HAMPTON ROADS', propulsion: 'Engines', stamp: '1862', sensor: () => 9 },
  dreadnought: { label: 'DREADNOUGHT ERA / WIRELESS COMMAND', region: ' / NORTH SEA', propulsion: 'Engines', stamp: '1915', sensor: () => 10 },
  coldwar: { label: 'COLD WAR / UNDERSEA COMMAND', region: ' / NORTH ATLANTIC', propulsion: 'Propulsion', stamp: '1984', sensor: (s) => (s ? s.sonar + 4 : 8) },
  modern: { label: 'MISSILE AGE / FICTIONAL EXERCISE', region: ' / NORTHERN APPROACH', propulsion: 'Propulsion', stamp: 'MODERN', sensor: (s) => (s?.radar ? 11 : 5) },
};
const pref = (k, fallback) => { try { return localStorage.getItem(`weather-gage.${k}`) ?? fallback; } catch { return fallback; } };
const setPref = (k, v) => { try { localStorage.setItem(`weather-gage.${k}`, v); } catch { /* preference only */ } };
const newSeed = () => (Math.random() * 0x100000000) >>> 0;

let state = createGame('dogger', newSeed());
let selected = state.ships.find(s => s.side === 'blue').id;
let running = false;
let timer;
let notice = 'Chart ready. Review your sealed orders, then issue a signal.';
let overlays = true;
let battleOpen = false;
let battleFxTick = -1;
let group = false;
let plotting = false;
let speed = SPEEDS[pref('speed', 'normal')] ? pref('speed', 'normal') : 'normal';
let rotations = {};
let outcomeTimers = [];
let restoredSortie = false;
const scenario = () => SCENARIOS.find(s => s.id === state.scenarioId);
const era = () => ERA[scenario().era];
const flagship = () => state.ships.find(s => s.id === selected);
const recipients = () => group ? state.ships.filter(s => s.side === 'blue' && isActive(s)).map(s => s.id) : [selected];
const sonarRecipients = () => recipients().filter(id => state.ships.find(s => s.id === id && s.type !== 'carrier'));
const pt = ({ q, r }) => ({ x: 35 + Math.sqrt(3) * 19 * (q + r / 2), y: 34 + 28.5 * r });
const mapSize = (map = state.map) => ({ width: map?.width ?? 20, height: map?.height ?? 14 });
const chartBounds = (map = state.map) => {
  const { width, height } = mapSize(map);
  const last = pt({ q: width - 1, r: height - 1 });
  return { x: 0, y: 0, width: Math.ceil(last.x + 58), height: Math.ceil(last.y + 48) };
};
const chartViewBox = (map = state.map) => { const b = chartBounds(map); return `${b.x} ${b.y} ${b.width} ${b.height}`; };
const hex = (q, r) => { const p = pt({ q, r }); return Array.from({ length: 6 }, (_, i) => `${(p.x + 19 * Math.cos((60 * i - 30) * Math.PI / 180)).toFixed(1)},${(p.y + 19 * Math.sin((60 * i - 30) * Math.PI / 180)).toFixed(1)}`).join(' '); };
const statusName = s => isActive(s) ? 'Operational' : s.status === 'reserve' ? `In reserve · due T${s.arriveAt}` : s.status;
const orderName = o => ({ engage: 'Engage contacts', hold: 'Hold station', proceed: `Proceed ${o.q}, ${o.r}`, withdraw: 'Withdraw', line: 'Form line', screen: 'Screen flagship', shadow: 'Shadow contact' }[o.type] || o.type);
const downwind = () => { const [dq, dr] = DIRECTIONS[(state.wind + 3) % 6]; const a = pt({ q: 0, r: 0 }), b = pt({ q: dq, r: dr }); return { x: b.x - a.x, y: b.y - a.y }; };

$('#app').innerHTML = `
<header class="masthead">
  <a class="brand" href="./" aria-label="Weather Gage home"><span class="brand-mark">⚓</span><span>WEATHER GAGE<small>A NAVAL COMMAND GAME</small></span></a>
  <div class="edition">COMMAND EXPERIMENT / 004<br><span>SAIL · IRONCLAD · DREADNOUGHT · COLD WAR · MISSILE AGE</span></div>
  <div class="header-actions"><button id="missions">Missions</button><button id="briefing">Sealed orders</button><button id="help" aria-label="Open field manual">Field manual <span>↗</span></button></div>
</header>
<main>
  <section class="mission-bar" aria-label="Mission and simulation controls">
    <div class="mission-title"><span class="eyebrow" id="era-label"></span><label for="scenario" class="sr-only">Mission</label><select id="scenario">${SCENARIOS.map(s => `<option value="${escape(s.id)}">${escape(s.title)}</option>`).join('')}</select><span id="subtitle"></span></div>
    <div class="clock"><span class="eyebrow">SIMULATION CLOCK</span><strong id="tick"></strong><span id="clock-state">PAUSED / AWAITING ORDERS</span></div>
    <div class="time-actions"><label class="speed"><span class="eyebrow">PACE</span><select id="speed" aria-label="Clock pace"><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option></select></label><button id="play" class="secondary">▶ Run</button><button id="step" class="primary">Advance tick <span>→</span></button></div>
  </section>
  <div class="workspace">
    <aside class="roster-panel"><div class="section-heading"><h2>Your squadron</h2><span id="fleet-count"></span></div><div id="roster"></div>
      <div class="section-heading contacts-heading"><h2>Contact reports</h2><span id="contacts-source" class="tiny">INTELLIGENCE</span></div><div id="contacts"></div>
      <div class="admiralty-note"><span class="eyebrow">FLAG LIEUTENANT ADVISES</span><p id="era-note" aria-live="polite"></p></div>
    </aside>
    <section class="chart-panel" aria-label="Tactical chart and battle view"><div class="chart-toolbar"><div><span class="live-dot"></span><strong id="view-title">TACTICAL CHART</strong><span id="chart-region"></span></div><div class="toolbar-buttons"><button id="battle-toggle" class="battle-toggle" aria-pressed="false" aria-controls="battle-view">Go to the battle ↗</button><button id="sound" aria-pressed="false" title="Synthesized sea, machinery and combat sounds">Sound</button><button id="layers" aria-pressed="true">Sensor overlay</button></div></div>
      <div class="chart-wrap" id="chart-wrap"><svg id="chart" viewBox="0 0 925 445" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">Naval tactical chart</title><desc id="chart-desc">Friendly vessels, reported contacts and terrain on an axial hex grid. Gunfire, hits and sinkings are animated. Use the coordinate order controls as a keyboard alternative to clicking the map.</desc>
        <defs><radialGradient id="g-flash"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#f7c35a"/><stop offset=".7" stop-color="#d9622b" stop-opacity=".8"/><stop offset="1" stop-color="#9d463c" stop-opacity="0"/></radialGradient><radialGradient id="g-smoke"><stop offset="0" stop-color="#4c524f" stop-opacity=".55"/><stop offset="1" stop-color="#4c524f" stop-opacity="0"/></radialGradient><pattern id="p-mines" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#e6d8cf"/><path d="M0 0V6" stroke="#b77b6c" stroke-width="1.2"/></pattern></defs>
        <g id="l-sea"></g><g id="l-overlay"></g><g id="l-tracks"></g><g id="l-contacts"></g><g id="l-entities"></g><g id="l-ships"></g><g id="l-fx"></g><g id="l-hud"></g></svg>
        <div id="battle-view" class="battle-view" hidden><div id="battle-art"></div><div class="battle-head"><span class="battle-kicker">ON THE WATER / ILLUSTRATIVE VIEW</span><strong id="battle-name"></strong><span id="battle-position"></span></div><div class="battle-foot"><span id="battle-situation"></span><span>Select a ship to move the camera · return to chart to plot</span></div></div>
        <div id="banner" class="banner" aria-hidden="true"></div>
        <div class="chart-caption"><span id="chart-scale"></span><span>AXIAL GRID / Q, R</span></div></div>
      <div class="chart-legend"><span><i class="key friendly"></i> Your squadron</span><span><i class="key hostile"></i> Contact</span><span><i class="key stale"></i> Last known</span><span><i class="key land"></i> Land / shoal</span><span id="legend-mines"><i class="key mines"></i> Declared minefield</span><span><i class="key range"></i> Selected ship's gun range</span></div>
      <div class="situation"><span class="eyebrow">MISSION OBJECTIVE</span><p id="objective"></p></div>
    </section>
    <aside class="command-panel"><div class="section-heading"><h2>Signal office</h2><span class="tiny">COMMAND</span></div><div id="inspector"></div></aside>
  </div>
  <section class="dispatch-panel"><div class="dispatch-title"><span class="eyebrow">FROM THE BRIDGE</span><h2>Action dispatch</h2><span id="notice" role="status" aria-live="polite"></span></div><ol id="log"></ol></section>
  <footer><span>WEATHER GAGE <b>0.4</b> · PLAYABLE RESEARCH BUILD</span><div><button id="save">Save locally</button><button id="load">Load save</button><button id="export">Export</button><button id="import">Import</button><button id="restart">New sortie</button></div><span>NO ACCOUNT. NO TELEMETRY.</span></footer>
</main>
<input id="file" type="file" accept="application/json,.json" hidden>
<dialog id="launcher" class="launcher" aria-labelledby="launcher-title"></dialog>
<dialog id="dialog" aria-labelledby="dialog-title"><div class="dialog-top"><span class="eyebrow">OFFICE OF THE ADMIRAL</span><button id="close-dialog" aria-label="Close dialog">×</button></div><div id="dialog-content"></div><button id="acknowledge" class="primary">Return to the chart →</button></dialog>`;

const fx = createFx({ layer: $('#l-fx'), tracks: $('#l-tracks'), wrap: $('#chart-wrap'), banner: $('#banner'), pt });
fx.setSound(pref('sound', 'off') === 'on');

// ---------- Chart ----------

function silhouette(vessel) {
  if (vessel.era === 'coldwar') {
    if (vessel.type === 'carrier') return '<path class="hull carrier-hull" d="M24 0 L17 -7 L-18 -7 L-23 -3 L-23 4 L-17 7 L17 7 Z"/><rect class="carrier-deck" x="-18" y="-5" width="33" height="10"/><path class="deck" d="M-14 -2 H10 M-9 2 H13"/><rect class="funnel" x="4" y="-3" width="5" height="6"/>';
    if (vessel.type === 'asw_destroyer') return '<path class="hull surface" d="M20 0 L12 -4.5 L-15 -4.5 L-18 0 L-15 4.5 L12 4.5 Z"/><path class="deck" d="M-10 0 H10"/><rect class="funnel" x="-2" y="-2" width="4" height="4"/><circle class="turret" cx="13" r="2"/>';
    const beam = vessel.type === 'ssbn' ? 6 : 4.2;
    return `<path class="hull sub" d="M19 0 C15 -${beam} -12 -${beam} -17 0 C-12 ${beam} 15 ${beam} 19 0 Z"/><rect class="funnel" x="3" y="-1.6" width="6" height="3.2"/><path class="deck" d="M-17 0 L-21 -3 M-17 0 L-21 3"/>`;
  }
  if (vessel.era === 'dreadnought') {
    if (vessel.type === 'destroyer') return '<path class="hull" d="M16 0 L9 -3.2 L-12 -3.2 L-14 0 L-12 3.2 L9 3.2 Z"/><path class="deck" d="M-6 0 H6"/><rect class="funnel" x="-2" y="-1.4" width="3" height="2.8"/>';
    return '<path class="hull" d="M21 0 L14 -5.8 L-16 -5.8 L-20 0 L-16 5.8 L14 5.8 Z"/><circle class="turret" cx="11" r="2.6"/><circle class="turret" cx="4" r="2.6"/><rect class="funnel" x="-4" y="-2" width="4" height="4"/><circle class="turret" cx="-9" r="2.6"/><circle class="turret" cx="-15" r="2.2"/>';
  }
  if (vessel.era === 'ironclad') {
    if (vessel.turret) return '<ellipse class="hull" rx="17" ry="5.5"/><circle class="turret big" r="5"/><rect class="funnel" x="-11" y="-1.5" width="3" height="3"/>';
    if (vessel.type === 'ironclad') return '<path class="hull" d="M19 0 L12 -6 L-15 -6 L-18 0 L-15 6 L12 6 Z"/><path class="casemate" d="M9 -4 L-11 -4 L-13 0 L-11 4 L9 4 L11 0 Z"/><rect class="funnel" x="-3" y="-1.8" width="3.6" height="3.6"/><path class="ram" d="M19 0 L23 0"/>';
    const funnel = vessel.speed > 0 ? '<rect class="funnel" x="-1" y="-1.8" width="3.4" height="3.6"/>' : '';
    return `<path class="hull" d="M17 0 L5 -7 L-13 -6 L-16 0 L-13 6 L5 7 Z"/><path class="deck" d="M-8 0 H7 M-4 -5 V5 M5 -4 V4"/>${funnel}`;
  }
  if (vessel.era === 'sail') return '<path class="hull" d="M17 0 L5 -7 L-13 -6 L-16 0 L-13 6 L5 7 Z"/><path class="deck" d="M-8 0 H7 M-2 -5 V5 M6 -4 V4 M-9 -4 V4"/>';
  return '<path class="hull" d="M18 0 L6 -5.5 L-14 -5.5 L-16 0 L-14 5.5 L6 5.5 Z"/><rect class="funnel" x="-4" y="-2.5" width="7" height="5"/><circle class="turret" cx="11" r="2"/>';
}

function contactGlyph(contact) {
  const cls = (contact.className || '').toLowerCase();
  if (/destroyer|torpedo boat/.test(cls)) return '<path d="M10 0 L0 -6 L-10 0 L0 6 Z"/>';
  if (/battle|cruiser|destroyer|frigate|corvette|ironclad|sloop/.test(cls)) return '<path d="M0 -12 L12 0 L0 12 L-12 0 Z"/><circle r="3" class="contact-core"/>';
  return '<path d="M0 -10 L10 0 L0 10 L-10 0 Z"/>';
}

function drawSea(ship) {
  const terrain = new Map(state.map.terrain.map(t => [`${t.q},${t.r}`, t.type]));
  const range = era().sensor(ship);
  let svg = '';
  for (let r = 0; r < state.map.height; r++) for (let q = 0; q < state.map.width; q++) {
    const type = terrain.get(`${q},${r}`) || 'sea';
    // Overlay uses only own-ship sensor capability, not hidden enemy truth.
    const within = overlays && ship && isActive(ship) && distance(ship, { q, r }) <= range;
    svg += `<polygon points="${hex(q, r)}" class="hex ${type} ${within && type === 'sea' ? 'sensor' : ''}" data-q="${q}" data-r="${r}"><title>${q}, ${r} · ${type === 'mines' ? 'declared minefield' : type}</title></polygon>`;
    if (type === 'mines') { const p = pt({ q, r }); svg += `<text class="mine-glyph" x="${p.x}" y="${p.y + 3}">✱</text>`; }
  }
  for (const mark of scenario().marks || []) {
    for (const [q, r] of mark.cells) svg += `<polygon points="${hex(q, r)}" class="mark-cell"/>`;
    const [q, r] = mark.cells[0]; const p = pt({ q, r });
    svg += `<text class="mark-label" x="${p.x}" y="${p.y - 24}">${escape(mark.label)}</text>`;
  }
  for (let q = 0; q < state.map.width; q += 2) { const p = pt({ q, r: 0 }); svg += `<text class="grid-label" x="${p.x}" y="9">${q.toString().padStart(2, '0')}</text>`; }
  for (let r = 0; r < state.map.height; r += 2) { const p = pt({ q: 0, r }); svg += `<text class="grid-label" x="${p.x - 30}" y="${p.y + 3}">${r.toString().padStart(2, '0')}</text>`; }
  $('#l-sea').innerHTML = svg;
}

function gunRange(ship) {
  if (!ship) return 0;
  if (ship.era === 'sail') return Math.min(ship.doctrine.range, 3);
  if (ship.era === 'dreadnought') return ship.gunRange;
  if (ship.era === 'ironclad') return ship.battery ? Math.min(ship.doctrine.range + 1, 3) : 0;
  return ship.ammo > 0 ? ship.doctrine.range : 0;
}

function drawOverlay(ship) {
  let svg = '';
  if (ship && isActive(ship)) {
    const p = pt(ship);
    const range = gunRange(ship);
    if (range) svg += `<circle class="gun-range" cx="${p.x}" cy="${p.y}" r="${range * 32.9 + 8}"/>`;
    if (ship.era === 'dreadnought' && ship.torpedoes > 0) svg += `<circle class="torpedo-range" cx="${p.x}" cy="${p.y}" r="${3 * 32.9 + 8}"/>`;
    if (ship.order.type === 'proceed') {
      const b = pt(ship.order);
      svg += `<path class="route" d="M${p.x},${p.y} L${b.x},${b.y}"/><circle class="destination" cx="${b.x}" cy="${b.y}" r="9"/>`;
    }
  }
  $('#l-overlay').innerHTML = svg;
}

function keyed(layer, attr, id, create) {
  let node = [...layer.children].find(n => n.getAttribute(attr) === id);
  if (!node) { node = create(); node.setAttribute(attr, id); layer.appendChild(node); }
  return node;
}

function place(node, p) { node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`; }

function syncShips(view) {
  const layer = $('#l-ships');
  const ids = new Set(view.ships.filter(s => s.status !== 'reserve').map(s => s.id));
  for (const n of [...layer.children]) if (!ids.has(n.getAttribute('data-ship'))) n.remove();
  const wind = downwind();
  for (const vessel of view.ships.filter(s => s.status !== 'reserve')) {
    const node = keyed(layer, 'data-ship', vessel.id, () => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = `<title></title><circle class="selection" r="25"/><g class="rot"><g class="hullg">${silhouette(vessel)}</g></g><g class="damage"></g><text class="ship-label" y="32"></text>`;
      place(g, pt(vessel));
      rotations[vessel.id] = vessel.facing * 60;
      g.querySelector('.rot').style.transform = `rotate(${rotations[vessel.id]}deg)`;
      return g;
    });
    const active = isActive(vessel);
    node.setAttribute('class', `vessel ${selected === vessel.id ? 'selected' : ''} ${vessel.side !== 'blue' ? 'ally' : ''} ${vessel.doctrine?.depth === 'deep' ? 'deep' : ''} ${active ? '' : `inactive ${vessel.status}`}`);
    node.querySelector('title').textContent = `${vessel.name} · ${statusName(vessel)} · ${vessel.q}, ${vessel.r}`;
    node.querySelector('.ship-label').textContent = vessel.name.replace(/^(USS|HMS|BNS) /, '') + (vessel.status === 'struck' ? ' ⚑' : '');
    place(node, pt(vessel));
    const target = vessel.facing * 60;
    const current = rotations[vessel.id] ?? target;
    rotations[vessel.id] = current + ((((target - current) % 360) + 540) % 360 - 180);
    node.querySelector('.rot').style.transform = `rotate(${rotations[vessel.id]}deg)`;
    node.querySelector('.damage').innerHTML = active ? damageMarks(vessel.hull, wind) : '';
  }
}

function damageMarks(hull, wind) {
  if (hull >= 70) return '';
  const puffs = hull < 40 ? 4 : 2;
  let svg = `<g class="plume" style="--dx:${(wind.x * 0.9).toFixed(1)}px;--dy:${(wind.y * 0.9 - 10).toFixed(1)}px">`;
  for (let i = 0; i < puffs; i++) svg += `<circle r="${5 + i}" fill="url(#g-smoke)" style="animation-delay:${i * 0.45}s"/>`;
  svg += '</g>';
  if (hull < 40) svg += '<g class="fire"><circle cx="-3" cy="-1" r="2.6"/><circle cx="4" cy="1" r="2"/></g>';
  return svg;
}

function syncContacts(view) {
  const layer = $('#l-contacts');
  const ids = new Set(view.contacts.map(c => c.id));
  for (const n of [...layer.children]) if (!ids.has(n.getAttribute('data-contact'))) n.remove();
  const wind = downwind();
  for (const contact of view.contacts) {
    const node = keyed(layer, 'data-contact', contact.id, () => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      place(g, pt(contact));
      return g;
    });
    node.setAttribute('class', `contact ${contact.stale ? 'old' : ''}`);
    place(node, pt(contact));
    const label = contact.confidence === 'identified' ? contact.name : contact.className ? contact.className.toUpperCase() : contact.confidence.toUpperCase();
    const ring = contact.stale ? Math.min(45, 18 + (state.tick - contact.lastSeen) * 3) : Math.max(20, (contact.uncertainty || 0) * 32.9 + 10);
    const observed = fx.observedDamage(contact.id);
    node.innerHTML = `<circle r="${ring}" class="contact-ring"/>${contactGlyph(contact)}<text class="contact-symbol" y="4">${contact.stale ? '?' : ''}</text>${!contact.stale ? damageMarks(observed >= 6 ? 30 : observed >= 3 ? 60 : 100, wind) : ''}${contact.emitter && !contact.stale ? '<path class="emitter" d="M-15 -15 q5 -6 10 0 M-18 -19 q8 -9 16 0"/>' : ''}<text class="ship-label" y="-28">${escape(label)}</text>`;
  }
}

function drawHud() {
  const sc = scenario();
  const windy = sc.era === 'sail' || sc.era === 'dreadnought';
  const arrow = windy ? `<g transform="rotate(${((state.wind + 3) % 6) * 60})"><path class="wind-arrow" d="M-22 0 H18 M10 -6 L19 0 L10 6"/></g>` : '';
  const caption = sc.era === 'coldwar' ? 'SOUND CHANNEL · THERMAL LAYER' : sc.era === 'ironclad' ? 'SLACK WATER · SHOALS BAR DEEP DRAUGHT' : sc.era === 'sail' ? `WIND FROM ${dirs[state.wind]}` : sc.era === 'dreadnought' ? `WIND FROM ${dirs[state.wind]} · SMOKE DRIFTS ${dirs[(state.wind + 3) % 6]}` : 'SURFACE PICTURE';
  const b = chartBounds();
  $('#l-hud').innerHTML = `<g transform="translate(${b.width - 78} 67)" class="compass"><circle r="29"/><path d="M0 -36 V36 M-36 0 H36"/>${arrow}<path d="M0 -24 L5 10 L0 5 L-5 10 Z" class="needle"/><text y="-42">N</text><text y="55">${caption}</text></g>`;
}

function drawChart(view) {
  $('#chart').setAttribute('viewBox', chartViewBox());
  const ship = flagship();
  $('#chart').classList.toggle('undersea', scenario().era === 'coldwar');
  drawSea(ship);
  drawOverlay(ship);
  syncContacts(view);
  syncShips(view);
  syncEntities(view);
  drawHud();
}

function drawBattle(view, effects = []) {
  const focus = view.ships.find(s => s.id === selected);
  const panel = $('#battle-view');
  panel.hidden = !battleOpen;
  $('.chart-panel').classList.toggle('battle-active', battleOpen);
  $('#chart-wrap').classList.toggle('battle-on', battleOpen);
  $('#chart').setAttribute('aria-hidden', battleOpen);
  $('#battle-toggle').setAttribute('aria-pressed', battleOpen);
  $('#battle-toggle').textContent = battleOpen ? 'Return to chart ↙' : 'Go to the battle ↗';
  $('#view-title').textContent = battleOpen ? 'BATTLE VIEW' : 'TACTICAL CHART';
  $('#layers').hidden = battleOpen;
  if (!battleOpen || !focus) return;
  const scene = renderBattleScene(view, { selectedId: selected, era: scenario().era, effects, aspectRatio: panel.clientWidth / panel.clientHeight });
  $('#battle-art').innerHTML = scene.svg;
  $('#battle-name').textContent = focus.name;
  $('#battle-position').textContent = `T${String(state.tick).padStart(2, '0')} · GRID ${focus.q}, ${focus.r}`;
  $('#battle-situation').textContent = !view.contacts.length ? 'No enemy in sight · keep watch'
    : scene.visibleContacts ? `${scene.visibleContacts} report${scene.visibleContacts === 1 ? '' : 's'} in view · ${view.contacts.length} total`
      : `${view.contacts.length} report${view.contacts.length === 1 ? '' : 's'} · beyond camera`;
}

// Weapons in the water: own torpedoes and noisemakers exactly; others only as
// rough "heard" positions.
function syncEntities(view) {
  const layer = $('#l-entities');
  const ids = new Set(view.entities.map(e => e.id));
  for (const n of [...layer.children]) if (!ids.has(n.getAttribute('data-entity'))) n.remove();
  for (const e of view.entities) {
    const node = keyed(layer, 'data-entity', e.id, () => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      place(g, pt(e));
      return g;
    });
    node.setAttribute('class', `entity ${e.kind} ${e.own ? 'own' : 'heard'}`);
    place(node, pt(e));
    node.innerHTML = e.kind === 'decoy' ? '<circle class="bubbles" r="6"/><circle class="bubbles" r="3" cx="4" cy="-3"/>'
      : e.own ? `<g style="transform:rotate(${e.facing * 60}deg)"><path class="fish" d="M6 0 L-5 -1.6 L-5 1.6 Z"/><path class="fish-wake" d="M-6 0 H-22"/></g>${e.armed ? '' : '<text class="fish-label" y="-7">SAFE</text>'}`
      : '<circle class="heard-ring" r="11"/><text class="fish-label hostile" y="-14">TORPEDO?</text>';
  }
}

// ---------- Panels ----------

function contactLabel(view, targetId) {
  const c = view.contacts.find(x => x.id === targetId); // fc.targetId arrives as your contact id
  return c ? (c.name || c.className || 'unidentified contact') : 'a contact';
}

function eraPanel(ship, view) {
  const e = scenario().era;
  if (e === 'coldwar') {
    const names = scenario().id === 'northern_screen' ? { red: 'raiders', blue: 'escort' } : { red: 'Soviet Navy', green: 'the defector', blue: 'US Navy' };
    const war = view.hostileFrom.length ? view.hostileFrom.map(s => names[s] || s).join(', ') : 'nobody';
    if (ship.type === 'carrier') {
      const ready = (ship.patrolReadyAt ?? 0) <= state.tick;
      const sorties = ship.airSorties ?? 0;
      const flight = state.patrols?.find(p => p.carrierId === ship.id && p.resolveAt > state.tick);
      const { width, height } = mapSize();
      return `<div class="emcon"><div class="magazine"><span>AIR SORTIES <b>${sorties}</b></span><span>PATROL <b>${sorties <= 0 ? 'SPENT' : ready ? 'READY' : `T${ship.patrolReadyAt}`}</b></span><span>PICTURE <b>${view.contacts.length}</b></span></div>
        <form id="patrol-form" class="patrol-form"><label for="patrol-q">Patrol Q</label><input id="patrol-q" type="number" min="0" max="${width - 1}" value="${Math.min(width - 1, ship.q + 14)}" required><label for="patrol-r">R</label><input id="patrol-r" type="number" min="0" max="${height - 1}" value="${ship.r}" required><button type="submit" ${sorties <= 0 || !ready ? 'disabled' : ''}>Launch patrol</button></form>
        <p class="hint">${flight ? `Flight report due T${flight.resolveAt}. ` : ''}Patrols reach up to 14 hexes away and search within 5 of the chosen hex after two ticks. Reports belong to this carrier, not every boat.</p></div>`;
    }
    if (ship.type === 'asw_destroyer') {
      return `<div class="emcon"><div class="magazine"><span>ASW TORPEDOES <b>${ship.torpedoes}</b></span><span>SONAR <b>${ship.sonar}</b></span><span>CONTACTS <b>${view.contacts.length}</b></span></div>
        <button id="ping" class="wide">Active sonar ping</button>
        <p class="hint">${ship.captain ? `${escape(ship.captain.name)} · ${escape(ship.captain.trait)}. ` : ''}Surface escorts can localize a submarine, but a ping advertises the screen’s position. At war with you: ${escape(war)}.</p></div>`;
    }
    return `<div class="emcon"><div class="magazine"><span>TORPEDOES <b>${ship.torpedoes}</b></span><span>DECOYS <b>${ship.decoys}</b></span><span>NOISE <b>${ship.noise}</b></span></div>
      <div class="doctrine-row"><label for="sub-speed">Speed<select id="sub-speed">${['silent', 'standard', 'flank'].map(v => `<option ${ship.doctrine.speed === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label for="sub-depth">Depth<select id="sub-depth" ${ship.doctrine.depth === 'surface' ? 'disabled' : ''}>${['shallow', 'deep', ...(ship.doctrine.depth === 'surface' ? ['surface'] : [])].map(v => `<option value="${v}" ${ship.doctrine.depth === v ? 'selected' : ''}>${v === 'deep' ? 'below layer' : v === 'shallow' ? 'above layer' : 'surfaced'}</option>`).join('')}</select></label></div>
      <button id="ping" class="wide">One ping only</button>
      <p class="hint">${escape(ship.captain.name)} · ${escape(ship.captain.trait)}. At war with you: ${escape(war)}. Silent running is hard to hear but slow; flank speed is loud and half-deaf. A ping gives an exact fix and your position.</p></div>`;
  }
  if (e === 'modern') return `<div class="emcon"><label class="check"><input id="radar" type="checkbox" ${ship.radar ? 'checked' : ''}> Active radar</label><p class="hint">Longer detection; emissions expose you.</p><div class="magazine"><span>MISSILES <b>${ship.ammo}</b></span><span>DEFENSE <b>${ship.defense}</b></span></div></div>`;
  if (e === 'ironclad') {
    return `<div class="emcon"><div class="magazine"><span>${ship.turret ? 'TURRET' : 'BROADSIDE'} <b>${ship.battery}</b></span><span>RAM <b>${ship.ram ? (ship.ramReadyAt > state.tick ? 'BACKING' : 'READY') : '—'}</b></span><span>DRAUGHT <b>${ship.draft === 'deep' ? 'DEEP' : 'SHALLOW'}</b></span></div>
      ${ship.burning ? '<p class="hint alarm">Fire aboard. Hull and crew are burning away each turn.</p>' : ''}
      <p class="hint">${ship.type === 'ironclad' ? `Iron armour: wooden broadsides barely scratch the hull, but gun crews and machinery still suffer.${ship.ram ? ' Engage lets her captain ram wooden ships; beam-on blows are deadly.' : ''}` : 'Wooden hull: shell sets her afire. Keep her out of broadside range of heavier ships.'}${ship.draft === 'deep' ? ' Deep draught: she cannot cross shoals.' : ''}</p></div>`;
  }
  if (e === 'dreadnought') {
    const pips = [0, 1, 2].map(i => `<i class="${ship.fc.targetId && ship.fc.level > i ? 'on' : ''}"></i>`).join('');
    return `<div class="emcon"><div class="magazine"><span>${ship.type === 'destroyer' ? 'GUNS' : 'HEAVY GUNS'} <b>${ship.guns}</b></span>${ship.type === 'destroyer' ? `<span>TORPEDOES <b>${ship.torpedoes}</b></span>` : `<span>SECONDARIES <b>${ship.secondary}</b></span>`}<span>KNOTS <b>${ship.speed * 7 + 7}</b></span></div>
      <div class="fire-control"><span class="eyebrow">FIRE CONTROL</span><span class="pips" aria-label="Ranging level ${ship.fc.level} of 3">${pips}</span><small>${ship.fc.targetId ? `Ranging on ${escape(contactLabel(view, view.ships.find(s => s.id === ship.id)?.fc.targetId))}` : 'No target'}</small></div>
      <p class="hint">${ship.type === 'destroyer' ? 'Torpedo attack inside 3 hexes (inner ring). Engage sends her in; Screen keeps her with the line.' : 'All turrets bear abeam; only half fore or aft. Accuracy builds on a steady course.'}</p></div>`;
  }
  return '<p class="hint era-hint">Broadsides fire off the beam, not the bow. Wind limits movement; rigging damage slows a ship.</p>';
}

function renderInspector(view) {
  const ship = flagship();
  if (!ship) return;
  const active = isActive(ship) && !state.outcome;
  const pending = view.pending.filter(p => p.shipId === ship.id && p.order);
  const { width, height } = mapSize();
  const panel = eraPanel(ship, view);
  $('#inspector').innerHTML = `
    <span class="eyebrow">${escape(ship.className)}</span><h3>${escape(ship.name)}</h3><div class="ship-meta">GRID ${ship.q}, ${ship.r} <span>HEADING ${dirs[ship.facing]}</span></div>
    <div class="health-tracks">${[['hull', 'Hull'], ['propulsion', era().propulsion], ['weapons', 'Weapons'], ['crew', 'Crew / morale']].map(([key, label]) => `<div class="track"><label>${label}<b>${Math.round(ship[key])}%</b></label><meter min="0" max="100" low="35" high="65" optimum="100" value="${ship[key]}">${ship[key]}%</meter></div>`).join('')}</div>
    <div class="standing-order"><span class="eyebrow">STANDING ORDER</span><strong>${escape(orderName(ship.order))}</strong>${pending.map(p => `<small>↳ ${escape(orderName(p.order))} · arrives tick ${p.deliverAt}</small>`).join('')}</div>
    <fieldset ${active ? '' : 'disabled'}><legend>${ship.type === 'carrier' ? 'Carrier operations' : 'Issue a signal'}</legend>
    ${ship.type === 'carrier' ? panel : ''}
    <label class="check"><input id="group" type="checkbox" ${group ? 'checked' : ''}> Entire squadron</label>
    <div class="order-grid">${[['engage', 'Engage'], scenario().era === 'coldwar' ? ['shadow', 'Shadow'] : ['line', 'Form line'], ['screen', 'Screen'], ['hold', 'Hold'], ['proceed', 'Proceed ↗'], ['withdraw', 'Withdraw']].map(([type, label]) => `<button data-order="${type}" class="${plotting && type === 'proceed' ? 'chosen' : ''}">${label}</button>`).join('')}</div>
    <form id="plot-form"><label for="q">Q</label><input id="q" type="number" min="0" max="${width - 1}" value="${ship.q}" required aria-label="Destination Q coordinate"><label for="r">R</label><input id="r" type="number" min="0" max="${height - 1}" value="${ship.r}" required aria-label="Destination R coordinate"><button type="submit">Plot</button></form>
    <p class="hint">${plotting ? 'Click a sea hex to send a proceed order.' : scenario().era === 'dreadnought' ? 'Wireless orders arrive next tick, but each transmission reveals your flagship’s bearing.' : 'Orders travel by signal. Captains execute them automatically.'}</p>
    <label class="control-label" for="roe">Rules of engagement</label><select id="roe"><option value="free" ${ship.doctrine.roe === 'free' ? 'selected' : ''}>Weapons free</option><option value="hold" ${ship.doctrine.roe === 'hold' ? 'selected' : ''}>Hold fire</option></select>
    <div class="doctrine-row"><label for="range">Preferred range<input id="range" type="number" min="1" max="12" value="${ship.doctrine.range}"></label><label for="withdraw">Withdraw at hull %<input id="withdraw" type="number" min="0" max="90" step="5" value="${ship.doctrine.withdraw}"></label></div>
    <button id="doctrine" class="wide">Apply doctrine</button>
    ${ship.type === 'carrier' ? '' : panel}
    </fieldset>`;
}

function contactSourceLabel(view, sc) {
  if (sc.era !== 'coldwar') return 'INTELLIGENCE';
  const ship = view.ships.find((s) => s.id === selected);
  if (!ship) return 'SONAR';
  if (ship.type === 'carrier') return `${ship.name} AIR PICTURE`;
  if (ship.type === 'asw_destroyer') return `${ship.name} ASW PICTURE`;
  return `${ship.name} SONAR`;
}

let lastHull = {};
function render() {
  const sc = scenario();
  fx.setScene(sc.era);
  const view = getView(state, 'blue', selected);
  if (!view.ships.some(s => s.id === selected && s.status !== 'reserve')) selected = view.ships.find(s => s.status !== 'reserve')?.id;
  $('#scenario').value = state.scenarioId;
  $('#speed').value = speed;
  $('#era-label').textContent = sc.id === 'northern_screen' ? 'COLD WAR / CARRIER ESCORT' : era().label;
  $('#subtitle').textContent = sc.subtitle;
  $('#tick').textContent = `${String(state.tick).padStart(2, '0')} / ${sc.maxTicks}`;
  $('#clock-state').textContent = state.outcome ? 'MISSION COMPLETE' : running ? `RUNNING / ${speed.toUpperCase()} PACE` : 'PAUSED / AWAITING ORDERS';
  $('#play').textContent = running ? 'Ⅱ Pause' : '▶ Run';
  $('#play').disabled = $('#step').disabled = !!state.outcome;
  $('#sound').setAttribute('aria-pressed', fx.soundOn());
  $('#sound').textContent = fx.soundOn() ? '♪ Sound on' : '♪ Sound off';
  $('#contacts-source').textContent = contactSourceLabel(view, sc);
  $('#fleet-count').textContent = `${view.ships.filter(isActive).length} VESSELS`;
  $('#objective').textContent = sc.objective;
  $('#chart-region').textContent = era().region;
  $('#legend-mines').hidden = !state.map.terrain.some(t => t.type === 'mines');
  $('#chart-scale').textContent = `${sc.hexScale} · ${sc.tickLabel.toUpperCase()} TICKS`;
  $('#era-note').textContent = advise(view, sc);
  $('#roster').innerHTML = view.ships.map(s => {
    const hit = lastHull[s.id] !== undefined && s.hull < lastHull[s.id];
    return `<button class="roster-card ${selected === s.id ? 'active' : ''} ${hit ? 'hit' : ''} ${isActive(s) ? '' : 'lost'}" data-select="${escape(s.id)}" aria-pressed="${selected === s.id}"><span class="roster-top"><span class="ship-icon">➤</span><span class="ship-number">${escape(s.className)}</span><span class="status-dot ${isActive(s) ? '' : 'lost'}"></span></span><strong>${escape(s.name)}</strong><span class="roster-status">${escape(statusName(s))} <span>${Math.round(s.hull)}% HULL</span></span><span class="mini-bar ${s.hull < 35 ? 'low' : s.hull < 65 ? 'mid' : ''}"><i style="width:${s.hull}%"></i></span><span class="roster-order">${escape(orderName(s.order))}</span></button>`;
  }).join('');
  lastHull = Object.fromEntries(view.ships.map(s => [s.id, s.hull]));
  $('#contacts').innerHTML = view.contacts.length ? view.contacts.map(c => `<div class="contact-row"><span class="contact-glyph">${c.stale ? '?' : '◇'}</span><div><strong>${escape(c.confidence === 'identified' ? c.name : c.className || 'Unresolved contact')}</strong><span>${escape(c.confidence)} · ${c.q}, ${c.r}${c.emitter && !c.stale ? ' · TRANSMITTING' : ''}</span><small>${c.stale ? `LAST KNOWN · ${state.tick - c.lastSeen} TICKS AGO` : 'FRESH REPORT'}</small></div></div>`).join('') : '<p class="empty">No contacts reported.<br><span>Absence of evidence is not clear seas.</span></p>';
  renderInspector(view);
  drawChart(view);
  drawBattle(view);
  $('#notice').textContent = notice;
  $('#log').innerHTML = view.log.slice(-24).reverse().map(e => `<li class="${escape(e.kind || '')}"><time>T${String(e.tick).padStart(2, '0')}</time><span>${escape(e.text)}</span></li>`).join('');
  return view;
}

// ---------- Clock ----------

function pause() { running = false; clearInterval(timer); }
function startClock() { clearInterval(timer); timer = setInterval(advance, SPEEDS[speed]); }
function advance() {
  if (state.outcome) return;
  const known = new Set(getView(state, 'blue', selected).contacts.filter(c => !c.stale).map(c => c.id));
  state = step(state);
  const after = getView(state, 'blue', selected);
  const newContact = after.contacts.some(c => !c.stale && !known.has(c.id));
  notice = `Tick ${state.tick} resolved. Captains are following standing orders.`;
  if (newContact) fx.banner(known.size ? 'NEW CONTACT' : 'ENEMY IN SIGHT', 'alert');
  if (newContact && running) { pause(); notice = 'New contact report. Clock paused for your assessment.'; }
  if (state.outcome) { pause(); notice = state.outcome.title; recordResult(state.scenarioId, state.outcome.result); }
  document.documentElement.style.setProperty('--move', `${Math.round(SPEEDS[speed] * 0.45)}ms`);
  const view = render();
  if (battleOpen) { drawBattle(view, view.fx); battleFxTick = state.tick; }
  fx.play(view, SPEEDS[speed], { contactName: id => { const c = view.contacts.find(x => x.id === id); return c ? (c.name || c.className || 'ENEMY') : 'ENEMY'; }, shipName: id => view.ships.find(s => s.id === id)?.name || '' });
  if (state.outcome) { const outcome = state.outcome.result; outcomeTimers.push(setTimeout(() => { fx.banner(outcome === 'victory' ? 'VICTORY' : outcome === 'defeat' ? 'DEFEAT' : 'INDECISIVE', outcome === 'defeat' ? 'alert' : 'good'); }, SPEEDS[speed] * 0.8), setTimeout(showDebrief, SPEEDS[speed] + 1400)); }
}
function sendOrder(order) {
  pause();
  state = issueOrder(state, recipients(), order);
  plotting = false;
  notice = getView(state).log.at(-1)?.text || 'Signal submitted.';
  render();
}
function launchCarrierPatrol(q, r) {
  pause();
  const carrierIds = recipients().filter(id => state.ships.find(s => s.id === id && s.type === 'carrier'));
  if (!carrierIds.length) { notice = 'Select a carrier to launch an air patrol.'; render(); return; }
  state = launchPatrol(state, carrierIds, { q, r });
  notice = getView(state, 'blue', selected).log.at(-1)?.text || `Patrol launching for ${q}, ${r}; reports arrive after two ticks.`;
  render();
}

// ---------- Dialogs ----------

function openDialog(html) { pause(); render(); $('#dialog-content').innerHTML = html; if (!$('#dialog').open) $('#dialog').showModal(); }
function showBriefing() {
  const sc = scenario();
  const notes = { coldwar: 'A fan scenario inspired by The Hunt for Red October. Names are homage; sonar ranges, speeds and weapons are game abstractions, not real capabilities.', ironclad: 'Inspired by the Battle of Hampton Roads, 8–9 March 1862, with both days compressed into one sortie. Not a reconstruction: the map, speeds and damage are game abstractions.', sail: 'Signals take time. Seek a broadside position and mind the wind. This is an inspired-by-history squadron exercise, not a historical reconstruction.', dreadnought: 'Inspired by the Dogger Bank action of January 1915, not a reconstruction of it. Ranges, speeds and damage are game abstractions tuned for a 20-minute sortie.', modern: 'Radar improves detection but exposes emissions. Missiles and defensive interceptors are finite. This is a fictional, deliberately abstract surface-warfare exercise.' };
  const note = sc.id === 'northern_screen' ? 'A fictional escort exercise. Patrol range, sonar, weapons and travel time are deliberately abstract game values.' : notes[sc.era];
  openDialog(`<span class="dispatch-stamp">SEALED ORDERS / ${sc.era === 'modern' ? era().stamp : sc.year}</span><h1 id="dialog-title">${escape(sc.title)}</h1><p class="dialog-lead">${escape(sc.briefing)}</p><h3>Your objective</h3><p>${escape(sc.objective)}</p><h3>The admiral's primer</h3><ul class="primer">${primer(sc.era, sc.id).map(([title, text]) => `<li><b>${escape(title)}.</b> ${escape(text)}</li>`).join('')}</ul><h3>First three decisions</h3><ol><li>Select a vessel or check <b>Entire squadron</b>.</li><li>Choose <b>Engage</b>, or use <b>Proceed</b> to plot a position.</li><li><b>Run</b> the clock and watch the chart, or choose <b>Go to the battle</b> for a ship-level view. The flag lieutenant comments as the action develops.</li></ol><p class="dialog-note">${note}</p>`);
}
function showHelp() {
  openDialog(`<h1 id="dialog-title">A commodore, not a captain.</h1><p class="dialog-lead">You set intentions. Your captains find a course, hold formation, and fight according to doctrine.</p><dl class="manual"><dt>Orders & signals</dt><dd>Engage closes to preferred range. Hold stops movement, not defensive or automatic fire. Form line follows the flagship; Screen takes a flank station. Proceed uses axial Q/R coordinates. Withdraw heads toward your friendly edge. New signals replace that ship's queued signal.</dd><dt>Doctrine</dt><dd>Weapons free permits automatic attacks on current contacts in range and arc. Hold fire forbids attacks. The hull threshold triggers autonomous withdrawal. Doctrine changes apply immediately as a prototype simplification.</dd><dt>Contacts</dt><dd>Reports develop from sighted through classified to identified. Stale markers remain at the last observed position, not the hidden ship's current position. Opponent health is never shown; smoke and fire on a contact reflect only the hits you saw land.</dd><dt>Sail</dt><dd>Wind affects movement. Guns fire to port and starboard; captains maneuver for those arcs. Damage can reduce propulsion, weapons, and morale, not just hull.</dd><dt>Ironclad</dt><dd>Steam ships ignore the wind. Iron armour shrugs off most of a wooden broadside, though gun crews, machinery and funnels still suffer. Shell sets wooden ships afire; a fire burns each turn until it is brought under control. A ship with a ram, ordered to Engage, rams wooden ships alongside: beam-on is devastating, glancing blows are not, and the ram can be lost. Deep-draught ships cannot cross shoals. Ships at anchor cannot turn, and fire from ahead or astern rakes them. Flag signals take two to three turns, longer while the flagship's guns are firing. All ships fire simultaneously each turn. Reinforcements may arrive during the action.</dd><dt>Cold War undersea</dt><dd>Nobody sees anything: you hear. A boat's noise rises with speed; a silent boat is hard to hear, a boat at flank speed is loud and half-deaf. Passive contacts give a bearing: the reported position sits inside an uncertainty ring that shrinks while you hold contact, and after three ticks the contact is classified (sometimes wrongly). Nothing is heard dead astern (the baffles) except during a Crazy Ivan. The thermal layer muffles sound between boats at different depths. One ping gives an exact fix of everything within 10 hexes and tells everyone within 20 where you are. Torpedoes run 3 hexes a tick, are wire-guided to the aim point, then home on the loudest boat in their forward cone (friend or foe), and only explode after running their arming distance. Noisemakers can seduce them. Sides have rules of engagement: firing on a side, or on a boat under its protection, makes you enemies. Scenario events can change a boat mid-mission.</dd><dt>Cold War escorts</dt><dd>In The Northern Screen, select Steadfast to launch one of four patrol flights toward a Q/R sector within 14 hexes. A flight searches within five hexes and returns after two ticks; deep submarines can evade a sweep. Its report appears only in the carrier’s picture, not every vessel’s sensors. ASW destroyers can ping and fire limited torpedoes at submarine contacts. Select each ship to see its own picture.</dd><dt>Dreadnought</dt><dd>Ships keep steaming unless ordered to Hold: battleships 1 hex a tick, battlecruisers 1½, destroyers 2. Turrets bear fully abeam and half fore/aft, so the ship that crosses the enemy's T fires everything while he replies with his forward turrets. Fire control builds over successive salvos on one target (the pips) and drops in hard turns. Funnel smoke drifts downwind; firing straight downwind cuts accuracy. Destroyers carry two torpedo spreads, aimed where the target will be if she holds course. Battlecruisers are fast but thinly protected. Wireless orders arrive next tick but reveal your flagship's bearing, and are sometimes garbled. Captains avoid declared minefields.</dd><dt>Modern</dt><dd>Active radar sees farther but is detectable. Passive sensing can find emitting vessels. Finite missile magazines and defensive interceptors reward timing. Ranges and damage are game abstractions, not real weapon specifications.</dd><dt>Map & clock</dt><dd>The shaded overlay is a nominal sensor envelope; the dashed ring is the selected ship's gun range. Go to the battle opens an illustrated view of the selected ship's reported picture, never hidden enemy positions. Select another ship to move the camera; return to chart to click precise hexes. Pace sets how long each tick plays out. Run pauses on new contacts. Space toggles the clock; N advances one tick outside form fields.</dd><dt>Persistence</dt><dd>Save locally uses this browser and origin. Export a JSON save for a portable backup. Import validates before replacing a game. Every new sortie uses a fresh random seed.</dd></dl>`);
}
function showDebrief() {
  const out = state.outcome;
  if (!out) return;
  const own = getView(state).ships;
  const s = fx.stats();
  const tees = scenario().era === 'dreadnought' ? `<div><b>${s.tees}</b><span>SALVOS CROSSING THE T</span></div>` : '';
  openDialog(`<span class="dispatch-stamp">DISPATCH HOME / ${escape(out.result).toUpperCase()}</span><h1 id="dialog-title">${escape(out.title)}</h1><p class="dialog-lead">${escape(out.summary)}</p><div class="debrief-stats"><div><b>${state.tick}</b><span>TICKS ELAPSED</span></div><div><b>${own.filter(isActive).length}/${own.length}</b><span>OPERATIONAL</span></div><div><b>${s.hits}/${s.taken}</b><span>HITS SCORED / TAKEN</span></div>${tees}</div><h3>What the Admiralty will ask</h3><p>${escape(lesson(getView(state), scenario(), s))}</p><p class="dialog-note">Sortie seed ${state.seed}. Choose <b>New sortie</b> for a fresh engagement.</p>`);
}
// ---------- Mission browser ----------

const ERA_ORDER = [
  { era: 'sail', year: '1775–1815', name: 'Age of Sail' },
  { era: 'ironclad', year: '1850–1890', name: 'Ironclads & Steam' },
  { era: 'dreadnought', year: '1905–1918', name: 'Dreadnoughts' },
  { era: 'ww2', year: '1939–1945', name: 'Carriers & Radar', planned: true },
  { era: 'coldwar', year: '1947–1991', name: 'Cold War & ASW' },
  { era: 'modern', year: 'Near future', name: 'Missile Age' },
];
const RANK = { victory: 3, draw: 2, defeat: 1 };
function records() {
  try { const r = JSON.parse(localStorage.getItem('weather-gage.record') || '{}'); return r && typeof r === 'object' && !Array.isArray(r) ? r : {}; } catch { return {}; }
}
function recordResult(id, result) {
  if (restoredSortie) return; // a loaded save is not a new sortie
  const all = records();
  const r = all[id] || { plays: 0, best: null };
  r.plays += 1;
  r.last = result;
  if (!r.best || RANK[result] > RANK[r.best]) r.best = result;
  all[id] = r;
  setPref('record', JSON.stringify(all));
}

function miniChart(id) {
  const setup = SCENARIO_SETUPS[id];
  const width = setup.map?.width ?? setup.width ?? 20;
  const height = setup.map?.height ?? setup.height ?? 14;
  const terrain = new Map((setup.terrain || []).map(t => [`${t.q},${t.r}`, t.type]));
  let svg = '';
  for (let r = 0; r < height; r++) for (let q = 0; q < width; q++) {
    const p = pt({ q, r });
    svg += `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="15" class="mini ${terrain.get(`${q},${r}`) || 'sea'}"/>`;
  }
  for (const s of setup.ships.filter(s => s.side === 'blue')) { const p = pt(s); svg += `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="17" class="mini own"/>`; }
  return `<svg class="mini-chart" viewBox="${chartViewBox({ width, height })}" aria-hidden="true">${svg}</svg>`;
}

function missionCard(sc) {
  const setup = SCENARIO_SETUPS[sc.id];
  const own = setup.ships.filter(s => s.side === 'blue');
  const opposing = setup.ships.filter(s => s.side === 'red' && s.status !== 'reserve').length;
  const rec = records()[sc.id];
  const minutes = Math.round((sc.maxTicks * SPEEDS.normal) / 60000);
  const record = rec ? `Best: <b>${escape(rec.best)}</b> · ${rec.plays} sortie${rec.plays > 1 ? 's' : ''}` : 'Not yet sailed';
  return `<article class="mission-card era-${escape(sc.era)}">
    <div class="card-top"><span class="year">${sc.year < 2000 ? escape(sc.year) : 'NEAR FUTURE'}</span><span class="era-tag">${escape(ERA[sc.era].label.split(' / ')[0])}</span><span class="difficulty" title="Difficulty ${sc.difficulty} of 3" aria-label="Difficulty ${sc.difficulty} of 3">${'●'.repeat(Math.min(3, sc.difficulty))}${'○'.repeat(Math.max(0, 3 - sc.difficulty))}</span></div>
    ${miniChart(sc.id)}
    <h2>${escape(sc.title)}</h2><p class="card-sub">${escape(sc.subtitle)}</p>
    <dl><dt>Your force</dt><dd>${own.map(s => escape(s.name)).join(', ')}</dd><dt>Opposition</dt><dd>${opposing} warship${opposing > 1 ? 's' : ''} reported</dd><dt>Teaches</dt><dd>${escape(sc.teaches)}</dd><dt>Length</dt><dd>${sc.maxTicks} ${escape(sc.tickLabel)} turns · ${minutes <= 1 ? 'about a minute' : `about ${minutes} min`} of running clock, plus your pauses</dd></dl>
    <div class="card-foot"><span class="record ${rec?.best || ''}">${record}</span><button class="primary" data-launch="${escape(sc.id)}">Take command →</button></div>
  </article>`;
}

function showLauncher() {
  pause();
  outcomeTimers.forEach(clearTimeout); outcomeTimers = [];
  const byYear = [...SCENARIOS].sort((a, b) => a.year - b.year);
  $('#launcher').innerHTML = `<div class="dialog-top"><span class="eyebrow">THE ADMIRALTY CHART ROOM</span><button data-close aria-label="Close mission browser">×</button></div>
    <h1 id="launcher-title">Choose your command</h1><p class="dialog-lead">Each era changes the question. In sail you fight the wind, with ironclads you learn what the new weapons can do, and in 1915 it is about range, speed and finding the enemy first.</p>
    <ol class="era-line">${ERA_ORDER.map(e => `<li class="${e.planned ? 'planned' : ''} ${SCENARIOS.some(s => s.era === e.era) ? 'built' : ''}"><b>${e.name}</b><span>${e.year}${e.planned ? ' · in the dockyard' : ''}</span></li>`).join('')}</ol>
    <div class="mission-grid">${byYear.map(missionCard).join('')}</div>`;
  if (!$('#launcher').open) $('#launcher').showModal();
}

$('#missions').onclick = showLauncher;
// Closing the chart room without choosing (× or Esc) at the very start still gets you your orders.
$('#launcher').addEventListener('close', () => { if (state.tick === 0 && !$('#dialog').open) showBriefing(); });
$('#launcher').onclick = e => {
  if (e.target.closest('[data-close]')) { $('#launcher').close(); return; }
  const launch = e.target.closest('[data-launch]');
  if (launch) { newSortie(launch.dataset.launch); $('#launcher').close(); }
};

function resetVisuals() { outcomeTimers.forEach(clearTimeout); outcomeTimers = []; fx.reset(); rotations = {}; lastHull = {}; battleFxTick = -1; $('#l-ships').innerHTML = ''; $('#l-contacts').innerHTML = ''; }
function newSortie(id) {
  pause(); state = createGame(id, newSeed()); restoredSortie = false; selected = getView(state).ships.find(s => s.status !== 'reserve').id; plotting = false; group = false;
  resetVisuals();
  notice = 'New sortie. Standing by for your orders.'; render(); showBriefing();
}

// ---------- Wiring ----------

$('#step').onclick = () => { pause(); fx.unlock(); advance(); };
$('#play').onclick = () => { if (state.outcome) return; fx.unlock(); if (running) pause(); else { running = true; startClock(); } render(); };
$('#speed').onchange = e => { speed = SPEEDS[e.target.value] ? e.target.value : 'normal'; setPref('speed', speed); if (running) startClock(); render(); };
$('#sound').onclick = () => { fx.setSound(!fx.soundOn()); fx.unlock(); setPref('sound', fx.soundOn() ? 'on' : 'off'); render(); };
$('#battle-toggle').onclick = () => { battleOpen = !battleOpen; const view = render(); if (battleOpen && battleFxTick !== state.tick) { drawBattle(view, view.fx); battleFxTick = state.tick; } };
$('#briefing').onclick = showBriefing;
$('#help').onclick = showHelp;
$('#close-dialog').onclick = $('#acknowledge').onclick = () => $('#dialog').close();
$('#scenario').onchange = e => newSortie(e.target.value);
$('#restart').onclick = () => newSortie(state.scenarioId);
$('#layers').onclick = () => { overlays = !overlays; $('#layers').setAttribute('aria-pressed', overlays); drawChart(getView(state, 'blue', selected)); };
$('#roster').onclick = e => { const card = e.target.closest('[data-select]'); if (card) { selected = card.dataset.select; plotting = false; render(); } };
$('#chart').onclick = e => {
  const vessel = e.target.closest('[data-ship]');
  if (vessel && !plotting) { selected = vessel.dataset.ship; render(); return; }
  const cell = e.target.closest('[data-q]');
  if (cell && plotting && !state.outcome) sendOrder({ type: 'proceed', q: Number(cell.dataset.q), r: Number(cell.dataset.r) });
};
$('#inspector').onclick = e => {
  const order = e.target.closest('[data-order]');
  if (order) { if (order.dataset.order === 'proceed') { pause(); plotting = true; notice = 'Choose a sea hex on the chart, or enter Q/R coordinates.'; render(); } else sendOrder({ type: order.dataset.order }); }
  if (e.target.id === 'ping') { pause(); state = activePing(state, sonarRecipients()); const last = getView(state).log.at(-1)?.text || ''; notice = /ordered to ping/.test(last) ? 'Ping ordered for next tick. Everyone within earshot will know where you are.' : last; render(); return; }
  if (e.target.id === 'doctrine') {
    const range = Number($('#range').value), withdraw = Number($('#withdraw').value);
    if (!Number.isInteger(range) || range < 1 || range > 12 || !Number.isFinite(withdraw) || withdraw < 0 || withdraw > 90) { notice = 'Use a range of 1–12 and a withdrawal threshold of 0–90.'; $('#notice').textContent = notice; return; }
    state = setDoctrine(state, recipients(), { roe: $('#roe').value, range, withdraw }); notice = 'Standing doctrine updated.'; render();
  }
};
$('#inspector').onchange = e => {
  if (e.target.id === 'group') group = e.target.checked;
  if (e.target.id === 'sub-speed' || e.target.id === 'sub-depth') { state = setDoctrine(state, recipients(), e.target.id === 'sub-speed' ? { speed: e.target.value } : { depth: e.target.value }); notice = e.target.id === 'sub-speed' ? `Speed: ${e.target.value}.` : `Depth: ${e.target.value === 'deep' ? 'below the layer' : 'above the layer'}.`; render(); }
  if (e.target.id === 'radar') { state = setRadar(state, recipients(), e.target.checked); notice = e.target.checked ? 'Active radar enabled. Your emissions can be detected.' : 'Emissions control: radar silent.'; render(); }
};
$('#inspector').onsubmit = e => {
  if (e.target.id === 'plot-form') { e.preventDefault(); sendOrder({ type: 'proceed', q: Number($('#q').value), r: Number($('#r').value) }); }
  if (e.target.id === 'patrol-form') { e.preventDefault(); launchCarrierPatrol(Number($('#patrol-q').value), Number($('#patrol-r').value)); }
};
function restore(text) {
  const loaded = deserialize(text);
  const loadedView = getView(loaded);
  if (!loadedView.ships.length) throw Error('Save contains no player squadron.');
  const loadedSelection = loadedView.ships[0].id;
  pause(); state = loaded; restoredSortie = true; selected = loadedSelection; plotting = false; resetVisuals(); notice = 'Saved sortie restored. Clock paused.'; render();
}
$('#save').onclick = () => { pause(); try { localStorage.setItem(storageKey, serialize(state)); notice = 'Sortie saved in this browser. Export for a portable backup.'; } catch { notice = 'Browser storage unavailable or full. Use Export to keep your sortie.'; } render(); };
$('#load').onclick = () => { pause(); try { const saved = localStorage.getItem(storageKey); if (!saved) throw Error('No local save found.'); restore(saved); } catch (error) { notice = `Could not load: ${error.message}`; render(); } };
$('#export').onclick = () => { pause(); const url = URL.createObjectURL(new Blob([serialize(state)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `weather-gage-${state.scenarioId}-tick-${state.tick}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice = 'Save exported. Keep this JSON file to resume on another browser.'; render(); };
$('#import').onclick = () => { pause(); render(); $('#file').click(); };
$('#file').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { if (file.size > 2_000_000) throw Error('Save file is too large.'); restore(await file.text()); } catch (error) { notice = `Import rejected: ${error.message}`; render(); } e.target.value = ''; };
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); fx.pauseAudio(); render(); } else fx.unlock(); });
window.addEventListener('resize', () => { if (battleOpen) drawBattle(getView(state, 'blue', selected)); });
document.addEventListener('keydown', e => { if ($('#dialog').open || $('#launcher').open || /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return; if (e.code === 'Space') { e.preventDefault(); $('#play').click(); } if (e.key.toLowerCase() === 'n') { e.preventDefault(); $('#step').click(); } });
document.documentElement.style.setProperty('--move', `${Math.round(SPEEDS[speed] * 0.45)}ms`);
render();
showLauncher();
