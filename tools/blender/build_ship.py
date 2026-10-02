"""Headless ship builder: spec.json -> GLB + review renders + build report.

    blender -b --factory-startup -P tools/blender/build_ship.py -- \
        --spec ships/hms-lion/spec.json --out public/assets/ships/dreadnought/hms-lion.glb \
        --previews output/ships/hms-lion

Normally run through `npm run ship:build -- hms-lion`, which also validates the
GLB and overlays the reference drawing. See docs/ship-pipeline.md.
"""
import argparse
import hashlib
import json
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shipkit import finish, preview, spec as spec_module  # noqa: E402

PINNED_BLENDER = "5.2"
KIT_DIR = os.path.dirname(os.path.abspath(__file__))


def kit_sha256():
    """Hash of every kit source (sorted relative path, NUL, bytes, NUL); must
    match shipKitSha256() in scripts/ship-asset-report.mjs."""
    digest = hashlib.sha256()
    paths = []
    for folder, dirs, files in os.walk(KIT_DIR):
        dirs[:] = sorted(d for d in dirs if d != "__pycache__")
        paths += [os.path.join(folder, f) for f in files if f.endswith(".py")]
    for path in sorted(os.path.relpath(p, KIT_DIR).replace(os.sep, "/") for p in paths):
        with open(os.path.join(KIT_DIR, path), "rb") as handle:
            digest.update(path.encode() + b"\0" + handle.read() + b"\0")
    return digest.hexdigest()


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--previews", default="")
    parser.add_argument("--report", default="")
    parser.add_argument("--no-bake", action="store_true", help="skip AO baking (fast iteration)")
    parser.add_argument("--blend", default="", help="also save the generated .blend for inspection")
    return parser.parse_args(argv)


def main():
    args = parse_args()
    started = time.time()
    version = bpy.app.version_string
    if not version.startswith(PINNED_BLENDER):
        print(f"WARNING: built with Blender {version}; the pipeline is pinned to {PINNED_BLENDER}.x", file=sys.stderr)
    spec = spec_module.load(args.spec)
    with open(args.spec, "rb") as handle:
        spec_hash = hashlib.sha256(handle.read()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Stamped into the GLB (scene extras) so tests can tell a stale build.
    bpy.context.scene["weatherGageSpec"] = spec["id"]
    bpy.context.scene["weatherGageSpecSha256"] = spec_hash
    bpy.context.scene["weatherGageKitSha256"] = kit_sha256()
    obj, kit = finish.build_ship(spec)
    # The hull's real waterline, in glTF metres ([x half-breadth, z]; bow is -Z),
    # so the game can lay waterline foam and the bow wave on this hull rather
    # than on the procedural stand-in's.
    length = spec["hull"]["length"]
    waterline = [[half, round(aft - length / 2, 3)] for half, aft in kit.lines.waterline()]
    bpy.context.scene["weatherGageWaterline"] = json.dumps(waterline)
    if not args.no_bake:
        finish.bake_ambient_occlusion(obj)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    finish.export_glb(obj, os.path.abspath(args.out))
    triangles, per_material = finish.triangle_count(obj)
    xs, ys, zs = zip(*[v.co for v in obj.data.vertices])
    report = {
        "id": spec["id"],
        "blender": version,
        "glb": args.out,
        "baked": not args.no_bake,
        "triangles": triangles,
        "trianglesByMaterial": per_material,
        "boundsMeters": {"length": max(ys) - min(ys), "beam": max(xs) - min(xs), "keel": min(zs), "top": max(zs)},
        "anchors": {name: [round(c, 3) for c in loc] for name, loc in kit.anchors},
        "seconds": round(time.time() - started, 1),
    }
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))
    if args.previews:
        report["views"] = preview.render_previews(spec, os.path.abspath(args.previews))
    if args.report:
        with open(args.report, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
    print("SHIP_BUILD_REPORT " + json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except spec_module.SpecError as error:
        print(f"SPEC ERROR: {error}", file=sys.stderr)
        sys.exit(2)
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
