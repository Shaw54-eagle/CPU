// The numbers behind every block in the scene and every figure in the panel.
//
// The lineup is one hypothetical design built five times: a 4-core RISC-V
// processor on one process, one clock, one cache hierarchy. The only thing
// that changes is XLEN, the width of the integer registers. That keeps the
// comparison about width and nothing else. Real products differ by far more
// than width (era, process, market), which is what the Real chips tab is for.
//
// Every figure is computed from the rules below, so the 3D floorplan, the
// tables, the race and the stress test can never disagree with each other.

import { count } from './ops.js';

export const WIDTHS = [8, 16, 32, 64, 128];

export const ASSUME = {
  cores: 4,
  clockGHz: 3.0,
  vdd: 0.85,              // core supply at 3 GHz, volts
  mtrPerMm2: 110,         // transistor density at the 5 nm-class baseline, millions per mm²
  leakWPerMm2: 0.08,      // static power per baseline mm² at 60 °C
  ampsPerContact: 0.2,    // current carried by one supply or ground contact
  signalContacts: 656,    // 2 DDR channels (288) + I/O lanes (320) + clock, test, misc (48)
  ballPitch: 0.65,        // mm between solder balls
  ballFill: 0.82,         // fraction of the grid populated
  coreBWGBs: 20,          // memory bandwidth one core can pull, GB/s
  chipBWGBs: 76.8,        // two DDR5-4800 channels, shared by every core
  ssdGBs: 3.5,            // NVMe read speed, GB/s
  osReserveGB: 1,         // what a 32-bit-address OS keeps out of a program's 4 GiB
};

export const DEFAULT_CONFIG = { cores: 4, l2KB: 512, l3MB: 8, clockGHz: 3.0, node: '5nm' };

// How wide a pointer is in memory, and how many of its bits the chip translates.
// 8- and 16-bit chips build addresses from register pairs, like the 6502's
// 16-bit addresses or the 8086's segment:offset. RV32 uses Sv32 (2-level page
// table), RV64 here uses Sv48 (4 levels). RV128 has no paging scheme defined;
// we assume 64 translated bits, because a full 128-bit address would need a
// 13-level page-table walk.
export const PTR_BITS = { 8: 16, 16: 32, 32: 32, 64: 64, 128: 128 };
export const VA_BITS = { 8: 16, 16: 32, 32: 32, 64: 48, 128: 64 };
export const PA_BITS = { 8: 16, 16: 32, 32: 34, 64: 56, 128: 64 };
export const PT_LEVELS = { 8: 1, 16: 2, 32: 2, 64: 4, 128: 6 };

// RV8 and RV16 do not exist; RV128 is an unratified placeholder. Starred.
export const NAMES = {
  8: { isa: 'RV8*', code: 'LAB-8', short: '8-bit' },
  16: { isa: 'RV16*', code: 'LAB-16', short: '16-bit' },
  32: { isa: 'RV32GC', code: 'LAB-32', short: '32-bit' },
  64: { isa: 'RV64GC', code: 'LAB-64', short: '64-bit' },
  128: { isa: 'RV128*', code: 'LAB-128', short: '128-bit' },
};

// Process nodes for the chip builder. d = transistor density relative to the
// 5 nm-class baseline; e = energy per switching event relative to it. Rough,
// from published density figures; good for direction, not for three digits.
// wafer = rough price of one processed 300 mm wafer in US dollars, from
// widely reported industry estimates. Treat as an order of magnitude.
export const NODES = {
  '28nm': { d: 0.14, e: 4.0, wafer: 3000, label: '28 nm', era: '2011' },
  '14nm': { d: 0.32, e: 2.2, wafer: 4000, label: '14 nm', era: '2014' },
  '7nm': { d: 0.62, e: 1.35, wafer: 9300, label: '7 nm', era: '2018' },
  '5nm': { d: 1, e: 1, wafer: 17000, label: '5 nm', era: '2020' },
  '3nm': { d: 1.35, e: 0.8, wafer: 20000, label: '3 nm', era: '2023' },
};

// Gross dies on a 300 mm wafer: wafer area over die area, minus the partial
// dies lost around the edge. Yield is the simple Poisson model: the chance a
// die catches no defect, at 0.1 defects per cm².
export const DEFECTS_PER_CM2 = 0.1;
export function diesPerWafer(areaMm2, d = 300) {
  return Math.max(0, Math.floor((Math.PI * (d / 2) ** 2) / areaMm2 - (Math.PI * d) / Math.sqrt(2 * areaMm2)));
}
export function economics(c) {
  const dpw = diesPerWafer(c.area);
  const y = Math.exp(-(c.area / 100) * DEFECTS_PER_CM2);
  const good = Math.floor(dpw * y);
  return { dpw, yield: y, good, cost: good ? c.node.wafer / good : Infinity };
}

const SCALE = {
  width: (w) => w / 64,
  square: (w) => (w / 64) ** 2,
  va: (w) => VA_BITS[w] / 48,
  fe: (w) => 0.85 + 0.15 * (VA_BITS[w] / 48),
  l2: (w, cfg) => cfg.l2KB / 512,
  l3: (w, cfg) => cfg.l3MB / 8,
  none: () => 1,
};

export const SCALE_TEXT = {
  width: 'grows in step with width',
  square: 'grows with width squared',
  va: 'grows with address bits',
  fe: 'grows slightly',
  l2: 'set by cache size',
  l3: 'set by cache size',
  none: 'same at every width',
};

export const GROUPS = {
  int: { name: 'Integer datapath', note: 'Where width lives' },
  mem: { name: 'Memory access', note: 'Addresses and loads' },
  ctl: { name: 'Control', note: 'Fetch, decode, scheduling' },
  fp: { name: 'Floating point', note: 'Unchanged by integer width' },
  cache: { name: 'Cache', note: 'Same bytes at every width' },
  io: { name: 'Uncore and I/O', note: 'Shared by all the cores' },
};

// Per-core parts. base = mm² on the 64-bit chip. pd = active W/mm² at 3 GHz.
export const CORE_PARTS = [
  { id: 'l2', name: 'L2 cache', spec: '512 KB', group: 'cache', base: 0.90, pd: 0.25, scale: 'l2',
    what: 'Same 512 KB at every width. It holds the same number of bytes, so it holds half as many 128-bit pointers as 64-bit ones.' },
  { id: 'l1i', name: 'L1 instruction cache', spec: '32 KB', group: 'cache', base: 0.22, pd: 0.25, scale: 'none',
    what: 'RISC-V instructions are 32 bits long on all of these chips, so the same program code fits in the same space.' },
  { id: 'fe', name: 'Front end', spec: 'fetch, decode, predict', group: 'ctl', base: 0.45, pd: 1.0, scale: 'fe',
    what: 'Decode is identical because the instruction encoding is identical. Only the branch predictor grows, because it stores target addresses and those get longer.' },
  { id: 'ooo', name: 'Scheduler & reorder buffer', spec: '~200 in flight', group: 'ctl', base: 0.35, pd: 1.0, scale: 'none',
    what: 'Tracks instructions in flight using register tags and status bits, not data values, so integer width barely reaches it.' },
  { id: 'regs', name: 'Integer register file', spec: '32 arch + 96 rename', group: 'int', base: 0.20, pd: 1.6, scale: 'width',
    what: 'Each register is a row of storage cells, one per bit. Double the width and every row doubles. Zoom in on the block to see one stripe per bit.' },
  { id: 'alu', name: 'Integer ALUs', spec: '4 units', group: 'int', base: 0.18, pd: 1.6, scale: 'width',
    what: 'Adders, shifters and logic. An adder is a chain of per-bit cells, so twice the bits is roughly twice the cells. The carry chain also gets one gate level longer each time width doubles.' },
  { id: 'bypass', name: 'Bypass network', spec: 'result forwarding', group: 'int', base: 0.15, pd: 1.6, scale: 'width',
    what: 'Wires that hand a result straight to the next instruction without a trip through the register file. One wire per bit per path, and longer wires as the datapath widens.' },
  { id: 'mul', name: 'Multiplier & divider', spec: 'w × w → 2w', group: 'int', base: 0.12, pd: 1.6, scale: 'square',
    what: 'A multiplier array has one partial-product cell for every pair of input bits, so it grows with the square of the width: 4× bigger at each doubling. On the 8-bit chip it is a speck; on the 128-bit chip it balloons.' },
  { id: 'lsu', name: 'Load/store unit', spec: '2 load, 1 store', group: 'mem', base: 0.16, pd: 1.2, scale: 'width',
    what: 'Computes addresses and moves values between registers and the L1 data cache. Each load carries one full register: 1, 2, 4, 8 or 16 bytes.' },
  { id: 'mmu', name: 'MMU & TLBs', spec: 'address translation', group: 'mem', base: 0.10, pd: 1.2, scale: 'va',
    what: 'Translates virtual addresses to physical ones. Its tags grow with the virtual-address bits the chip translates: 16, 32, 32, 48, or an assumed 64.' },
  { id: 'l1d', name: 'L1 data cache', spec: '32 KB', group: 'cache', base: 0.24, pd: 0.25, scale: 'none',
    what: 'Same 32 KB everywhere. Wider pointers take more of it, which is why pointer-heavy code runs slower on wider chips.' },
  { id: 'fpu', name: 'FPU & vector unit', spec: '64-bit float, 128-bit SIMD', group: 'fp', base: 0.30, pd: 0.8, scale: 'none',
    what: 'Floating point has its own registers. Every chip here carries 64-bit doubles and 128-bit SIMD, the way RV32 with the D extension still has 64-bit float registers. Integer width does not touch this block.' },
];

export const CHIP_PARTS = [
  { id: 'l3', name: 'Shared L3 cache', spec: '8 MB', group: 'cache', base: 8.0, pd: 0.15, scale: 'l3',
    what: 'Shared by all the cores. Same capacity on every lineup chip, and the largest single block. On the 8-bit chip it is 128 times more memory than the chip can address.' },
  { id: 'mc', name: 'Memory controller', spec: '2 × DDR5 channels', group: 'io', base: 4.5, pd: 0.25, scale: 'none',
    what: 'Talks to RAM over two 64-bit DDR channels on every chip. The external memory bus stopped tracking CPU width decades ago; DRAM addresses are sent in pieces over shared pins.' },
  { id: 'noc', name: 'Interconnect', spec: '64-byte lines', group: 'io', base: 1.2, pd: 0.5, scale: 'none',
    what: 'Moves 64-byte cache lines between cores, L3 and memory. Lines are the same size on every chip.' },
  { id: 'io', name: 'I/O & power control', spec: 'PCIe, USB, PMU', group: 'io', base: 5.0, pd: 0.2, scale: 'none',
    what: 'PCIe, USB, clocks and power management. Identical across the lineup.' },
];

const PART_INDEX = Object.fromEntries([...CORE_PARTS, ...CHIP_PARTS].map((p) => [p.id, p]));
export const part = (id) => PART_INDEX[id];

// Dynamic power follows frequency × voltage², and voltage has to rise to
// reach a higher clock. 0.85 V at 3 GHz, about 0.1 V per GHz either side.
export const vdd = (f) => 0.55 + 0.1 * f;
export const clockFactor = (f) => (f / 3) * (vdd(f) / vdd(3)) ** 2;

function cacheSpec(kb) {
  return kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`;
}

function sized(p, w, cfg, node) {
  const area5 = p.base * SCALE[p.scale](w, cfg);
  const spec = p.id === 'l2' ? cacheSpec(cfg.l2KB) : p.id === 'l3' ? `${cfg.l3MB} MB` : p.spec;
  return {
    ...p,
    spec,
    area5,                                   // at the 5 nm baseline, for power
    area: area5 / node.d,                    // on this chip's node
    power: area5 * (p.pd * clockFactor(cfg.clockGHz) + ASSUME.leakWPerMm2) * node.e,
  };
}

export function chip(spec) {
  const cfg = { ...DEFAULT_CONFIG, ...(typeof spec === 'number' ? { w: spec } : spec) };
  const w = cfg.w;
  const node = NODES[cfg.node];
  const key = cfg.key || String(w);
  const core = CORE_PARTS.map((p) => sized(p, w, cfg, node));
  const uncore = CHIP_PARTS.filter((p) => p.id !== 'l3' || cfg.l3MB > 0).map((p) => sized(p, w, cfg, node));
  const sum = (list, k) => list.reduce((s, p) => s + p[k], 0);
  const coreArea = sum(core, 'area'), corePower = sum(core, 'power');
  const uncoreArea = sum(uncore, 'area'), uncorePower = sum(uncore, 'power');
  const area = coreArea * cfg.cores + uncoreArea;
  const power = corePower * cfg.cores + uncorePower;
  const v = vdd(cfg.clockGHz);
  const current = power / v;
  const supply = Math.ceil(current / ASSUME.ampsPerContact);
  const contacts = ASSUME.signalContacts + supply * 2;
  const grid = Math.ceil(Math.sqrt(contacts / ASSUME.ballFill));
  const intArea = sum(core.filter((p) => p.group === 'int'), 'area');
  const names = NAMES[w];
  return {
    key,
    w,
    cfg,
    custom: !!cfg.custom,
    isa: names.isa,
    code: cfg.custom ? (cfg.name || 'YOUR CHIP').toUpperCase().slice(0, 14) : names.code,
    short: cfg.custom ? (cfg.name || 'Your chip') : names.short,
    title: cfg.custom ? `${cfg.name || 'Your chip'} · ${w}-bit` : names.short,
    cores: cfg.cores,
    clockGHz: cfg.clockGHz,
    node,
    core, uncore,
    coreArea, corePower, uncoreArea, uncorePower, intArea,
    area,
    dieSide: Math.sqrt(area),
    power,
    vdd: v,
    current,
    supplyContacts: supply,
    groundContacts: supply,
    signalContacts: ASSUME.signalContacts,
    contacts,
    grid,
    pkgSide: grid * ASSUME.ballPitch + 1.2,
    decaps: Math.ceil(current * 1.2),
    transistors: (area * node.d) * ASSUME.mtrPerMm2 * 1e6,
    regBits: 32 * w,
    ptrBits: PTR_BITS[w],
    pointerBytes: PTR_BITS[w] / 8,
    vaBits: VA_BITS[w],
    paBits: PA_BITS[w],
    ptLevels: PT_LEVELS[w],
    archSpace: 2 ** PTR_BITS[w],    // bytes a pointer could ever name
    vaSpace: 2 ** VA_BITS[w],       // bytes this chip actually translates
    coreBW: Math.min(ASSUME.coreBWGBs, ASSUME.chipBWGBs / cfg.cores),
  };
}

export const CHIPS = Object.fromEntries(WIDTHS.map((w) => [w, chip(w)]));

// --- Performance ----------------------------------------------------------
//
// One instruction per cycle on every chip, so time is instruction count plus
// any wait on memory or storage. That flattens a lot of real behaviour on
// purpose: it isolates what width alone does to the work. Multi-limb add and
// multiply counts come from the programs in ops.js, the same ones the Watch
// tab steps through.

const limbsOf = (bits, w) => Math.max(1, Math.ceil(bits / w));
const addALU = (bits, w) => count('add', bits, w).alu;
const mulLow = (L) => (L === 1 ? 1 : Math.round(1.5 * L * L));

export const WORKLOADS = [
  {
    id: 'int32',
    name: 'Everyday integers',
    job: 'Sum 1 billion 32-bit numbers',
    seen: 'Loop counters, array indexes, scores, prices in cents',
    items: 1e9, unit: 'numbers', rateUnit: 'G numbers/s', rateScale: 1e9,
    bits: (w) => Math.min(w, 32),
    item(c) {
      const L = limbsOf(32, c.w);
      const cycles = L + addALU(32, c.w);
      return { cycles, memS: 0, how: L === 1 ? '1 load + 1 add per number' : `each number is ${L} limbs: ${L} loads + ${addALU(32, c.w)} instructions of add-with-carry` };
    },
    why: 'A 32-bit number fits in one register from 32 bits up, so those chips tie and the extra width sits unused. Below 32 bits every number is split into pieces and the carry has to be passed along by hand. Most code people write lives in this row.',
  },
  {
    id: 'int64',
    name: '64-bit math',
    job: 'Hash 1 billion 64-bit values',
    seen: 'File sizes, timestamps, hash tables, random numbers',
    items: 1e9, unit: 'hashes', rateUnit: 'G hashes/s', rateScale: 1e9,
    bits: (w) => Math.min(w, 64),
    item(c) {
      const L = limbsOf(64, c.w);
      if (L === 1) return { cycles: 5, memS: 0, how: 'load, xor, multiply, shift, xor: 5 instructions' };
      const cycles = L + L + mulLow(L) + 2 * L + L;
      return { cycles, memS: 0, how: `each value is ${L} limbs: ${L} loads, ${L} xors, ${mulLow(L)} for the multiply, ${2 * L} for the shift, ${L} xors = ${cycles}` };
    },
    why: 'Narrow chips fake every 64-bit operation with several registers and carry handling, and the multiply grows with the square of the pieces. Beyond 64 bits there is nothing left to gain, so 128 ties 64.',
  },
  {
    id: 'crypto',
    name: 'Crypto math',
    job: 'Multiply 10 million pairs of 256-bit numbers',
    seen: 'The elliptic-curve step in every HTTPS connection',
    items: 1e7, unit: 'multiplies', rateUnit: 'M multiplies/s', rateScale: 1e6,
    bits: (w) => w,
    item(c) {
      const n = count('mul', 256, c.w);
      const L = 256 / c.w;
      return { cycles: n.total, memS: 0, how: `${L} limbs per number, ${L * L} limb products: ${n.total.toLocaleString('en-US')} instructions` };
    },
    why: 'Schoolbook multiplication needs one partial product per pair of limbs, so halving the limb count quarters the work. This is the one row where 128 bits clearly wins. Real 64-bit chips narrow the gap with vector units and special carry instructions.',
  },
  {
    id: 'ptr',
    name: 'Pointer-heavy data',
    job: 'Walk a 100-million-node linked list',
    seen: 'Trees, linked lists, browser pages, JavaScript objects',
    items: 1e8, unit: 'nodes', rateUnit: 'M nodes/s', rateScale: 1e6,
    bits: (w) => Math.min(w, VA_BITS[w]),
    item(c) {
      const ptrB = c.ptrBits / 8;
      const node = Math.ceil((ptrB + 4) / Math.max(ptrB, 4)) * Math.max(ptrB, 4);
      const bytes = 1e8 * node;
      if (bytes > c.vaSpace) {
        return { dnf: true, cycles: 0, memS: 0, how: `can't hold it: the list needs ${fmtBytes(bytes)} and ${c.w}-bit addresses reach ${fmtBytes(c.vaSpace)}` };
      }
      const instr = limbsOf(c.ptrBits, c.w) + limbsOf(32, c.w) + addALU(32, c.w);
      const memS = node / (c.coreBW * 1e9);
      return {
        cycles: instr, memS,
        how: `${node}-byte nodes (pointer + value, padded); ${instr} instructions + memory wait per node`,
        mem: `${fmtBytes(bytes)} of RAM for the same list`,
      };
    },
    why: 'Each node is mostly pointer. Wider pointers mean fatter nodes, fewer per cache line, and more bytes dragged from memory for the same list. That is why Java, V8 and Linux’s x32 ABI all squeeze pointers back to 32 bits on 64-bit chips. The 8-bit chip cannot hold the list at all.',
  },
  {
    id: 'big',
    name: 'Large working set',
    job: 'Scan 16 GB that is already loaded',
    seen: 'Databases, video editing, open-world games',
    items: 16, unit: 'GB', rateUnit: 'GB/s', rateScale: 1,
    bits: (w) => Math.min(w, VA_BITS[w]),
    item(c) {
      const room = Math.max(0, c.vaSpace / 2 ** 30 - (c.vaSpace >= 2 ** 32 ? ASSUME.osReserveGB : 0));
      if (room >= 16) return { cycles: 0, memS: 1 / c.coreBW, how: 'all 16 GB is addressable: read at memory speed' };
      const inRam = Math.min(room, 16) / 16;
      return {
        cycles: 0,
        memS: inRam / c.coreBW + (1 - inRam) / ASSUME.ssdGBs,
        how: room >= 1
          ? `a ${c.w}-bit program can map about ${room.toFixed(0)} GB at once; the rest is re-read from SSD at ${ASSUME.ssdGBs} GB/s`
          : `a ${c.w}-bit program can map ${fmtBytes(c.vaSpace)} at once, so nearly all of it streams from SSD at ${ASSUME.ssdGBs} GB/s`,
      };
    },
    why: 'This is why the world moved to 64 bits. A 32-bit address names at most 4 GiB, and the operating system keeps part of that. Past 64 bits the address space is already far bigger than any machine’s memory, so 128 adds nothing.',
  },
  {
    id: 'fp',
    name: 'Floating point',
    job: '1 billion double-precision multiply-adds',
    seen: 'Physics, audio, 3D graphics, machine learning',
    items: 1e9, unit: 'FMAs', rateUnit: 'GFLOP/s', rateScale: 0.5e9,
    bits: (w) => Math.min(w, 30),
    item() {
      return { cycles: 1, memS: 0, how: '1 fused multiply-add per step on the 64-bit float unit' };
    },
    why: 'Floating-point registers are separate from integer ones and are 64 bits wide on every chip here. Integer width does not change the float unit, so all five tie.',
  },
];

export const workload = (id) => WORKLOADS.find((x) => x.id === id);

// Seconds for one item on one core at clock f.
export function itemTime(wl, c, f = c.clockGHz) {
  const it = wl.item(c);
  if (it.dnf) return { ...it, s: Infinity };
  return { ...it, s: it.cycles / (f * 1e9) + it.memS };
}

export function race(id, chips = WIDTHS.map((w) => CHIPS[w])) {
  const wl = workload(id);
  const rows = chips.map((c) => {
    const it = itemTime(wl, c);
    return { key: c.key, w: c.w, chip: c, ...it, s: it.s * wl.items };
  });
  const ran = rows.filter((r) => !r.dnf);
  const best = Math.min(...ran.map((r) => r.s));
  for (const r of rows) {
    r.speed = r.dnf ? 0 : best / r.s;                         // 1 = fastest
    r.joules = r.dnf ? Infinity : r.s * r.chip.power / r.chip.cores;   // one core's share
  }
  const bestJ = Math.min(...ran.map((r) => r.joules));
  for (const r of rows) r.efficiency = r.dnf ? 0 : bestJ / r.joules;
  return { wl, rows };
}

// --- Formatting -----------------------------------------------------------

const BIN = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

export function bytesPow2(bits) {
  const unit = Math.min(Math.floor(bits / 10), BIN.length - 1);
  const rest = bits - unit * 10;
  if (rest > 20) return `2^${bits} bytes`;
  return `${2 ** rest} ${BIN[unit]}`;
}

export function fmtBytes(n) {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)} GB`;
  if (n >= 2 ** 20) return `${+(n / 2 ** 20).toFixed(0)} MiB`;
  if (n >= 1024) return `${+(n / 1024).toFixed(0)} KiB`;
  return `${n} B`;
}

export function seconds(s) {
  if (!isFinite(s)) return 'can’t run';
  if (s < 1e-3) return `${(s * 1e6).toFixed(0)} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(0)} ms`;
  if (s < 100) return `${s.toFixed(2)} s`;
  return `${s.toFixed(0)} s`;
}

export function big(n) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} trillion`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million`;
  return Math.round(n).toLocaleString('en-US');
}
