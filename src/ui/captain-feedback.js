// Public-view learning feedback for Take Command. These helpers intentionally
// read only the already-public view object: own ships, public contacts, pending
// signals, and the captain-control fields supplied by the engine/UI boundary.

const REPORT = Object.freeze({
  none: { title: 'Captain report unavailable', detail: 'Select a sail or dreadnought vessel for Take Command feedback.', lesson: 'Captain reports explain the public picture, not hidden enemy state.' },
});

const ORDER_LESSONS = Object.freeze({
  engage: 'Engage closes for a firing position; it does not promise a shot this turn.',
  hold: 'Hold stops movement; Rules of Engagement decide whether the ship may fire.',
  screen: 'Screen guards the flagship from a flank station.',
  line: 'Form line follows the flagship rather than chasing independently.',
  proceed: 'Proceed steers toward the plotted chart hex after the order arrives.',
  withdraw: 'Withdraw preserves the ship by leaving the fight if possible.',
  shadow: 'Shadow keeps contact and reports instead of forcing an immediate attack.',
});

const ACTION_GLOSSARY = Object.freeze({
  sail: 'Port means left 60°; starboard means right 60°; sail guns are broadsides off the ship’s sides.',
  dreadnought: 'Port means left 60°; starboard means right 60°; dreadnought turrets bear best abeam, and steady ranging helps accuracy.',
  default: 'Port means left 60°; starboard means right 60°; choose a reported target before resolving.',
});

function fallbackText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function wordCount(text) {
  return fallbackText(text).split(/\s+/).filter(Boolean).length;
}

function shipName(ship) {
  return fallbackText(ship?.name, 'Vessel');
}

function shipEra(ship) {
  return fallbackText(ship?.era).toLowerCase();
}

function isCaptainEra(ship) {
  return shipEra(ship) === 'sail' || shipEra(ship) === 'dreadnought';
}

function orderType(order) {
  return fallbackText(order?.type, 'none');
}

function orderLabel(order) {
  const type = orderType(order);
  if (type === 'proceed' && Number.isFinite(order?.q) && Number.isFinite(order?.r)) return `Proceed to ${order.q},${order.r}`;
  if (type === 'line') return 'Form line';
  return type === 'none' ? 'No standing order' : `${type[0].toUpperCase()}${type.slice(1)}`;
}

function contactLabel(contact) {
  if (!contact) return 'selected contact';
  const name = fallbackText(contact.name) || fallbackText(contact.className) || contact.id;
  return contact.stale ? `${name} (old estimate)` : name;
}

function publicContacts(view) {
  return Array.isArray(view?.contacts) ? view.contacts.filter((c) => c && typeof c.id === 'string') : [];
}

function contactState(view) {
  const contacts = publicContacts(view);
  const fresh = contacts.filter((c) => !c.stale);
  if (!contacts.length) return { priority: 40, text: 'No contacts are plotted, so this is a search/closing intention.' };
  if (!fresh.length) return { priority: 35, text: 'No fresh contact reports are plotted; old estimates are places to investigate.' };
  return { priority: 0, text: `${fresh.length} current public contact${fresh.length === 1 ? '' : 's'} reported.` };
}

function orderIntent(order) {
  const type = orderType(order);
  if (type === 'engage') return 'Captain intends to close for a firing position.';
  if (type === 'hold') return 'Captain intends to stop movement and keep station.';
  if (type === 'screen') return 'Captain intends to guard the flagship from a screening station.';
  if (type === 'line') return 'Captain intends to form line on the flagship.';
  if (type === 'proceed') return `Captain intends to steer toward ${Number.isFinite(order?.q) && Number.isFinite(order?.r) ? `${order.q},${order.r}` : 'the plotted destination'}.`;
  if (type === 'withdraw') return 'Captain intends to preserve the ship and withdraw.';
  if (type === 'shadow') return 'Captain intends to keep contact and report.';
  return 'No standing order is visible for this ship.';
}

function pendingConstraint(view, ship) {
  const pending = Array.isArray(view?.pending) ? view.pending.find((p) => p?.shipId === ship?.id && p.order) : null;
  if (!pending) return null;
  const at = Number.isInteger(pending.deliverAt) ? ` at T${String(pending.deliverAt).padStart(2, '0')}` : '';
  return { priority: 100, text: `${orderLabel(pending.order)} signal is still in transit${at}; current behavior follows the acknowledged order.` };
}

function roeConstraint(ship) {
  if (ship?.doctrine?.roe === 'hold') return { priority: 90, text: 'ROE is Hold Fire, so the captain should not initiate attacks.' };
  return null;
}

function ownCooldownConstraint(view, ship) {
  const tick = Number.isInteger(view?.tick) ? view.tick : 0;
  if (!Number.isInteger(ship?.reloadUntil) || ship.reloadUntil <= tick) return null;
  const era = shipEra(ship);
  const weapon = era === 'dreadnought' ? 'Torpedoes' : 'Weapons';
  return { priority: 80, text: `${weapon} are cooling down until T${String(ship.reloadUntil).padStart(2, '0')}.` };
}

function damageConstraint(ship) {
  if (shipEra(ship) === 'sail' && Number.isFinite(ship?.propulsion) && ship.propulsion < 40) return { priority: 70, text: 'Rigging damage is severe enough to cost movement.' };
  if (Number.isFinite(ship?.weapons) && ship.weapons < 55) return { priority: 60, text: 'Weapon damage reduces the weight of any attack.' };
  if (Number.isFinite(ship?.crew) && ship.crew < 55) return { priority: 55, text: 'Crew and morale damage reduce fighting effectiveness.' };
  return null;
}

function fireControlConstraint(view, ship) {
  if (shipEra(ship) !== 'dreadnought' || !ship?.fc?.targetId) return null;
  const target = publicContacts(view).find((c) => c.id === ship.fc.targetId);
  const label = target ? contactLabel(target) : 'a contact no longer on the plot';
  const level = Number.isInteger(ship.fc.level) ? ship.fc.level : 0;
  return { priority: level >= 2 ? 50 : 45, text: `Fire control is ${level >= 2 ? 'well set' : 'setting'} on ${label}; hard turns can spoil it.` };
}

function topConstraint(view, ship) {
  return [pendingConstraint(view, ship), roeConstraint(ship), ownCooldownConstraint(view, ship), damageConstraint(ship), contactState(view), fireControlConstraint(view, ship)]
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority)[0];
}

function lessonFor(ship, order) {
  if (shipEra(ship) === 'dreadnought' && ship?.fc?.targetId) return 'Keeping a steady course on the same reported target helps fire control; hard turns can spoil it.';
  if (shipEra(ship) === 'sail' && Number.isFinite(ship?.propulsion) && ship.propulsion < 40) return 'Severe rigging damage can cost movement, so simple helm plans are safer.';
  return ORDER_LESSONS[orderType(order)] || 'A standing order is an intention that resolves with the turn.';
}

function inactiveStatusText(ship) {
  const status = fallbackText(ship?.status, 'inactive');
  if (status === 'active') return '';
  if (status === 'reserve') return 'Not yet in action; no new maneuver or fire will resolve until the ship arrives.';
  if (status === 'escaped') return 'The ship has left the action; no new maneuver or fire will resolve.';
  if (status === 'sunk') return 'The ship is sunk; no new maneuver or fire is possible.';
  if (status === 'struck') return 'The ship has struck; no new maneuver or fire is possible.';
  return 'The ship is not operational; no new maneuver or fire will resolve.';
}

export function captainReport(view, shipId) {
  const ship = Array.isArray(view?.ships) ? view.ships.find((s) => s?.id === shipId) : null;
  if (!ship || !isCaptainEra(ship)) return { ...REPORT.none };
  const order = ship.order || { type: 'none' };
  const inactive = inactiveStatusText(ship);
  if (inactive) return {
    title: `${shipName(ship)} captain: ${fallbackText(ship.status, 'inactive')}`,
    detail: `${inactive} Last standing order shown: ${orderLabel(order)}.`,
    lesson: 'Inactive vessels remain on the roster for awareness, not for Take Command actions.',
  };
  const constraint = topConstraint(view, ship);
  return {
    title: `${shipName(ship)} captain: ${orderLabel(order)}`,
    detail: [orderIntent(order), constraint?.text].filter(Boolean).join(' '),
    lesson: lessonFor(ship, order),
  };
}

function optionById(options, id) {
  return Array.isArray(options) ? options.find((option) => option?.id === id) : null;
}

function cleanReason(text) {
  return fallbackText(text, 'engine rejected it').replace(/[.!?]+$/u, '');
}

function unavailablePhrase(kind, option) {
  if (!option || option.enabled !== false) return '';
  const label = fallbackText(option.label, kind);
  return `${label} unavailable: ${cleanReason(option.reason)}.`;
}


function controlEra(view) {
  const id = view?.captainControl?.shipId;
  const ship = Array.isArray(view?.ships) ? view.ships.find((s) => s?.id === id) : null;
  return shipEra(ship);
}


export function xoReport(view) {
  const control = view?.captainControl;
  const options = view?.captainOptions || {};
  if (!control || !control.plan) {
    return {
      title: 'XO: no Take Command plan',
      detail: fallbackText(options.summary, 'Choose a vessel to see available captain actions.'),
      lesson: 'Choose a helm intention and reported target; the fleet moves when you resolve.',
    };
  }
  const plan = control.plan;
  const helm = fallbackText(plan.helm, 'hold');
  const weapon = fallbackText(plan.weapon, 'hold');
  const helmOption = optionById(options.helm, helm);
  const weaponOption = optionById(options.weapons, weapon);
  const report = fallbackText(control.report);
  const summary = fallbackText(options.summary, 'Plan the captain action, then resolve with the fleet.');
  const blockers = [unavailablePhrase('Helm', helmOption), unavailablePhrase('Weapon', weaponOption)].filter(Boolean).join(' ');
  const phase = report ? `Last resolution: ${report}` : 'Forecast: resolves with the fleet on Advance.';
  const detail = [summary, blockers, phase].filter(Boolean).join(' ');
  const glossary = ACTION_GLOSSARY[controlEra(view)] || ACTION_GLOSSARY.default;
  return {
    title: 'XO Take Command brief',
    detail: wordCount(detail) > 70 ? [blockers || summary, phase].filter(Boolean).join(' ') : detail,
    lesson: `${glossary} Choose a helm intention and reported target; the fleet moves when you resolve.`,
  };
}
