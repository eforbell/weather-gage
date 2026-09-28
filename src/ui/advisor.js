// The flag lieutenant: short, era-specific tactical advice for a new admiral.
// Uses only the player's view (own ships, contact reports, wind), never enemy truth.
import { distance, isActive, DIRECTIONS } from '../sim/engine.js';

const dirs = ['east', 'south-east', 'south-west', 'west', 'north-west', 'north-east'];

const PRIMERS = {
  sail: [
    ['The weather gage', 'The squadron upwind chooses when and how close to fight. A ship downwind must tack slowly to close, and cannot easily escape an attack.'],
    ['Broadsides, not bows', 'Guns fire to port and starboard. A ship pointing at you can barely reply; turn to show your side before you arrive.'],
    ['Concentrate', 'Two frigates on one enemy end the fight before his consort can help. Form line keeps your ships together.'],
    ['Know when to go', 'A frigate that strikes her colours is a prize for the enemy. Withdraw a mauled ship early; she still counts at the end.'],
  ],
  ironclad: [
    ['Iron against wood', 'Virginia’s armour turns their broadsides aside, and her shells set wooden ships afire. Close in without fear of their guns, but not of their numbers.'],
    ['The ram', 'On Engage her captain will ram a wooden ship alongside. Beam-on, bow into her side, is a killing blow; bow or stern only glances. The ram can be torn off in the wreck.'],
    ['Mind the draught', 'Virginia draws 22 feet. The sand-coloured shoals are walls to her, while gunboats and shallow-draught ironclads cross them freely.'],
    ['Rake the anchored ships', 'Ships at anchor cannot turn. Approach from ahead or astern, where their broadsides cannot bear, and your fire rakes them end to end.'],
    ['Flags in the smoke', 'Signals are flag hoists: two or three turns to arrive, longer while the flagship is firing. Give orders early.'],
  ],
  dreadnought: [
    ['Cross the T', 'Steam across the head of the enemy line. Every one of your turrets bears; only his forward turrets can reply.'],
    ['Steady course, steady guns', 'Fire control improves with each salvo on the same target (the pips in the signal office) and is lost in hard turns.'],
    ['The weather gage flips', 'In sail you want to be upwind. Here your funnel and gun smoke drift downwind into your own gunlayers’ eyes. Don’t fight with the enemy straight downwind.'],
    ['Destroyers are torpedoes', 'Sent in early on Engage, they force the enemy line to dodge and scatter. Held on Screen, they guard your capitals against his torpedo boats. One torpedo hit cripples a dreadnought.'],
    ['Mind the battlecruiser', 'Lion is fast but thinly armoured and her magazines are vulnerable. Speed is her protection, not armour.'],
  ],
  modern: [
    ['Find without being found', 'Active radar sees far but announces you. Passive ships can still see emitters.'],
    ['Salvo against defence', 'Interceptors are finite. Several missiles arriving together swamp a defence that could stop them one at a time.'],
    ['Stand off', 'Keep preferred range long so your captains launch before the enemy closes.'],
  ],
};

export function primer(era) { return PRIMERS[era] || []; }

export function advise(view, sc) {
  const own = view.ships.filter(isActive);
  const fresh = view.contacts.filter(c => !c.stale);
  if (view.outcome) return 'The action is over. Read the dispatch, then try a new sortie with a different plan.';
  if (!own.length) return 'No ships remain in action.';
  const lead = own[0];
  if (!fresh.length) {
    if (sc.era === 'modern' && !own.some(s => s.radar)) return 'Your ships are silent and blind. A short radar burst finds the enemy but tells him where you are.';
    return view.tick < 2 ? 'No contacts yet. Engage sends captains toward the enemy’s likely position; Proceed lets you choose the approach.' : 'Contact lost. Last-known markers show where the enemy was, not where he is.';
  }
  const nearest = [...fresh].sort((a, b) => distance(lead, a) - distance(lead, b))[0];
  const bearing = directionToward(lead, nearest);

  if (sc.era === 'sail') {
    const hurt = own.find(s => s.hull < 45 && s.order.type !== 'withdraw');
    if (hurt) return `${hurt.name} is badly mauled. Withdraw her before she strikes — a damaged frigate that escapes still counts.`;
    if (own.length > 1 && distance(own[0], own[1]) > 4) return 'Your frigates are fighting apart. Form line so both broadsides fall on the same target.';
    if (turn(bearing, view.wind) <= 1) return 'The enemy lies upwind and holds the weather gage. Let him come down to you in line, broadsides ready, rather than beating up against the wind.';
    if (turn(bearing, (view.wind + 3) % 6) <= 1) return 'You hold the weather gage: you decide when to close. Bear down together and open fire at close range.';
    return 'Neither side holds the weather gage yet. The first to get upwind of the other chooses the terms of the fight.';
  }

  if (sc.era === 'ironclad') {
    const iron = own.find(s => s.type === 'ironclad');
    const unknown = fresh.find(c => /turret/i.test(c.className || ''));
    if (iron && (iron.crew < 45 || iron.weapons < 40) && iron.order.type !== 'withdraw') return `${iron.name}'s gun crews are shot to pieces even if her iron holds. Withdraw her before she is taken.`;
    const gunboat = own.find(s => s.type === 'wooden' && s.hull < 50 && s.order.type !== 'withdraw');
    if (gunboat) return `${gunboat.name} is a wooden gunboat; she cannot trade broadsides. Pull her back or send her to Screen.`;
    if (unknown) return 'An unknown low-lying contact: a turret ironclad. Your shells will break on her armour, and hers on yours. Finish the wooden ships before she can shield them.';
    const wooden = fresh.find(c => /sloop|frigate/i.test(c.className || ''));
    const idleBoat = own.find(s => s.type === 'wooden' && s.order.type === 'screen' && s.hull > 70);
    if (iron && iron.ram && wooden && iron.order.type !== 'engage') return `A wooden ship is within reach. Order ${iron.name} to Engage and her captain will ram.`;
    if (idleBoat && wooden && iron && distance(iron, wooden) <= 3) return `Virginia is engaged. The gunboats can add their fire now, but keep ${idleBoat.name} away from the heavy broadsides of Minnesota.`;
    if (iron && wooden && distance(iron, wooden) > 3) return 'Close the range. Wooden broadsides cannot hurt your armour much, and your shells burn best at two cables.';
    return 'Anchored ships cannot turn. Come at them from ahead or astern and your fire rakes them end to end.';
  }

  if (sc.era === 'dreadnought') {
    const smoke = (view.wind + 3) % 6;
    const capitals = own.filter(s => s.type !== 'destroyer');
    const destroyers = own.filter(s => s.type === 'destroyer');
    const bc = capitals.find(s => s.flashRisk && s.hull < 50 && s.order.type !== 'withdraw');
    if (bc) return `${bc.name} is burning and her magazines are vulnerable. Consider withdrawing her before a turret flash ends her.`;
    const blinded = capitals.find(s => fresh.some(c => distance(s, c) <= s.gunRange && directionToward(s, c) === smoke));
    if (blinded) return `${blinded.name} is firing straight downwind into her own smoke. Swing the line so the enemy bears ${dirs[(smoke + 1) % 6]} or ${dirs[(smoke + 5) % 6]} instead.`;
    const enemyCapital = fresh.find(c => /battle/i.test(c.className || ''));
    const idleDD = destroyers.find(d => d.torpedoes > 0 && d.order.type !== 'engage');
    if (enemyCapital && idleDD && capitals.some(s => distance(s, enemyCapital) <= s.gunRange)) return `The capitals are engaged. This is the moment for a torpedo attack: order ${idleDD.name} to Engage.`;
    const ranging = capitals.find(s => s.fc.targetId && s.fc.level < 2);
    if (ranging && view.tick % 3 === 0) return `${ranging.name} is still finding the range. Avoid new orders that force a hard turn until her fire control settles.`;
    return 'Keep the enemy abeam and your course steady. A longer preferred range makes captains turn broadside earlier.';
  }

  const dry = own.find(s => s.ammo === 0);
  if (dry) return `${dry.name} has an empty magazine. Withdraw her; she can only absorb missiles now.`;
  if (own.every(s => s.radar)) return 'Every ship is radiating. Consider silencing one; she can still fire on the others’ picture.';
  return 'Contacts in range. Missiles launched together arrive together; that is how defences are overwhelmed.';
}

export function lesson(view, sc, stats) {
  const result = view.outcome?.result;
  if (sc.era === 'ironclad') {
    if (result === 'victory') return 'The blockade is broken. Armour, the ram and patience against anchored ships carried the day, as they did in 1862.';
    if (stats.hits < 4) return 'Virginia barely got into action. Shoals channel a deep-draught ship; plot a route through deep water, then Engage.';
    return 'The wooden ships survived too long. Concentrate on one at a time, ram when she is alongside, and let fire do the rest before the unknown ironclad arrives.';
  }
  if (sc.era === 'dreadnought') {
    if (stats.tees === 0) return 'Your ships never crossed the enemy’s T. Next time, approach on a course that puts the enemy line across your bow, not head-on. A longer preferred range makes captains turn broadside sooner.';
    if (stats.hits < stats.taken) return 'The enemy outshot you. Check the wind: firing downwind into your own smoke costs a third of your hits, and hard turns reset fire control.';
    if (!stats.torpedoHits) return 'Your destroyers scored no torpedo hits. Launch them when the enemy capitals are committed to a gunnery duel and holding course.';
    return result === 'victory' ? 'A well-fought action: good geometry, steady gunnery and torpedoes at the right moment.' : 'Good fundamentals. Look at when you committed the destroyers and whether the battlecruiser was exposed too long.';
  }
  if (sc.era === 'sail') {
    if (stats.hits < stats.taken) return 'The enemy delivered more broadsides than you. Concentrate both frigates on one opponent, and use the wind to choose the moment you close.';
    return result === 'victory' ? 'Well handled. Position before exchange won the day.' : 'The exchange was even. Holding the weather gage and forming line would let you choose the fight.';
  }
  return result === 'victory' ? 'The missile exchange went your way. Emission control and salvo timing decided it.' : 'Review when radar was on: the side that is seen first usually loses the missile exchange.';
}

function directionToward(a, b) {
  let best = 0, bestDist = Infinity;
  DIRECTIONS.forEach(([dq, dr], i) => {
    const n = { q: a.q + dq, r: a.r + dr };
    const d = Math.max(Math.abs(n.q - b.q), Math.abs(n.r - b.r), Math.abs(-n.q - n.r + b.q + b.r));
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}

function turn(a, b) { const d = Math.abs(a - b) % 6; return Math.min(d, 6 - d); }
