// Source-pixel calibration for both bow-left published profiles and bow-right
// dockyard drawings. Cropping/flopping is applied to the reference, never the model.
export function referencePlacement(ref, view, length) {
  const anchor = ref.view === 'plan' ? ref.centerlineY : ref.waterlineY;
  if (!view || ![ref.bowX, ref.sternX, anchor, length].every(Number.isFinite) || length <= 0 || ref.bowX === ref.sternX) return null;
  const [cx, cy, cw, ch] = ref.crop || [0, 0, 100000, 100000];
  const flop = ref.bowX > ref.sternX;
  if (flop && !ref.crop) return null; // the mirrored crop width must be known
  const scale = view.pxPerMeter * length / Math.abs(ref.sternX - ref.bowX);
  const flip = flop && ref.view === 'plan'; // a top view rotates, not mirrors
  const localAnchor = flip ? ch - 1 - (anchor - cy) : anchor - cy;
  const localBow = flop ? cw - 1 - (ref.bowX - cx) : ref.bowX - cx;
  return { scale, flop, flip, x: Math.round(view.bowX - localBow * scale), y: Math.round(view.anchorY - localAnchor * scale) };
}
