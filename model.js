// The numbers behind every block in the scene and every figure in the panel.
//
// All three chips are the same hypothetical design: a 4-core RISC-V processor
// on one process, one clock, one cache hierarchy. The only thing that changes
// is XLEN, the width of the integer registers and addresses. That keeps the
// comparison about width and nothing else. Real 32-bit and 64-bit products
// differ by far more than width (era, process, market), which would swamp it.
//
// Every figure here is computed from the rules below, so the 3D floorplan,
// the tables and the race can never disagree with each other.

export const WIDTHS = [32, 64, 128];

export const ASSUME = {
  cores: 4,
  clockGHz: 3.0,
  vdd: 0.85,              // core supply, volts
  mtrPerMm2: 110,         // transistor density, millions per mm²
  leakWPerMm2: 0.08,      // static power, every mm² of silicon
  ampsPerContact: 0.2,    // current carried by one supply or ground contact
  signalContacts: 656,    // 2 DDR channels (288) + I/O lanes (320) + clock, test, misc (48)
  ballPitch: 0.65,        // mm between solder balls
  ballFill: 0.82,         // fraction of the grid populated
  coreBWGBs: 20,          // memory bandwidth one core can pull, GB/s
  ssdGBs: 3.5,            // NVMe read speed, GB/s
  ipc: 1,                 // instructions per cycle, held flat so instruction counts read as time
};

// Virtual-address bits each chip actually translates.
// RV32 uses Sv32 (2-level page table), RV64 here uses Sv48 (4 levels).
// RV128 has no paging scheme defined. We assume 64-bit virtual addresses,
// because a full 128-bit address would need a 13-level page table walk.
export const VA_BITS = { 32: 32, 64: 48, 128: 64 };
export const PA_BITS = { 32: 34, 64: 56, 128: 64 };
export const PT_LEVELS = { 32: 2, 64: 4, 128: 6 };

export const NAMES = {
  32: { isa: 'RV32GC', code: 'LAB-32', short: '32-bit' },
  64: { isa: 'RV64GC', code: 'LAB-64', short: '64-bit' },
  128: { isa: 'RV128GC', code: 'LAB-128', short: '128-bit' },
};

const SCALE = {
  width: (w) => w / 64,
  square: (w) => (w / 64) ** 2,
  va: (w) => VA_BITS[w] / 48,
  fe: (w) => 0.85 + 0.15 * (VA_BITS[w] / 48),
  none: () => 1,
};

export const SCALE_TEXT = {
  width: 'grows in step with width',
  square: 'grows with width squared',
  va: 'grows with address bits',
  fe: 'grows slightly',
  none: 'same at every width',
};

export const GROUPS = {
  int: { name: 'Integer datapath', note: 'Where width lives' },
  mem: { name: 'Memory access', note: 'Addresses and loads' },
  ctl: { name: 'Control', note: 'Fetch, decode, scheduling' },
  fp: { name: 'Floating point', note: 'Unchanged by integer width' },
  cache: { name: 'Cache', note: 'Same bytes at every width' },
  io: { name: 'Uncore and I/O', note: 'Shared by all four cores' },
};

// Per-core parts. base = mm² on the 64-bit chip. pd = active W/mm² at 3 GHz.
export const CORE_PARTS = [
  { id: 'l2', name: 'L2 cache', spec: '512 KB', group: 'cache', base: 0.90, pd: 0.25, scale: 'none',
    what: 'Same 512 KB at every width. It holds the same number of bytes, so it holds half as many 128-bit pointers as 64-bit ones.' },
  { id: 'l1i', name: 'L1 instruction cache', spec: '32 KB', group: 'cache', base: 0.22, pd: 0.25, scale: 'none',
    what: 'RISC-V instructions are 32 bits long on all three chips, so the same program code fits in the same space.' },
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
    what: 'A multiplier array has one partial-product cell for every pair of input bits, so it grows with the square of the width: 4× bigger at each doubling. This is the block that balloons.' },
  { id: 'lsu', name: 'Load/store unit', spec: '2 load, 1 store', group: 'mem', base: 0.16, pd: 1.2, scale: 'width',
    what: 'Computes addresses and moves values between registers and the L1 data cache. Each load carries one full register: 4, 8 or 16 bytes.' },
  { id: 'mmu', name: 'MMU & TLBs', spec: 'address translation', group: 'mem', base: 0.10, pd: 1.2, scale: 'va',
    what: 'Translates virtual addresses to physical ones. Its tags grow with the virtual-address bits the chip translates: 32, 48, or an assumed 64 on the 128-bit chip.' },
  { id: 'l1d', name: 'L1 data cache', spec: '32 KB', group: 'cache', base: 0.24, pd: 0.25, scale: 'none',
    what: 'Same 32 KB everywhere. Wider pointers take more of it, which is why pointer-heavy code runs slower on wider chips.' },
  { id: 'fpu', name: 'FPU & vector unit', spec: '64-bit float, 128-bit SIMD', group: 'fp', base: 0.30, pd: 0.8, scale: 'none',
    what: 'Floating point is a separate register file. RV32 with the D extension still has 64-bit double-precision registers, and all three chips carry 128-bit SIMD. Integer width does not touch this block.' },
];

export const CHIP_PARTS = [
  { id: 'l3', name: 'Shared L3 cache', spec: '8 MB', group: 'cache', base: 8.0, pd: 0.15, scale: 'none',
    what: 'Shared by all four cores. Same capacity on every chip. It is the largest single block and it does not care about width.' },
  { id: 'mc', name: 'Memory controller', spec: '2 × DDR5 channels', group: 'io', base: 4.5, pd: 0.25, scale: 'none',
    what: 'Talks to RAM over two 64-bit DDR channels on every chip. The external memory bus stopped tracking CPU width decades ago; DRAM addresses are sent in pieces over shared pins.' },
  { id: 'noc', name: 'Interconnect', spec: '64-byte lines', group: 'io', base: 1.2, pd: 0.5, scale: 'none',
    what: 'Moves 64-byte cache lines between cores, L3 and memory. Lines are the same size on all three chips.' },
  { id: 'io', name: 'I/O & power control', spec: 'PCIe, USB, PMU', group: 'io', base: 5.0, pd: 0.2, scale: 'none',
    what: 'PCIe, USB, clocks and power management. Identical across the three.' },
];

const PART_INDEX = Object.fromEntries([...CORE_PARTS, ...CHIP_PARTS].map((p) => [p.id, p]));
export const part = (id) => PART_INDEX[id];

function sized(p, w, count) {
  const area = p.base * SCALE[p.scale](w);
  return { ...p, area, count, power: area * (p.pd + ASSUME.leakWPerMm2) };
}

export function chip(w) {
  const core = CORE_PARTS.map((p) => sized(p, w, ASSUME.cores));
  const uncore = CHIP_PARTS.map((p) => sized(p, w, 1));
  const coreArea = core.reduce((s, p) => s + p.area, 0);
  const corePower = core.reduce((s, p) => s + p.power, 0);
  const uncoreArea = uncore.reduce((s, p) => s + p.area, 0);
  const uncorePower = uncore.reduce((s, p) => s + p.power, 0);
  const area = coreArea * ASSUME.cores + uncoreArea;
  const power = corePower * ASSUME.cores + uncorePower;
  const current = power / ASSUME.vdd;
  const supply = Math.ceil(current / ASSUME.ampsPerContact);
  const contacts = ASSUME.signalContacts + supply * 2;
  const grid = Math.ceil(Math.sqrt(contacts / ASSUME.ballFill));
  const intArea = core.filter((p) => p.group === 'int').reduce((s, p) => s + p.area, 0);
  return {
    w,
    ...NAMES[w],
    core, uncore,
    coreArea, corePower, uncoreArea, uncorePower, intArea,
    area,
    dieSide: Math.sqrt(area),
    power,
    current,
    supplyContacts: supply,
    groundContacts: supply,
    signalContacts: ASSUME.signalContacts,
    contacts,
    grid,
    pkgSide: grid * ASSUME.ballPitch + 1.2,
    decaps: Math.ceil(current * 1.2),
    transistors: area * ASSUME.mtrPerMm2 * 1e6,
    regBits: 32 * w,
    pointerBytes: w / 8,
    vaBits: VA_BITS[w],
    paBits: PA_BITS[w],
    ptLevels: PT_LEVELS[w],
    archSpace: 2 ** w,          // bytes the ISA could ever name
    vaSpace: 2 ** VA_BITS[w],   // bytes this chip actually translates
  };
}

export const CHIPS = Object.fromEntries(WIDTHS.map((w) => [w, chip(w)]));

// --- Performance ----------------------------------------------------------
//
// One instruction per cycle on every chip, so time is instruction count plus
// any wait on memory or storage. That flattens a lot of real behaviour on
// purpose: it isolates what width alone does to the work.

const cyc = (n) => n / (ASSUME.clockGHz * 1e9);
const bytesPerCycle = (ASSUME.coreBWGBs * 1e9) / (ASSUME.clockGHz * 1e9);

export const WORKLOADS = [
  {
    id: 'int32',
    name: 'Everyday integers',
    job: 'Sum 1 billion 32-bit numbers',
    seen: 'Loop counters, array indexes, scores, prices in cents',
    run(w) {
      return { s: cyc(1e9 * 2), how: '1 load + 1 add per number' };
    },
    why: 'A 32-bit number fits in every register here. Extra width sits unused, so all three tie. Most code people write lives in this row.',
  },
  {
    id: 'int64',
    name: '64-bit math',
    job: 'Hash 1 billion 64-bit values',
    seen: 'File sizes, timestamps, hash tables, random numbers',
    run(w) {
      if (w >= 64) return { s: cyc(1e9 * 5), how: 'load, xor, multiply, shift, xor: 5 instructions' };
      return { s: cyc(1e9 * 16), how: 'each 64-bit value is split across 2 registers: 2 loads, 2 xors, 6 for the multiply, 4 for the shift, 2 xors = 16' };
    },
    why: 'The 32-bit chip has to fake every 64-bit operation with pairs of registers and carry handling. Beyond 64 bits there is nothing left to gain, so the 128-bit chip ties the 64-bit one.',
  },
  {
    id: 'crypto',
    name: 'Crypto math',
    job: 'Multiply 10 million pairs of 256-bit numbers',
    seen: 'The elliptic-curve step in every HTTPS connection',
    run(w) {
      const n = 256 / w;
      const instr = 6 * n * n + 4 * n;
      return { s: cyc(1e7 * instr), how: `${n} limbs per number, ${n * n} limb products × 6 instructions + ${4 * n} loads and stores = ${instr}` };
    },
    why: 'Schoolbook multiplication needs one partial product per pair of limbs, so halving the limb count quarters the work. This is the one row where 128 bits clearly wins. Real 64-bit chips narrow the gap with vector units and special carry instructions.',
  },
  {
    id: 'ptr',
    name: 'Pointer-heavy data',
    job: 'Walk a 100-million-node linked list',
    seen: 'Trees, linked lists, browser pages, JavaScript objects',
    run(w) {
      const node = Math.max(8, (w / 8) * 2);
      const stall = node / bytesPerCycle;
      return {
        s: cyc(1e8 * (3 + stall)),
        how: `${node}-byte nodes (pointer + value, padded); 3 instructions + ${stall.toFixed(1)} cycles waiting on memory per node`,
        mem: `${((1e8 * node) / 1e9).toFixed(1)} GB of RAM for the same list`,
      };
    },
    why: 'Each node is mostly pointer. Wider pointers mean fatter nodes, fewer nodes per cache line, and more bytes dragged from memory for the same list. This is why Java, V8 and Linux’s x32 ABI all have ways to squeeze pointers back to 32 bits on 64-bit chips.',
  },
  {
    id: 'big',
    name: 'Large working set',
    job: 'Scan 16 GB that is already loaded',
    seen: 'Databases, video editing, open-world games',
    run(w) {
      if (w >= 64) return { s: 16 / ASSUME.coreBWGBs, how: 'all 16 GB is addressable: read at memory speed' };
      const inRam = 3;
      return {
        s: inRam / ASSUME.coreBWGBs + (16 - inRam) / ASSUME.ssdGBs,
        how: `a 32-bit process can map about ${inRam} GB at once; the other ${16 - inRam} GB is re-read from SSD at ${ASSUME.ssdGBs} GB/s`,
      };
    },
    why: 'This is why the world moved to 64 bits. A 32-bit address names at most 4 GiB, and the operating system keeps part of that for itself. Past 64 bits the address space is already far bigger than any machine’s memory, so 128 adds nothing.',
  },
  {
    id: 'fp',
    name: 'Floating point',
    job: '1 billion double-precision multiply-adds',
    seen: 'Physics, audio, 3D graphics, machine learning',
    run(w) {
      return { s: cyc(1e9), how: '1 fused multiply-add per step on the 64-bit float unit' };
    },
    why: 'Floating-point registers are separate from integer ones and are 64 bits wide on all three chips. Integer width does not change the float unit, so all three tie.',
  },
];

export function race(id) {
  const wl = WORKLOADS.find((x) => x.id === id);
  const rows = WIDTHS.map((w) => ({ w, ...wl.run(w) }));
  const best = Math.min(...rows.map((r) => r.s));
  for (const r of rows) {
    r.speed = best / r.s;                                  // 1 = fastest
    r.joules = r.s * CHIPS[r.w].power / ASSUME.cores;      // one core's share
  }
  const bestJ = Math.min(...rows.map((r) => r.joules));
  for (const r of rows) r.efficiency = bestJ / r.joules;
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

export function sci(n, digits = 1) {
  if (n < 1e6) return Math.round(n).toLocaleString('en-US');
  const exp = Math.floor(Math.log10(n));
  return `${(n / 10 ** exp).toFixed(digits)}×10^${exp}`;
}

export function seconds(s) {
  if (s < 1e-3) return `${(s * 1e6).toFixed(0)} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(0)} ms`;
  return `${s.toFixed(2)} s`;
}
