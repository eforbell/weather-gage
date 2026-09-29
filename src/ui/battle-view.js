// A presentation-only view of the selected ship's reported picture. Never pass
// raw simulation ships here: contacts must come from getView's fog-of-war view.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

function project(point, focus) {
  const dx = (point.q - focus.q) * 58 + (point.r - focus.r) * 29;
  const dy = (point.r - focus.r) * 34;
  const y = 284 + dy * 1.25;
  return { x: 500 + dx * 1.16, y, scale: clamp(0.52, 1.28, 1 + (y - 284) / 390) };
}

function shipArt(ship, own, era) {
  const sub = era === 'coldwar' && !['carrier', 'asw_destroyer'].includes(ship.type);
  const sail = era === 'sail';
  const heavy = ['battleship', 'battlecruiser', 'ironclad', 'carrier'].includes(ship.type);
  const hull = sub
    ? '<path class="bv-hull" d="M-76 8 Q-58 -5 60 -4 Q79 0 84 8 Q68 19 -59 17 Z"/><path class="bv-deck" d="M-18 -5 L-8 -23 L15 -23 L27 -4 Z"/>'
    : '<path class="bv-hull" d="M-91 3 L79 3 L91 -3 L80 25 Q15 36 -69 24 Z"/><path class="bv-keel" d="M-68 23 Q8 34 78 24"/>';
  const deck = sub ? '' : sail
    ? '<path class="bv-deck" d="M-67 2 V-4 H64 V2 Z"/><path class="bv-mast" d="M-40 -4 V-100 M17 -4 V-116 M56 -4 V-81"/><path class="bv-rig" d="M-40 -97 L-70 -15 M-40 -97 L8 -12 M17 -114 L-26 -13 M17 -114 L70 -12 M56 -79 L33 -10 M56 -79 L78 -10"/><path class="bv-sail" d="M-36 -93 Q-5 -79 -18 -56 L-35 -53 Z M21 -107 Q58 -83 39 -56 L21 -56 Z M59 -73 Q78 -56 69 -37 L59 -39 Z"/>'
    : `<path class="bv-deck" d="M-66 2 V-8 H58 L69 2 Z"/><path class="bv-bridge" d="M-31 -8 V-35 H17 L25 -8 Z"/><path class="bv-window" d="M-23 -29 H11"/><path class="bv-funnel" d="M1 -35 V-55 H16 V-35 Z"/>${ship.type === 'carrier' ? '<path class="bv-carrier" d="M-63 -16 H67 V-9 H-63 Z"/><path class="bv-deckline" d="M-52 -13 H52"/>' : '<path class="bv-turret" d="M-67 -8 H-42 L-38 -16 H-60 Z M38 -8 H63 L67 -16 H43 Z"/><path class="bv-gun" d="M-66 -14 L-93 -17 M-55 -14 L-84 -18 M52 -14 L82 -17 M61 -14 L91 -17"/>'}`;
  const smoke = !sub && (ship.hull < 65 || !sail) ? '<g class="bv-smoke"><circle cx="8" cy="-67" r="8"/><circle cx="18" cy="-85" r="12"/><circle cx="6" cy="-107" r="15"/></g>' : '';
  return `<g class="battle-ship ${own ? 'own' : 'reported'} ${sub ? 'submarine' : ''} ${heavy ? 'heavy' : ''}"><path class="bv-wake" d="M-99 10 Q-130 16 -171 11 M86 16 Q111 23 144 30"/>${hull}${deck}${smoke}</g>`;
}

function eventArt(fx, focus) {
  return fx.map((event, i) => {
    const point = event.to || event.at || event.from;
    if (!point) return '';
    const p = project(point, focus);
    if (p.x < -40 || p.x > 1040 || p.y < 135 || p.y > 510) return '';
    const delay = Math.min(i * 0.11, 0.65).toFixed(2);
    if (['missile-hit', 'torpedo-hit', 'mine', 'ram'].includes(event.type) || (['salvo', 'broadside'].includes(event.type) && event.hits)) {
      return `<g class="bv-impact" style="animation-delay:${delay}s" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><circle class="bv-impact-glow" r="42"/><circle class="bv-impact-core" r="15"/><path d="M-26 -26 L-8 -8 M20 -31 L7 -8 M-32 9 L-10 3 M29 17 L8 7"/></g>`;
    }
    if (['salvo', 'broadside', 'missile'].includes(event.type)) {
      const from = event.from ? project(event.from, focus) : p;
      return `<g class="bv-shot" style="animation-delay:${delay}s"><path d="M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q${((from.x + p.x) / 2).toFixed(1)} ${Math.min(from.y, p.y) - 95} ${p.x.toFixed(1)} ${p.y.toFixed(1)}"/><circle cx="${from.x.toFixed(1)}" cy="${from.y.toFixed(1)}" r="14"/><circle class="bv-shot-smoke" cx="${(from.x + 15).toFixed(1)}" cy="${(from.y - 16).toFixed(1)}" r="22"/></g>`;
    }
    return '';
  }).join('');
}

export function renderBattleScene(view, { selectedId, era, effects = [], aspectRatio = 1000 / 520 }) {
  const focus = view.ships.find(ship => ship.id === selectedId) || view.ships[0];
  if (!focus) return { svg: '', visibleContacts: 0 };
  const undersea = era === 'coldwar' && !['carrier', 'asw_destroyer'].includes(focus.type);
  const contacts = view.contacts.filter(c => c.q != null && c.r != null);
  const positioned = [
    ...view.ships.filter(s => s.status !== 'reserve').map(s => ({ ...s, own: true, point: project(s, focus) })),
    ...contacts.map(c => ({ ...c, own: false, point: project(c, focus) })),
  ].filter(s => s.point.x > -110 && s.point.x < 1110 && s.point.y > 130 && s.point.y < 520)
    .sort((a, b) => a.point.y - b.point.y);
  // The SVG uses `slice`: narrow viewports crop its left and right edges.
  const halfWidth = Math.min(500, 260 * aspectRatio);
  const halfHeight = Math.min(260, 500 / aspectRatio);
  const visibleContacts = positioned.filter(s => !s.own && Math.abs(s.point.x - 500) <= halfWidth && Math.abs(s.point.y - 260) <= halfHeight).length;
  const vessels = positioned.map(s => {
    const p = s.point;
    const name = s.own ? s.name : s.confidence === 'identified' ? s.name : s.className || 'Unresolved contact';
    const isReport = !s.own && (s.stale || s.confidence !== 'identified');
    const facing = s.own && s.facing >= 2 && s.facing <= 4 ? -1 : 1;
    const body = isReport
      ? `<ellipse class="bv-uncertainty" rx="${clamp((s.uncertainty || 1) * 35, 32, 90)}" ry="17"/><path class="bv-report-mark" d="M0 -41 V-17 M-8 -33 H8"/><text class="bv-report-q" y="-49">${s.stale ? 'LAST KNOWN' : 'REPORTED'}</text>`
      : `<g transform="scale(${facing} 1)">${shipArt(s, s.own, era)}</g>`;
    const scale = p.scale * (s.id === selectedId ? 1.08 : 0.76);
    return `<g class="bv-unit ${s.id === selectedId ? 'focus' : ''}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${scale.toFixed(2)})">${body}<text class="bv-unit-label" y="${isReport ? 26 : 52}">${esc(name)}</text></g>`;
  }).join('');
  const sparkles = Array.from({ length: 24 }, (_, i) => {
    const x = (i * 173 + 43) % 1000, y = 206 + (i * 71) % 305;
    return `<path class="bv-glint" style="animation-delay:${(i % 7) * 0.32}s" d="M${x} ${y} h${i % 3 === 0 ? 22 : 9}"/>`;
  }).join('');
  const svg = `<svg class="battle-scene ${undersea ? 'undersea' : ''}" viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustrative battle view from ${esc(focus.name)}; ${visibleContacts} reported contacts visible. Positions are approximate, not a targeting display."><defs><linearGradient id="bv-sky" x2="0" y2="1"><stop stop-color="#1d3b4a"/><stop offset=".56" stop-color="#c68059"/><stop offset="1" stop-color="#f2c58d"/></linearGradient><linearGradient id="bv-water" x2="0" y2="1"><stop stop-color="#597783"/><stop offset=".6" stop-color="#173c51"/><stop offset="1" stop-color="#102b3b"/></linearGradient><linearGradient id="bv-metal" x2="0" y2="1"><stop stop-color="#f8ddb0"/><stop offset=".28" stop-color="#8f9c9b"/><stop offset=".65" stop-color="#3d5664"/><stop offset="1" stop-color="#172d3a"/></linearGradient><radialGradient id="bv-sun"><stop stop-color="#fff5d9"/><stop offset=".3" stop-color="#f8dba6"/><stop offset="1" stop-color="#f8dba6" stop-opacity="0"/></radialGradient><radialGradient id="bv-fire"><stop stop-color="#fff9d1"/><stop offset=".25" stop-color="#ffd180"/><stop offset=".65" stop-color="#dc5936"/><stop offset="1" stop-color="#dc5936" stop-opacity="0"/></radialGradient></defs><rect class="bv-sky" width="1000" height="220"/><circle class="bv-sun" cx="747" cy="167" r="143"/><path class="bv-horizon" d="M0 216 H1000"/><rect class="bv-water" y="217" width="1000" height="303"/><path class="bv-light-road" d="M715 218 L773 218 L964 520 L444 520 Z"/>${sparkles}<path class="bv-swell" d="M0 285 Q160 272 314 287 T643 285 T1000 288 M0 393 Q180 378 330 395 T650 390 T1000 397 M0 485 Q210 469 392 482 T790 480 T1000 489"/>${vessels}${eventArt(effects, focus)}<path class="bv-vignette" d="M0 0 H1000 V520 H0 Z"/></svg>`;
  return { svg, visibleContacts };
}
