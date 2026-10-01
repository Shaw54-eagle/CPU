# Bit Width Lab

A 3D comparison of a 32-bit, a 64-bit and a 128-bit CPU. It runs on your own
machine and nothing on it goes anywhere.

    python3 serve.py --open        # http://127.0.0.1:7171

On a Mac you can also double-click `Start Bit Width Lab.command`. The server is
Python's standard library, bound to 127.0.0.1, with no install step. Any port:
`python3 serve.py 8080`, or set `BITWIDTH_PORT`.

## What you're looking at

Three versions of one hypothetical chip: four RISC-V cores, 3.0 GHz, the same
32 KB / 512 KB / 8 MB caches. The only thing that changes is XLEN, the width of
the integer registers and addresses. Real 32-bit and 64-bit products differ by
much more than width (decade, process, market), so comparing real chips would
mostly show those differences instead.

RV32 and RV64 ship in real silicon. RV128 is a placeholder chapter in the RISC-V
spec, and no general-purpose 128-bit CPU has been built. The 128-bit chip here
is what the same scaling rules predict.

| In the 3D view | What it shows |
| --- | --- |
| The floating register | One cube per bit, holding the current Unix time (31 bits). |
| The lanes | One per byte moved on each load: 4, 8 or 16. |
| The die | Every block sized from the model. Copper blocks are the integer datapath. |
| Underneath | Red contacts bring power in, blue take it to ground. |
| The ruler | 10 mm. All three packages are at true relative scale. |

Click any block on a die and the same part lights up on all three chips.
Keys: `0` `1` `2` `3` views, `C` close-up, `U` underneath, `L` lid, `E` explode,
`B` lanes, `P` power pins, `T` labels.

## Where the numbers come from

Everything is computed in `model.js`, and the 3D floorplan, the tables and the
race all read from it, so they can't disagree. The rules:

- **Area.** Each part is anchored to a 64-bit core and scaled: register file,
  ALUs, bypass and load/store with width; the multiplier with width squared;
  the MMU with virtual-address bits; caches, FPU and I/O not at all.
- **Power.** Area × an activity figure per part, plus leakage, at full load.
- **Performance.** One instruction per cycle on every chip, so instruction count
  reads as time, plus memory or SSD waits where the data doesn't fit.

It's a model, not a measurement. The Speed tab lists every assumption.

## Files

| File | Role |
| --- | --- |
| `index.html` | Page, styles, top bar. |
| `model.js` | Every number: parts, scaling rules, chips, workloads. |
| `scene.js` | The three.js scene: packages, floorplans, contacts, register, lanes. |
| `panel.js` | The six tabs. |
| `main.js` | Wires the top bar and keys to the scene. |
| `serve.py` | Localhost server. |
| `check.py` | Browser-driven checks: `python3 check.py`. Needs `pip install playwright && playwright install chromium`. |
| `vendor/three.bundle.min.js` | three.js r186 with OrbitControls and CSS2DRenderer, bundled so the page works offline. MIT, see `vendor/LICENSE-three.txt`. |

Fonts come from Google Fonts when online and fall back to system fonts when not.
