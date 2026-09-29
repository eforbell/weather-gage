// Public presentation specs for 3D ship silhouettes. Dimensions are painted
// presentation units used by the model kit, not historical feet/metres.
const SURFACE_PAINT = { hull: 'steel', deck: 'deck', boot: 'boot', upper: 'paleSteel', fittings: 'darkSteel', glass: 'glass' };
const WOOD_PAINT = { hull: 'wood', deck: 'ochre', boot: 'boot', upper: 'wood', fittings: 'wood', glass: 'glass' };
const IRON_PAINT = { ...SURFACE_PAINT, hull: 'darkSteel', upper: 'darkSteel' };

const baseHull = { rake: 0.04 };
const turret = (z, size = 'small', barrels = 1, facing = z < 0 ? 'fore' : 'aft') => ({ z, size, barrels, facing });

export const SHIP_SPECS = Object.freeze({
  sail_frigate: { key: 'sail_frigate', era: 'sail', loaderKey: 'sail/frigate-38-44', presentationUnits: true, dimensions: { length: 8.2, beam: 1.75, freeboard: 0.48, draft: 0.54 }, paint: WOOD_PAINT, hull: { ...baseHull, bowFine: 0.08, sternWidth: 0.55, sheer: 0.25, flare: 0.18, tumblehome: 0.12 }, masts: [{ z: -2.25, height: 5.0 }, { z: 0.55, height: 5.35 }, { z: 2.55, height: 4.75 }], sails: { tiers: 3, width: 2.55, height: 0.98 } },
  wooden_sail_ship: { key: 'wooden_sail_ship', era: 'ironclad', loaderKey: 'ironclad/wooden-sail-ship', presentationUnits: true, dimensions: { length: 8.05, beam: 1.82, freeboard: 0.5, draft: 0.56 }, paint: WOOD_PAINT, hull: { ...baseHull, bowFine: 0.09, sternWidth: 0.58, sheer: 0.24, flare: 0.17, tumblehome: 0.12 }, masts: [{ z: -2.1, height: 4.7 }, { z: 0.55, height: 5.0 }, { z: 2.5, height: 4.45 }], sails: { tiers: 2, width: 2.35, height: 0.9 } },
  wooden_steamer: { key: 'wooden_steamer', era: 'ironclad', loaderKey: 'ironclad/wooden-steam-frigate', presentationUnits: true, dimensions: { length: 8.45, beam: 1.92, freeboard: 0.52, draft: 0.58 }, paint: WOOD_PAINT, hull: { ...baseHull, bowFine: 0.08, sternWidth: 0.62, sheer: 0.2, flare: 0.14, tumblehome: 0.1 }, funnels: [{ x: 0, z: 0.25, height: 0.95 }], masts: [{ z: -2.15, height: 3.4 }, { z: 2.15, height: 3.0 }], bridge: { z: -0.3, length: 1.4, height: 0.48 } },
  sidewheel_gunboat: {
    key: 'sidewheel_gunboat',
    era: 'ironclad',
    loaderKey: 'ironclad/sidewheel-gunboat',
    presentationUnits: true,
    dimensions: { length: 6.85, beam: 1.72, freeboard: 0.43, draft: 0.4 },
    paint: WOOD_PAINT,
    hull: { ...baseHull, bowFine: 0.08, sternWidth: 0.72, sheer: 0.14, flare: 0.12, tumblehome: 0.06 },
    gunStyle: 'exposed',
    exposedGuns: [{ z: -1.9, facing: 'fore' }, { z: 1.75, facing: 'aft' }],
    funnels: [{ x: 0, z: 0.55, height: 0.75 }],
    bridge: { z: -0.25, length: 1.2, height: 0.46 },
    paddleBoxes: true,
  },
  ironclad_casemate: {
    key: 'ironclad_casemate',
    era: 'ironclad',
    loaderKey: 'ironclad/casemate',
    presentationUnits: true,
    dimensions: { length: 8.55, beam: 2.45, freeboard: 0.34, draft: 0.62 },
    paint: IRON_PAINT,
    hull: { ...baseHull, bowFine: 0.08, sternWidth: 0.78, sheer: 0.1, flare: 0.05, tumblehome: 0.14, rake: 0.02, ram: 0.08 },
    gunStyle: 'casemate',
    casemate: { z: -0.05, length: 3.45, width: 1.5, height: 0.82, slope: 0.28 },
    broadsideGuns: [-1.15, -0.35, 0.45, 1.25],
    funnels: [{ x: 0, z: 0.65, height: 0.95 }],
    bridge: { z: -0.05, length: 3.3, height: 0.72 },
  },
  ironclad_monitor: {
    key: 'ironclad_monitor',
    era: 'ironclad',
    loaderKey: 'ironclad/turret-monitor',
    presentationUnits: true,
    dimensions: { length: 5.65, beam: 2.25, freeboard: 0.2, draft: 0.42 },
    paint: IRON_PAINT,
    hull: { bowFine: 0.18, sternWidth: 0.82, sheer: 0.03, flare: 0.02, tumblehome: 0.04, rake: 0.01 },
    gunStyle: 'monitor-turret',
    monitorTurret: { z: -0.15, radius: 0.62, height: 0.36, barrels: 2 },
    funnels: [{ x: 0, z: 1.15, height: 0.45 }],
    bridge: { z: -1.15, length: 0.55, height: 0.35 },
  },
  dreadnought_battleship: { key: 'dreadnought_battleship', era: 'dreadnought', loaderKey: 'dreadnought/battleship', presentationUnits: true, dimensions: { length: 9.3, beam: 2.22, freeboard: 0.5, draft: 0.58 }, paint: SURFACE_PAINT, hull: { ...baseHull, bowFine: 0.04, sternWidth: 0.72, sheer: 0.18, flare: 0.12, tumblehome: 0.06 }, turrets: [turret(-3.1, 'large', 2), turret(-1.75, 'large', 2), turret(1.75, 'large', 2), turret(3.0, 'large', 2)], funnels: [{ x: -0.22, z: 0.55, height: 1.25 }, { x: 0.18, z: 1.25, height: 1.12 }], masts: [{ z: -1.45, height: 2.5 }, { z: 2.15, height: 2.05 }], bridge: { z: -0.35, length: 1.85, height: 0.9 } },
  battlecruiser: { key: 'battlecruiser', era: 'dreadnought', loaderKey: 'dreadnought/battlecruiser', presentationUnits: true, dimensions: { length: 9.6, beam: 2.05, freeboard: 0.52, draft: 0.56 }, paint: SURFACE_PAINT, hull: { ...baseHull, bowFine: 0.035, sternWidth: 0.68, sheer: 0.2, flare: 0.13, tumblehome: 0.05 }, turrets: [turret(-3.25, 'large', 2), turret(-1.95, 'large', 2), turret(1.65, 'large', 2), turret(3.15, 'large', 2)], funnels: [{ x: -0.18, z: 0.45, height: 1.25 }, { x: 0.14, z: 1.15, height: 1.12 }], masts: [{ z: -1.55, height: 2.55 }, { z: 2.15, height: 1.95 }], bridge: { z: -0.45, length: 1.75, height: 0.88 } },
  destroyer: { key: 'destroyer', era: 'dreadnought', loaderKey: 'dreadnought/destroyer', presentationUnits: true, dimensions: { length: 6.25, beam: 1.34, freeboard: 0.42, draft: 0.45 }, paint: SURFACE_PAINT, hull: { ...baseHull, bowFine: 0.035, sternWidth: 0.66, sheer: 0.16, flare: 0.1, tumblehome: 0.04 }, turrets: [turret(-2.0), turret(2.0)], funnels: [{ x: 0, z: 0.75, height: 0.82 }], masts: [{ z: -1.2, height: 1.7 }], bridge: { z: -0.55, length: 1.35, height: 0.72 } },
  carrier: { key: 'carrier', era: 'modern', loaderKey: 'modern/light-carrier', presentationUnits: true, dimensions: { length: 10.7, beam: 2.95, freeboard: 0.52, draft: 0.58 }, paint: { ...SURFACE_PAINT, hull: 'darkSteel' }, hull: { ...baseHull, bowFine: 0.035, sternWidth: 0.76, sheer: 0.14, flare: 0.1, tumblehome: 0.03 }, island: { x: 1.12, z: -0.45 }, masts: [{ z: -0.9, height: 2.1 }] },
  modern_surface: { key: 'modern_surface', era: 'modern', loaderKey: 'modern/surface-combatant', presentationUnits: true, dimensions: { length: 7.0, beam: 1.55, freeboard: 0.48, draft: 0.48 }, paint: SURFACE_PAINT, hull: { ...baseHull, bowFine: 0.025, sternWidth: 0.7, sheer: 0.13, flare: 0.12, tumblehome: 0.05 }, turrets: [turret(-2.35)], funnels: [{ x: 0, z: 0.75, height: 0.75 }], masts: [{ z: -0.55, height: 2.25 }], bridge: { z: -0.85, length: 1.45, height: 0.82 } },
  asw_destroyer: { key: 'asw_destroyer', era: 'coldwar', loaderKey: 'modern/asw-destroyer', presentationUnits: true, dimensions: { length: 6.75, beam: 1.42, freeboard: 0.46, draft: 0.46 }, paint: SURFACE_PAINT, hull: { ...baseHull, bowFine: 0.03, sternWidth: 0.68, sheer: 0.14, flare: 0.11, tumblehome: 0.04 }, turrets: [turret(-2.15)], funnels: [{ x: 0, z: 0.55, height: 0.72 }], masts: [{ z: -0.7, height: 2.0 }], bridge: { z: -0.7, length: 1.25, height: 0.78 } },
  submarine: { key: 'submarine', era: 'coldwar', loaderKey: 'coldwar/submarine-procedural', presentationUnits: true, dimensions: { length: 8.4, beam: 1.36, freeboard: 0.2, draft: 0.5 }, paint: { ...SURFACE_PAINT, hull: 'subSteel' } },
});

export function shipSpecFor(type = '', era = '', publicName = '') {
  const label = `${String(type || '').toLowerCase()} ${String(publicName || '').toLowerCase()}`;
  if (/carrier/.test(label)) return SHIP_SPECS.carrier;
  if (/submarine|ssn|ssbn|attack boat|typhoon|alfa|los angeles/.test(label)) return SHIP_SPECS.submarine;
  if (era === 'sail') return SHIP_SPECS.sail_frigate;
  if (era === 'ironclad') {
    if (/monitor|turret/.test(label)) return SHIP_SPECS.ironclad_monitor;
    if (/side[- ]?wheel|gunboat|patrick henry|jamestown/.test(label)) return SHIP_SPECS.sidewheel_gunboat;
    if (/steam frigate|minnesota/.test(label)) return SHIP_SPECS.wooden_steamer;
    if (/sail|sloop|cumberland|congress/.test(label)) return SHIP_SPECS.wooden_sail_ship;
    if (/ironclad|casemate|virginia/.test(label)) return SHIP_SPECS.ironclad_casemate;
    return SHIP_SPECS.wooden_steamer;
  }
  if (era === 'dreadnought') {
    if (/battlecruiser/.test(label)) return SHIP_SPECS.battlecruiser;
    if (/battleship|dreadnought/.test(label)) return SHIP_SPECS.dreadnought_battleship;
    if (/destroyer|torpedo boat/.test(label)) return SHIP_SPECS.destroyer;
    return SHIP_SPECS.dreadnought_battleship;
  }
  if (era === 'modern' || era === 'coldwar') {
    if (/asw/.test(label)) return SHIP_SPECS.asw_destroyer;
    return SHIP_SPECS.modern_surface;
  }
  if (/battlecruiser/.test(label)) return SHIP_SPECS.battlecruiser;
  if (/battleship|dreadnought/.test(label)) return SHIP_SPECS.dreadnought_battleship;
  if (/destroyer|torpedo boat/.test(label)) return SHIP_SPECS.destroyer;
  if (/sail/.test(label)) return SHIP_SPECS.sail_frigate;
  return SHIP_SPECS.modern_surface;
}

export const MATERIAL_NAMES = Object.freeze(['steel', 'darkSteel', 'subSteel', 'paleSteel', 'deck', 'wood', 'ochre', 'canvas', 'glass', 'boot', 'wake', 'glow', 'rigging']);
