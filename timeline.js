// The evolution of the CPU, from the vacuum tube to backside power.
//
// kind: 'chip'    a landmark processor (coloured by its integer width)
//       'idea'    an architecture idea: RISC, out-of-order, SIMD, multicore…
//       'process' a manufacturing breakthrough: the transistor, CMOS, FinFET…
// m is the month where it is well documented; otherwise mid-year.
// `chip` figures feed the record counters at the top of the timeline.

export const START = 1945;
export const END = 2027;

export const ERAS = [
  { from: 1945, to: 1971, name: 'Before the microprocessor', note: 'Vacuum tubes give way to transistors, then to integrated circuits.' },
  { from: 1971, to: 1977, name: 'The first microprocessors', note: 'A whole CPU fits on one chip, first for calculators, then for hobbyists.' },
  { from: 1977, to: 1985, name: 'Home computers', note: '8-bit chips put computers on desks and consoles under televisions.' },
  { from: 1985, to: 1995, name: '32 bits and RISC', note: '32-bit desktops, the PC takes over, and RISC rethinks the instruction set.' },
  { from: 1995, to: 2005, name: 'The clock-speed race', note: 'Out-of-order cores and gigahertz clocks, until power stops the climb.' },
  { from: 2005, to: 2013, name: 'Multicore and mobile', note: 'More cores instead of faster ones, and a CPU in every pocket.' },
  { from: 2013, to: 2019, name: '64 bits everywhere', note: 'Phones go 64-bit, and Moore’s law gets harder to keep.' },
  { from: 2019, to: 2027, name: 'Chiplets and new transistors', note: 'Dies are split, stacked, lit with EUV, and wrapped in gate-all-around transistors.' },
];

export const EVENTS = [
  { y: 1946, m: 2, kind: 'process', title: 'ENIAC', who: 'University of Pennsylvania',
    text: 'One of the first general-purpose electronic computers: 17,468 vacuum tubes drawing about 150 kW. Every one of those tubes was a switch that a transistor would later replace.' },
  { y: 1947, m: 12, kind: 'process', title: 'The transistor', who: 'Bell Labs',
    text: 'John Bardeen, Walter Brattain and William Shockley demonstrate the point-contact transistor: a solid switch with no filament to burn out. Every CPU since is built from transistors.' },
  { y: 1954, m: 5, kind: 'process', title: 'The silicon transistor', who: 'Texas Instruments',
    text: 'Gordon Teal’s team makes transistors from silicon instead of germanium. Silicon copes with heat far better, and becomes the material of the industry.' },
  { y: 1958, m: 9, kind: 'process', title: 'The integrated circuit', who: 'Texas Instruments',
    text: 'Jack Kilby builds several components on one piece of germanium: the first integrated circuit.' },
  { y: 1959, kind: 'process', title: 'The planar process', who: 'Fairchild Semiconductor',
    text: 'Jean Hoerni’s planar process, and Robert Noyce’s monolithic silicon chip built on it, make integrated circuits that photolithography can mass-produce.' },
  { y: 1959, m: 11, kind: 'process', title: 'The MOSFET', who: 'Bell Labs',
    text: 'Mohamed Atalla and Dawon Kahng build the metal–oxide–semiconductor transistor. It is the kind of transistor in every modern processor.' },
  { y: 1963, m: 6, kind: 'process', title: 'CMOS', who: 'Fairchild Semiconductor',
    text: 'Frank Wanlass pairs n-type and p-type transistors so a logic gate draws almost no power while it holds still. CMOS becomes the standard way to build CPUs from the 1980s on.' },
  { y: 1965, m: 4, kind: 'idea', title: 'Moore’s law', who: 'Gordon Moore',
    text: 'Moore predicts that the number of components on a chip will double every year. In 1975 he revises it to every two years, and the industry plans around it for decades.' },
  { y: 1968, kind: 'process', title: 'Silicon-gate MOS', who: 'Fairchild Semiconductor',
    text: 'Federico Faggin develops silicon-gate MOS, faster and denser than metal gates. He takes it to the newly founded Intel, where it makes the 4004 possible.' },
  { y: 1971, m: 11, kind: 'chip', title: 'Intel 4004', who: 'Intel', bits: 4,
    chip: { transistors: 2300, process: 10000, clockMHz: 0.74 },
    text: 'The first commercial microprocessor: a complete CPU on one chip. Four bits wide, built for Busicom’s 141-PF printing calculator.' },
  { y: 1972, m: 4, kind: 'chip', title: 'Intel 8008', who: 'Intel', bits: 8,
    chip: { transistors: 3500, process: 10000, clockMHz: 0.5 },
    text: 'The first 8-bit microprocessor. Its design leads, through the 8080, to the x86 family.' },
  { y: 1974, m: 4, kind: 'chip', title: 'Intel 8080', who: 'Intel', bits: 8,
    chip: { clockMHz: 2, process: 6000 },
    text: 'A much faster 8-bit chip. It powers the Altair 8800 and the CP/M operating system, and starts the hobbyist computer boom.' },
  { y: 1975, m: 9, kind: 'chip', title: 'MOS 6502', who: 'MOS Technology', bits: 8,
    chip: { transistors: 3510, process: 8000, clockMHz: 1 },
    text: 'Sold for about $25 when rival chips cost several times more. Cheap enough to end up in the Apple II, Commodore 64, Atari 2600 and NES.' },
  { y: 1976, m: 7, kind: 'chip', title: 'Zilog Z80', who: 'Zilog', bits: 8,
    chip: { transistors: 8500, process: 4000, clockMHz: 2.5 },
    text: 'Faggin’s new company improves on the 8080 and runs its software. It powers the TRS-80, the ZX Spectrum and decades of embedded controllers.' },
  { y: 1978, m: 6, kind: 'chip', title: 'Intel 8086', who: 'Intel', bits: 16,
    chip: { transistors: 29000, process: 3000, clockMHz: 5 },
    text: 'The first x86 processor. Sixteen-bit registers, and a segment trick that reaches 1 MiB of memory. Its instruction set still runs on PCs today.' },
  { y: 1979, m: 9, kind: 'chip', title: 'Motorola 68000', who: 'Motorola', bits: 32,
    chip: { transistors: 68000, process: 3500, clockMHz: 8 },
    text: '32-bit registers on a 16-bit bus. It runs the first Macintosh, the Amiga, the Atari ST and the Sega Mega Drive.' },
  { y: 1980, m: 6, kind: 'idea', title: 'RISC', who: 'IBM, Berkeley, Stanford',
    text: 'IBM’s 801 project, then Berkeley RISC and Stanford MIPS, show that a small set of simple instructions, each finished in one fast step, can beat large complex instruction sets. ARM, MIPS, SPARC, PowerPC and RISC-V all follow.' },
  { y: 1982, m: 2, kind: 'chip', title: 'Intel 80286', who: 'Intel', bits: 16,
    chip: { transistors: 134000, process: 1500, clockMHz: 6 },
    text: 'Adds protected mode, so an operating system can keep programs out of each other’s memory. The heart of the IBM PC/AT.' },
  { y: 1985, m: 4, kind: 'chip', title: 'ARM1', who: 'Acorn', bits: 32,
    chip: { transistors: 25000, process: 3000, clockMHz: 6 },
    text: 'Acorn’s first RISC chip works the first time it is powered up. About 25,000 transistors and tiny power draw. Its descendants end up in nearly every phone.' },
  { y: 1985, m: 10, kind: 'chip', title: 'Intel 80386', who: 'Intel', bits: 32,
    chip: { transistors: 275000, process: 1500, clockMHz: 16 },
    text: 'Takes x86 to 32 bits, with paged virtual memory. A single program can now address 4 GiB.' },
  { y: 1989, m: 4, kind: 'chip', title: 'Intel 80486', who: 'Intel', bits: 32,
    chip: { transistors: 1.2e6, process: 1000, clockMHz: 25 },
    text: 'The first x86 with over a million transistors. A pipeline, an on-chip cache and a built-in floating-point unit.' },
  { y: 1991, kind: 'chip', title: 'MIPS R4000', who: 'MIPS', bits: 64,
    chip: { clockMHz: 100 },
    text: 'The first 64-bit microprocessor. A 64-bit version of its family later powers the Nintendo 64.' },
  { y: 1992, m: 2, kind: 'chip', title: 'DEC Alpha 21064', who: 'Digital Equipment', bits: 64,
    chip: { clockMHz: 200 },
    text: 'A 64-bit RISC chip designed from the start for very high clocks. At 150–200 MHz it is the fastest processor of its day.' },
  { y: 1993, m: 3, kind: 'idea', title: 'Superscalar x86: Pentium', who: 'Intel', bits: 32,
    chip: { transistors: 3.1e6, process: 800, clockMHz: 60 },
    text: 'Two pipelines side by side, so the Pentium can finish two instructions in one clock tick.' },
  { y: 1995, m: 11, kind: 'idea', title: 'Out-of-order: Pentium Pro', who: 'Intel', bits: 32,
    chip: { transistors: 5.5e6, process: 500, clockMHz: 200 },
    text: 'Runs instructions as soon as their inputs are ready rather than in program order, then puts the results back in order. Nearly every fast CPU since works this way.' },
  { y: 1997, m: 1, kind: 'idea', title: 'SIMD: MMX', who: 'Intel',
    text: 'Pentium MMX adds instructions that apply one operation to several numbers at once, for video, audio and games.' },
  { y: 1997, m: 9, kind: 'process', title: 'Copper wiring', who: 'IBM',
    text: 'IBM replaces the aluminium wires between transistors with copper, which carries current with less resistance. The rest of the industry follows.' },
  { y: 1999, m: 2, kind: 'idea', title: 'SSE: 128-bit registers', who: 'Intel',
    text: 'Pentium III adds eight 128-bit registers for SIMD. 128-bit registers become standard in desktop chips, while integer registers stay at 32 and then 64 bits.' },
  { y: 2000, m: 3, kind: 'chip', title: '1 GHz: AMD Athlon', who: 'AMD', bits: 32,
    chip: { clockMHz: 1000 },
    text: 'The first x86 processor sold at a gigahertz, days ahead of Intel. The clock-speed race is at full tilt.' },
  { y: 2000, m: 3, kind: 'chip', title: 'Emotion Engine', who: 'Sony and Toshiba', bits: 128,
    chip: { transistors: 10.5e6, process: 250, clockMHz: 294.912 },
    text: 'The PlayStation 2’s CPU: a 64-bit MIPS core with 128-bit registers for multimedia work. Marketed as 128-bit; not 128-bit in the address sense.' },
  { y: 2001, kind: 'idea', title: 'Multicore: IBM POWER4', who: 'IBM', bits: 64,
    chip: { transistors: 174e6, process: 180, clockMHz: 1300 },
    text: 'The first commercial multicore processor: two complete cores on one die, with a shared cache.' },
  { y: 2002, m: 11, kind: 'idea', title: 'Hyper-Threading', who: 'Intel', bits: 32,
    chip: { transistors: 55e6, process: 130, clockMHz: 3060 },
    text: 'The 3.06 GHz Pentium 4 runs two threads on one core, filling idle execution units with work from the second. Simultaneous multithreading becomes standard on desktop and server chips.' },
  { y: 2003, m: 4, kind: 'idea', title: 'x86-64: AMD Opteron', who: 'AMD', bits: 64,
    text: 'AMD extends x86 to 64 bits and keeps every 32-bit program working. The Athlon 64 brings it to desktops that September, and Intel adopts it.' },
  { y: 2004, m: 10, kind: 'idea', title: 'The power wall', who: 'Intel', bits: 32,
    chip: { clockMHz: 3800 },
    text: 'Clock speeds stop climbing. The Pentium 4 tops out at 3.8 GHz, Intel cancels its 4 GHz model, and the industry turns to more cores instead of faster ones.' },
  { y: 2005, m: 5, kind: 'idea', title: 'Dual-core PCs', who: 'AMD and Intel',
    text: 'The Athlon 64 X2 and the Pentium D put two cores in ordinary desktop PCs.' },
  { y: 2006, m: 7, kind: 'chip', title: 'Intel Core 2', who: 'Intel', bits: 64,
    chip: { transistors: 291e6, process: 65 },
    text: 'Wide, efficient cores replace the Pentium 4’s long pipeline. Speed now comes from doing more each tick, not from more ticks.' },
  { y: 2007, m: 11, kind: 'process', title: 'High-k metal gate', who: 'Intel', bits: 64,
    chip: { process: 45 },
    text: 'At 45 nm the gate insulator is so thin that current leaks straight through it. Intel replaces silicon dioxide with a hafnium-based material and the polysilicon gate with metal.' },
  { y: 2010, kind: 'idea', title: 'RISC-V begins', who: 'UC Berkeley',
    text: 'An open instruction set that anyone can use without a licence. Its base specifications are ratified in 2019, and it is the family every lineup chip on this site belongs to.' },
  { y: 2011, m: 5, kind: 'process', title: 'FinFET', who: 'Intel',
    chip: { process: 22 },
    text: 'Intel announces 3D “tri-gate” transistors: the channel stands up as a fin with the gate wrapped round three sides. The first chips ship in 2012, and the industry follows.' },
  { y: 2011, m: 10, kind: 'idea', title: 'big.LITTLE and 64-bit ARM', who: 'ARM',
    text: 'ARM pairs fast cores with efficient ones on the same chip, and announces ARMv8, its 64-bit architecture.' },
  { y: 2013, m: 9, kind: 'chip', title: 'Apple A7', who: 'Apple', bits: 64,
    chip: { transistors: 1e9, process: 28, clockMHz: 1300 },
    text: 'The first 64-bit chip in a consumer phone, in the iPhone 5s. The rest of the phone industry follows within two years.' },
  { y: 2019, m: 7, kind: 'process', title: 'Chiplets: AMD Zen 2', who: 'AMD', bits: 64,
    chip: { process: 7 },
    text: 'CPU cores move to small 7 nm dies joined to a separate input/output die in one package. Small dies yield better, and parts can be made on the process that suits them.' },
  { y: 2019, m: 10, kind: 'process', title: 'EUV lithography', who: 'TSMC',
    text: 'TSMC’s N7+ is the first process in volume to use extreme-ultraviolet light, at a 13.5 nm wavelength, to print the finest layers.' },
  { y: 2020, m: 11, kind: 'chip', title: 'Apple M1', who: 'Apple', bits: 64,
    chip: { transistors: 16e9, process: 5, clockMHz: 3200 },
    text: '16 billion transistors on 5 nm. An ARM chip replaces Intel in Macs, with GPU, neural engine and memory in one package.' },
  { y: 2021, m: 10, kind: 'chip', title: 'Apple M1 Max', who: 'Apple', bits: 64,
    chip: { transistors: 57e9, process: 5 },
    text: '57 billion transistors on one die.' },
  { y: 2022, m: 4, kind: 'process', title: '3D V-Cache', who: 'AMD', bits: 64,
    text: 'The Ryzen 7 5800X3D stacks an extra cache die directly on top of the CPU die. Chips start growing upward.' },
  { y: 2022, m: 6, kind: 'process', title: 'Gate-all-around', who: 'Samsung',
    chip: { process: 3 },
    text: 'Samsung begins 3 nm mass production with gate-all-around transistors: the gate surrounds stacked channels on all four sides.' },
  { y: 2023, m: 1, kind: 'chip', title: '6 GHz out of the box', who: 'Intel', bits: 64,
    chip: { clockMHz: 6000 },
    text: 'The Core i9-13900KS is the first desktop chip sold running at 6 GHz. Two decades after the power wall, clocks have crept up by about half.' },
  { y: 2023, m: 9, kind: 'chip', title: '3 nm in a phone: A17 Pro', who: 'Apple', bits: 64,
    chip: { transistors: 19e9, process: 3 },
    text: 'The first 3 nm chip in a phone, with 19 billion transistors, in the iPhone 15 Pro.' },
  { y: 2025, m: 11, kind: 'process', title: 'TSMC 2 nm', who: 'TSMC',
    chip: { process: 2 },
    text: 'TSMC’s N2 enters volume production in the fourth quarter of 2025: its first gate-all-around nanosheet process.' },
  { y: 2026, m: 1, kind: 'process', title: 'Backside power', who: 'Intel', bits: 64,
    text: 'Panther Lake, on Intel 18A, launches at CES 2026: the first high-volume chip to feed power from underneath the transistors, freeing the wiring layers above for signals.' },
];

export const DEVICES = [
  { y: 1971, name: 'Busicom 141-PF', cpu: 'Intel 4004', bits: 4, kind: 'calculator' },
  { y: 1975, name: 'Altair 8800', cpu: 'Intel 8080', bits: 8, kind: 'computer' },
  { y: 1976, name: 'Apple I', cpu: 'MOS 6502', bits: 8, kind: 'computer' },
  { y: 1977, name: 'Apple II', cpu: 'MOS 6502', bits: 8, kind: 'computer' },
  { y: 1977, name: 'Commodore PET', cpu: 'MOS 6502', bits: 8, kind: 'computer' },
  { y: 1977, name: 'TRS-80', cpu: 'Zilog Z80', bits: 8, kind: 'computer' },
  { y: 1977, name: 'Atari 2600', cpu: 'MOS 6507', bits: 8, kind: 'console' },
  { y: 1980, name: 'Sinclair ZX80', cpu: 'Zilog Z80', bits: 8, kind: 'computer' },
  { y: 1981, name: 'IBM PC', cpu: 'Intel 8088', bits: 16, kind: 'computer' },
  { y: 1982, name: 'Commodore 64', cpu: 'MOS 6510', bits: 8, kind: 'computer' },
  { y: 1982, name: 'ZX Spectrum', cpu: 'Zilog Z80', bits: 8, kind: 'computer' },
  { y: 1983, name: 'Famicom / NES', cpu: 'Ricoh 2A03, a 6502 core', bits: 8, kind: 'console' },
  { y: 1984, name: 'Apple Macintosh', cpu: 'Motorola 68000', bits: 32, kind: 'computer' },
  { y: 1984, name: 'IBM PC/AT', cpu: 'Intel 80286', bits: 16, kind: 'computer' },
  { y: 1985, name: 'Amiga 1000', cpu: 'Motorola 68000', bits: 32, kind: 'computer' },
  { y: 1987, name: 'Acorn Archimedes', cpu: 'ARM2', bits: 32, kind: 'computer' },
  { y: 1988, name: 'Sega Mega Drive', cpu: 'Motorola 68000', bits: 32, kind: 'console' },
  { y: 1989, name: 'Game Boy', cpu: 'Sharp LR35902', bits: 8, kind: 'handheld' },
  { y: 1990, name: 'Super Famicom / SNES', cpu: 'Ricoh 5A22, a 65C816 core', bits: 16, kind: 'console' },
  { y: 1994, name: 'PlayStation', cpu: 'MIPS R3000A', bits: 32, kind: 'console' },
  { y: 1996, name: 'Nintendo 64', cpu: 'NEC VR4300', bits: 64, kind: 'console' },
  { y: 1998, name: 'iMac G3', cpu: 'PowerPC 750', bits: 32, kind: 'computer' },
  { y: 2000, name: 'PlayStation 2', cpu: 'Emotion Engine', bits: 128, kind: 'console' },
  { y: 2001, name: 'Game Boy Advance', cpu: 'ARM7TDMI', bits: 32, kind: 'handheld' },
  { y: 2001, name: 'iPod', cpu: 'Two ARM7TDMI cores', bits: 32, kind: 'player' },
  { y: 2001, name: 'Xbox', cpu: 'Intel Pentium III-based', bits: 32, kind: 'console' },
  { y: 2005, name: 'Xbox 360', cpu: 'IBM Xenon, 3 cores', bits: 64, kind: 'console' },
  { y: 2006, name: 'PlayStation 3', cpu: 'Cell Broadband Engine', bits: 64, kind: 'console' },
  { y: 2006, name: 'Nintendo Wii', cpu: 'IBM Broadway', bits: 32, kind: 'console' },
  { y: 2007, name: 'iPhone', cpu: 'Samsung ARM11 chip', bits: 32, kind: 'phone' },
  { y: 2010, name: 'iPad', cpu: 'Apple A4', bits: 32, kind: 'tablet' },
  { y: 2010, name: 'Arduino Uno', cpu: 'ATmega328P', bits: 8, kind: 'board' },
  { y: 2012, name: 'Raspberry Pi', cpu: 'Broadcom BCM2835 (ARM11)', bits: 32, kind: 'board' },
  { y: 2013, name: 'iPhone 5s', cpu: 'Apple A7', bits: 64, kind: 'phone' },
  { y: 2013, name: 'PlayStation 4', cpu: 'AMD Jaguar, 8 cores', bits: 64, kind: 'console' },
  { y: 2017, name: 'Nintendo Switch', cpu: 'NVIDIA Tegra X1', bits: 64, kind: 'handheld' },
  { y: 2020, name: 'MacBook Air', cpu: 'Apple M1', bits: 64, kind: 'laptop' },
  { y: 2020, name: 'PlayStation 5', cpu: 'AMD Zen 2, 8 cores', bits: 64, kind: 'console' },
  { y: 2021, name: 'Raspberry Pi Pico', cpu: 'RP2040', bits: 32, kind: 'board' },
  { y: 2022, name: 'Steam Deck', cpu: 'AMD Zen 2 APU', bits: 64, kind: 'handheld' },
  { y: 2023, name: 'iPhone 15 Pro', cpu: 'Apple A17 Pro', bits: 64, kind: 'phone' },
  { y: 2026, name: 'Panther Lake laptops', cpu: 'Intel 18A', bits: 64, kind: 'laptop' },
];

export const DEVICE_WINDOW = 8;    // years a device stays on the shelf after launch

export const SOURCES = [
  ['Intel 4004 (Computer History Museum)', 'https://www.computerhistory.org/revolution/digital-logic/12/285'],
  ['Chip Hall of Fame: Intel 4004 (IEEE Spectrum)', 'https://spectrum.ieee.org/chip-hall-of-fame-intel-4004-microprocessor'],
  ['POWER4 (WikiChip)', 'https://en.wikichip.org/wiki/ibm/microarchitectures/power4'],
  ['TSMC begins volume production of 2 nm (Tom’s Hardware)', 'https://www.tomshardware.com/tech-industry/semiconductors/tsmc-begins-quietly-volume-production-of-2nm-class-chips-first-gaa-transistor-for-tsmc-claims-up-to-15-percent-improvement-at-iso-power'],
  ['Intel unwraps Panther Lake on 18A (All About Circuits)', 'https://www.allaboutcircuits.com/news/intel-unwraps-panther-lake-fist-ai-pc-platform-built-on-18a/'],
];

// --- Derived -----------------------------------------------------------------

export const when = (e) => e.y + ((e.m ?? 7) - 1) / 12;
EVENTS.sort((a, b) => when(a) - when(b));
EVENTS.forEach((e, i) => { e.i = i; e.t = when(e); });

export const eraAt = (t) => ERAS.find((e) => t >= e.from && t < e.to) || ERAS[ERAS.length - 1];

// Records among the chips on this timeline, as of time t.
export function recordsAt(t) {
  const out = { transistors: null, process: null, clock: null, bits: null };
  for (const e of EVENTS) {
    if (e.t > t) break;
    const c = e.chip || {};
    if (c.transistors && (!out.transistors || c.transistors > out.transistors.v)) out.transistors = { v: c.transistors, e };
    if (c.process && (!out.process || c.process < out.process.v)) out.process = { v: c.process, e };
    if (c.clockMHz && (!out.clock || c.clockMHz > out.clock.v)) out.clock = { v: c.clockMHz, e };
    if (e.bits && (!out.bits || (e.bits > out.bits.v && e.bits <= 64))) out.bits = { v: e.bits, e };
  }
  return out;
}

export function devicesAt(t, n = 8) {
  return DEVICES.filter((d) => d.y <= Math.floor(t) && d.y > Math.floor(t) - DEVICE_WINDOW)
    .sort((a, b) => b.y - a.y)
    .slice(0, n);
}

export const currentEvent = (t) => {
  let cur = null;
  for (const e of EVENTS) { if (e.t <= t + 1e-6) cur = e; else break; }
  return cur;
};
