"""Parametric fittings: turrets, funnels, masts, superstructure and small detail.

Every part is built in its own scratch bmesh, bevelled there, then merged into
the ship's single mesh with a material index. The finished ship is therefore
one object with one primitive per material: few draw calls in the game.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from .spec import y_of

MATERIALS = ("hull", "upper", "deck", "boot", "bottom", "dark", "canvas", "spar")
# Optional paints fall back to another role, so older specs need not name them.
PAINT_FALLBACK = {"spar": "upper"}
EMBED = 0.4  # how far parts sink into whatever they stand on, so no gaps show
# Gun axis height as a fraction of gunhouse height. The muzzle anchor sits at
# length/2 - frontSlope * GUN_AXIS + barrelLength from the turret centre;
# muzzleReach() in scripts/ship-asset-report.mjs must use the same formula.
GUN_AXIS = 0.42


class Kit:
    def __init__(self, spec, lines):
        self.spec = spec
        self.lines = lines
        self.bm = bmesh.new()
        # Per-face colour (0xRRGGBB + 1; 0 = none) multiplied into the baked
        # vertex colours: flags and other small painted detail.
        self.tint = self.bm.faces.layers.int.new("tint")
        self.anchors = []  # (name, (x, y, z)) in Blender metres

    # -- coordinates -------------------------------------------------------
    def point(self, aft, side, z):
        return Vector((side, y_of(self.spec, aft), z))

    def base_height(self, base, aft_values, half_width=0.0):
        """Resolve a spec 'base' (number or 'deck') to a height, sunk slightly."""
        if base == "deck":
            return min(self.lines.deck_height(aft, half_width) for aft in aft_values) - EMBED
        return float(base) - 0.05

    # -- merging -----------------------------------------------------------
    def merge(self, src, material, smooth=None):
        """Copy a scratch bmesh into the ship mesh. `material` is a name or a
        function face -> name. `smooth` overrides every face's shading flag."""
        src.verts.index_update()
        src_tint = src.faces.layers.int.get("tint")
        vmap = [self.bm.verts.new(v.co) for v in src.verts]
        for face in src.faces:
            try:
                new = self.bm.faces.new([vmap[v.index] for v in face.verts])
            except ValueError:
                continue
            name = material(face) if callable(material) else material
            new.material_index = MATERIALS.index(name)
            new.smooth = face.smooth if smooth is None else smooth
            if src_tint is not None:
                new[self.tint] = face[src_tint]
        for edge in src.edges:
            if not edge.smooth:
                a, b = (vmap[v.index] for v in edge.verts)
                target = self.bm.edges.get((a, b))
                if target:
                    target.smooth = False
        src.free()

    def anchor(self, name, location):
        self.anchors.append((name, tuple(location)))


# -- primitive builders (scratch bmeshes) ------------------------------------

def _bevel(bm, width, segments=1):
    if width > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=width, offset_type="OFFSET", segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True)


def prism(outline, z0, z1, bevel=0.12):
    """Extrude a closed outline [(x, y), ...] (counter-clockwise) from z0 to z1."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z0)) for x, y in outline]
    face = bm.faces.new(verts)
    if face.normal.z > 0:
        face.normal_flip()
    result = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [g for g in result["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=(0, 0, z1 - z0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _bevel(bm, bevel)
    for f in bm.faces:
        f.smooth = False
    return bm


def box(center, size, bevel=0.08):
    cx, cy, cz = center
    sx, sy, sz = size
    outline = [(cx - sx / 2, cy - sy / 2), (cx + sx / 2, cy - sy / 2), (cx + sx / 2, cy + sy / 2), (cx - sx / 2, cy + sy / 2)]
    return prism(outline, cz - sz / 2, cz + sz / 2, bevel)


def cylinder(radius, z0, z1, segments=20, top_scale=1.0, scale_xy=(1.0, 1.0), cap=True, matrix=None):
    """Vertical (local Z) cylinder or cone; smooth sides, flat caps."""
    bm = bmesh.new()
    depth = z1 - z0
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segments, radius1=radius, radius2=radius * top_scale, depth=depth,
                          matrix=Matrix.Translation((0, 0, z0 + depth / 2)))
    bmesh.ops.scale(bm, vec=(scale_xy[0], scale_xy[1], 1.0), verts=bm.verts)
    for f in bm.faces:
        f.smooth = abs(f.normal.z) < 0.7
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.link_faces[0].smooth != e.link_faces[1].smooth:
            e.smooth = False
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return bm


def rod(start, end, radius, end_radius=None, segments=10, cap=True):
    """A cylinder between two points (barrels, yards, pipes)."""
    start, end = Vector(start), Vector(end)
    axis = end - start
    rotation = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    scale = 1.0 if end_radius is None else end_radius / radius
    return cylinder(radius, 0.0, axis.length, segments, scale, cap=cap, matrix=Matrix.Translation(start) @ rotation)


def ellipsoid(radii, segments=14, rings=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=radii, verts=bm.verts)
    for f in bm.faces:
        f.smooth = True
    return bm


def mirrored_outline(kit, plan):
    """Plan [(aft, half_width), ...] fore to aft -> CCW outline in Blender XY."""
    starboard = [(half, y_of(kit.spec, aft)) for aft, half in plan]
    port = [(-half, y) for half, y in reversed(starboard)]
    if len(plan) == 2:  # a rectangle
        (a0, h0), (a1, h1) = plan
        return [(h0, y_of(kit.spec, a0)), (h1, y_of(kit.spec, a1)), (-h1, y_of(kit.spec, a1)), (-h0, y_of(kit.spec, a0))]
    return starboard + port


def translate(bm, offset):
    bmesh.ops.translate(bm, verts=bm.verts, vec=offset)
    return bm


# -- ship fittings -----------------------------------------------------------

def superstructures(kit):
    for block in kit.spec.get("superstructures", []):
        plan = block["plan"]
        aft_values = [a for a, _ in plan]
        widest = max(h for _, h in plan)
        z0 = kit.base_height(block["base"], aft_values, widest)
        kit.merge(prism(mirrored_outline(kit, plan), z0, block["top"], bevel=0.15), "upper")


def conning_towers(kit):
    for ct in kit.spec.get("conningTowers", []):
        y = y_of(kit.spec, ct["aft"])
        z0 = kit.base_height(ct["base"], [ct["aft"]])
        rx, ry = ct["width"] / 2, ct["length"] / 2
        kit.merge(translate(cylinder(1.0, z0, ct["top"], 24, scale_xy=(rx, ry)), (0, y, 0)), "upper")
        kit.merge(translate(cylinder(1.0, ct["top"] - 1.1, ct["top"] - 0.6, 24, scale_xy=(rx + 0.06, ry + 0.06), cap=False), (0, y, 0)), "dark")


def turrets(kit):
    if not kit.spec.get("turrets"):
        return
    t = kit.spec["turretType"]
    L, W, H = t["length"], t["width"], t["height"]
    for turret in kit.spec.get("turrets", []):
        aft = turret["aft"]
        deck = kit.base_height(turret["base"], [aft - t["barbetteRadius"], aft, aft + t["barbetteRadius"]], abs(turret.get("side", 0.0)) + t["barbetteRadius"])
        house0 = deck + EMBED + turret["barbette"]
        house1 = house0 + H
        place = Matrix.Translation((turret.get("side", 0.0), y_of(kit.spec, aft), 0))
        if turret["facing"] == "aft":
            place = place @ Matrix.Rotation(math.pi, 4, "Z")

        def put(bm, material):
            bmesh.ops.transform(bm, matrix=place, verts=bm.verts)
            kit.merge(bm, material)

        put(cylinder(t["barbetteRadius"], deck, house0 + 0.1, 28), "upper")
        outline = [(W / 2 - 0.5, L / 2), (-W / 2 + 0.5, L / 2), (-W / 2, L / 2 - 1.2), (-W / 2, -L / 2 + 1.5), (-W / 2 + 1.5, -L / 2),
                   (W / 2 - 1.5, -L / 2), (W / 2, -L / 2 + 1.5), (W / 2, L / 2 - 1.2)]
        house = prism(outline, house0, house1, bevel=0.0)
        for v in house.verts:  # sloped front plate
            if v.co.z > house1 - 1e-4 and v.co.y > L / 2 - 1.3:
                v.co.y -= t["frontSlope"]
        _bevel(house, 0.14)
        for f in house.faces:
            f.smooth = False
        put(house, "upper")
        gun_z = house0 + H * GUN_AXIS
        face_y = L / 2 - t["frontSlope"] * GUN_AXIS
        guns = turret.get("guns", 2)
        if guns not in (1, 2):
            raise ValueError(f"Turret {turret['id']} requires one or two guns, got {guns}")
        for side in ((0,) if guns == 1 else (-1, 1)):
            x = side * t["gunSpacing"] / 2
            put(rod((x, face_y - 1.5, gun_z), (x, face_y + t["barrelLength"], gun_z), t["barrelRadius"], t["muzzleRadius"], 12), "dark")
            put(rod((x, face_y - 0.4, gun_z), (x, face_y + 0.9, gun_z), 0.72, 0.6, 12), "canvas")
            put(box((side * (W / 2 - 1.5), L / 2 - t["frontSlope"] - 0.9, house1 + 0.2), (1.1, 1.3, 0.6)), "upper")
        put(rod((-W / 2 - 0.5, -L / 2 + 1.9, house1 + 0.05), (W / 2 + 0.5, -L / 2 + 1.9, house1 + 0.05), 0.5, None, 12), "upper")
        muzzle = place @ Vector((0, face_y + t["barrelLength"], gun_z))
        kit.anchor(f"anchor_turret_{turret['id']}", muzzle)


def funnels(kit):
    for funnel in kit.spec.get("funnels", []):
        y = y_of(kit.spec, funnel["aft"])
        z0 = kit.base_height(funnel["base"], [funnel["aft"]])
        rx, ry, top = funnel["width"] / 2, funnel["length"] / 2, funnel["top"]
        casing = funnel.get("casing")
        if casing:
            # A straight-sided uptake casing (a chamfered deckhouse) under the
            # funnel, as on German capital ships; the funnel rises from its roof.
            # Funnels without one keep their original geometry.
            cw, cl, chamfer = casing["width"] / 2, casing["length"] / 2, min(casing["width"], casing["length"]) * 0.18
            outline = [(cw - chamfer, cl), (-cw + chamfer, cl), (-cw, cl - chamfer), (-cw, -cl + chamfer),
                       (-cw + chamfer, -cl), (cw - chamfer, -cl), (cw, -cl + chamfer), (cw, cl - chamfer)]
            kit.merge(translate(prism(outline, z0, casing["top"], bevel=0.15), (0, y, 0)), "upper")
            z0 = casing["top"] - 0.05
        kit.merge(translate(cylinder(1.0, z0, top - 0.9, 28, scale_xy=(rx, ry), cap=False), (0, y, 0)), "upper")
        kit.merge(translate(cylinder(1.0, top - 0.9, top, 28, scale_xy=(rx + 0.08, ry + 0.08), cap=False), (0, y, 0)), "dark")
        kit.merge(translate(cylinder(1.0, top - 1.6, top - 1.4, 28, scale_xy=(rx - 0.05, ry - 0.05)), (0, y, 0)), "dark")
        for side in (-1, 1):
            kit.merge(rod((side * rx * 0.45, y - ry - 0.35, z0), (side * rx * 0.45, y - ry - 0.35, top + 1.0), 0.22, None, 8), "upper")
        kit.anchor(f"anchor_funnel_{funnel['id']}", (0, y, top + 0.6))


def masts(kit):
    for mast in kit.spec.get("masts", []):
        y = y_of(kit.spec, mast["aft"])
        z0 = kit.base_height(mast["base"], [mast["aft"]])
        r, top, split = mast["radius"], mast["top"], mast.get("topmastFrom", mast["top"] * 0.7)
        kit.merge(translate(cylinder(r, z0, split, 12, top_scale=0.75), (0, y, 0)), "upper")
        if mast.get("type") == "tripod":
            # Two raked legs meeting the main leg below the spotting top.
            legs = mast.get("legs", {})
            joint = legs.get("joinHeight", split * 0.85)
            foot_y = y - legs.get("footAft", 7.0)
            for side in (-1, 1):
                kit.merge(rod((side * legs.get("footSpread", 4.5), foot_y, z0), (0, y, joint), r * 0.8, r * 0.6, 10), "upper")
        kit.merge(translate(cylinder(r * 0.4, split - 1.5, top, 8, top_scale=0.35), (0, y, 0)), "upper")
        spotting = mast.get("spottingTop")
        if spotting:
            length, width, height = spotting["size"]
            kit.merge(box((0, y, spotting["height"]), (width, length, height), bevel=0.1), "upper")
            kit.merge(box((0, y, spotting["height"] - height / 2 - 0.15), (width + 0.8, length + 0.8, 0.3), bevel=0.05), "dark")
        for yard in mast.get("yards", []):
            kit.merge(rod((-yard["span"] / 2, y, yard["height"]), (yard["span"] / 2, y, yard["height"]), 0.16, None, 6), "upper")
        kit.anchor(f"anchor_mast_{mast['id']}", (0, y, top))


def searchlight_towers(kit):
    for tower in kit.spec.get("searchlightTowers", []):
        y = y_of(kit.spec, tower["aft"])
        z0 = kit.base_height(tower["base"], [tower["aft"]])
        r, top = tower["radius"], tower["top"]
        kit.merge(translate(cylinder(r, z0, top, 16), (0, y, 0)), "upper")
        kit.merge(translate(cylinder(r + 0.7, top, top + 0.3, 16), (0, y, 0)), "upper")
        for side in (-1, 1):
            kit.merge(translate(cylinder(0.55, top + 0.3, top + 1.3, 12), (side * r * 0.6, y, 0)), "dark")


def hawse_pipes(kit):
    for hawse in kit.spec.get("hawsePipes", []):
        y = y_of(kit.spec, hawse["aft"])
        half = kit.lines.half_breadth(hawse["aft"])
        for side in (-1, 1):
            kit.merge(rod((side * (half - 0.4), y, hawse["height"]), (side * (half + 0.15), y, hawse["height"]), 0.75, None, 12), "dark")


def boats(kit):
    for boat in kit.spec.get("boats", []):
        y = y_of(kit.spec, boat["aft"])
        z0 = kit.base_height(boat["base"], [boat["aft"]]) + 0.05
        hull = ellipsoid((boat["beam"] / 2, boat["length"] / 2, 0.9))
        kit.merge(translate(hull, (boat["side"], y, z0 + 1.2)), "canvas")
        for k in (-0.3, 0.3):
            kit.merge(box((boat["side"], y + k * boat["length"], z0 + 0.4), (boat["beam"] * 0.8, 0.4, 0.8), bevel=0.04), "dark")


def secondary_guns(kit):
    guns = kit.spec.get("secondaryGuns")
    if not guns:
        return
    for mount in guns["mounts"]:
        aft, z = mount["aft"], mount["height"]
        half = kit.lines.half_breadth(aft)
        angle = math.radians(mount["angle"])
        for side in (-1, 1):
            base = Vector((side * (half - 0.35), y_of(kit.spec, aft), z))
            direction = Vector((side * math.sin(angle), math.cos(angle), 0.0))
            kit.merge(box((base.x - side * 0.3, base.y, z), (1.0, 2.2, 1.8), bevel=0.08), "upper")
            kit.merge(box((base.x + side * 0.15, base.y, z), (0.3, 1.2, 1.0), bevel=0.04), "dark")
            kit.merge(rod(base, base + direction * guns["barrelLength"], guns["radius"], guns["radius"] * 0.85, 8), "dark")


def build_fittings(kit):
    from . import sail  # sail-era fittings; each returns nothing when its key is absent
    superstructures(kit)
    conning_towers(kit)
    turrets(kit)
    funnels(kit)
    masts(kit)
    searchlight_towers(kit)
    hawse_pipes(kit)
    boats(kit)
    secondary_guns(kit)
    sail.build(kit)
