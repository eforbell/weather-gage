"""Review renders so an agent can see what it built.

profile.png is an orthographic port-side view at a fixed scale (bow to the
left, like most published profile drawings) with a JSON sidecar giving the bow
pixel, waterline pixel and pixels per metre, so scripts/build-ship.mjs can
overlay a calibrated reference drawing. plan.png is the top view. quarter.png
and game-distance.png are perspective views from roughly where the battle
camera sits, with a water plane, to judge the silhouette at play distance.
"""
import json
import math
import os

import bpy
from mathutils import Vector

PX_PER_METER = 8.0


def _workbench(scene, transparent):
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.show_shadows = True
    shading.show_object_outline = True
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"


def _camera(scene, name, location, target, ortho_scale=None, lens=50):
    data = bpy.data.cameras.new(name)
    if ortho_scale:
        data.type = "ORTHO"
        data.ortho_scale = ortho_scale
    else:
        data.lens = lens
    data.clip_end = 5000
    cam = bpy.data.objects.new(name, data)
    scene.collection.objects.link(cam)
    cam.location = location
    direction = Vector(target) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    return cam


def _render(scene, path, width, height):
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def _water(scene):
    mesh = bpy.data.meshes.new("preview-water")
    s = 2000
    mesh.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    mat = bpy.data.materials.new("preview-water")
    mat.diffuse_color = (0.06, 0.12, 0.15, 1.0)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new("preview-water", mesh)
    scene.collection.objects.link(obj)
    return obj


def render_previews(spec, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    length = spec["hull"]["length"]
    beam = spec["hull"]["beam"]
    ship = bpy.data.objects[spec["id"]]
    ys = [v.co.y for v in ship.data.vertices]
    tallest = max(v.co.z for v in ship.data.vertices)
    keel = min(row["keel"] for row in spec["hull"]["lines"])
    # Bowsprits and rudders can reach past the hull; frame them, but keep the
    # bow and stern pixels on the hull for the reference overlay.
    fore, aft = max(ys), min(ys)
    center_y = (fore + aft) / 2
    s = length / 213.4  # perspective cameras were framed for Lion

    # Profile: port side, bow left, fixed pixels per metre.
    _workbench(scene, transparent=True)
    margin = 8.0
    width_m = fore - aft + 2 * margin
    height_m = tallest - keel + 2 * margin
    width_px, height_px = round(width_m * PX_PER_METER), round(height_m * PX_PER_METER)
    center_z = (tallest + keel) / 2
    _camera(scene, "profile", (-500, center_y, center_z), (0, center_y, center_z), ortho_scale=max(width_m, height_m))
    _render(scene, os.path.join(out_dir, "profile.png"), width_px, height_px)
    scale = max(width_px, height_px) / max(width_m, height_m)
    meta = {
        "pxPerMeter": scale,
        "bowX": width_px / 2 - (length / 2 - center_y) * scale,
        "sternX": width_px / 2 + (length / 2 + center_y) * scale,
        "waterlineY": height_px / 2 + center_z * scale,
        "anchorY": height_px / 2 + center_z * scale,
        "width": width_px,
        "height": height_px,
    }
    with open(os.path.join(out_dir, "profile.json"), "w", encoding="utf-8") as handle:
        json.dump(meta, handle, indent=2)

    # Plan: from above, bow left.
    plan_w = width_m
    xs = [abs(v.co.x) for v in ship.data.vertices]
    plan_h = max(beam, 2 * max(xs)) + 2 * margin
    cam = _camera(scene, "plan", (0, center_y, 500), (0, center_y, 0), ortho_scale=plan_w)
    cam.rotation_euler = (0, 0, -math.pi / 2)
    plan_px_w, plan_px_h = round(plan_w * PX_PER_METER / 2), round(plan_h * PX_PER_METER / 2)
    _render(scene, os.path.join(out_dir, "plan.png"), plan_px_w, plan_px_h)
    plan_scale = plan_px_w / plan_w
    plan_meta = {"pxPerMeter": plan_scale, "bowX": plan_px_w / 2 - (length / 2 - center_y) * plan_scale, "sternX": plan_px_w / 2 + (length / 2 + center_y) * plan_scale,
                 "anchorY": plan_px_h / 2, "width": plan_px_w, "height": plan_px_h}
    with open(os.path.join(out_dir, "plan.json"), "w", encoding="utf-8") as handle:
        json.dump(plan_meta, handle, indent=2)

    # Perspective views over water, opaque background.
    water = _water(scene)
    _workbench(scene, transparent=False)
    scene.display.shading.background_type = "WORLD"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    if scene.world:
        scene.world.color = (0.55, 0.62, 0.66)
    # Rigged ships are taller than they are long; frame their height too.
    s = max(s, (tallest - keel) / 110.0)
    target_z = max(8 * s, (tallest + keel) / 2.6)
    _camera(scene, "quarter", (-200 * s, 215 * s, 70 * s), (0, 0, target_z), lens=50)
    _render(scene, os.path.join(out_dir, "quarter.png"), 1600, 900)
    _camera(scene, "stern-quarter", (210 * s, -220 * s, 55 * s), (0, 0, target_z), lens=50)
    _render(scene, os.path.join(out_dir, "stern-quarter.png"), 1600, 900)
    # Roughly the default battle camera: a few ship lengths off, looking down.
    _camera(scene, "game-distance", (-520 * s, 420 * s, 260 * s), (0, 0, 0), lens=50)
    _render(scene, os.path.join(out_dir, "game-distance.png"), 960, 540)
    bpy.data.objects.remove(water)
    return {"profile": meta, "plan": plan_meta}
