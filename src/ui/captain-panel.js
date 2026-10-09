import { xoReport } from './captain-feedback.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Both the inspector and immersive view use the same station and engine options.
// The prefix keeps native labels unique when both surfaces are in the DOM.
// Choices are a standing intent: the ship carries on with them until changed.
export function captainStation(view, { prefix = 'captain', compact = false } = {}) {
  const control = view.captainControl;
  const ship = view.ships.find(s => s.id === control?.shipId);
  if (!ship || !control || !view.captainOptions) return '';
  const { plan } = control;
  const options = view.captainOptions;
  const report = xoReport(view);
  const contacts = view.contacts.filter(c => !c.stale);
  const selectedContact = view.contacts.find(c => c.id === plan.targetId);
  const contactName = c => [c.name, c.className].filter(Boolean).join(' · ') || 'Unresolved contact';
  const risk = { high: ' · torpedo track', some: ' · near the track' };
  const button = (item, field) => `<button type="button" data-captain-${field}="${escape(item.id)}" aria-pressed="${plan[field] === item.id}" class="${plan[field] === item.id ? 'chosen' : ''}${item.torpedoRisk === 'high' ? ' risk' : ''}" ${item.enabled ? '' : 'disabled'}>${escape(item.label)}${item.torpedoRisk && risk[item.torpedoRisk] ? `<small>${risk[item.torpedoRisk]}</small>` : ''}</button>`;
  const buttons = (items, field) => items.map(item => button(item, field)).join('');
  const chosen = (items, id) => items.find(item => item.id === id);
  const reasons = items => items.map(item => `<li><b>${escape(item.label)}:</b> ${escape(item.reason)}</li>`).join('');
  const shots = options.shots || [];
  const forecast = (options.forecast || []).filter(line => line?.text);
  const alert = forecast.some(line => line.tone === 'warn');
  return `<section class="captain-station ${compact ? 'compact' : ''}" aria-label="Captain's station for ${escape(ship.name)}">
    <div class="captain-heading"><div><span class="eyebrow">ON THE QUARTERDECK</span>${compact ? `<strong>${escape(ship.name)}</strong>` : ''}</div><button type="button" data-captain-release>Return to flag</button></div>
    <p class="hint">Your orders stand until you change them. Other captains act on doctrine.</p>
    <section class="captain-feedback ${alert ? 'alert' : ''}" aria-label="XO's assessment"><span class="eyebrow">${escape(report.title)}</span><p>${escape(report.detail)}</p>${forecast.length ? `<ul class="captain-forecast">${forecast.map(line => `<li class="${line.tone === 'warn' || line.tone === 'good' ? line.tone : ''}">${escape(line.text)}</li>`).join('')}</ul>` : ''}<p class="hint">${escape(report.forecastNote || '')}</p><details class="captain-glossary"><summary>Plain-English help</summary><p class="hint">${escape(report.lesson)}</p></details></section>
    <fieldset><legend>1. Helm</legend><div class="captain-actions helm">${buttons(options.helm, 'helm')}</div><p class="hint captain-choice-reason">${escape(chosen(options.helm, plan.helm)?.reason)}</p></fieldset>
    <label class="control-label" for="${prefix}-target">2. Target</label>
    <select id="${prefix}-target" data-captain-target><option value="">Her captain’s choice</option>${plan.targetId && !contacts.some(c => c.id === plan.targetId) ? `<option value="${escape(plan.targetId)}" selected>${selectedContact ? `${escape(contactName(selectedContact))} · last known` : 'Previous report · no longer fresh'}</option>` : ''}${contacts.map(c => `<option value="${escape(c.id)}" ${c.id === plan.targetId ? 'selected' : ''}>${escape(contactName(c))} · ${escape(c.confidence)} · ${c.q}, ${c.r}</option>`).join('')}</select>
    <label class="check" for="${prefix}-roe"><input id="${prefix}-roe" type="checkbox" data-captain-roe ${ship.doctrine?.roe === 'free' ? 'checked' : ''}> Authorize attacks (weapons free)</label>
    <fieldset><legend>3. Guns</legend><div class="captain-actions">${buttons(options.weapons, 'weapon')}</div><p class="hint captain-weapon-reason">${escape(chosen(options.weapons, plan.weapon)?.reason)}</p></fieldset>
    ${shots.length ? `<fieldset><legend>4. Load with</legend><div class="captain-actions shot">${buttons(shots, 'shot')}</div><p class="hint">${escape(chosen(shots, plan.shot)?.reason)}</p></fieldset>` : ''}
    <details class="captain-readiness"><summary>Every choice, forecast</summary><ul>${reasons(options.helm)}${reasons(options.weapons)}${reasons(shots)}</ul></details>
    <button type="button" class="primary wide" data-captain-resolve>Resolve the turn →</button>
  </section>`;
}
