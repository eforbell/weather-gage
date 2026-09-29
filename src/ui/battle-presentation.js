// The only data allowed to enter the 3D renderer is the selected ship's
// public getView() result. These actors deliberately contain no hidden IDs,
// enemy health, or authoritative positions from the simulation state.
export function battleActors(view, selectedId) {
  const focus = view.ships.find(s => s.id === selectedId) || view.ships[0];
  if (!focus) return { focus: null, actors: [] };
  const position = ({ q, r }) => ({
    x: ((q - focus.q) + (r - focus.r) / 2) * 4.8,
    z: (r - focus.r) * 4.15,
  });
  const actors = [
    ...view.ships.filter(s => s.status !== 'reserve').map(s => ({
      id: s.id, own: true, name: s.name, type: s.type,
      facing: s.facing, hull: s.hull, status: s.status,
      ...position(s),
    })),
    ...view.contacts.filter(c => Number.isFinite(c.q) && Number.isFinite(c.r)).map(c => ({
      id: c.id, own: false,
      name: c.confidence === 'identified' ? c.name : c.className || 'Unresolved contact',
      type: c.confidence === 'identified' ? c.className : null,
      uncertain: c.stale || c.confidence !== 'identified',
      stale: Boolean(c.stale),
      uncertainty: c.uncertainty || 0,
      ...position(c),
    })),
  ];
  return { focus: { id: focus.id, name: focus.name, type: focus.type, q: focus.q, r: focus.r }, actors };
}
