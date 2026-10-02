"""Hull lofting from a table of offsets (spec.hull.lines).

Each row is one station: half-breadth at deck and waterline, deck height
(sheer, including any forecastle break), keel height and a `fullness` exponent
for the underwater section (2 = round bilge, 5+ = flat bottom with a tight
bilge, under 2 = a fine V). Columns are interpolated with a monotone cubic so
the hull stays fair without overshooting at a deck break.
"""
import math

import bmesh

from .spec import y_of

COLUMNS = ("halfDeck", "halfWater", "deck", "keel", "fullness")
UNDERWATER_POINTS = 12
SIDE_POINTS = 6
DECK_POINTS = 9
FLARE_POWER = 1.6

# Face roles, later turned into materials.
ROLE_SIDE, ROLE_DECK = 0, 1


def _monotone_slopes(xs, ys):
    """Fritsch-Carlson tangents: smooth, never overshoots the data."""
    n = len(xs)
    deltas = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    slopes = [deltas[0]] + [0.0] * (n - 2) + [deltas[-1]]
    for i in range(1, n - 1):
        if deltas[i - 1] * deltas[i] <= 0:
            slopes[i] = 0.0
        else:
            w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1])
            w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1])
            slopes[i] = (w1 + w2) / (w1 / deltas[i - 1] + w2 / deltas[i])
    return slopes


class Lines:
    def __init__(self, spec):
        hull = spec["hull"]
        self.spec = spec
        self.length = hull["length"]
        self.camber = hull.get("camber", 0.0)
        rows = hull["lines"]
        self.xs = [row["aft"] for row in rows]
        self.columns = {}
        for key in COLUMNS:
            ys = [row[key] for row in rows]
            self.columns[key] = (ys, _monotone_slopes(self.xs, ys))

    def at(self, aft):
        aft = min(max(aft, self.xs[0]), self.xs[-1])
        i = max(0, min(len(self.xs) - 2, next((k for k in range(len(self.xs) - 1) if aft <= self.xs[k + 1]), len(self.xs) - 2)))
        x0, x1 = self.xs[i], self.xs[i + 1]
        h = x1 - x0
        t = (aft - x0) / h
        h00, h10 = 2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t
        h01, h11 = -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2
        out = {}
        for key, (ys, ms) in self.columns.items():
            out[key] = h00 * ys[i] + h10 * h * ms[i] + h01 * ys[i + 1] + h11 * h * ms[i + 1]
        out["halfDeck"] = max(0.0, out["halfDeck"])
        out["halfWater"] = max(0.0, min(out["halfWater"], out["halfDeck"] * 1.15))
        out["fullness"] = max(1.05, out["fullness"])
        return out

    def deck_height(self, aft, side=0.0):
        """Height of the weather deck at a point, including camber."""
        row = self.at(aft)
        half = max(row["halfDeck"], 1e-6)
        u = min(1.0, abs(side) / half)
        return row["deck"] + self.camber * (1 - u * u)

    def half_breadth(self, aft):
        return self.at(aft)["halfDeck"]

    def waterline_half(self, aft):
        """Half-breadth where the hull meets the design waterline (0 where the
        hull is clear of the water, e.g. under an overhanging counter)."""
        row = self.at(aft)
        hd, hw, deck, keel, n = row["halfDeck"], row["halfWater"], row["deck"], row["keel"], row["fullness"]
        if keel >= 0:
            return 0.0
        knuckle = max(0.0, keel + 0.35 * (deck - keel))
        if knuckle <= 0.0:
            return hw
        half_knuckle = hw + (hd - hw) * (knuckle / deck)
        depth = knuckle - keel
        return half_knuckle * max(0.0, 1 - (knuckle / depth) ** n) ** (1 / n)

    def waterline(self, samples=48):
        """[[halfBreadth, aft], ...] bow to stern, trimmed to where the hull is wet."""
        points = [(self.waterline_half(self.length * i / samples), self.length * i / samples) for i in range(samples + 1)]
        wet = [i for i, (half, _) in enumerate(points) if half > 1e-3]
        first, last = max(0, wet[0] - 1), min(len(points) - 1, wet[-1] + 1)
        return [[round(h, 3), round(a, 3)] for h, a in points[first:last + 1]]

    def stations(self):
        spacing = self.spec["hull"].get("stationSpacing", 2.0)
        count = max(8, int(math.ceil(self.length / spacing)))
        # Cosine bunching puts more stations where the ends curve hardest.
        values = {round(self.length * (1 - math.cos(math.pi * i / count)) / 2, 4) for i in range(count + 1)}
        values.update(round(x, 4) for x in self.xs)
        return sorted(values)

    def section(self, aft):
        """One closed ring of (x, z) points: keel, starboard side, deck, port side."""
        row = self.at(aft)
        hd, hw, deck, keel, n = row["halfDeck"], row["halfWater"], row["deck"], row["keel"], row["fullness"]
        knuckle = max(0.0, keel + 0.35 * (deck - keel))
        half_knuckle = hw if knuckle <= 0.0 else hw + (hd - hw) * (knuckle / deck)
        depth = knuckle - keel
        starboard = []
        for i in range(1, UNDERWATER_POINTS + 1):
            theta = (math.pi / 2) * (1 - i / UNDERWATER_POINTS)
            x = half_knuckle * math.cos(theta) ** (2 / n)
            z = knuckle - depth * math.sin(theta) ** (2 / n)
            starboard.append((x, z))
        for j in range(1, SIDE_POINTS + 1):
            u = j / SIDE_POINTS
            starboard.append((half_knuckle + (hd - half_knuckle) * u ** FLARE_POWER, knuckle + (deck - knuckle) * u))
        deck_points = []
        for k in range(1, DECK_POINTS + 1):
            u = 1 - 2 * k / (DECK_POINTS + 1)
            deck_points.append((hd * u, deck + self.camber * (1 - u * u)))
        port = [(-x, z) for x, z in reversed(starboard)]
        ring = [(0.0, keel)] + starboard + deck_points + port
        # Ring edge e joins ring[e] and ring[e+1]; deck edges sit between the
        # starboard deck edge and the port deck edge.
        first_deck = len(starboard)
        last_deck = first_deck + DECK_POINTS + 1
        return ring, (first_deck, last_deck)


def build_hull(spec, bm):
    """Loft the hull into bm. Faces carry an int layer 'role' (side/deck)."""
    lines = Lines(spec)
    role = bm.faces.layers.int.get("role") or bm.faces.layers.int.new("role")
    rings = []
    deck_span = None
    for aft in lines.stations():
        ring, deck_span = lines.section(aft)
        y = y_of(spec, aft)
        rings.append([bm.verts.new((x, y, z)) for x, z in ring])
    size = len(rings[0])
    first_deck, last_deck = deck_span
    for a, b in zip(rings, rings[1:]):
        for e in range(size):
            f = (e + 1) % size
            quad = (a[e], a[f], b[f], b[e])
            try:
                face = bm.faces.new(quad)
            except ValueError:
                continue
            face[role] = ROLE_DECK if first_deck <= e < last_deck else ROLE_SIDE
    # The stem and the stern collapse to a line; welding removes the
    # zero-width faces and closes the hull.
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    degenerate = [f for f in bm.faces if f.calc_area() < 1e-7]
    if degenerate:
        bmesh.ops.delete(bm, geom=degenerate, context="FACES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lines
