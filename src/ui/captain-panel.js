import { xoReport } from './captain-feedback.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Both the inspector and immersive view use the same station and engine options.
// The prefix keeps native labels unique when both surfaces are in the DOM.
export function captainStation(view, { prefix = 'captain', compact = false } = {}) {
  const control = view.captainControl;
  const ship = view.ships.find(s => s.id === control?.shipId);
  if (!ship || !control || !view.captainOptions) return '';
  const { plan } = control;
  const options = view.captainOptions;
  const weapons = options.weapons.filter(item => item.id !== 'torpedoes' || (ship.era === 'dreadnought' && ship.type === 'destroyer'));
  const report = xoReport(view);
  const contacts = view.contacts.filter(c => !c.stale);
  const selectedContact = view.contacts.find(c => c.id === plan.targetId);
  const contactName = c => c.name || c.className || 'Unresolved contact';
  const helmLabels = { hold: 'Hold station', port: 'Port · left', starboard: 'Starboard · right', ahead: 'Ahead' };
  const buttons = (items, field) => items.map(item => `<button type="button" data-captain-${field}="${escape(item.id)}" aria-pressed="${plan[field] === item.id}" class="${plan[field] === item.id ? 'chosen' : ''}" ${item.enabled ? '' : 'disabled'}>${escape(field === 'helm' ? helmLabels[item.id] || item.label : item.label)}</button>`).join('');
  const reasons = items => items.filter(item => item.id !== 'hold').map(item => `<li><b>${escape(item.label)}:</b> ${escape(item.reason)}</li>`).join('');
  return `<section class="captain-station ${compact ? 'compact' : ''}" aria-label="Captain's station for ${escape(ship.name)}">
    <div class="captain-heading"><div><span class="eyebrow">YOUR NEXT TURN</span>${compact ? `<strong>${escape(ship.name)}</strong>` : ''}</div><button type="button" data-captain-release>Return to flag</button></div>
    <p class="hint">Plan here, then advance one turn. Other captains act on doctrine.</p>
    <section class="captain-feedback" aria-label="XO's assessment"><span class="eyebrow">${escape(report.title)}</span><p>${escape(report.detail)}</p><details class="captain-glossary"><summary>Plain-English help</summary><p class="hint">${escape(report.lesson)}</p></details></section>
    <fieldset><legend>1. Helm — where to put the ship</legend><div class="captain-actions">${buttons(options.helm, 'helm')}</div></fieldset>
    <label class="control-label" for="${prefix}-target">2. Target — a reported contact</label>
    <select id="${prefix}-target" data-captain-target><option value="">No target designated</option>${plan.targetId && !contacts.some(c => c.id === plan.targetId) ? `<option value="${escape(plan.targetId)}" selected>${selectedContact ? `${escape(contactName(selectedContact))} · last known` : 'Previous report · no longer fresh'}</option>` : ''}${contacts.map(c => `<option value="${escape(c.id)}" ${c.id === plan.targetId ? 'selected' : ''}>${escape(contactName(c))} · ${escape(c.confidence)} · ${c.q}, ${c.r}</option>`).join('')}</select>
    <label class="check" for="${prefix}-roe"><input id="${prefix}-roe" type="checkbox" data-captain-roe ${ship.doctrine?.roe === 'free' ? 'checked' : ''}> Authorize attacks (weapons free)</label>
    <fieldset><legend>3. Weapons — commit or wait</legend><div class="captain-actions">${buttons(weapons, 'weapon')}</div><p class="hint captain-weapon-reason">${escape(weapons.find(item => item.id === 'guns')?.reason)}</p></fieldset>
    <details class="captain-readiness"><summary>Why an action can or cannot work</summary><ul>${reasons(options.helm)}${reasons(weapons)}</ul></details>
    <button type="button" class="primary wide" data-captain-resolve>Resolve captain's turn →</button>
  </section>`;
}
