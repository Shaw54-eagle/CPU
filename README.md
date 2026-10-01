# Bit Width Lab

A 3D comparison of 8-, 16-, 32-, 64- and 128-bit CPUs, plus a stress test, a
chip builder, an instruction-by-instruction stepper and a timeline of real
chips. It runs on your own machine and nothing on it goes anywhere.

    python3 serve.py --open        # http://127.0.0.1:7171

On a Mac you can also double-click `Start Bit Width Lab.command`. The server is
Python's standard library, bound to 127.0.0.1, with no install step. Any port:
`python3 serve.py 8080`, or set `BITWIDTH_PORT`.

## What's in it

**Compare.** One hypothetical chip built five times: four RISC-V cores,
3.0 GHz, the same 32 KB / 512 KB / 8 MB caches. Only the width of the integer
registers changes. Overview, input (power, current, contacts), usage, parts and
size, all at true relative scale in 3D.

**Run.**
- *Speed*: six jobs raced on one core of each chip. The 8-bit chip can't hold
  the 800 MB linked list at all, because its addresses reach 64 KiB.
- *Stress test*: every core flat out under one of five coolers, from bare
  package to 280 mm liquid. Temperature, clock, power, current, fan speed and
  throughput update live, with charts. Hotter silicon leaks more, the governor
  throttles near 100 °C, and a chip past 105 °C at its lowest clock shuts down.
  Turn on **Heat** for a thermal-camera view of the dies.
- *Watch an op*: add or multiply numbers up to 256 bits and watch every chip
  run the real instruction sequence, carries and all. Every register value is
  computed, and each chip's answer is checked against exact arithmetic.

**Build.** Your own chip: width, process node (28 to 3 nm), cores, clock, L2
and L3, and a name engraved on the lid. Put it on the bench and it joins the
3D view, the tables, the race and the stress test. The readout includes dies
per wafer, yield and a rough cost per good die.

**Real chips.** Eleven real processors from the 6502 (1975) to the M1 (2020)
and RP2040 (2021), dies at true scale on a timeline, a Moore's-law plot, and a
wafer map of how many fit on a 300 mm wafer. Sources are listed in the tab.

| In the 3D view | What it shows |
| --- | --- |
| The floating register | One cube per bit, holding the current Unix time (31 bits). |
| The lanes | One per byte moved on each load: 1, 2, 4, 8 or 16. |
| The die | Every block sized from the model. Copper blocks are the integer datapath. |
| Underneath | Red contacts bring power in, blue take it to ground. |
| Lid | Heat spreader, and the stress test's cooler with its fan spinning at the simulated speed. |
| The ruler | 10 mm. Everything on the bench is at true relative scale. |

Keys: `0` all, `1`–`6` each chip, `C` close-up, `U` underneath, `L` lid,
`E` explode, `B` lanes, `P` power pins, `H` heat, `T` labels.

## Honest limits

- RV32 and RV64 are real. RV128 is a placeholder in the RISC-V spec; RV8 and
  RV16 don't exist. The 8- and 16-bit chips here are the same modern design
  with narrow registers, which real 8- and 16-bit chips never were.
- Every lineup number is a model, not a measurement. Area per part is anchored
  to a 64-bit core and scaled by rule; performance counts instructions at one
  per cycle plus memory waits; the stress test is a two-node thermal circuit.
  The Speed and Stress tabs list every assumption.
- Process-node densities and wafer prices in the builder are rough industry
  figures. Good for direction, not for three digits.
- Real-chip figures are as published; where sources disagree, the card says so.

## Files

| File | Role |
| --- | --- |
| `index.html` | Page, styles, top bar. |
| `model.js` | Every lineup number: parts, scaling rules, chips, workloads, wafer economics. |
| `ops.js` | Multi-word add and multiply programs, and the BigInt interpreter that runs them. |
| `stress.js` | Thermal, leakage, fan and clock-governor simulation. |
| `real.js` | The eleven real chips and their sources. |
| `scene.js` | The three.js bench: packages, floorplans, contacts, coolers, heat view, real dies. |
| `panel.js` | Navigation and the Compare and Speed tabs. |
| `tab-stress.js`, `tab-watch.js`, `tab-build.js`, `tab-real.js` | The other tabs. |
| `charts.js` | Live line charts for the stress test. |
| `ui.js` | Shared panel pieces and bench state. |
| `main.js` | Wires the top bar, keys, heat legend and boot screen. |
| `serve.py` | Localhost server. |
| `check.py` | 59 browser-driven checks: `python3 check.py`. Needs `pip install playwright && playwright install chromium`. |
| `vendor/three.bundle.min.js` | three.js r186 with OrbitControls and CSS2DRenderer, bundled so the page works offline. MIT, see `vendor/LICENSE-three.txt`. |

Fonts come from Google Fonts when online and fall back to system fonts when not.
