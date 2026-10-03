"""textures.py — the image maps for the chip model, and the layout both share.

    python3 blender/textures.py        # needs Pillow and numpy

Writes blender/textures/*.jpg|png and blender/layout.json. The textures are
already in the repo, so you only need this to change the engraving or the
layout. make_chip.py reads layout.json, so pads, capacitors and the painted
openings around them always line up.

Everything is in millimetres. The package is a generic desktop-style land
grid array: a 40 mm square substrate, a nickel-plated heat spreader, and a
14 × 11 mm die underneath. It is modelled on how real packages are built,
not on any one product.
"""

import json
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "textures")
rng = random.Random(2643)
np_rng = np.random.default_rng(2643)

# --- Layout -------------------------------------------------------------------

SUB = 40.0            # substrate edge
SUB_T = 1.15          # substrate thickness
NOTCH_R = 1.0         # orientation notches cut into two edges
NOTCHES = [(-SUB / 2, 9.5), (SUB / 2, 9.5)]
FLANGE = 33.0         # heat-spreader flange
FLANGE_R = 1.6
PLATEAU = 28.0        # raised top of the heat spreader
PLATEAU_R = 2.4
DIE = (14.0, 11.0)
DIE_T = 0.75
PITCH = 0.9           # land grid
PAD = 0.56
CAVITY = 6.2          # half-size of the bare centre on the underside, for capacitors


def pads():
    out = []
    n = int((SUB / 2 - 1.0) // PITCH)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x, y = i * PITCH, j * PITCH
            if abs(x) < CAVITY and abs(y) < CAVITY:
                continue
            if any(math.hypot(x - nx, y - ny) < NOTCH_R + 0.9 for nx, ny in NOTCHES):
                continue
            # A few depopulated corners, as on real parts, for keying.
            if abs(x) > 17.5 and abs(y) > 17.5 and (i + j) % 2:
                continue
            out.append((round(x, 3), round(y, 3)))
    return out


def caps_top():
    out = []
    for side in (-1, 1):
        x = side * (FLANGE / 2 + 1.75)
        y = -13.6
        while y <= 13.6:
            if abs(y - 9.5) > 1.6:
                out.append((round(x, 3), round(y, 3), 0, "0402"))
            y += 0.78
    # A short row of larger parts near one corner.
    for k in range(5):
        out.append((round(-9.0 + k * 1.9, 3), round(-(FLANGE / 2 + 1.7), 3), 90, "0603"))
    return out


def caps_bottom():
    out = []
    for r in range(8):
        for c in range(6):
            x = -4.6 + c * 1.84
            y = -4.9 + r * 1.4
            out.append((round(x, 3), round(y, 3), 0 if r % 2 else 90, "0402"))
    return out


FIDUCIALS = [(18.6, 18.6), (-18.6, 18.6), (18.6, -18.6)]
PIN1 = (-18.9, -18.9)

# --- Helpers ------------------------------------------------------------------

FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", "/Library/Fonts", "/System/Library/Fonts/Supplemental", "C:/Windows/Fonts"]


def font(name, px):
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, int(px))
    return ImageFont.load_default(int(px))


def mapper(w_mm, h_mm, W, H, mirror=False):
    """mm (centre origin, +y up) to pixels (top-left origin)."""
    def f(x, y):
        u = (w_mm / 2 - x) / w_mm if mirror else (x + w_mm / 2) / w_mm
        return u * W, (h_mm / 2 - y) / h_mm * H
    return f


def normal_from_height(h, strength):
    gy, gx = np.gradient(h.astype(np.float32))
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(h, dtype=np.float32)
    n = np.stack([nx, ny, nz], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))


def gray(a):
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))


def streaks(H, W, cols=24, amp=1.0):
    """Noise that varies fast across rows and slowly along them: brushed metal."""
    small = np_rng.normal(0, 1, (H, cols)).astype(np.float32)
    img = Image.fromarray(small).resize((W, H), Image.BILINEAR)
    a = np.asarray(img)
    return a / (np.abs(a).max() + 1e-6) * amp


def save(img, name, quality=None):
    path = os.path.join(OUT, name)
    if quality:
        img.convert("RGB").save(path, quality=quality, optimize=True)
    else:
        img.save(path, optimize=True)
    print("  wrote", name, img.size)


# --- Substrate ------------------------------------------------------------------

MASK = (30, 72, 46)
MASK_COPPER = (42, 92, 54)
SILK = (226, 228, 214)


def substrate_top(W=2048):
    H = W
    m = mapper(SUB, SUB, W, H)
    px = W / SUB
    copper = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(copper)
    # Copper planes under the mask in the strip outside the heat spreader, split by clearance gaps.
    for _ in range(70):
        x0 = rng.uniform(-19.6, 18.0); y0 = rng.uniform(-19.6, 18.0)
        w = rng.uniform(1.0, 6.0); h = rng.uniform(1.0, 6.0)
        a, b = m(x0, y0 + h), m(x0 + w, y0)
        d.rectangle([a, b], fill=rng.randint(150, 255))
    for _ in range(140):   # traces
        x, y = rng.uniform(-19.5, 19.5), rng.uniform(-19.5, 19.5)
        pts = [(x, y)]
        for _ in range(rng.randint(2, 5)):
            if rng.random() < 0.5: x += rng.uniform(-4, 4)
            else: y += rng.uniform(-4, 4)
            pts.append((x, y))
        d.line([m(*p) for p in pts], fill=200, width=max(2, int(0.09 * px)))
    gaps = copper.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(3))
    cu = np.asarray(copper, dtype=np.float32) / 255 - np.asarray(gaps, dtype=np.float32) / 255 * 0.7
    # Via rows.
    via = Image.new("L", (W, H), 0)
    dv = ImageDraw.Draw(via)
    for _ in range(26):
        x, y = rng.uniform(-19, 19), rng.uniform(-19, 19)
        horizontal = rng.random() < 0.5
        for k in range(rng.randint(4, 12)):
            vx, vy = (x + k * 0.7, y) if horizontal else (x, y + k * 0.7)
            cx, cy = m(vx, vy)
            r = 0.14 * px
            dv.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    v = np.asarray(via.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255
    height = np.clip(cu, 0, 1) * 0.6 + v * 0.8
    height = np.asarray(gray(height).filter(ImageFilter.GaussianBlur(2.0)), dtype=np.float32) / 255

    base = np.array(MASK, dtype=np.float32)
    cop = np.array(MASK_COPPER, dtype=np.float32)
    t = np.clip(cu, 0, 1)[..., None] * 0.28 + v[..., None] * 0.35
    noise = np_rng.normal(0, 2.2, (H, W, 1))
    col = base * (1 - t) + cop * t + noise
    img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))

    # Silkscreen, mask openings around fiducials, the pin-1 corner.
    d = ImageDraw.Draw(img)
    rough = np.full((H, W), 0.30, dtype=np.float32) + np_rng.normal(0, 0.02, (H, W))
    silk = Image.new("L", (W, H), 0)
    ds = ImageDraw.Draw(silk)
    f_small = font("DejaVuSansMono-Bold.ttf", 0.62 * px)
    f_tiny = font("DejaVuSansMono.ttf", 0.42 * px)
    for (x, y), text, f in [((-17.2, 19.25), "BWL-LAB64  A2643", f_small), ((6.0, -18.6), "e4  2643", f_small),
                            ((-17.2, -17.8), "1", f_small), ((11.0, 19.25), "SN 0000412", f_tiny),
                            ((-6.5, 19.3), "LOT 0526", f_tiny)]:
        ds.text(m(x, y), text, font=f, fill=255)
    for fx, fy in FIDUCIALS:
        cx, cy = m(fx, fy)
        r = 0.55 * px
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(18, 44, 28))   # opening in the mask
    s = np.asarray(silk, dtype=np.float32) / 255
    col = np.asarray(img, dtype=np.float32) * (1 - s[..., None]) + np.array(SILK, dtype=np.float32) * s[..., None]
    rough = rough * (1 - s) + 0.72 * s
    height = height + s * 0.5
    return Image.fromarray(col.astype(np.uint8)), gray(rough), normal_from_height(height, 3.0)


def substrate_bottom(pad_list, W=2048):
    H = W
    m = mapper(SUB, SUB, W, H, mirror=True)   # read from below
    px = W / SUB
    base = np.array(MASK, dtype=np.float32)
    col = np.ones((H, W, 3), dtype=np.float32) * base + np_rng.normal(0, 2.0, (H, W, 1))
    img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    height = Image.new("L", (W, H), 128)
    dh = ImageDraw.Draw(height)
    o = 0.36 * px
    for x, y in pad_list:
        cx, cy = m(x, y)
        d.rectangle([cx - o, cy - o, cx + o, cy + o], fill=(20, 46, 30))   # mask opening, shadowed
        dh.rectangle([cx - o, cy - o, cx + o, cy + o], fill=60)
    silk = Image.new("L", (W, H), 0)
    ds = ImageDraw.Draw(silk)
    f = font("DejaVuSansMono-Bold.ttf", 0.5 * px)
    for (x, y), text in [((5.9, 6.0), "LAB-64"), ((5.9, -5.6), "BWL 2643"), ((19.4, 19.5), "ASSY 0526")]:
        ds.text(m(x, y), text, font=f, fill=255)
    s = np.asarray(silk, dtype=np.float32) / 255
    c = np.asarray(img, dtype=np.float32)
    c = c * (1 - s[..., None]) + np.array(SILK, dtype=np.float32) * s[..., None]
    rough = np.full((H, W), 0.32, dtype=np.float32) * (1 - s) + 0.72 * s
    hh = np.asarray(height.filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32) / 255 + s * 0.4
    return Image.fromarray(c.astype(np.uint8)), gray(rough), normal_from_height(hh, 2.5)


def laminate(W=1024, H=128):
    """The cut edge: green mask, copper layers, glass-weave resin core."""
    rows = []
    layers = [(0.06, (30, 72, 46)), (0.03, (176, 112, 60)), (0.10, (150, 130, 80)), (0.025, (186, 120, 64)),
              (0.12, (140, 122, 74)), (0.025, (186, 120, 64)), (0.20, (128, 112, 70)), (0.025, (186, 120, 64)),
              (0.12, (140, 122, 74)), (0.025, (186, 120, 64)), (0.10, (150, 130, 80)), (0.03, (176, 112, 60)),
              (0.06, (30, 72, 46))]
    total = sum(t for t, _ in layers)
    for t, c in layers:
        rows += [c] * max(1, round(t / total * H))
    rows = (rows + [rows[-1]] * H)[:H]
    a = np.array(rows, dtype=np.float32)[:, None, :].repeat(W, axis=1)
    a += np_rng.normal(0, 6, (H, W, 1))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


# --- Heat spreader --------------------------------------------------------------

NICKEL = (200, 203, 207)
ETCH = (104, 106, 111)


def data_matrix(n=18):
    g = np.zeros((n, n), dtype=bool)
    g[:, 0] = True; g[n - 1, :] = True                  # solid L finder
    g[0, ::2] = True; g[::2, n - 1] = True              # clock tracks
    inner = np_rng.random((n - 2, n - 2)) < 0.48
    g[1:n - 1, 1:n - 1] = inner
    return g


def heat_spreader(W=2048):
    H = W
    px = W / PLATEAU
    # mm from the plateau's top-left corner.
    at = lambda x, y: (x * px, y * px)
    etch = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(etch)
    bold = lambda mm: font("DejaVuSans-Bold.ttf", mm * px)
    mono = lambda mm: font("DejaVuSansMono.ttf", mm * px)
    monob = lambda mm: font("DejaVuSansMono-Bold.ttf", mm * px)
    d.text(at(2.6, 2.4), "BIT WIDTH LAB", font=bold(1.7), fill=255)
    d.text(at(2.6, 5.3), "LAB-64", font=bold(3.4), fill=255)
    lines = ["RV64GC  8C/16T  3.6 GHz", "X613B027  2643  ES", "L637F142  (c)'26"]
    for k, line in enumerate(lines):
        d.text(at(2.6, 10.6 + k * 1.7), line, font=monob(1.12) if k == 0 else mono(1.12), fill=255)
    dm = data_matrix()
    cell = 0.27
    for i in range(dm.shape[0]):
        for j in range(dm.shape[1]):
            if dm[i, j]:
                x, y = 2.6 + j * cell, 19.4 + i * cell
                d.rectangle([*at(x, y), *at(x + cell * 0.96, y + cell * 0.96)], fill=255)
    d.polygon([at(0.9, 27.1), at(2.4, 27.1), at(0.9, 25.6)], fill=255)   # pin-1 corner
    e = np.asarray(etch.filter(ImageFilter.GaussianBlur(0.6)), dtype=np.float32) / 255

    brush = streaks(H, W, cols=40, amp=1.0)
    fine = np_rng.normal(0, 1, (H, W)).astype(np.float32)
    fine = (fine + np.roll(fine, 1, 0) + np.roll(fine, 1, 1) + np.roll(fine, -1, 0) + np.roll(fine, -1, 1)) / 5
    # Gentle polishing swirl: the plateau is lapped flat, so light catches big soft arcs.
    yy, xx = np.mgrid[0:H, 0:W] / W
    swirl = np.sin(((xx - 0.3) ** 2 + (yy - 1.2) ** 2) ** 0.5 * 40) * 0.5

    base = np.array(NICKEL, dtype=np.float32)
    col = base[None, None, :] + (brush * 3.5 + swirl * 1.2)[..., None]
    col = col * (1 - e[..., None]) + np.array(ETCH, dtype=np.float32) * e[..., None]
    rough = 0.30 + brush * 0.05 + swirl * 0.012
    rough = rough * (1 - e) + 0.66 * e
    metal = 1.0 - e * 0.55          # laser marking oxidises the nickel: darker and less mirror-like
    height = brush * 0.15 + fine * 0.05 - e * 0.9
    return (Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)), gray(np.clip(rough, 0, 1)),
            normal_from_height(height, 1.6), gray(metal))


# --- Die -----------------------------------------------------------------------------

def die_shot(W=2048):
    w_mm, h_mm = DIE
    H = int(W * h_mm / w_mm)
    px = W / w_mm
    img = Image.new("RGB", (W, H), (34, 30, 58))
    d = ImageDraw.Draw(img)

    def block(x, y, w, h, kind, hue):
        X0, Y0, X1, Y1 = x * px, y * px, (x + w) * px, (y + h) * px
        if kind == "sram":
            base = np.array(hue, dtype=np.float32)
            d.rectangle([X0, Y0, X1, Y1], fill=tuple(int(c * 0.8) for c in hue))
            step = max(3, int(0.045 * px))
            for yy in range(int(Y0) + 1, int(Y1), step):
                d.line([(X0, yy), (X1, yy)], fill=tuple(int(c) for c in base * 1.08), width=1)
            for xx in range(int(X0) + 1, int(X1), step * 6):
                d.line([(xx, Y0), (xx, Y1)], fill=tuple(int(c * 0.6) for c in hue), width=2)
        elif kind == "logic":
            d.rectangle([X0, Y0, X1, Y1], fill=hue)
            cell = max(2, int(0.03 * px))
            for _ in range(int((X1 - X0) * (Y1 - Y0) / (cell * cell) * 0.35)):
                cx = rng.uniform(X0, X1); cy = rng.uniform(Y0, Y1)
                k = rng.uniform(0.75, 1.25)
                d.rectangle([cx, cy, cx + cell * rng.randint(1, 4), cy + cell], fill=tuple(min(255, int(c * k)) for c in hue))
        elif kind == "io":
            d.rectangle([X0, Y0, X1, Y1], fill=hue)
            step = 0.24 * px
            yy = Y0 + step / 2
            while yy < Y1 - step / 2:
                d.rectangle([X0 + 0.05 * px, yy - step * 0.3, X1 - 0.05 * px, yy + step * 0.3], fill=(186, 168, 120))
                yy += step

    # Floorplan: I/O down the left, four cores top and bottom, shared cache between.
    block(0.25, 0.25, 1.4, h_mm - 0.5, "io", (60, 56, 70))
    block(1.8, 4.3, w_mm - 2.05, 2.4, "sram", (88, 70, 150))
    core_w = (w_mm - 2.05) / 4
    for row, y0 in ((0, 0.25), (1, 6.85)):
        for c in range(4):
            x0 = 1.8 + c * core_w
            block(x0 + 0.05, y0, core_w - 0.1, 1.5, "logic", (138, 112, 66))
            block(x0 + 0.05, y0 + 1.55, core_w * 0.55, 1.0 + (0 if row else 0.05), "logic", (96, 120, 92))
            block(x0 + core_w * 0.6, y0 + 1.55, core_w * 0.35, 1.0, "sram", (70, 92, 150))
            block(x0 + 0.05, y0 + 2.6, core_w - 0.1, 1.3, "sram", (102, 82, 160))
    # Top metal power straps and a faint seal ring.
    for x in np.arange(0, w_mm, 0.42):
        d.line([(x * px, 0), (x * px, H)], fill=(150, 140, 170), width=1)
    d.rectangle([2, 2, W - 3, H - 3], outline=(170, 160, 120), width=6)
    img = img.filter(ImageFilter.GaussianBlur(0.5))
    a = np.asarray(img, dtype=np.float32) + np_rng.normal(0, 3, (H, W, 1))
    # Bare silicon under a lamp is dark and saturated; the colour is mostly interference.
    lum = a.mean(axis=2, keepdims=True)
    a = (lum + (a - lum) * 1.35) * 0.62
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


# --- Main ---------------------------------------------------------------------------

def main():
    os.makedirs(OUT, exist_ok=True)
    pad_list = pads()
    layout = {
        "units": "mm",
        "sub": SUB, "sub_t": SUB_T, "notch_r": NOTCH_R, "notches": NOTCHES,
        "flange": FLANGE, "flange_r": FLANGE_R, "plateau": PLATEAU, "plateau_r": PLATEAU_R,
        "die": DIE, "die_t": DIE_T, "pitch": PITCH, "pad": PAD,
        "pads": pad_list, "caps_top": caps_top(), "caps_bottom": caps_bottom(),
        "fiducials": FIDUCIALS, "pin1": PIN1,
    }
    with open(os.path.join(HERE, "layout.json"), "w") as f:
        json.dump(layout, f, indent=1)
    print(f"layout: {len(pad_list)} pads, {len(layout['caps_top'])} top and {len(layout['caps_bottom'])} bottom capacitors")

    c, r, n = substrate_top()
    save(c, "substrate_top.jpg", 90); save(r.resize((1024, 1024)), "substrate_top_rough.png"); save(n.resize((1024, 1024)), "substrate_top_normal.png")
    c, r, n = substrate_bottom(pad_list)
    save(c, "substrate_bottom.jpg", 90); save(r.resize((1024, 1024)), "substrate_bottom_rough.png"); save(n.resize((1024, 1024)), "substrate_bottom_normal.png")
    save(laminate(), "laminate.jpg", 90)
    c, r, n, mt = heat_spreader()
    save(c, "ihs_color.jpg", 92); save(r.resize((1024, 1024)), "ihs_rough.png"); save(n.resize((1024, 1024)), "ihs_normal.png")
    save(mt.resize((1024, 1024)), "ihs_metal.png")
    save(die_shot(), "die.jpg", 92)


if __name__ == "__main__":
    main()
