// Real instruction sequences for arithmetic wider than the machine.
//
// A w-bit chip handles an n-bit number as L = n / w pieces ("limbs") and
// strings instructions together to carry between them. These programs are
// what a compiler emits for RISC-V, which has no carry flag: a carry is
// recovered with `sltu` (set if the sum came out smaller than an input).
//
// The programs run on a tiny interpreter with BigInt registers, so every
// value shown on screen is computed, and the final answer is checked against
// BigInt arithmetic. The performance model counts instructions from these
// same programs, so the race and the step-through can't disagree.

const LOAD = { 8: 'lbu', 16: 'lhu', 32: 'lw', 64: 'ld', 128: 'lq', 256: 'lq' };
const STORE = { 8: 'sb', 16: 'sh', 32: 'sw', 64: 'sd', 128: 'sq', 256: 'sq' };

const mask = (bits) => (1n << BigInt(bits)) - 1n;

export function limbs(value, n, w) {
  const out = [];
  for (let i = 0; i < Math.max(1, n / w); i++) out.push((value >> BigInt(i * w)) & mask(w));
  return out;
}

// --- Program builders -------------------------------------------------------

export function addProgram(n, w) {
  const L = Math.max(1, n / w), b = Math.min(n, w);
  const ld = LOAD[b], st = STORE[b];
  const p = [];
  const I = (op, rd, a, c, note) => p.push({ op, rd, a, c, note });
  if (L === 1) {
    I(ld, 'a0', 'x', 0, 'load x');
    I(ld, 'a1', 'y', 0, 'load y');
    I('add', 'a2', 'a0', 'a1', 'one add does it');
    I(st, 'a2', 'z', 0, 'store the sum');
    return { L, prog: p, width: b };
  }
  for (let i = 0; i < L; i++) {
    const first = i === 0, last = i === L - 1;
    I(ld, 'a0', 'x', i, `load x limb ${i}`);
    I(ld, 'a1', 'y', i, `load y limb ${i}`);
    I('add', 'a2', 'a0', 'a1', `add limb ${i}`);
    if (first) {
      I('sltu', 't0', 'a2', 'a0', 'carry out? (sum < input)');
    } else if (last) {
      I('add', 'a2', 'a2', 't0', 'add the carry in');
    } else {
      I('sltu', 't1', 'a2', 'a0', 'carry from the add');
      I('add', 'a2', 'a2', 't0', 'add the carry in');
      I('sltu', 't2', 'a2', 't0', 'carry from adding the carry');
      I('or', 't0', 't1', 't2', 'carry for the next limb');
    }
    I(st, 'a2', 'z', i, `store limb ${i}`);
  }
  return { L, prog: p, width: b };
}

// n × n → 2n bits, column by column ("Comba"), with a three-register accumulator.
export function mulProgram(n, w) {
  const p = [];
  const I = (op, rd, a, c, note) => p.push({ op, rd, a, c, note });
  if (2 * n <= w) {
    const ld = LOAD[n], st = STORE[2 * n];
    I(ld, 'a0', 'x', 0, 'load x');
    I(ld, 'a1', 'y', 0, 'load y');
    I('mul', 'a2', 'a0', 'a1', 'the whole product fits one register');
    I(st, 'a2', 'z', 0, 'store the product');
    return { L: 1, prog: p, width: n, outWidth: 2 * n };
  }
  if (n === w) {
    const ld = LOAD[w], st = STORE[w];
    I(ld, 'a0', 'x', 0, 'load x');
    I(ld, 'a1', 'y', 0, 'load y');
    I('mul', 'a2', 'a0', 'a1', 'low half of the product');
    I('mulhu', 'a3', 'a0', 'a1', 'high half of the product');
    I(st, 'a2', 'z', 0, 'store low half');
    I(st, 'a3', 'z', 1, 'store high half');
    return { L: 1, prog: p, width: w, outWidth: w };
  }
  const L = n / w, ld = LOAD[w], st = STORE[w];
  I('li', 's0', 0n, null, 'clear the accumulator');
  I('li', 's1', 0n, null, '');
  I('li', 's2', 0n, null, '');
  for (let k = 0; k < 2 * L - 1; k++) {
    for (let i = Math.max(0, k - L + 1); i <= Math.min(k, L - 1); i++) {
      const j = k - i;
      I(ld, 'a0', 'x', i, `load x limb ${i}`);
      I(ld, 'a1', 'y', j, `load y limb ${j}`);
      I('mul', 't0', 'a0', 'a1', `x${i} × y${j}, low half`);
      I('mulhu', 't1', 'a0', 'a1', `x${i} × y${j}, high half`);
      I('add', 's0', 's0', 't0', 'accumulate low');
      I('sltu', 't2', 's0', 't0', 'carry?');
      I('add', 't1', 't1', 't2', 'fold carry into high');
      I('add', 's1', 's1', 't1', 'accumulate high');
      I('sltu', 't2', 's1', 't1', 'carry?');
      I('add', 's2', 's2', 't2', 'count carries');
    }
    I(st, 's0', 'z', k, `column ${k} done: store it`);
    I('mv', 's0', 's1', null, 'shift the accumulator');
    I('mv', 's1', 's2', null, '');
    I('li', 's2', 0n, null, '');
  }
  I(st, 's0', 'z', 2 * L - 1, 'store the top limb');
  return { L, prog: p, width: w, outWidth: w };
}

export function program(op, n, w) {
  return op === 'mul' ? mulProgram(n, w) : addProgram(n, w);
}

// --- Counting, for the performance model -----------------------------------

const cache = new Map();
export function count(op, n, w) {
  const key = `${op}:${n}:${w}`;
  if (!cache.has(key)) {
    const { prog } = program(op, n, w);
    const alu = prog.filter((i) => !/^(l[bhwdq]u?|s[bhwdq])$/.test(i.op)).length;
    cache.set(key, { total: prog.length, alu, mem: prog.length - alu });
  }
  return cache.get(key);
}

// --- Interpreter --------------------------------------------------------------

export function machine(op, n, w, x, y) {
  const { prog, width, outWidth = width, L } = program(op, n, w);
  const m = mask(w);
  const regs = new Map();
  const mem = { x: limbs(x, n, width), y: limbs(y, n, width), z: [] };
  let pc = 0;
  const get = (r) => (typeof r === 'bigint' ? r : regs.get(r) ?? 0n);

  function step() {
    if (pc >= prog.length) return null;
    const ins = prog[pc++];
    const { op: o, rd, a, c } = ins;
    let v;
    if (o.startsWith('l') && o !== 'li') v = mem[a][c];
    else if (o.startsWith('s') && o !== 'sltu') {
      const stored = get(rd) & mask(outWidth);
      mem[a][c] = stored;
      return { ins, rd: null, mem: `${a}[${c}]`, v: stored };
    }
    else if (o === 'add') v = (get(a) + get(c)) & m;
    else if (o === 'sltu') v = get(a) < get(c) ? 1n : 0n;
    else if (o === 'or') v = get(a) | get(c);
    else if (o === 'mul') v = (get(a) * get(c)) & m;
    else if (o === 'mulhu') v = ((get(a) * get(c)) >> BigInt(w)) & m;
    else if (o === 'mv') v = get(a);
    else if (o === 'li') v = a;
    regs.set(rd, v);
    return { ins, rd, v };
  }

  function result() {
    let r = 0n;
    mem.z.forEach((limb, i) => { r |= (limb ?? 0n) << BigInt(i * outWidth); });
    return r;
  }

  return { prog, regs, mem, L, step, result, get pc() { return pc; }, get done() { return pc >= prog.length; } };
}

export function asm(ins) {
  const { op, rd, a, c } = ins;
  if (/^l[bhwdq]u?$/.test(op)) return `${op} ${rd}, ${a}[${c}]`;
  if (/^s[bhwdq]$/.test(op)) return `${op} ${rd}, ${a}[${c}]`;
  if (op === 'li') return `li ${rd}, ${a}`;
  if (op === 'mv') return `mv ${rd}, ${a}`;
  return `${op} ${rd}, ${a}, ${c}`;
}

export function expected(op, n, x, y) {
  return op === 'mul' ? x * y : (x + y) & mask(n);
}
