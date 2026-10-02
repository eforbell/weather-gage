// Backdoor: `?side=red` lets you command the other squadron. The UI is otherwise
// written for blue: briefings, objectives and the mission browser still describe
// the blue commander's task, and the engine scores outcomes from blue's side, so
// this module flips the result for display. Only two-sided scenarios without an
// escort objective qualify; anything else quietly stays blue.

const MIRRORED_TITLES = {
  'Enemy Squadron Defeated': 'Squadron Lost',
  'Squadron Lost': 'Enemy Squadron Defeated',
  'Favorable Dispatch': 'Unfavorable Dispatch',
  'Unfavorable Dispatch': 'Favorable Dispatch',
};

export function requestedSide(search = globalThis.location?.search || '') {
  try { return new URLSearchParams(search).get('side'); } catch { return null; }
}

export function playerSideFor(meta, setup, requested) {
  const sides = setup?.sides || ['blue', 'red'];
  if (!requested || requested === 'blue' || !sides.includes(requested)) return 'blue';
  if (sides.length !== 2 || meta?.victory?.protect) return 'blue';
  return requested;
}

// The engine's outcome is from blue's point of view; restate it for `side`.
export function outcomeFor(outcome, side) {
  if (!outcome || side === 'blue') return outcome;
  const result = outcome.result === 'victory' ? 'defeat' : outcome.result === 'defeat' ? 'victory' : outcome.result;
  return { ...outcome, result, title: MIRRORED_TITLES[outcome.title] || outcome.title };
}
