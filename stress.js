// A virtual stress test: every core on full load, a cooler, and physics.
//
// Each chip is a two-node thermal circuit. The die (small heat capacity)
// sits on a cooler (large heat capacity), which loses heat to the room.
// Power has three parts that feed back on each other:
//
//   dynamic   = Σ part area × activity × W/mm²  × (f · V²)   — what the work costs
//   leakage   = baseline × 2^((T − 60) / 30)                  — doubles every 30 °C
//   clock     = governed: drops when the hotspot nears 100 °C, recovers below 92 °C
//
// Hotter silicon leaks more, which heats it further, which is why a chip
// on a weak cooler settles at a lower clock instead of a higher temperature.
// Past 105 °C at the lowest clock, the chip trips and shuts itself off,
// the way real CPUs do (THERMTRIP).

import { ASSUME, vdd, clockFactor, workload, itemTime } from './model.js';

export const AMBIENT = 25;
export const TJMAX = 100;
export const TRIP = 105;

export const COOLERS = {
  none: { label: 'No heatsink', rsa: 9.0, cs: 12, fan: null, note: 'The bare package in still air.' },
  passive: { label: 'Passive fins', rsa: 4.5, cs: 90, fan: null, note: 'Aluminium fins and no fan, like a fanless mini PC.' },
  stock: { label: 'Stock fan', rsa: 0.9, cs: 220, fan: [900, 3000], note: 'The small cooler that comes in the box.' },
  tower: { label: 'Tower air', rsa: 0.35, cs: 450, fan: [500, 1800], note: 'Heat pipes, a tall fin stack and a 120 mm fan.' },
  liquid: { label: 'Liquid 280', rsa: 0.2, cs: 800, fan: [600, 2000], note: 'A pump block and a 280 mm radiator.' },
};

// How busy each part of the chip is under each job. Integer activity is then
// scaled by how many bits are actually switching: zeros in the upper half of
// a wide register barely toggle, but the clock still reaches every bit.
export const ACTIVITY = {
  int32: { int: 1.0, mem: 0.8, ctl: 0.8, fp: 0.1, cache: 0.5, l3: 0.2, io: 0.3 },
  int64: { int: 1.0, mem: 0.8, ctl: 0.8, fp: 0.1, cache: 0.5, l3: 0.2, io: 0.3 },
  crypto: { int: 1.0, mem: 0.7, ctl: 0.8, fp: 0.1, cache: 0.5, l3: 0.2, io: 0.3 },
  ptr: { int: 0.5, mem: 1.0, ctl: 0.6, fp: 0.1, cache: 1.0, l3: 0.9, io: 1.0 },
  big: { int: 0.3, mem: 1.0, ctl: 0.5, fp: 0.4, cache: 0.9, l3: 1.0, io: 1.0 },
  fp: { int: 0.25, mem: 0.7, ctl: 0.8, fp: 1.0, cache: 0.5, l3: 0.2, io: 0.3 },
};
const IDLE = { int: 0.05, mem: 0.05, ctl: 0.05, fp: 0.02, cache: 0.05, l3: 0.05, io: 0.1 };

function actFor(act, p, intScale) {
  if (p.id === 'l3') return act.l3;
  const a = act[p.group] ?? 0.3;
  return p.group === 'int' ? a * intScale : a;
}

// --- One chip ---------------------------------------------------------------

function sim(c, wlId, coolerId) {
  const wl = workload(wlId);
  const cooler = COOLERS[coolerId];
  const probe = itemTime(wl, c);
  const dnf = !!probe.dnf;
  const act = dnf ? IDLE : ACTIVITY[wlId];
  const intScale = 0.3 + 0.7 * Math.min(1, wl.bits(c.w) / c.w);

  // Dynamic watts at 3 GHz for each part, with this job's activity, and leakage at 60 °C.
  const e = c.node.e;
  const parts = [...c.core.map((p) => ({ p, n: c.cores })), ...c.uncore.map((p) => ({ p, n: 1 }))].map(({ p, n }) => {
    const dyn = p.area5 * p.pd * actFor(act, p, intScale) * e * n;
    return { id: p.id, group: p.group, area: p.area * n, dyn, density: 0 };
  });
  const dyn3 = parts.reduce((s, x) => s + x.dyn, 0);
  const leak60 = c.core.reduce((s, p) => s + p.area5, 0) * c.cores * ASSUME.leakWPerMm2 * e
    + c.uncore.reduce((s, p) => s + p.area5, 0) * ASSUME.leakWPerMm2 * e;
  const avgDensity = dyn3 / c.area;
  for (const x of parts) x.density = x.dyn / x.area;
  const hottest = Math.max(...parts.map((x) => x.density));

  const rjc = Math.min(2, 10.5 / c.area);       // die to cooler, °C/W: a smaller die concentrates heat
  const cj = 4 + 0.05 * c.area;                  // J/°C, die plus spreader
  const fMax = c.clockGHz, fMin = Math.max(0.2, fMax * 0.15);

  const s = {
    key: c.key, chip: c, wl, cooler, dnf, how: probe.how,
    t: 0, f: fMax, Tj: AMBIENT, Ts: AMBIENT, hot: AMBIENT, P: 0, I: 0, rpm: 0, fanFrac: 0,
    rate: 0, work: 0, energy: 0, throttled: 0, peak: AMBIENT, minF: fMax, tripped: false, tripAt: null,
    hist: [],
  };

  // Temperature of one floorplan block: the die average, plus or minus how
  // far that block's power density sits from the die's average. Dense logic
  // runs hotter than the caches beside it; on real dies the gap is 10–20 °C.
  const SPREAD = 9;   // °C per W/mm² of excess density
  const cf = () => (s.tripped ? 0 : clockFactor(s.f));
  s.partTemp = (id) => {
    const x = parts.find((q) => q.id === id);
    if (!x) return s.Tj;
    return s.Tj + SPREAD * (x.density - avgDensity) * cf();
  };
  const hotspot = () => s.Tj + SPREAD * (hottest - avgDensity) * cf();

  let govClock = 0;
  s.step = (dt) => {
    s.t += dt;
    const on = !s.tripped;
    const dynP = on ? dyn3 * clockFactor(s.f) : 0;
    const leakP = on ? leak60 * 2 ** ((s.Tj - 60) / 30) : 0;
    s.P = dynP + leakP;
    s.I = on ? s.P / vdd(s.f) : 0;

    if (cooler.fan) {
      s.fanFrac = Math.min(1, Math.max(0, (s.hot - 40) / 45));
      s.rpm = cooler.fan[0] + (cooler.fan[1] - cooler.fan[0]) * s.fanFrac;
    }
    const rsa = cooler.rsa * (cooler.fan ? 1.5 - 0.5 * s.fanFrac : 1);
    const q = (s.Tj - s.Ts) / rjc;
    s.Tj += ((s.P - q) / cj) * dt;
    s.Ts += ((q - (s.Ts - AMBIENT) / rsa) / cooler.cs) * dt;
    s.hot = hotspot();
    s.peak = Math.max(s.peak, s.hot);

    // The governor checks ten times a second.
    govClock += dt;
    if (on && govClock >= 0.1) {
      govClock = 0;
      if (s.hot > TJMAX - 1) s.f = Math.max(fMin, s.f - 0.05 * fMax);
      else if (s.hot > TJMAX - 3) s.f = Math.max(fMin, s.f - 0.01 * fMax);
      else if (s.hot < TJMAX - 8) s.f = Math.min(fMax, s.f + 0.01 * fMax);
      if (s.hot > TRIP && s.f <= fMin + 1e-9) { s.tripped = true; s.tripAt = s.t; s.f = 0; }
    }

    if (on && !dnf) {
      const it = itemTime(wl, c, s.f);
      s.rate = c.cores / it.s;
      s.work += s.rate * dt;
    } else {
      s.rate = 0;
    }
    s.energy += s.P * dt;
    if (on && s.f < fMax * 0.98) s.throttled += dt;
    if (on) s.minF = Math.min(s.minF, s.f);
  };

  s.sample = () => s.hist.push({ t: s.t, T: s.hot, f: s.f, P: s.P, rate: s.rate });

  s.verdict = () => {
    if (s.dnf) return { tone: 'muted', text: 'Can’t run this job', detail: s.how };
    if (s.tripped) return { tone: 'critical', text: `Shut down at ${s.tripAt.toFixed(0)} s`, detail: `Hit ${TRIP} °C at its lowest clock and tripped its thermal cut-off.` };
    const frac = s.throttled / Math.max(s.t, 1e-9);
    if (frac < 0.01) return { tone: 'good', text: 'Held full clock', detail: `Peaked at ${s.peak.toFixed(0)} °C.` };
    return { tone: frac > 0.5 ? 'serious' : 'warning', text: `Throttled ${(frac * 100).toFixed(0)}% of the run`, detail: `Down to ${s.minF.toFixed(2)} GHz to stay under ${TJMAX} °C.` };
  };

  return s;
}

// --- A run ------------------------------------------------------------------

export function createRun(chips, { wl = 'int64', cooler = 'stock', duration = 180 } = {}) {
  const runs = chips.map((c) => sim(c, wl, cooler));
  let t = 0, lastSample = -Infinity;
  const DT = 0.05;
  const run = {
    runs, duration, wl: workload(wl), cooler: COOLERS[cooler],
    get t() { return t; },
    get done() { return t >= duration; },
    advance(simSeconds) {
      // Step in whole 50 ms ticks and snap to the end, so floating-point
      // drift can never leave a run stuck a hair short of its duration.
      const end = Math.min(duration, t + simSeconds);
      while (t < end) {
        const dt = Math.min(DT, end - t);
        for (const r of runs) r.step(dt);
        t = end - t < 1e-6 ? end : t + dt;
        if (end - t < 1e-6) t = end;
        if (t - lastSample >= 1 || t >= duration) {
          lastSample = t;
          for (const r of runs) r.sample();
        }
      }
    },
  };
  for (const r of runs) r.sample();
  return run;
}

// Ironbow, the classic thermal-camera palette: black → violet → red → amber → white.
const IRONBOW = [
  [20, [0.04, 0.03, 0.12]],
  [40, [0.30, 0.05, 0.50]],
  [60, [0.80, 0.12, 0.30]],
  [75, [0.96, 0.38, 0.06]],
  [90, [1.00, 0.72, 0.10]],
  [105, [1.00, 0.97, 0.80]],
];

export function heatRGB(T) {
  if (T <= IRONBOW[0][0]) return IRONBOW[0][1];
  for (let i = 1; i < IRONBOW.length; i++) {
    const [t1, c1] = IRONBOW[i];
    if (T <= t1) {
      const [t0, c0] = IRONBOW[i - 1];
      const k = (T - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return IRONBOW[IRONBOW.length - 1][1];
}

export const HEAT_STOPS = IRONBOW.map(([t, c]) => [t, `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`]);
