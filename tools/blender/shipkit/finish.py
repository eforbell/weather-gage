"""Hull assembly, materials, baked ambient occlusion and glTF export."""
import bmesh
import bpy

from . import lines as hull_lines
from .parts import MATERIALS, PAINT_FALLBACK, Kit, build_fittings

# Painted-realism PBR: painted steel is a dielectric (low metalness) so the sky
# environment does the work in the game. Roughness per role.
ROUGHNESS = {"hull": 0.55, "upper": 0.55, "deck": 0.85, "boot": 0.6, "bottom": 0.8, "dark": 0.5, "canvas": 0.9, "spar": 0.7}
METALNESS = {"hull": 0.2, "upper": 0.2, "deck": 0.0, "boot": 0.05, "bottom": 0.0, "dark": 0.3, "canvas": 0.0, "spar": 0.0}


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(value):
    value = value.lstrip("#")
    return tuple(_srgb_to_linear(int(value[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def make_materials(spec):
    out = []
    for name in MATERIALS:
        mat = bpy.data.materials.new(f"{spec['id']}-{name}")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        paint = spec["paint"]
        fallback = PAINT_FALLBACK.get(name)
        if name not in paint and fallback not in paint:
            raise ValueError(f"spec.paint is missing '{name}'")
        color = hex_to_linear(paint.get(name) or paint[fallback])
        bsdf.inputs["Base Color"].default_value = color
        surface = spec.get("surface", {}).get(name, {})  # e.g. wooden hulls: no metalness
        bsdf.inputs["Roughness"].default_value = surface.get("roughness", ROUGHNESS[name])
        bsdf.inputs["Metallic"].default_value = surface.get("metalness", METALNESS[name])
        mat.diffuse_color = color  # what Workbench previews show
        out.append(mat)
    return out


def build_hull_part(kit):
    spec = kit.spec
    boot_low, boot_high = spec["hull"].get("bootTopping", [-0.6, 0.9])
    bm = bmesh.new()
    hull_lines.build_hull(spec, bm)
    for z in (boot_high, boot_low):
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(0, 0, z), plane_no=(0, 0, 1))
    role = bm.faces.layers.int["role"]
    # Triangulate before painting, so a twisted quad at the stem cannot put a
    # vertical half on the deck.
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method="BEAUTY", ngon_method="BEAUTY")

    def material(face):
        if face[role] == hull_lines.ROLE_DECK:
            return "deck" if face.normal.z > 0.45 else "hull"
        z = face.calc_center_median().z
        if z > boot_high:
            return "hull"
        return "boot" if z > boot_low else "bottom"

    for face in bm.faces:
        face.smooth = face[role] != hull_lines.ROLE_END
    for edge in bm.edges:
        faces = edge.link_faces
        if len(faces) == 2 and faces[0][role] != faces[1][role]:
            edge.smooth = False
    kit.merge(bm, material)


def build_ship(spec):
    """Build the complete ship as one mesh object. Returns (object, kit)."""
    lines = hull_lines.Lines(spec)
    kit = Kit(spec, lines)
    build_hull_part(kit)
    build_fittings(kit)
    # Triangulate with a fixed method rather than leaving n-gons to the exporter.
    bmesh.ops.triangulate(kit.bm, faces=kit.bm.faces, quad_method="BEAUTY", ngon_method="BEAUTY")
    mesh = bpy.data.meshes.new(spec["id"])
    kit.bm.to_mesh(mesh)
    kit.bm.free()
    for mat in make_materials(spec):
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(spec["id"], mesh)
    bpy.context.scene.collection.objects.link(obj)
    for name, location in kit.anchors:
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_size = 1.5
        empty.location = location
        bpy.context.scene.collection.objects.link(empty)
    return obj, kit


def bake_ambient_occlusion(obj, samples=48, distance=9.0, floor=0.42):
    """Bake AO into a per-corner colour attribute (COLOR_0 in glTF).

    Vertex AO needs no UVs or textures and costs nothing at runtime: three.js
    multiplies COLOR_0 into the base colour. It grounds turrets on the deck and
    darkens gaps between fittings, which flat-shaded blockouts lack.
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.seed = 7
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.light_settings.distance = distance
    mesh = obj.data
    attr = mesh.color_attributes.new("AO", "BYTE_COLOR", "CORNER")
    mesh.color_attributes.active_color = attr
    mesh.color_attributes.render_color_index = mesh.color_attributes.find("AO")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    # Soften and add a little waterline grime: painted realism, not a dirt map.
    attr = mesh.color_attributes["AO"]
    tints = mesh.attributes.get("tint")
    tint_of_loop = {}
    if tints is not None:
        for poly in mesh.polygons:
            value = tints.data[poly.index].value
            if value:
                rgb = hex_to_linear(f"{value - 1:06x}")[:3]
                for loop_index in poly.loop_indices:
                    tint_of_loop[loop_index] = rgb
    for loop in mesh.loops:
        z = mesh.vertices[loop.vertex_index].co.z
        ao = attr.data[loop.index].color[0]
        shade = floor + (1 - floor) * ao ** 0.85
        if 0.0 < z < 2.5:
            shade *= 0.88 + 0.12 * (z / 2.5)
        r, g, b = tint_of_loop.get(loop.index, (1.0, 1.0, 1.0))
        attr.data[loop.index].color = (shade * r, shade * g, shade * b, 1.0)


def export_glb(obj, path):
    tints = obj.data.attributes.get("tint")
    if tints is not None:  # consumed by the bake; never exported
        obj.data.attributes.remove(tints)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_vertex_color="ACTIVE",
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
    )


def triangle_count(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    per_material = {}
    for tri in mesh.loop_triangles:
        name = MATERIALS[tri.material_index]
        per_material[name] = per_material.get(name, 0) + 1
    return len(mesh.loop_triangles), per_material
