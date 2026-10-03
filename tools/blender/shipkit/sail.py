"""Sail-era fittings: strakes, bulwarks, gun batteries, head, stern, rig and flags.

Every builder reads its own spec key and does nothing when the key is absent,
so steel ships are unaffected. Heights along the hull follow named curves
(`spec.curves`, [[aft, z], ...] interpolated like the offsets table) so a
gunport row or a painted strake can follow the sheer without restating it.

The rig is posed once, as fighting sail on a broad reach with the wind on the
starboard quarter: yards braced with the starboard yardarms forward, square
sails bellied forward and to port, fore-and-aft sails and flags blowing to port.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from .lines import _monotone_slopes
from .parts import box, ellipsoid, prism, rod
from .spec import y_of

FLAG_DESIGNS = {}


class Curve:
    """A monotone cubic through [[aft, z], ...] (clamped at the ends)."""

    def __init__(self, points):
        self.xs = [p[0] for p in points]
        self.ys = [p[1] for p in points]
        self.ms = _monotone_slopes(self.xs, self.ys) if len(points) > 1 else [0.0]

    def __call__(self, aft):
        xs, ys, ms = self.xs, self.ys, self.ms
        if len(xs) == 1 or aft <= xs[0]:
            return ys[0]
        if aft >= xs[-1]:
            return ys[-1]
        i = next(k for k in range(len(xs) - 1) if aft <= xs[k + 1])
        h = xs[i + 1] - xs[i]
        t = (aft - xs[i]) / h
        return ((2 * t ** 3 - 3 * t ** 2 + 1) * ys[i] + (t ** 3 - 2 * t ** 2 + t) * h * ms[i]
                + (-2 * t ** 3 + 3 * t ** 2) * ys[i + 1] + (t ** 3 - t ** 2) * h * ms[i + 1])


def curve(kit, ref, offset=0.0):
    """A height function from a curve name, an inline [[aft, z], ...] or a number."""
    if isinstance(ref, (int, float)):
        return lambda aft: float(ref) + offset
    points = kit.spec["curves"][ref] if isinstance(ref, str) else ref
    c = Curve(points)
    return lambda aft: c(aft) + offset


# -- geometry helpers --------------------------------------------------------

def side_frame(kit, aft, z, side):
    """Point on the hull side (side = +1 starboard, -1 port) and its outward normal."""
    f = kit.lines.side_half
    d = 0.05
    f_aft = (f(aft + d, z) - f(aft - d, z)) / (2 * d)
    f_z = (f(aft, z + d) - f(aft, z - d)) / (2 * d)
    normal = Vector((side, f_aft, -f_z)).normalized()
    return Vector((side * f(aft, z), y_of(kit.spec, aft), z)), normal


def oriented_box(center, x_axis, y_axis, size, bevel=0.03):
    """A box of `size` along (x_axis, y_axis, x_axis × y_axis) about `center`."""
    bm = box((0, 0, 0), size, bevel)
    x = Vector(x_axis).normalized()
    y = Vector(y_axis)
    y = (y - x * y.dot(x)).normalized()
    z = x.cross(y)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(center)
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def grid(points, tints=None):
    """A quad grid from rows of points [[Vector, ...], ...]; optional per-cell tint."""
    bm = bmesh.new()
    layer = bm.faces.layers.int.new("tint")
    rows = [[bm.verts.new(p) for p in row] for row in points]
    for j in range(len(rows) - 1):
        for i in range(len(rows[j]) - 1):
            try:
                face = bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
            except ValueError:
                continue
            face.smooth = True
            if tints:
                face[layer] = tints(i, j)
    return bm


def facing(bm, outward):
    """Flip faces of an open strip so they face `outward` (a function of the face centre)."""
    for face in bm.faces:
        if face.normal.dot(outward(face.calc_center_median())) < 0:
            face.normal_flip()
    return bm


def samples(a0, a1, step):
    n = max(1, int(math.ceil(abs(a1 - a0) / step)))
    return [a0 + (a1 - a0) * i / n for i in range(n + 1)]


def point(kit, p):
    """Spec [aft, side, z] -> Blender vector."""
    return Vector((p[1], y_of(kit.spec, p[0]), p[2]))


# -- hull dressing -----------------------------------------------------------

def side_strip(kit, aft0, aft1, low, high, out, material, rows=3, step=0.5):
    for side in (-1, 1):
        points = []
        for k in range(rows):
            row = []
            for aft in samples(aft0, aft1, step):
                z = low(aft) + (high(aft) - low(aft)) * k / (rows - 1)
                row.append(Vector((side * (kit.lines.side_half(aft, z) + out), y_of(kit.spec, aft), z)))
            points.append(row)
        kit.merge(facing(grid(points), lambda c, s=side: Vector((s, 0, 0))), material)


def strakes(kit):
    """Painted bands along the side, following a curve: [{line, from, to, fromAft, toAft, material}]."""
    for strake in kit.spec.get("strakes", []):
        low = curve(kit, strake["line"], strake["from"])
        high = curve(kit, strake["line"], strake["to"])
        side_strip(kit, strake.get("fromAft", 0.3), strake.get("toAft", kit.lines.length), low, high, strake.get("out", 0.03), strake["material"])


def bulwarks(kit):
    """The side carried up from the deck edge to a rail curve, with an inner face and a rail cap."""
    spec = kit.spec.get("bulwarks")
    if not spec:
        return
    L = kit.lines.length
    rail = curve(kit, spec["rail"])
    t = spec.get("thickness", 0.3)
    aft0, aft1 = spec.get("fromAft", 0.4), spec.get("toAft", L)
    low = lambda aft: kit.lines.deck_height(aft, kit.lines.half_breadth(aft)) - 0.3
    side_strip(kit, aft0, aft1, low, rail, 0.015, spec.get("outer", "hull"))
    for side in (-1, 1):
        inner, cap = [], []
        for k in range(2):
            row = []
            for aft in samples(aft0, aft1, 0.5):
                z = low(aft) + (rail(aft) - low(aft)) * k
                row.append(Vector((side * max(0.0, kit.lines.side_half(aft, z) - t), y_of(kit.spec, aft), z)))
            inner.append(row)
        for aft in samples(aft0, aft1, 0.5):
            z = rail(aft)
            half = kit.lines.side_half(aft, z)
            y = y_of(kit.spec, aft)
            cap.append((Vector((side * (half + 0.04), y, z + 0.06)), Vector((side * max(0.0, half - t - 0.04), y, z + 0.06))))
        kit.merge(facing(grid(inner), lambda c, s=side: Vector((-s, 0, 0))), spec.get("inner", "upper"))
        kit.merge(facing(grid([[a for a, _ in cap], [b for _, b in cap]]), lambda c: Vector((0, 0, 1))), spec.get("cap", "dark"))
    if aft1 >= L - 1e-3:  # taffrail across the transom
        half = kit.lines.side_half(L, rail(L))
        y = y_of(kit.spec, L)
        for dy, material, outward in ((0.0, spec.get("outer", "hull"), -1), (t, spec.get("inner", "upper"), 1)):
            rows = [[Vector((x, y + dy, kit.lines.deck_height(L, x) - 0.3 if k == 0 else rail(L))) for x in samples(-half, half, 0.5)] for k in range(2)]
            kit.merge(facing(grid(rows), lambda c, o=outward: Vector((0, o, 0))), material)
        kit.merge(box((0, y + t / 2, rail(L) + 0.03), (2 * half + 0.1, t + 0.1, 0.12), 0.02), spec.get("cap", "dark"))


def batteries(kit):
    """Gunports in rows along each side, with guns run out and lids hauled up."""
    for battery in kit.spec.get("batteries", []):
        centre = curve(kit, battery["line"])
        width, height = battery.get("size", [0.8, 0.75])
        if "positions" in battery:
            afts = battery["positions"]
        else:
            count = battery["count"]
            afts = [battery["fromAft"] + (battery["toAft"] - battery["fromAft"]) * i / max(1, count - 1) for i in range(count)]
        gun = battery.get("gun", {"length": 1.3, "radius": 0.15})
        for aft in afts:
            z = centre(aft)
            for side in (-1, 1):
                p, n = side_frame(kit, aft, z, side)
                along = Vector((0, 1, 0))
                kit.merge(oriented_box(p + n * 0.02, along, Vector((0, 0, 1)), (width, height, 0.24), 0.02), "dark")
                kit.merge(rod(p - n * 0.3, p + n * gun["length"], gun["radius"] * 1.25, gun["radius"], 8), "dark")
                if battery.get("lids", True):
                    angle = math.radians(battery.get("lidAngle", 60))
                    hinge = p + Vector((0, 0, height / 2)) + n * 0.1
                    up = Vector((0, 0, 1)) * math.cos(angle) + n * math.sin(angle)
                    kit.merge(oriented_box(hinge + up * (height / 2), along, up, (width, height, 0.08), 0.01), battery.get("lidMaterial", "upper"))


def plate(outline, thickness, material, kit):
    """A centreplane plate from a profile [[aft, z], ...] (head knee, rudder)."""
    bm = prism([(y_of(kit.spec, a), z) for a, z in outline], -thickness / 2, thickness / 2, bevel=0.04)
    m = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    kit.merge(bm, material)


def head(kit):
    spec = kit.spec.get("head")
    if not spec:
        return
    plate(spec["profile"], spec.get("thickness", 0.6), spec.get("material", "hull"), kit)
    figure = spec.get("figurehead")
    if figure:
        sx, sy, sz = figure["size"]
        kit.merge(translate_bm(ellipsoid((sx / 2, sy / 2, sz / 2), 10, 6), point(kit, [figure["aft"], 0, figure["z"]])), figure.get("material", "upper"))


def translate_bm(bm, offset):
    bmesh.ops.translate(bm, verts=bm.verts, vec=offset)
    return bm


def stern(kit):
    spec = kit.spec.get("stern")
    if not spec:
        return
    L = kit.lines.length
    y = y_of(kit.spec, L)
    for row in spec.get("windows", []):
        w, h = row["size"]
        for i in range(row["count"]):
            x = -row["span"] / 2 + row["span"] * i / max(1, row["count"] - 1)
            kit.merge(box((x, y - 0.03, row["z"]), (w, 0.2, h), 0.02), "dark")
    for band in spec.get("bands", []):  # painted panels across the transom
        half = kit.lines.side_half(L, band["z1"])
        kit.merge(box((0, y - 0.015, (band["z0"] + band["z1"]) / 2), (2 * half - 0.1, 0.06, band["z1"] - band["z0"]), 0.0), band["material"])
    gallery = spec.get("galleries")
    if gallery:
        a0, a1, z0, z1, depth = gallery["fromAft"], gallery["toAft"], gallery["z0"], gallery["z1"], gallery["depth"]
        zm = (z0 + z1) / 2
        for side in (-1, 1):
            inner0 = kit.lines.side_half(a0, zm) - 0.3
            inner1 = kit.lines.side_half(a1, zm) - 0.3
            outer1 = kit.lines.side_half(a1, zm) + depth
            outer0 = kit.lines.side_half(a0 + 1.2, zm) + depth
            outline = [(inner0, y_of(kit.spec, a0)), (outer0, y_of(kit.spec, a0 + 1.2)), (outer1, y_of(kit.spec, a1)), (inner1, y_of(kit.spec, a1))]
            outline = [(side * x, yy) for x, yy in outline]
            if side < 0:
                outline.reverse()
            kit.merge(prism(outline, z0, z1, bevel=0.06), gallery.get("material", "hull"))
            kit.merge(prism(outline, z1 - 0.05, z1 + 0.35, bevel=0.08), gallery.get("roof", "upper"))
            count = gallery.get("windows", 3)
            for i in range(count):
                aft = a0 + 1.4 + (a1 - a0 - 1.8) * (i + 0.5) / count
                x = kit.lines.side_half(aft, zm) + depth + 0.02
                kit.merge(box((side * x, y_of(kit.spec, aft), zm + 0.2), (0.16, 0.55, (z1 - z0) * 0.45), 0.01), "dark")
    rudder = spec.get("rudder")
    if rudder:
        # Sternpost and deadwood: fill from the keel line up to the rudder
        # head, back to the stern, so no water shows between hull and rudder.
        keel = min(row["keel"] for row in kit.spec["hull"]["lines"]) + 0.02
        c = rudder.get("chord", 1.2)
        start = next(a for a in samples(L * 0.8, L, 0.25) if kit.lines.at(a)["keel"] > keel + 0.05) - 0.5
        plate([[start, rudder["top"]], [start, keel], [L + c * 0.8, keel], [L + c, rudder["top"] - 1.0], [L + 0.3, rudder["top"]]],
              rudder.get("thickness", 0.45), rudder.get("material", "bottom"), kit)


# -- rig ---------------------------------------------------------------------

class Mast:
    def __init__(self, kit, spec):
        self.spec = spec
        self.z0 = kit.base_height(spec.get("base", "deck"), [spec["aft"]])
        self.y0 = y_of(kit.spec, spec["aft"])
        self.tan = math.tan(math.radians(spec.get("rake", 0.0)))

    def at(self, z):
        return Vector((0.0, self.y0 - (z - self.z0) * self.tan, z))

    def aft_at(self, z):
        return self.spec["aft"] + (z - self.z0) * self.tan

    def radius_at(self, z):
        sections = self.spec["sections"]
        for s in reversed(sections):
            if z >= s.get("from", self.z0):
                return s["radius"]
        return sections[0]["radius"]


def rig(kit):
    spec = kit.spec.get("rig")
    if not spec:
        return
    brace = math.radians(spec.get("brace", 0.0))
    yard_dir = Vector((math.cos(brace), math.sin(brace), 0.0))  # starboard yardarm forward
    belly_dir = Vector((-math.sin(brace), math.cos(brace), 0.0))
    rope = spec.get("rigging", 0.08)
    for mspec in spec.get("masts", []):
        mast = Mast(kit, mspec)
        z = mast.z0
        for i, section in enumerate(mspec["sections"]):
            start = section.get("from", mast.z0)
            kit.merge(rod(mast.at(start), mast.at(section["head"]), section["radius"], section.get("topRadius", section["radius"] * 0.72), 12), "spar")
            if i < len(mspec["sections"]) - 1:
                r = section["radius"]
                kit.merge(oriented_box(mast.at(section["head"]) + Vector((0, 0.35 * r, 0)), Vector((1, 0, 0)), Vector((0, 1, 0)), (2.6 * r, 4.2 * r, 0.45), 0.02), "dark")
            z = section["head"]
        kit.anchor(f"anchor_mast_{mspec['id']}", mast.at(z) + Vector((0, 0, 0.3)))
        top = mspec.get("top")
        if top:
            length, width = top["size"]
            kit.merge(box(mast.at(top["z"]) - Vector((0, 0.3, 0)), (width, length, 0.3), 0.04), "dark")
        for cross in mspec.get("crosstrees", []):
            c = mast.at(cross["z"])
            kit.merge(box(c, (cross["span"], 0.25, 0.22), 0.02), "dark")
            kit.merge(box(c, (0.25, cross.get("length", 1.8), 0.22), 0.02), "dark")
        for yard in mspec.get("yards", []):
            c = mast.at(yard["z"]) + belly_dir * (mast.radius_at(yard["z"]) + 0.35)
            r = yard.get("radius", yard["span"] * 0.011)
            for s in (-1, 1):
                kit.merge(rod(c, c + yard_dir * s * yard["span"] / 2, r, r * 0.45, 8), "dark")
            if yard.get("furled"):
                bundle = c + belly_dir * 0.2 + Vector((0, 0, 0.25))
                for s in (-1, 1):
                    kit.merge(rod(bundle, bundle + yard_dir * s * yard["span"] * 0.44, 0.34, 0.16, 8), "canvas")
            sail = yard.get("sail")
            if sail:
                kit.merge(square_sail(c + belly_dir * 0.12, yard_dir, belly_dir, yard["span"] * 0.92, sail, spec.get("belly", 0.1)), "canvas")
        shrouds(kit, mast, mspec, rope)
    for spar in spec.get("spars", []):
        kit.merge(rod(point(kit, spar["from"]), point(kit, spar["to"]), spar["radius"], spar.get("endRadius", spar["radius"] * 0.7), 10), spar.get("material", "spar"))
    for stay in spec.get("stays", []):
        kit.merge(rod(point(kit, stay[0]), point(kit, stay[1]), rope * 1.3, None, 4, cap=False), "dark")
    for sail in spec.get("foreAftSails", []):
        kit.merge(fore_aft_sail(kit, sail), "canvas")
    for flag_spec in spec.get("flags", []):
        kit.merge(flag(kit, flag_spec), "canvas")


def square_sail(head_centre, yard_dir, belly_dir, head_span, sail, belly, nu=10, nv=8):
    foot_span = sail.get("footSpan", head_span * 1.15)
    z_head = head_centre.z - 0.3
    rows = []
    for j in range(nv + 1):
        v = j / nv
        width = head_span + (foot_span - head_span) * v
        z = z_head + (sail["foot"] - z_head) * v
        row = []
        for i in range(nu + 1):
            u = i / nu
            fill = belly * width * math.sin(math.pi * u) * math.sin(math.pi * (0.06 + 0.88 * v))
            roach = 0.05 * width * math.sin(math.pi * u) * v ** 4
            p = Vector((head_centre.x, head_centre.y, z + roach)) + yard_dir * (u - 0.5) * width + belly_dir * fill
            row.append(p)
        rows.append(row)
    return grid(rows)


def fore_aft_sail(kit, sail, nu=8, nv=8):
    """Jibs, staysails and the spanker: 3 or 4 corners [[aft, z], ...] in the
    centreplane, bellied to port. Corners go luff-top, luff-foot, leech-foot(, leech-top)."""
    corners = [point(kit, [a, 0.0, z]) for a, z in sail["corners"]]
    if len(corners) == 3:
        corners.append(corners[0].copy())
    p00, p01, p11, p10 = corners  # (luff, top) (luff, foot) (leech, foot) (leech, top)
    size = max((p11 - p00).length, (p10 - p01).length)
    belly = sail.get("belly", 0.08) * size
    rows = []
    for j in range(nv + 1):
        v = j / nv
        row = []
        for i in range(nu + 1):
            u = i / nu
            top = p00.lerp(p10, u)
            foot = p01.lerp(p11, u)
            p = top.lerp(foot, v)
            p.x -= belly * math.sin(math.pi * u) * math.sin(math.pi * (0.1 + 0.8 * v))
            row.append(p)
        rows.append(row)
    return grid(rows)


def shrouds(kit, mast, mspec, rope):
    spec = mspec.get("shrouds")
    top = mspec.get("top")
    if not spec or not top:
        return
    length, width = top["size"]
    z_top = top["z"]
    z_chain = spec["z"]
    out = spec.get("out", 0.9)
    count = spec.get("count", 5)
    a0, a1 = spec.get("aft", [-0.8, 3.5])
    chain_afts = [mspec["aft"] + a0 + (a1 - a0) * i / max(1, count - 1) for i in range(count)]
    for side in (-1, 1):
        # Channel (chainwale) board outboard of the hull.
        mid = (chain_afts[0] + chain_afts[-1]) / 2
        p, n = side_frame(kit, mid, z_chain, side)
        span = chain_afts[-1] - chain_afts[0] + 1.4
        kit.merge(oriented_box(p + n * (out / 2 + 0.05), Vector((0, 1, 0)), Vector((0, 0, 1)), (span, 0.22, out + 0.2), 0.02), "dark")
        top_edge = mast.at(z_top) + Vector((side * width / 2 * 0.92, -0.2, 0))
        for i, aft in enumerate(chain_afts):
            foot = Vector((side * (kit.lines.side_half(aft, z_chain) + out), y_of(kit.spec, aft), z_chain))
            head = top_edge + Vector((0, 0.5 - i * 0.18, 0))
            kit.merge(rod(foot, head, rope, None, 4, cap=False), "dark")
        cross = mspec.get("crosstrees", [])
        if cross:
            z_cross = cross[0]["z"]
            for i in range(3):  # topmast shrouds to the rim of the top
                head = mast.at(z_cross) + Vector((side * 0.3, 0, 0))
                foot = mast.at(z_top) + Vector((side * width / 2 * 0.9, 0.3 - i * 0.45, 0.15))
                kit.merge(rod(foot, head, rope * 0.8, None, 4, cap=False), "dark")
            for i in range(spec.get("backstays", 2)):  # topmast backstays to the channel
                aft = chain_afts[-1] + 0.8 + i * 0.9
                foot = Vector((side * (kit.lines.side_half(aft, z_chain) + out), y_of(kit.spec, aft), z_chain))
                kit.merge(rod(foot, mast.at(z_cross) + Vector((side * 0.3, 0, 0)), rope * 0.9, None, 4, cap=False), "dark")


# -- flags -------------------------------------------------------------------

def _hex(value):
    return int(value.lstrip("#"), 16) + 1


def _us_1795(u, v):
    if u < 0.42 and v < 7 / 13:
        return "#2c3366"
    return "#b0202e" if int(v * 13) % 2 == 0 else "#f4f1ea"


def _csa_1861(u, v):
    if u < 0.4 and v < 2 / 3:
        return "#26346e"
    return "#f4f1ea" if 1 / 3 <= v < 2 / 3 else "#b51f2b"


def _fr_1794(u, v):
    return "#1f3a8a" if u < 1 / 3 else "#f4f1ea" if u < 2 / 3 else "#c4142a"


# The 1861 flag (34 stars) differs from 1795 only in the canton, which reads
# as plain blue at game distance.
FLAG_DESIGNS.update({"us-1795": (_us_1795, 13), "us-1861": (_us_1795, 13), "fr-1794": (_fr_1794, 4), "csa-1861": (_csa_1861, 6)})


def flag(kit, spec, nu=12):
    """A flag from a named design, or from a `pattern` in the spec: rows of
    colour keys, top to bottom, hoist to fly ({"rows": ["rrbb", ...], "colors": {"r": "#hex"}})."""
    pattern = spec.get("pattern")
    if pattern:
        cells = pattern["rows"]
        cols, rows_n = len(cells[0]), len(cells)
        if any(len(row) != cols for row in cells):
            raise ValueError("flag pattern rows must all be the same length")
        # The mesh stays fine enough to ripple however coarse the pattern is;
        # cell edges still fall on face edges.
        nu, nv = cols * math.ceil(12 / cols), rows_n * math.ceil(8 / rows_n)
        design = lambda u, v: pattern["colors"][cells[min(rows_n - 1, int(v * rows_n))][min(cols - 1, int(u * cols))]]
    else:
        design, nv = FLAG_DESIGNS[spec["design"]]
    width, height = spec["size"]
    hoist = point(kit, [spec["hoist"][0], 0.0, spec["hoist"][1]])
    stream = math.radians(spec.get("stream", 60.0))  # from dead aft toward port
    fly = Vector((-math.sin(stream), -math.cos(stream), 0.0))
    across = Vector((fly.y, -fly.x, 0.0))
    wave = spec.get("wave", 0.1) * width
    rows = []
    for j in range(nv + 1):
        v = j / nv
        row = []
        for i in range(nu + 1):
            u = i / nu
            ripple = wave * u * math.sin(2 * math.pi * (1.4 * u + 0.15 * v))
            row.append(hoist + fly * u * width + across * ripple - Vector((0, 0, v * height + 0.12 * height * u * u)))
        rows.append(row)
    return grid(rows, lambda i, j: _hex(design((i + 0.5) / nu, (j + 0.5) / nv)))


def build(kit):
    strakes(kit)
    bulwarks(kit)
    batteries(kit)
    head(kit)
    stern(kit)
    rig(kit)
