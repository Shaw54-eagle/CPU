"""make_chip.py — build a realistic CPU package in Blender, in millimetres.

Three ways to run it:

  In Blender:   open the Scripting workspace, Text > Open > make_chip.py, Run Script.
                It replaces everything in the current file with the chip and a studio.
  Headless:     blender --background --python blender/make_chip.py -- --save --render --export
  As a module:  python blender/make_chip.py --save --render --export   (pip install bpy)

Flags (all optional):
  --save        write blender/chip.blend next to this script
  --render      render blender/renders/hero.jpg, exploded.jpg and delid.jpg with Cycles
  --export      write models/chip.glb for the website's Showroom
  --samples N   Cycles samples (default 96)
  --res WxH     render size (default 1600x1000)

What it builds, bottom to top: 1,664 gold lands, a 40 mm substrate with
orientation notches, laminate edges and silkscreen, 115 ceramic capacitors,
an epoxy underfill, a 14 × 11 mm die, an indium thermal layer, a silicone
sealant bead and a nickel-plated copper heat spreader with laser marking.
Positions come from layout.json, written by textures.py.

The die is shown circuit-side up so you can see it. In a real flip-chip
package that side faces down, onto the substrate, and the top is plain
polished silicon.
"""

import json
import math
import os
import sys

import bpy  # first: as a pip module, bpy is what makes bmesh and mathutils importable
import bmesh
from mathutils import Matrix, Vector


def script_dir():
    try:
        d = os.path.dirname(os.path.abspath(__file__))
        if os.path.exists(os.path.join(d, "layout.json")):
            return d
    except NameError:
        pass
    try:
        t = bpy.context.space_data.text
        if t and t.filepath:
            return os.path.dirname(bpy.path.abspath(t.filepath))
    except AttributeError:
        pass
    return bpy.path.abspath("//")


HERE = script_dir()
TEX = os.path.join(HERE, "textures")
ROOT = os.path.dirname(HERE)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
FLAGS = set(a for a in argv if a.startswith("--"))
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default

with open(os.path.join(HERE, "layout.json")) as f:
    L = json.load(f)

SUB, SUB_T = L["sub"], L["sub_t"]
Z_SUB_TOP = SUB_T
Z_DIE0 = SUB_T + 0.05                  # the die rides on solder bumps
Z_DIE1 = Z_DIE0 + L["die_t"]
Z_TIM1 = Z_DIE1 + 0.08
Z_IHS0 = SUB_T + 0.12                  # flange sits on the sealant bead
Z_PLATE0 = Z_TIM1                      # cavity ceiling touches the thermal layer
Z_PLATE1 = Z_PLATE0 + 0.42
Z_TOP = SUB_T + 3.0                    # top of the heat spreader


# --- Scene ---------------------------------------------------------------------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = "METRIC"
    s.unit_settings.scale_length = 0.001
    s.unit_settings.length_unit = "MILLIMETERS"
    return s


# --- Geometry helpers ------------------------------------------------------------

def rounded_rect(w, h, r, seg=6, cx=0.0, cy=0.0):
    """Counter-clockwise outline, starting at the bottom-right corner arc."""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    corners = [(w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180)]
    for x, y, a0 in corners:
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cx + x + r * math.cos(a), cy + y + r * math.sin(a)))
    return pts


def substrate_outline():
    """40 mm square, small corner radius, a semicircular notch in the left and right edges."""
    h, r, nr = SUB / 2, 0.6, L["notch_r"]
    ny = L["notches"][0][1]
    pts = []
    arc = lambda cx, cy, a0, a1, n=6: [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]
    notch = lambda cx, a0, a1, n=10: [(cx + nr * math.cos(math.radians(a0 + (a1 - a0) * k / n)), ny + nr * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]
    pts += arc(h - r, -h + r, -90, 0)                 # bottom-right
    pts += notch(h, -90, -270)                        # right notch, cut inward (clockwise)
    pts += arc(h - r, h - r, 0, 90)                   # top-right
    pts += arc(-h + r, h - r, 90, 180)                # top-left
    pts += notch(-h, 90, -90)                         # left notch, cut inward
    pts += arc(-h + r, -h + r, 180, 270)              # bottom-left
    return pts


def prism(bm, outline, z0, z1, mat_top=0, mat_bottom=0, mat_side=0, uv_top=None, uv_bottom=None, uv_layer=None):
    """Extrude a closed outline. Returns (bottom_verts, top_verts, faces)."""
    bot = [bm.verts.new((x, y, z0)) for x, y in outline]
    top = [bm.verts.new((x, y, z1)) for x, y in outline]
    n = len(outline)
    faces = []
    ft = bm.faces.new(top); ft.material_index = mat_top; faces.append(ft)
    fb = bm.faces.new(list(reversed(bot))); fb.material_index = mat_bottom; faces.append(fb)
    perim = [0.0]
    for i in range(n):
        a, b = outline[i], outline[(i + 1) % n]
        perim.append(perim[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    sides = []
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new([bot[i], bot[j], top[j], top[i]])
        f.material_index = mat_side
        sides.append((f, perim[i], perim[i + 1]))
        faces.append(f)
    if uv_layer is not None:
        for f in [ft, fb]:
            fn = uv_top if f is ft else uv_bottom
            if fn:
                for loop in f.loops:
                    loop[uv_layer].uv = fn(loop.vert.co.x, loop.vert.co.y)
        total = perim[-1]
        for f, p0, p1 in sides:
            us = [p0 / total * 24, p1 / total * 24]
            for loop in f.loops:
                v = loop.vert
                u = us[1] if (v is f.verts[1] or v is f.verts[2]) else us[0]
                loop[uv_layer].uv = (u, (v.co.z - z0) / max(z1 - z0, 1e-6))
    return bot, top, faces


def ring(bm, outer, inner, z0, z1, mat=0):
    """A wall between two outlines with the same point count."""
    n = len(outer)
    ob = [bm.verts.new((x, y, z0)) for x, y in outer]
    ot = [bm.verts.new((x, y, z1)) for x, y in outer]
    ib = [bm.verts.new((x, y, z0)) for x, y in inner]
    it = [bm.verts.new((x, y, z1)) for x, y in inner]
    for i in range(n):
        j = (i + 1) % n
        for quad in ([ob[i], ob[j], ot[j], ot[i]], [it[i], it[j], ib[j], ib[i]], [ot[i], ot[j], it[j], it[i]], [ib[i], ib[j], ob[j], ob[i]]):
            bm.faces.new(quad).material_index = mat


def bevel_sharp(bm, offset, segments=3, angle=30):
    edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(angle)]
    if edges:
        bmesh.ops.bevel(bm, geom=edges, offset=offset, segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True)


def finish(bm, name, mats, smooth_angle=35, collection=None, **props):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    me.shade_smooth()
    try:
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    except AttributeError:
        pass
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    for k, v in props.items():
        ob[k] = v
    return ob


def box(bm, cx, cy, cz, sx, sy, sz, rot=0.0, mat=0):
    m = Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(math.radians(rot), 4, "Z") @ Matrix.Diagonal((sx, sy, sz, 1))
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    for v in res["verts"]:
        for f in v.link_faces:
            f.material_index = mat
    return res["verts"]


# --- Materials ------------------------------------------------------------------------

def image(name, data=False):
    img = bpy.data.images.load(os.path.join(TEX, name), check_existing=True)
    if data:
        img.colorspace_settings.name = "Non-Color"
    return img


def material(name, color=(0.8, 0.8, 0.8), metallic=0.0, roughness=0.5, base_tex=None, rough_tex=None, normal_tex=None, metal_tex=None,
             normal_strength=1.0, coat=0.0, coat_rough=0.05, aniso=0.0, thin_film=0.0, ior=1.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    p.inputs["IOR"].default_value = ior
    if coat:
        p.inputs["Coat Weight"].default_value = coat
        p.inputs["Coat Roughness"].default_value = coat_rough
    if aniso:
        p.inputs["Anisotropic"].default_value = aniso
    if thin_film and "Thin Film Thickness" in p.inputs:
        p.inputs["Thin Film Thickness"].default_value = thin_film
        p.inputs["Thin Film IOR"].default_value = 1.45
    y = 300
    if base_tex:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = image(base_tex); t.location = (-600, y)
        nt.links.new(t.outputs["Color"], p.inputs["Base Color"]); y -= 300
    if rough_tex:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = image(rough_tex, data=True); t.location = (-600, y)
        nt.links.new(t.outputs["Color"], p.inputs["Roughness"]); y -= 300
    if metal_tex:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = image(metal_tex, data=True); t.location = (-600, y)
        nt.links.new(t.outputs["Color"], p.inputs["Metallic"]); y -= 300
    if normal_tex:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = image(normal_tex, data=True); t.location = (-800, y)
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.location = (-400, y); nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(t.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
    return m


def materials():
    return {
        "mask_top": material("Solder mask", base_tex="substrate_top.jpg", rough_tex="substrate_top_rough.png", normal_tex="substrate_top_normal.png", normal_strength=0.6, coat=0.4, coat_rough=0.12),
        "mask_bottom": material("Solder mask (underside)", base_tex="substrate_bottom.jpg", rough_tex="substrate_bottom_rough.png", normal_tex="substrate_bottom_normal.png", normal_strength=0.5, coat=0.4, coat_rough=0.12),
        "laminate": material("Laminate edge", base_tex="laminate.jpg", roughness=0.6),
        "gold": material("Gold", color=(1.0, 0.77, 0.36), metallic=1.0, roughness=0.2),
        "ceramic": material("Ceramic", color=(0.42, 0.33, 0.24), roughness=0.55),
        "tin": material("Tin", color=(0.80, 0.81, 0.83), metallic=1.0, roughness=0.32),
        "die": material("Silicon die", base_tex="die.jpg", metallic=0.5, roughness=0.14, coat=0.5, coat_rough=0.03, thin_film=420),
        "silicon": material("Silicon edge", color=(0.10, 0.11, 0.13), metallic=0.6, roughness=0.25),
        "underfill": material("Underfill", color=(0.05, 0.042, 0.036), roughness=0.4, coat=0.3),
        "indium": material("Indium", color=(0.76, 0.76, 0.78), metallic=1.0, roughness=0.42),
        "nickel_marked": material("Nickel (marked)", base_tex="ihs_color.jpg", rough_tex="ihs_rough.png", normal_tex="ihs_normal.png", metal_tex="ihs_metal.png", normal_strength=0.45, metallic=1.0, aniso=0.5),
        "nickel": material("Nickel", color=(0.78, 0.79, 0.81), metallic=1.0, roughness=0.3, aniso=0.4),
        "sealant": material("Sealant", color=(0.018, 0.018, 0.02), roughness=0.65),
    }


# --- The package ------------------------------------------------------------------------

def build(M):
    col = bpy.data.collections.new("Chip")
    bpy.context.scene.collection.children.link(col)
    parts = {}

    # Substrate: top, underside and cut edge get their own materials and UVs.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    top_uv = lambda x, y: ((x + SUB / 2) / SUB, (y + SUB / 2) / SUB)
    bot_uv = lambda x, y: ((SUB / 2 - x) / SUB, (y + SUB / 2) / SUB)
    prism(bm, substrate_outline(), 0.0, SUB_T, 0, 1, 2, top_uv, bot_uv, uv)
    bevel_sharp(bm, 0.07, 2)
    parts["Substrate"] = finish(bm, "Substrate", [M["mask_top"], M["mask_bottom"], M["laminate"]], collection=col,
        label="Package substrate", explode=0.0,
        info="A 40 mm square of glass-reinforced resin with copper layers inside, under green solder mask. It fans the die's microscopic bumps out to contacts a socket can touch. The notches key it into the socket one way round.")

    # Gold marks: pin-1 triangle and fiducials, set into the mask.
    bm = bmesh.new()
    px, py = L["pin1"]
    tri = [(px, py), (px + 1.6, py), (px, py + 1.6)]
    prism(bm, tri, SUB_T - 0.01, SUB_T + 0.012)
    for fx, fy in L["fiducials"]:
        prism(bm, rounded_rect(0.5, 0.5, 0.25, 4, fx, fy), SUB_T - 0.01, SUB_T + 0.012)
    parts["Markings"] = finish(bm, "Gold markings", [M["gold"]], collection=col, label="Pin-1 mark and fiducials", explode=0.0,
        info="The gold triangle marks pin 1 so the chip goes in the right way. The round marks are fiducials: targets the assembly robots' cameras use to line everything up.")

    # Land grid: one gold pad per contact on the underside.
    bm = bmesh.new()
    for x, y in L["pads"]:
        prism(bm, rounded_rect(L["pad"], L["pad"], 0.09, 2, x, y), -0.035, 0.002)
    parts["Pads"] = finish(bm, "LGA pads", [M["gold"]], collection=col, label=f"{len(L['pads']):,} gold lands", explode=-5.0,
        info="Flat gold contacts in a 0.9 mm grid. A land grid array has no pins: spring contacts in the motherboard socket press up against these. Gold doesn't corrode, so the contact stays clean for years.")

    # Capacitors: ceramic body between two tinned terminals.
    def caps(spec, z_base, flip):
        bm = bmesh.new()
        for x, y, rot, size in spec:
            Lc, Wc = (1.0, 0.5) if size == "0402" else (1.6, 0.8)
            Hc = Wc * 0.9
            zc = z_base + (-Hc / 2 if flip else Hc / 2)
            box(bm, x, y, zc, Lc * 0.62, Wc * 0.96, Hc * 0.96, rot, 0)
            for s in (-1, 1):
                off = Vector((s * Lc * 0.40, 0, 0))
                off.rotate(Matrix.Rotation(math.radians(rot), 3, "Z"))
                box(bm, x + off.x, y + off.y, zc, Lc * 0.2, Wc, Hc, rot, 1)
        bevel_sharp(bm, 0.035, 2)
        return bm
    parts["CapsTop"] = finish(caps(L["caps_top"], SUB_T, False), "Capacitors (top)", [M["ceramic"], M["tin"]], collection=col,
        label=f"{len(L['caps_top'])} capacitors, top", explode=0.0,
        info="Multilayer ceramic capacitors, most 1.0 × 0.5 mm. When billions of transistors switch at once the current demand jumps in nanoseconds; these sit millimetres from the die and supply it until the motherboard can catch up.")
    parts["CapsBottom"] = finish(caps(L["caps_bottom"], 0.0, True), "Capacitors (underside)", [M["ceramic"], M["tin"]], collection=col,
        label=f"{len(L['caps_bottom'])} capacitors, underside", explode=0.0,
        info="Land-side capacitors in the middle of the contact grid, right under the die, as close to it as they can get.")

    # Underfill: an epoxy fillet that locks the die's solder bumps in place.
    dw, dh = L["die"]
    bm = bmesh.new()
    lower = rounded_rect(dw + 1.6, dh + 1.6, 0.8, 6)
    upper = rounded_rect(dw + 0.12, dh + 0.12, 0.06, 6)
    b0 = [bm.verts.new((x, y, Z_SUB_TOP)) for x, y in lower]
    b1 = [bm.verts.new((x, y, Z_DIE0 + 0.42)) for x, y in upper]
    n = len(lower)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([b0[i], b0[j], b1[j], b1[i]])
    bm.faces.new(b1)
    bm.faces.new(list(reversed(b0)))
    parts["Underfill"] = finish(bm, "Underfill", [M["underfill"]], smooth_angle=60, collection=col, label="Underfill epoxy", explode=2.5,
        info="Epoxy wicked under the die after soldering. Silicon and the substrate expand by different amounts as they heat up; the underfill shares that strain so the tiny solder bumps don't crack.")

    # The die.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    die_uv = lambda x, y: ((x + dw / 2) / dw, (y + dh / 2) / dh)
    prism(bm, rounded_rect(dw, dh, 0.03, 1), Z_DIE0, Z_DIE1, 0, 1, 1, die_uv, die_uv, uv)
    bevel_sharp(bm, 0.02, 1)
    parts["Die"] = finish(bm, "Die", [M["die"], M["silicon"]], collection=col, label="Silicon die", explode=5.0,
        info="The processor itself: 14 × 11 mm of silicon carrying the transistors. Shown circuit-side up so you can see it; in a real flip-chip package that side faces down, wired to the substrate through thousands of solder bumps.")

    # Indium thermal layer between die and heat spreader.
    bm = bmesh.new()
    prism(bm, rounded_rect(dw - 0.2, dh - 0.2, 0.1, 3), Z_DIE1, Z_TIM1)
    bevel_sharp(bm, 0.02, 1)
    parts["TIM"] = finish(bm, "Solder TIM", [M["indium"]], collection=col, label="Indium thermal layer", explode=8.5,
        info="A thin sheet of indium solder bonding the die to the heat spreader. Metal conducts heat far better than paste, which is why chips that use it run cooler.")

    # Sealant bead under the flange.
    bm = bmesh.new()
    F, Fr = L["flange"], L["flange_r"]
    ring(bm, rounded_rect(F - 0.1, F - 0.1, Fr, 8), rounded_rect(F - 1.1, F - 1.1, Fr * 0.7, 8), Z_SUB_TOP, Z_IHS0 - 0.01)
    bevel_sharp(bm, 0.04, 2)
    parts["Sealant"] = finish(bm, "Sealant", [M["sealant"]], collection=col, label="Sealant bead", explode=11.0,
        info="Black silicone adhesive that glues the heat spreader's flange to the substrate and keeps dust off the die.")

    # Heat spreader: cavity wall, plate, raised plateau. Only the plateau's top carries the marking.
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    P, Pr = L["plateau"], L["plateau_r"]
    ihs_uv = lambda x, y: ((x + P / 2) / P, (y + P / 2) / P)
    # One closed, manifold shell. Walk the cross-section from the cavity ceiling down
    # the cavity wall, out under the flange, up the outside, in across the flange top
    # and up the plateau. Every loop has the same point count, so neighbours bridge
    # with quads. (Built as three stacked solids instead, the shared faces left
    # non-manifold edges that the bevel turned into sparkling slivers in real time.)
    cavity = rounded_rect(F - 2.4, F - 2.4, Fr * 0.6, 8)
    outside = rounded_rect(F, F, Fr, 8)
    plateau = rounded_rect(P, P, Pr, 8)
    profile = [(cavity, Z_PLATE0), (cavity, Z_IHS0), (outside, Z_IHS0), (outside, Z_PLATE1), (plateau, Z_PLATE1), (plateau, Z_TOP)]
    loops = [[bm.verts.new((x, y, z)) for x, y in pts] for pts, z in profile]
    n = len(outside)
    for lo, hi in zip(loops, loops[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([lo[i], lo[j], hi[j], hi[i]]).material_index = 1
    bm.faces.new(loops[0]).material_index = 1                  # cavity ceiling
    top = bm.faces.new(loops[-1]); top.material_index = 0       # the marked face
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bevel_sharp(bm, 0.22, 3)
    # UVs: a planar projection from above, tilted slightly so it never collapses on a
    # wall. Straight down, a vertical face gets UVs that only change sideways, and a
    # real-time renderer that derives tangents from UVs divides by zero there: the
    # brushed finish turns into sparkles. On the top face it is exactly the marking's
    # mapping. Only the flat top carries the marking; the bevel round it is plain.
    for f in bm.faces:
        f.material_index = 0 if (f.normal.z > 0.999 and f.calc_center_median().z > Z_TOP - 1e-3) else 1
        for loop in f.loops:
            x, y, z = loop.vert.co
            loop[uv].uv = ((x + P / 2 + 0.37 * (z - Z_TOP)) / P, (y + P / 2 + 0.61 * (z - Z_TOP)) / P)
    parts["IHS"] = finish(bm, "Heat spreader", [M["nickel_marked"], M["nickel"]], collection=col, label="Heat spreader", explode=14.0,
        info="Nickel-plated copper. It spreads heat from the small hot die across a much larger area for the cooler to take away, and protects the die from the pressure of the cooler. The marking is laser-etched.")
    return col, parts


# --- Studio ----------------------------------------------------------------------------

def emitter(name, size, loc, target, strength, color=(1, 1, 1), col=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bm.to_mesh(me); bm.free()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    e = nt.nodes.new("ShaderNodeEmission"); e.inputs["Color"].default_value = (*color, 1); e.inputs["Strength"].default_value = strength
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.scale = (size[0], size[1], 1)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    ob.visible_camera = False
    ob.visible_shadow = False
    col.objects.link(ob)
    return ob


def studio():
    col = bpy.data.collections.new("Studio")
    bpy.context.scene.collection.children.link(col)
    # A sweep: floor curving up into a back wall, so there is no horizon line.
    bm = bmesh.new()
    prof = [(-400, -0.04)] + [(-0 + 0, -0.04)]
    prof = [(y, -0.04) for y in (-400, 60)] + [(60 + 90 * math.sin(math.radians(a)), -0.04 + 90 * (1 - math.cos(math.radians(a)))) for a in range(10, 91, 10)] + [(150, 300)]
    left = [bm.verts.new((-500, y, z)) for y, z in prof]
    right = [bm.verts.new((500, y, z)) for y, z in prof]
    for i in range(len(prof) - 1):
        bm.faces.new([left[i], left[i + 1], right[i + 1], right[i]])
    me = bpy.data.meshes.new("Backdrop"); bm.to_mesh(me); bm.free()
    me.shade_smooth()
    floor = material("Backdrop", color=(0.020, 0.022, 0.026), roughness=0.38)
    me.materials.append(floor)
    ob = bpy.data.objects.new("Backdrop", me); col.objects.link(ob)

    emitter("Key softbox", (150, 100), (-110, -90, 150), (0, 0, 0), 9.0, (1.0, 0.97, 0.92), col)
    emitter("Fill softbox", (180, 120), (150, -60, 70), (0, 0, 0), 1.6, (0.85, 0.92, 1.0), col)
    emitter("Rim strip", (220, 26), (0, 140, 60), (0, 0, 0), 14.0, (1.0, 1.0, 1.0), col)
    emitter("Top softbox", (120, 120), (20, 10, 230), (0, 0, 0), 2.5, (1.0, 1.0, 1.0), col)
    # A big card behind the chip, where the hero camera sees it mirrored in the heat spreader.
    emitter("Reflection card", (280, 170), (-110, 140, 100), (0, 0, 4), 2.2, (1.0, 1.0, 1.0), col)

    w = bpy.data.worlds.new("World")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.022, 0.026, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    bpy.context.scene.world = w
    return col


def camera(name, loc, target, lens=85, fstop=0.03, focus=None):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.clip_start = 1
    cam.clip_end = 5000
    cam.dof.use_dof = True
    cam.dof.aperture_fstop = fstop
    ob = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.dof.focus_distance = (Vector(focus or target) - Vector(loc)).length
    return ob


def render_settings(scene, samples, res):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.glossy_bounces = 6
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 92
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0


def export_glb(parts, path):
    for ob in bpy.context.scene.objects:
        ob.select_set(False)
    for ob in parts.values():
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts["Substrate"]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kwargs = dict(filepath=path, export_format="GLB", use_selection=True, export_extras=True, export_apply=True,
                  export_yup=True, export_image_format="AUTO", export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except AttributeError:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
        bpy.ops.export_scene.gltf(**kwargs)
    print("exported", path, f"{os.path.getsize(path) / 1e6:.1f} MB")


def main():
    scene = reset()
    M = materials()
    _, parts = build(M)
    studio()
    hero = camera("Hero camera", (66, -84, 60), (0, 1.5, 1.2), lens=85, focus=(-2, -6, 3.5))
    exploded = camera("Exploded camera", (92, -118, 46), (0, 0, 6.5), lens=85, fstop=0.06, focus=(0, -4, 6))
    delid = camera("Die close-up camera", (34, -44, 38), (0, 0, 1.6), lens=100, fstop=0.04, focus=(0, -2, 1.9))
    scene.camera = hero
    samples = int(arg("--samples", 96))
    res = tuple(int(v) for v in arg("--res", "1600x1000").split("x"))
    render_settings(scene, samples, res)

    if "--export" in FLAGS:
        export_glb(parts, os.path.join(ROOT, "models", "chip.glb"))

    if "--save" in FLAGS:
        bpy.ops.file.make_paths_relative() if bpy.data.filepath else None
        path = os.path.join(HERE, "chip.blend")
        bpy.ops.wm.save_as_mainfile(filepath=path, relative_remap=True)
        print("saved", path)

    if "--render" in FLAGS:
        out = os.path.join(HERE, "renders")
        os.makedirs(out, exist_ok=True)
        scene.camera = hero
        scene.render.filepath = os.path.join(out, "hero.jpg")
        bpy.ops.render.render(write_still=True)
        print("rendered hero.jpg")
        # Exploded: every layer lifted by its own offset, as the Showroom does.
        for ob in parts.values():
            ob.location.z = ob.get("explode", 0.0) * 1.15
        scene.camera = exploded
        scene.render.filepath = os.path.join(out, "exploded.jpg")
        bpy.ops.render.render(write_still=True)
        print("rendered exploded.jpg")
        # Delidded: heat spreader, sealant and indium removed, close on the die.
        for ob in parts.values():
            ob.location.z = 0.0
        for key in ("IHS", "Sealant", "TIM"):
            parts[key].hide_render = True
        scene.camera = delid
        scene.render.filepath = os.path.join(out, "delid.jpg")
        bpy.ops.render.render(write_still=True)
        print("rendered delid.jpg")
        for key in ("IHS", "Sealant", "TIM"):
            parts[key].hide_render = False
        scene.camera = hero


if __name__ == "__main__":
    main()
