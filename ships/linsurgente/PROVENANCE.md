# L'Insurgente: provenance and modelling decisions

The model is original geometry, generated from `spec.json` by the headless
Blender kit (`tools/blender/`, sail fittings in `shipkit/sail.py`). No reference
image, texture or third-party mesh is embedded in, or shipped with, the GLB.

## Approach

**Side-faithful, not ship-faithful**, like [USS Constellation](../uss-constellation/PROVENANCE.md):
she must read as French next to the American frigates. No drawing was traced or
overlaid (French plans are mostly in copyrighted monographs), so the spec has no
`references[]`.

| ID | Source | Use | Accessed |
|---|---|---|---|
| wiki-insurgente | [French frigate Insurgente (1793)](https://en.wikipedia.org/wiki/French_frigate_Insurgente_(1793)), Wikipedia | Rating, approximate dimensions, capture by Constellation off Nevis in 1799 | 2026-10-02 |

## Facts used

- About 47.5 m long, 11.9 m beam, about 5.3 m draught (rounded).
- 40 guns, matching `guns: 40` in the Nevis scenario: 13 gundeck ports a side plus 7 on the quarterdeck and forecastle.

## Deliberate choices (not evidence)

- **Silhouette:** an **open waist** between a raised forecastle and quarterdeck (deck breaks in the offsets table), the usual French and British frigate layout, against the Americans' flush spar deck. Lower freeboard, more sheer and more raked masts than Constellation.
- **Paint:** black hull with red-ochre bands at the gunports and the sheer, red port lids and bulwark interiors, slightly greyer canvas.
- **Flags:** the 1794 tricolour (blue at the hoist) at the gaff and the main truck, coloured through the baked vertex colours.
- Rig pose, rigging thickness and unmodelled detail as for Constellation.
