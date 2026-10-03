"""Steam-era fittings: casemates, paddle wheels, walking beams and deck guns.

Each builder reads its own spec key and does nothing when it is absent.
Round (Monitor-style) turrets are a `turretType.shape` in parts.py.
"""
import math

import bmesh
from mathutils import Vector

from .parts import box, prism, rod
from .sail import oriented_box, plate
from .spec import y_of


def _ring(kit, a0, a1, half, end, n=10):
    """Closed outline: starboard side aft, round the stern, port side forward, round the bow."""
    pts = []
    for i in range(n + 1):  # stern end: starboard (+x) to port (-x)
        t = math.pi * i / n
        pts.append((half * math.cos(t), y_of(kit.spec, a1 - end + end * math.sin(t))))
    for i in range(n + 1):  # bow end: port to starboard
        t = math.pi * i / n
        pts.append((-half * math.cos(t), y_of(kit.spec, a0 + end - end * math.sin(t))))
    return pts


def casemate(kit):
    """A sloped armoured box with rounded ends (CSS Virginia): base outline at
    `base`, a smaller roof outline at `top`, gunports on the slopes and ends."""
    c = kit.spec.get("casemate")
    if not c:
        return
    a0, a1, z0, z1 = c["fromAft"], c["toAft"], c["base"], c["top"]
    half0, half1 = c["halfWidth"], c["roofHalfWidth"]
    inset = half0 - half1  # the ends slope like the sides
    end0 = c.get("endLength", half0)
    lower = _ring(kit, a0, a1, half0, end0)
    upper = _ring(kit, a0 + inset, a1 - inset, half1, max(0.5, end0 - inset))
    bm = bmesh.new()
    lv = [bm.verts.new((x, y, z0)) for x, y in lower]
    uv = [bm.verts.new((x, y, z1)) for x, y in upper]
    n = len(lv)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lv[i], lv[j], uv[j], uv[i]))
    bm.faces.new(uv)
    bm.faces.new(list(reversed(lv)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        face.smooth = abs(face.normal.z) < 0.95
    for edge in bm.edges:
        if len(edge.link_faces) == 2 and edge.link_faces[0].smooth != edge.link_faces[1].smooth:
            edge.smooth = False
    kit.merge(bm, lambda f: c.get("roof", "dark") if f.normal.z > 0.95 else c.get("material", "upper"))
    # Gunports with closed shutters half open, guns run out.
    ports = c.get("ports", {})
    w, h = ports.get("size", [1.0, 0.9])
    zp = ports.get("z", (z0 + z1) / 2)
    f = (zp - z0) / (z1 - z0)
    half = half0 + (half1 - half0) * f
    slope = Vector((1.0, 0.0, (half0 - half1) / (z1 - z0))).normalized()
    gun = ports.get("gun", {"length": 1.6, "radius": 0.2})
    for aft in ports.get("side", []):
        for side in (-1, 1):
            n_out = Vector((side * slope.x, 0.0, slope.z))
            p = Vector((side * half, y_of(kit.spec, aft), zp))
            up = Vector((0, 0, 1)) - n_out * n_out.z
            kit.merge(oriented_box(p + n_out * 0.05, Vector((0, 1, 0)), up, (w, h, 0.3), 0.02), "dark")
            kit.merge(rod(p - n_out * 0.4, p + n_out * gun["length"], gun["radius"] * 1.2, gun["radius"], 8), "dark")
    for key, aft, sign in (("bow", a0 + inset * f, 1), ("stern", a1 - inset * f, -1)):
        count = ports.get(key, 0)
        n_out = Vector((0.0, sign * slope.x, slope.z))
        for i in range(count):  # spread across the rounded end
            x = (i - (count - 1) / 2) * (w + 0.6)
            p = Vector((x, y_of(kit.spec, aft + sign * (end0 * (1 - math.sqrt(max(0.0, 1 - (x / half) ** 2))))), zp))
            kit.merge(oriented_box(p + n_out * 0.05, Vector((1, 0, 0)), Vector((0, 0, 1)) - n_out * n_out.z, (w, h, 0.3), 0.02), "dark")
            kit.merge(rod(p - n_out * 0.4, p + n_out * gun["length"], gun["radius"] * 1.2, gun["radius"], 8), "dark")


def paddle_boxes(kit):
    """Side wheels: a half-round box over each wheel, the guard (sponson) deck
    around it, and paddle floats showing below the box."""
    p = kit.spec.get("paddleBoxes")
    if not p:
        return
    aft, r, width, axle = p["aft"], p["radius"], p["width"], p["axle"]
    yc = y_of(kit.spec, aft)
    for side in (-1, 1):
        inner = kit.lines.side_half(aft, axle + r * 0.5) - 0.2
        outer = inner + width
        outline = [(yc + r * math.cos(math.pi * i / 16), axle + r * math.sin(math.pi * i / 16)) for i in range(17)]
        bm = prism(outline, 0.0, 1.0, bevel=0.05)  # in (y, z), extruded along local z -> x
        for v in bm.verts:
            y, z, x = v.co.x, v.co.y, v.co.z
            v.co = Vector((side * (inner + (outer - inner) * x), y, z))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        kit.merge(bm, p.get("material", "upper"))
        # Sponson guard: a ledge along the side at deck level, from well ahead of the wheel to well abaft it.
        g = p.get("guard", r * 1.6)
        deck = kit.lines.deck_height(aft, kit.lines.half_breadth(aft)) - 0.25
        kit.merge(box((side * (inner + width / 2), yc, deck), (width + 0.4, 2 * g, 0.35), 0.04), p.get("guardMaterial", "hull"))
        for k in range(7):  # floats below the box
            t = math.pi + math.pi * (k + 0.5) / 7
            c = Vector((side * (inner + width / 2), yc + r * 0.9 * math.cos(t), axle + r * 0.9 * math.sin(t)))
            kit.merge(oriented_box(c, Vector((1, 0, 0)), Vector((0, math.cos(t), math.sin(t))), (width - 0.4, 0.8, 0.12), 0.01), "dark")
        kit.merge(rod((side * (inner - 0.2), yc, axle), (side * (outer + 0.1), yc, axle), 0.35, None, 10), "dark")


def walking_beam(kit):
    """The beam engine's A-frame gallows and diamond-shaped rocking beam above the deck."""
    w = kit.spec.get("walkingBeam")
    if not w:
        return
    aft, top, length = w["aft"], w["top"], w["length"]
    z0 = kit.base_height("deck", [aft])
    yc = y_of(kit.spec, aft)
    spread = w.get("spread", length * 0.35)
    for side in (-0.6, 0.6):
        for dy in (-spread, spread):
            kit.merge(rod((side, yc + dy, z0), (side, yc, top), 0.22, 0.18, 8), "dark")
    beam = [[aft - length / 2, top + 0.15], [aft, top + 1.1], [aft + length / 2, top + 0.15], [aft, top - 0.8]]
    plate(beam, 0.35, "dark", kit)
    kit.merge(rod((-0.75, yc, top), (0.75, yc, top), 0.17, None, 10), "dark")  # pivot shaft across the gallows
    crank_y = y_of(kit.spec, aft + length / 2 - 0.3)
    kit.merge(rod((0, crank_y, top + 0.25), (0, crank_y, z0), 0.16, None, 8), "dark")


def deck_guns(kit):
    """Guns on open slides or pivots: [{aft, side, train (degrees from the bow, + to starboard), length, radius}]."""
    for g in kit.spec.get("deckGuns", []):
        z = kit.base_height("deck", [g["aft"]], abs(g.get("side", 0))) + 0.4
        base = Vector((g.get("side", 0.0), y_of(kit.spec, g["aft"]), z))
        a = math.radians(g.get("train", 0.0))
        d = Vector((math.sin(a), math.cos(a), 0.0))
        kit.merge(oriented_box(base + Vector((0, 0, 0.35)), d.cross(Vector((0, 0, 1))), d, (1.0, 1.8, 0.7), 0.04), g.get("carriage", "hull"))
        L, r = g.get("length", 3.0), g.get("radius", 0.22)
        start = base + Vector((0, 0, 0.85)) - d * L * 0.35
        kit.merge(rod(start, start + d * L, r * 1.4, r, 10), "dark")


def build(kit):
    casemate(kit)
    paddle_boxes(kit)
    walking_beam(kit)
    deck_guns(kit)
