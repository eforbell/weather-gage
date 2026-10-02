"""Load and check a ship spec (ships/<id>/spec.json).

The spec is written in naval terms so agents can transcribe it from profile and
plan drawings: `aft` is metres aft of the stem at deck level, `side` is metres to
starboard, heights are metres above the design waterline. Everything here maps
those numbers into Blender space: bow +Y, starboard +X, up +Z, midships at 0.
"""
import json
import os

SCHEMA = "weather-gage/ship-spec@1"


class SpecError(ValueError):
    pass


def load(path):
    with open(path, "r", encoding="utf-8") as handle:
        spec = json.load(handle)
    spec["_dir"] = os.path.dirname(os.path.abspath(path))
    check(spec)
    return spec


def check(spec):
    problems = []
    if spec.get("schema") != SCHEMA:
        problems.append(f"schema must be {SCHEMA}")
    if spec.get("units") != "meters":
        problems.append("units must be 'meters'")
    for key in ("id", "name", "era", "registryKeys", "hull"):
        if key not in spec:
            problems.append(f"missing '{key}'")
    hull = spec.get("hull", {})
    lines = hull.get("lines", [])
    if len(lines) < 4:
        problems.append("hull.lines needs at least 4 stations")
    for prev, row in zip(lines, lines[1:]):
        if row["aft"] <= prev["aft"]:
            problems.append(f"hull.lines must increase in 'aft' (at {row['aft']})")
    if lines and (abs(lines[0]["aft"]) > 1e-6 or abs(lines[-1]["aft"] - hull.get("length", 0)) > 1e-6):
        problems.append("hull.lines must start at aft=0 and end at aft=hull.length")
    for row in lines:
        if row["deck"] <= 0:
            problems.append(f"deck must be above the waterline (aft {row['aft']})")
    for turret in spec.get("turrets", []):
        if turret.get("facing") not in ("fore", "aft"):
            problems.append(f"turret {turret.get('id')} facing must be fore or aft")
    if problems:
        raise SpecError("; ".join(problems))


def y_of(spec, aft):
    """Blender Y for a distance aft of the stem (bow is +Y, midships is 0)."""
    return spec["hull"]["length"] / 2.0 - aft
