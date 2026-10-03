# Bit Width Lab — working notes

Read this first. It is what the earlier sessions learned building this site,
written so a new session can carry on without the old conversation.

## What this is

A personal, localhost-only website. Vanilla JS modules, no framework, no
build step, no database. `python3 serve.py --open` serves it on
http://127.0.0.1:7171 (`BITWIDTH_PORT` or a port argument to change it), bound
to loopback. Nothing leaves the machine except Google Fonts, which fall back to
system fonts when offline.

It started as a 3D comparison of 32-, 64- and 128-bit CPUs and grew in stages:

- **Stage 1**: the 3D bench comparing input, usage, parts, size and speed.
- **Stage 2** (PR #1): 8- and 16-bit chips, stress test with live stats over
  the 3D view, build-a-chip, watch-an-op, real chips, animated timeline of CPU
  history.
- **Showroom** (also PR #1): a realistic package modelled in Blender, viewed
  live with physical materials.

All three are on `main`. Start new work on a branch and merge it with a PR.
README.md is the user-facing tour; this file is the why and the gotchas.

## Files

| File | Role |
| --- | --- |
| `index.html` | Page, all CSS (tokens on `:root`, dark theme), top bar. |
| `main.js` | Wires top bar, keys, heat legend, boot screen. `window.bitWidthLab` is the scene API. |
| `panel.js` | Navigation (`NAV` groups and tabs) and the Compare and Speed tabs. Tabs have `render`, `mount`, `unmount`. |
| `scene.js` | The three.js bench. `setMode('lineup' \| 'real' \| 'timeline' \| 'showroom')`. |
| `model.js` | Every lineup number: parts, scaling, chips, workloads, process nodes, wafer economics. |
| `ops.js` | Multi-word add and multiply programs and the BigInt interpreter. |
| `stress.js` | Two-node thermal model, leakage, fan curve, governor, shutdown. |
| `real.js`, `timeline.js` | Real-chip data and timeline events, eras, devices, with sources. |
| `tab-*.js` | One per tab. `tab-timeline.js` and `tab-showroom.js` take over the viewport. |
| `showroom.js` | The Showroom's own renderer, separate from the bench's. |
| `ui.js` | Shared panel pieces, `esc()`, bench state. |
| `charts.js` | Live line charts. |
| `check.py` | 101 browser-driven checks. |
| `blender/` | `textures.py`, `make_chip.py`, `chip.blend`, `renders/`, `textures/`, `layout.json`. |
| `models/chip.glb` | What the Showroom loads; exported by `make_chip.py --export`. |
| `vendor/` | three.js r186 bundle, its licence, and `entry.js`, the recipe to rebuild it. |

## Running the checks

    pip install playwright && playwright install chromium
    python3 check.py

`check.py` starts its own server on a free port and drives Chromium with
SwiftShader (software WebGL), so it runs anywhere but slowly. `CHROMIUM=...`
points it at a specific browser binary. Run it before every push.

- **Assert on what renders, not on state:** canvas pixels, tooltip text from
  real hover hits, on-screen sizes, images that loaded.
- **Wait on a condition, never a fixed timeout.** Under SwiftShader the page
  draws a few frames a second, so animation-driven checks need
  `wait_for_function`.

## The Blender model

    python3 blender/textures.py                              # needs Pillow + NumPy
    blender -b -P blender/make_chip.py -- --save --render --export

Flags: `--save` writes `blender/chip.blend`, `--render` writes
`blender/renders/{hero,exploded,delid}.jpg`, `--export` writes `models/chip.glb`.
Also `--samples N` (default 96) and `--res WxH` (default 1600x1000).
`make_chip.py` also runs from Blender's Scripting tab, or as plain
`python make_chip.py` with the `bpy` module from pip.

- **Version:** built and tested with Blender 5.0.1. The AgX look name is
  `"AgX - Medium High Contrast"`.
- **Units:** millimetres. `scale_length` is 0.001, so 1 Blender unit is 1 mm,
  and the glTF export keeps 1 unit = 1 mm.
- **Render time:** about 2.5 minutes per final image on a 4-core cloud CPU; a Mac with Metal will be far faster.
- **Showroom metadata:** each top-level object carries custom properties
  `label`, `info` and `explode` (mm to lift when pulled apart). They export as
  glTF extras and drive the Showroom's tooltips, part list and explode.
- **Parts:** substrate, gold markings, 1,664 LGA pads, top and underside
  capacitors, underfill, die, indium TIM, sealant, heat spreader. Positions
  come from `blender/layout.json`, written by `textures.py`.
- **Re-export after every change.** If you change the model in Blender, re-run
  `--export` (and `--render` if the renders should match), then run
  `check.py`: it asserts part names, counts and the spec table.

## Things that broke, and the rules they left

- **Escape untrusted text.** A built chip's name is user input. It goes through
  `esc()` before `innerHTML`, and a check covers it.
- **GLTFLoader sanitises node names.** Spaces become underscores
  (`Heat spreader` → `Heat_spreader`). The Showroom keys parts by a slug
  (`heat-spreader`); match on that, never on the Blender name.
- **Blender's glTF exporter drops thin film.** Iridescence is what makes a die
  shimmer, so `showroom.js` puts it back on the material named `Silicon die`.
  Clear coat and anisotropy do survive the export.
- **Build closed shapes as one manifold mesh with usable UVs.**
  - The heat spreader was first three stacked solids with merged vertices.
    That left non-manifold edges, which the bevel mangled.
  - Top-down planar UVs collapse on vertical walls, and three.js then derives
    NaN tangents there: walls and bevels sparkle in real time while Cycles
    looks fine.
  - It is now one shell bridged from contour loops, with planar UVs tilted
    slightly (`0.37·z`, `0.61·z`) so the projection never collapses.
- **three.js r186 removed `PCFSoftShadowMap`.** Use `PCFShadowMap` and
  `shadow.radius`.
- **The raycaster ignores visibility.** Picking checks the part's own
  `visible`, so a lid that has been taken off can't be hovered.
- **OrbitControls damping is per frame.** Pass `dt` to `controls.update(dt)`
  so the turntable runs at the same speed at any frame rate.
- **A range input keeps focus after a drag.** Key handlers should ignore only
  text fields; otherwise shortcuts die until the user clicks elsewhere.
- **Floating-point drift** once stopped a stress run just short of its end.
  `advance` snaps to the end.
- **`pkill -f "serve.py ..."` can kill the shell that runs it.** Use
  `kill $(pgrep -f "^python3 serve.py PORT")`.
- **Colours:**
  - Series colours are tokens (`--s8` … `--s128`, `--scustom`) with dark-theme
    values, and status colours are `--good`, `--warning`, `--serious`,
    `--critical`.
  - Reuse them rather than inventing new ones.
  - The Showroom stage is the one deliberately theme-independent surface: its
    backdrop follows the lighting preset.

## Tone

The writing is part of the product.

- **Say what a number means and where it comes from.** Mark what is modelled
  rather than measured, and what is invented.
- **Keep "Honest limits" honest.** The README section and the notes in each tab
  are where that lives. Examples:
  - RV8, RV16 and RV128 are not real.
  - The Showroom chip is generic.
  - Its die is drawn circuit side up.
  - Life size assumes 96 CSS px per inch.
- **No hype and no false precision.**

## Where things stand

- Everything above is merged to `main` through PR #1, whose description is the
  fullest account of stage 2 and the Showroom. No further stage is planned yet.
- Never run on a real machine: the site has only been driven by `check.py` in
  headless Chromium with software WebGL, never in Safari or on a real GPU;
  `chip.blend` has only been opened by headless Blender; and
  `Start Bit Width Lab.command` has never been double-clicked on a Mac.
- The user wants to keep working on the Blender model on their Mac, through an
  MCP server that can drive Blender. A cloud session can't reach the Mac, so
  that work happens in a session running there.
- Before handing anything back, run `python3 check.py` and read
  `git diff --stat`.
