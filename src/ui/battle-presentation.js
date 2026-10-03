// Readability and scale (docs/3d-visual-direction.md): ships are drawn far larger
// than true scale and distances are compressed, so one hex reads as about 1.5
// capital-ship lengths. Camera, smoke, splash and haze sizes all derive from HEX.
export const HEX = 13.5;
export const SHIP_LENGTH = HEX / 1.5;
// Authored assets are in metres. A representative 210 m capital ship occupies
// SHIP_LENGTH; the nominal 3× enlargement and compressed chart distances are
// presentation choices, not a physical nautical-mile conversion.
export const PRESENTATION_SCALE = 3;
export const WORLD_UNITS_PER_METER = SHIP_LENGTH / (210 * PRESENTATION_SCALE);
export const MODEL_METERS_TO_WORLD = WORLD_UNITS_PER_METER * PRESENTATION_SCALE;
// Each era's chart scale differs (a sail hex is 400 yards), so each era sizes
// its authored ships so that its own representative ship fills SHIP_LENGTH: a
// 50 m frigate at Nevis reads like a 210 m battlecruiser at the Dogger Bank.
// At Hampton Roads the reference matches the procedural stand-ins, so a 54 m
// sail frigate sits beside Virginia and Minnesota at their presentation size.
// WWII uses a 180 m cruiser reference; destroyers keep their smaller relative size.
// One uniform factor per era; ships within an era keep their true relative size.
export const ERA_REFERENCE_METERS = Object.freeze({ sail: 50, ironclad: 60, ww2: 180 });
export function modelMetersToWorld(era) {
  const reference = ERA_REFERENCE_METERS[era];
  return reference ? SHIP_LENGTH / reference : MODEL_METERS_TO_WORLD;
}
export const hexToWorld = ({ q, r }, focus) => ({
  x: ((q - focus.q) + (r - focus.r) / 2) * HEX,
  z: (r - focus.r) * HEX * Math.sqrt(3) / 2,
});

// The only data allowed to enter the 3D renderer is the selected ship's
// public getView() result. These actors deliberately contain no hidden IDs,
// enemy health, or authoritative positions from the simulation state.
export function battleActors(view, selectedId) {
  const focus = view.ships.find(s => s.id === selectedId) || view.ships[0];
  if (!focus) return { focus: null, actors: [] };
  const coldwar = focus.era === 'coldwar';
  // Cold War boats report their depth; a WWII U-boat is either surfaced or submerged.
  const depthOf = ship => coldwar ? ship.doctrine?.depth || 'shallow' : ship.type === 'submarine' ? ship.doctrine?.depth || 'surface' : 'surface';
  const level = depth => ({ surface: 0, shallow: -2.7, deep: -8 }[depth] ?? 0);
  const focusDepth = depthOf(focus);
  const position = point => hexToWorld(point, focus);
  const opticallyVisible = ship => {
    if (!coldwar || ship.id === focus.id) return true;
    const depth = depthOf(ship);
    if (focusDepth === 'surface') return depth === 'surface';
    if (depth !== focusDepth) return false;
    const { x, z } = position(ship);
    return Math.hypot(x, z) <= 2.5 * HEX;
  };
  const actors = [
    ...view.ships.filter(s => s.status !== 'reserve' && opticallyVisible(s)).map(s => ({
      id: s.id, own: true, name: s.name, type: s.type, className: s.className,
      facing: s.facing, hull: s.hull, status: s.status, depth: depthOf(s), y: level(depthOf(s)), anchored: s.speed === 0,
      ...position(s),
    })),
    // A submerged contact (an ASDIC echo) has no hull on the surface to draw.
    ...view.contacts.filter(c => !coldwar && !c.submerged && Number.isFinite(c.q) && Number.isFinite(c.r)).map(c => ({
      id: c.id, own: false,
      name: c.confidence === 'identified' ? c.name : c.className || 'Unresolved contact',
      type: c.confidence === 'identified' ? c.className : null,
      uncertain: c.stale || c.confidence !== 'identified',
      stale: Boolean(c.stale),
      uncertainty: c.uncertainty || 0,
      anchored: Boolean(c.anchored),
      y: 0, ...position(c),
    })),
  ];
  return { focus: { id: focus.id, name: focus.name, type: focus.type, depth: focusDepth, y: level(focusDepth), q: focus.q, r: focus.r }, actors };
}
