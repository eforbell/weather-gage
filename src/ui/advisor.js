// The flag lieutenant: short, era-specific tactical advice for a new admiral.
// Uses only the player's view (own ships, contact reports, wind), never enemy truth.
import { distance, isActive, DIRECTIONS } from '../sim/engine.js';

const dirs = ['east', 'south-east', 'south-west', 'west', 'north-west', 'north-east'];

const PRIMERS = {
  sail: [
    ['The weather gage', 'The squadron upwind chooses when and how close to fight. A ship downwind must tack slowly to close, and cannot easily escape an attack.'],
    ['Broadsides, not bows', 'Guns fire to port and starboard. A ship pointing at you can barely reply; turn to show your side before you arrive.'],
    ['Concentrate', 'Two ships on one enemy end the fight before her consorts can help. Form line keeps your ships together.'],
    ['Know when to go', 'A ship that strikes her colours is a prize for the enemy. Withdraw a mauled ship early; she still counts at the end.'],
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
  ww2: [
    ['Radar sees, eyes name', 'Your SG sets hold the enemy at ten miles and more in the dark, but a blip has no name. Only a lookout, or the light of starshell, says what it is.'],
    ['The long torpedo', 'Japanese destroyers and cruisers carry torpedoes that reach eight miles, twice what your guns can see at night. A spread aimed at your gun flashes is already running before you know it.'],
    ['Light them up', 'Cruisers without fire-control radar need light to shoot at night: starshell (often wide), a burning target, or an enemy close enough to see. A searchlight lights the enemy, and the ship holding it.'],
    ['Keep the cruisers together', 'Form line keeps the cruisers on the enemy cruisers instead of being drawn off by his destroyers. The airfield is what matters.'],
    ['Emissions', 'Untick a ship’s radar to go silent. The 1942 Imperial Navy has no receiver that hears centimetric radar, so silence buys little here and costs you the picture.'],
  ],
  coldwar: [
    ['Hear, don’t be heard', 'Speed is noise. Silent running is slow but nearly inaudible; at flank speed you are loud and deaf. Hunters sprint, then drift to listen.'],
    ['A bearing is not a position', 'Each boat has its own sonar picture: select a submarine to see what she hears. Passive contacts sit somewhere inside their ring. Hold contact and the ring shrinks; hold it three ticks and sonar will classify it, not always correctly.'],
    ['One ping only', 'Active sonar gives an exact fix and tells everyone where you are. It is also how one captain says hello to another.'],
    ['Torpedoes have no loyalty', 'A seeker homes on the loudest boat ahead of it, including the one that fired it. Inside its arming distance a torpedo is just a heavy object.'],
    ['Don’t start a war', 'Peacetime rules: Dallas holds fire. Shoot first and Konovalov is your enemy too. But an attack on a boat under your protection is an attack on you.'],
    ['Screens and patrols', 'Surface escorts and carriers have their own tactical pictures. Patrol aircraft can search a distant hex, but reports take time and do not magically update every submarine.'],
  ],
  modern: [
    ['Find without being found', 'Active radar sees far but announces you. Passive ships can still see emitters.'],
    ['Salvo against defence', 'Interceptors are finite. Several missiles arriving together swamp a defence that could stop them one at a time.'],
    ['Stand off', 'Keep preferred range long so your captains launch before the enemy closes.'],
  ],
};

const CONVOY_PRIMER = [
  ['The wolf pack attacks at night, on the surface', 'A surfaced U-boat is fast and almost invisible to a lookout. Centimetric Type 271 radar finds her at four miles, and her receiver cannot hear it.'],
  ['Push them down', 'A submerged U-boat makes seven knots and cannot keep up with the convoy. Every boat you force under is a boat that is not attacking.'],
  ['Huff-Duff', 'Each time a U-boat radios the convoy’s position, Walker’s HF/DF gets a bearing. Run it down before she attacks.'],
  ['Unleash the escorts', 'On Screen, escorts hunt only close to the convoy. Engage lets them go after contacts further out, and the pack is broken up before it closes. Escorts that cling to the columns lose the convoy.'],
  ['Mind your emissions', 'Metox hears Sackville’s old metric radar from ten miles and steers the pack toward her. The centimetric 271 is unheard. Consider silencing Sackville.'],
];

export function primer(era, scenarioId) {
  if (scenarioId === 'convoy') return CONVOY_PRIMER;
  const items = PRIMERS[era] || [];
  return scenarioId === 'northern_screen' ? items.filter(([title]) => title !== 'Don’t start a war') : items;
}

export function advise(view, sc) {
  const own = view.ships.filter(isActive);
  const fresh = view.contacts.filter(c => !c.stale);
  if (view.outcome) return 'The action is over. Read the dispatch, then try a new sortie with a different plan.';
  if (!own.length) return 'No ships remain in action.';
  const lead = own[0];
  if (!fresh.length) {
    if (sc.era === 'coldwar') {
      const carrier = own.find(s => s.type === 'carrier');
      if (carrier && (carrier.airSorties ?? 0) > 0 && (carrier.patrolReadyAt ?? 0) <= view.tick) return `${carrier.name} has aircraft ready. Launch a patrol toward the suspected lane; reports will arrive after two ticks.`;
    }
    if (sc.era === 'ww2' && own.some(s => s.sensors?.search) && !own.some(s => s.radar)) return 'Every set is silent and the night is empty. The enemy cannot hear your radar; switch the SG cruisers back on or you will not find him in the dark.';
    if (sc.era === 'modern' && !own.some(s => s.radar)) return 'Your ships are silent and blind. A short radar burst finds the enemy but tells him where you are.';
    return view.tick < 2 ? 'No contacts yet. Engage sends captains toward the enemy’s likely position; Proceed lets you choose the approach.' : 'Contact lost. Last-known markers show where the enemy was, not where he is.';
  }
  const nearest = [...fresh].sort((a, b) => distance(lead, a) - distance(lead, b))[0];
  const bearing = directionToward(lead, nearest);

  if (sc.era === 'sail') {
    const hurt = own.find(s => s.hull < 45 && s.order.type !== 'withdraw');
    if (hurt) return `${hurt.name} is badly mauled. Withdraw her before she strikes — a damaged ship that escapes still counts.`;
    if (own.length > 1 && distance(own[0], own[1]) > 4) return 'Your ships are fighting apart. Form line so your broadsides fall on the same target.';
    if (turn(bearing, view.wind) <= 1) return 'The enemy lies upwind and holds the weather gage. Let him come down to you in line, broadsides ready, rather than beating up against the wind.';
    if (turn(bearing, (view.wind + 3) % 6) <= 1) return 'You hold the weather gage: you decide when to close. Bear down together and open fire at close range.';
    return 'Neither side holds the weather gage yet. The first to get upwind of the other chooses the terms of the fight.';
  }

  if (sc.era === 'coldwar') {
    const listener = own.find(s => s.id === view.sonarOf) || own.find(s => s.side === 'blue');
    const defector = own.find(s => s.side !== 'blue');
    const quiet = fresh.find(c => /seismic|magma/i.test(c.className || ''));
    const heard = view.entities.find(e => !e.own && e.kind === 'torpedo');
    if (heard) return 'Torpedo in the water! Captains will evade on their own; a noisemaker or a turn into an unarmed fish may save them.';
    if (listener?.type === 'asw_destroyer' && fresh.some(c => distance(listener, c) <= listener.doctrine.range)) return `${listener.name} is close enough to prosecute the contact. Keep the screen between the carrier and the datum.`;
    if (defector && defector.doctrine.depth === 'surface') return `${defector.name} is on the surface and visible for miles. Keep Dallas between her and the hunter, and be ready to defend her.`;
    if (defector) return `${defector.name} is under your command. Her route, speed and depth are yours to set; an attack on her is now an attack on you.`;
    if (quiet && listener && distance(listener, quiet) <= 8) return 'That “seismic noise” is moving at a steady course and speed. Nature doesn’t do that. One ping might get an answer.';
    if (quiet) return 'Sonar reports faint seismic noise that keeps a steady bearing drift. Close the range quietly and listen.';
    if (listener && listener.doctrine.speed === 'flank') return `${listener.name} is at flank speed: loud and half-deaf. Slow down to hear anything.`;
    return 'Nothing on sonar you can trust yet. Slow, quiet and patient finds more than fast and loud.';
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

  if (sc.id === 'convoy') {
    if (own.some(s => s.type === 'submarine')) {
      const surfaced = own.filter(s => s.type === 'submarine' && s.doctrine.depth === 'surface');
      return surfaced.length ? 'Stay on the surface in the dark and close on the merchant ships; dive when escorts come at you.' : 'Your boats are down. Wait for the hunt to pass, then surface and catch the convoy up.';
    }
    if (fresh.some(c => c.by === 'hfdf')) return 'HF/DF bearing: a U-boat is reporting the convoy. Send an escort down the bearing before the pack gathers.';
    const screening = own.filter(s => s.depthCharges !== undefined && s.order.type === 'screen');
    if (screening.length >= 3 && fresh.length) return 'Escorts on Screen hunt only close to the convoy. Order some to Engage and break up the pack before it reaches the merchant ships.';
    if (fresh.some(c => c.submerged)) return 'A U-boat is down. Hold her with ASDIC and depth-charge her, or simply keep her down while the convoy draws away.';
    return 'Hunt what the 271s find: a surfaced U-boat is a tiny echo at four miles. Sackville’s metric radar is heard by Metox; silence it if the pack seems to know where you are.';
  }
  if (sc.era === 'ww2') {
    if (!own.some(s => s.sensors?.search)) {
      // The Imperial Navy side: no radar, better eyes, the long torpedo.
      if (fresh.some(c => c.by === 'flash')) return 'Their guns are firing: the flashes give you a bearing. Long Lances reach eight miles; let the destroyers send spreads down the bearing before you show yourself.';
      return 'Your lookouts see further in the dark than theirs, but their radar sees further still. Keep the cruisers moving on the airfield; let the destroyers deal with whatever comes out of the night.';
    }
    const blips = fresh.filter(c => c.by === 'radar' && c.confidence === 'sighted');
    if (blips.length && fresh.every(c => c.confidence === 'sighted')) return 'Radar blips only. Guns hold fire until a contact is classified, though destroyers will torpedo any fresh report; close in, or let the SG cruisers lead.';
    const cruisers = fresh.filter(c => /cruiser/i.test(c.className || ''));
    const scattered = own.filter(s => s.type === 'cruiser' && s.order.type === 'engage');
    if (cruisers.length && scattered.length > 1) return `Enemy cruisers in the picture. Form line on the flagship so your ${scattered.length} cruisers fight the ships bound for the airfield, not the screen.`;
    if (fresh.some(c => c.by === 'flash')) return 'Gun flashes on the horizon: someone is firing. Expect torpedoes before you see the ship that fired them.';
    return 'Keep the radar cruisers on the heaviest blips. Ships without fire-control radar fire starshell first and shoot only once the target is lit or close.';
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
  if (sc.era === 'coldwar') {
    if (sc.id === 'northern_screen') {
      if (result === 'victory') return 'Steadfast made the crossing. Separate sonar tracks, a forward submarine screen and timely patrol reports kept the carrier out of the raiders’ reach.';
      if (result === 'defeat') return 'The carrier was exposed. Keep destroyers between her and the contacts, and launch patrols toward the likely approach before the enemy closes.';
      return 'The escort survived but missed the rendezvous. A shorter route and earlier patrol reports may buy the time to cross.';
    }
    if (result === 'victory') return 'Red October made the rendezvous. Whether by quiet patience, one ping or a torpedo that turned on its owner, the defector is home.';
    const commanded = view.ships.some(s => s.side !== 'blue');
    if (commanded) return 'She was under your protection and still did not make it. Keep Dallas close, slow her down before the hunter hears her, and be ready to defend her once she is attacked.';
    if (view.hostileFrom?.includes('red')) return 'You were at war with the Soviet Navy before Red October ever asked for help. Peacetime rules exist for a reason.';
    return 'Red October never came under your protection. Close on the strange “seismic noise” and try one ping.';
  }
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
  if (sc.id === 'convoy') {
    if (view.ships.some(s => s.side === 'red')) return result === 'defeat' ? 'The convoy was savaged. Surface attacks at night, before the escorts found you, decided it.' : 'The convoy came through. Too many of your boats were forced down, and a submerged boat cannot keep up.';
    if (result === 'victory') return 'The convoy came through. Radar found them on the surface, HF/DF found them when they talked, and the escorts kept them down.';
    if (result === 'defeat') return 'The pack got in among the merchant ships. Let the escorts off the leash (Engage), run down HF/DF bearings early, and do not radiate what Metox can hear.';
    return 'A battered convoy. Hunt further out: a U-boat forced down astern never reaches the columns.';
  }
  if (sc.era === 'ww2') {
    // The engine scores from the US side; a red player raided the airfield.
    if (view.ships.some(s => s.side === 'red')) {
      if (result === 'defeat') return 'The airfield burned. Night eyes, the long torpedo and a bombardment group that kept its course beat the radar.';
      if (result === 'victory') return 'Turned back. Their radar found you long before your lookouts found them; keep the cruisers on course and send the destroyers at their gun flashes.';
      return 'Neither through nor beaten off. Press on harder: the airfield is the objective, not the enemy cruisers.';
    }
    if (result === 'victory') return 'The airfield is safe. Radar found them, the line kept the cruisers on the cruisers, and the night belonged to whoever could see in it.';
    if (result === 'defeat') return 'They reached the bombardment line. Keep the radar on, form your cruisers in line across their path, and fight the cruisers, not the screen.';
    return 'Neither through nor beaten off. Close sooner: radar-directed fire needs the enemy inside about twelve miles.';
  }
  if (sc.era === 'sail') {
    if (stats.hits < stats.taken) return 'The enemy delivered more broadsides than you. Concentrate your ships on one opponent, and use the wind to choose the moment you close.';
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
