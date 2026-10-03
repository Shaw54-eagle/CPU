import { diesPerWafer } from './model.js';

// Real processors, with published figures.
//
// Sizes and counts are as their makers or die-level analyses reported them.
// Where sources disagree, the note says so. `bits` is the integer register
// width, which is what the rest of this site means by "width"; `bus` and
// `addr` are what the chip actually put on its pins.

export const REAL = [
  {
    id: '6502', name: 'MOS 6502', short: '6502', year: 1975, bits: 8, bus: 8, addr: 16,
    transistors: 3510, process: 8000, die: [3.9, 4.3], clockMHz: 1, pins: '40-pin DIP',
    used: 'Apple II, Commodore 64 (as the 6510), NES (as the Ricoh 2A03), Atari 2600 (as the 6507)',
    note: '3,510 transistors plus 1,018 depletion-load pull-ups. Die reported as 3.9 × 4.3 mm; another measurement gives 4.27 × 4.65 mm.',
  },
  {
    id: 'z80', name: 'Zilog Z80', short: 'Z80', year: 1976, bits: 8, bus: 8, addr: 16,
    transistors: 8500, process: 4000, die: [3.545, 3.35], clockMHz: 2.5, pins: '40-pin DIP',
    used: 'ZX Spectrum, TRS-80, MSX computers, and decades of embedded controllers',
    note: 'Designed by Federico Faggin’s team after he left Intel. Discontinued in 2024.',
  },
  {
    id: '8086', name: 'Intel 8086', short: '8086', year: 1978, bits: 16, bus: 16, addr: 20,
    transistors: 29000, process: 3000, die: [5.74, 5.74], clockMHz: 5, clockMaxMHz: 10, pins: '40-pin DIP',
    used: 'The first x86. The IBM PC used its 8-bit-bus sibling, the 8088.',
    note: 'Usually listed as 29,000 transistors; die-level counts of active transistors come to about 20,000. 33 mm² die.',
  },
  {
    id: '68000', name: 'Motorola 68000', short: '68000', year: 1979, bits: 32, bus: 16, addr: 24,
    transistors: 68000, process: 3500, die: [6.24, 7.14], clockMHz: 8, pins: '64-pin DIP',
    used: 'Original Macintosh, Amiga, Atari ST, Sega Mega Drive / Genesis',
    note: '32-bit registers on a 16-bit ALU and data bus, so it is often called 16/32-bit.',
  },
  {
    id: '386', name: 'Intel 80386', short: '80386', year: 1985, bits: 32, bus: 32, addr: 32,
    transistors: 275000, process: 1500, die: [10.2, 10.2], clockMHz: 12, clockMaxMHz: 33, pins: '132-pin PGA',
    used: 'The chip that took the PC to 32 bits and 4 GiB',
    note: '104 mm² in its first 1.5 µm CHMOS III version; 39 mm² after the shrink to 1 µm.',
  },
  {
    id: 'ee', name: 'Emotion Engine', short: 'Emotion Engine', year: 2000, bits: 128, bus: 128, addr: 32, simd: true,
    transistors: 10.5e6, process: 250, die: [15.5, 15.5], clockMHz: 294.912,
    used: 'PlayStation 2',
    note: 'A 64-bit MIPS core whose registers are 128 bits wide for multimedia instructions. Not a 128-bit CPU in the address sense. Figures are as announced (240 mm²); the first production revision is reported at 13.5 million transistors on 226 mm².',
  },
  {
    id: 'p4', name: 'Pentium 4 (Northwood)', short: 'Pentium 4', year: 2002, bits: 32, bus: 64, addr: 32,
    transistors: 55e6, process: 130, die: [11.45, 11.45], clockMHz: 1600, clockMaxMHz: 3400, pins: 'Socket 478',
    used: 'Desktop PCs at the peak of the clock-speed race',
    note: '146 mm² in the first stepping, 131 mm² in later ones (shown).',
  },
  {
    id: 'athlon64', name: 'Athlon 64 (ClawHammer)', short: 'Athlon 64', year: 2003, bits: 64, bus: 64, addr: 40,
    transistors: 105.9e6, process: 130, die: [13.9, 13.9], clockMHz: 2000, pins: 'Socket 754',
    used: 'The first 64-bit x86 desktop chip, released 23 September 2003',
    note: 'The 1 MB L2 version: 193 mm².',
  },
  {
    id: 'a7', name: 'Apple A7', short: 'A7', year: 2013, bits: 64, bus: 64, addr: 48,
    transistors: 1e9, process: 28, die: [10.1, 10.1], clockMHz: 1300,
    used: 'iPhone 5s, iPad Air, iPad mini 2',
    note: 'The first 64-bit chip in a consumer phone. “Over 1 billion” transistors on 102 mm².',
  },
  {
    id: 'm1', name: 'Apple M1', short: 'M1', year: 2020, bits: 64, bus: 64, addr: 48,
    transistors: 16e9, process: 5, die: [10.98, 10.98], clockMHz: 3200,
    used: 'MacBook Air, Mac mini, 13-inch MacBook Pro',
    note: '16 billion transistors on 120.5 mm², including the GPU and neural engine.',
  },
  {
    id: 'rp2040', name: 'Raspberry Pi RP2040', short: 'RP2040', year: 2021, bits: 32, bus: 32, addr: 32,
    transistors: null, process: 40, die: [1.41, 1.41], clockMHz: 133, pins: 'QFN-56',
    used: 'Raspberry Pi Pico and thousands of hobby boards',
    note: 'Two Cortex-M0+ cores on about 2 mm² of silicon. Transistor count not published.',
  },
];

export const SOURCES = [
  ['Development of the MOS 6502 (Jason Sachs)', 'https://www.embeddedrelated.com/showarticle/1453.php'],
  ['The amazing Z80 (floooh)', 'https://floooh.github.io/2016/06/15/the-amazing-z80.html'],
  ['Counting the transistors in the 8086 (Ken Shirriff)', 'http://www.righto.com/2023/01/counting-transistors-in-8086-processor.html'],
  ['Design philosophy behind the MC68000', 'http://www.easy68k.com/paulrsm/doc/dpbm68k2.htm'],
  ['Intel 80386 (CPU Museum)', 'https://cpumuseum.jimdofree.com/museum/intel/80386/'],
  ['Inside the PS2’s Emotion Engine', 'https://obsoletesony.substack.com/p/why-sony-built-the-emotion-engine'],
  ['Size and speed of the 130 nm Northwood (Chip Architect)', 'http://www.chip-architect.com/news/2001_12_11_Northwood_Size_and_Speed.html'],
  ['Athlon 64 3500+ ClawHammer (Hardware museum)', 'https://hw-museum.cz/cpu/183/amd-athlon-64-3500plus--clawhammer-'],
  ['Chipworks’ first Apple A7 die shot (AnandTech)', 'https://www.anandtech.com/show/7355/chipworks-provides-first-apple-a7-die-shot'],
  ['Apple announces 5 nm M1 with 16 billion transistors (VideoCardz)', 'https://videocardz.com/press-release/apple-announces-5nm-m1-soc-with-16-billion-transistors'],
  ['Die shots of the RP2040 (Hacker News)', 'https://news.ycombinator.com/item?id=25958138'],
];

export const area = (r) => r.die[0] * r.die[1];
export const density = (r) => (r.transistors ? r.transistors / area(r) : null);

export const realDiesPerWafer = (r) => diesPerWafer(area(r));

export function processLabel(nm) {
  return nm >= 1000 ? `${+(nm / 1000).toFixed(1)} µm` : `${nm} nm`;
}

export function clockLabel(r) {
  const f = (m) => (m >= 1000 ? `${+(m / 1000).toFixed(1)} GHz` : `${+m.toFixed(3)} MHz`);
  return r.clockMaxMHz ? `${f(r.clockMHz)} – ${f(r.clockMaxMHz)}` : f(r.clockMHz);
}
