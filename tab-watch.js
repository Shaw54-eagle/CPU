// The Watch tab: one calculation, run instruction by instruction on every
// chip at once, one instruction per tick each. Narrow chips need more
// instructions, so they finish later. Every register value is real: the
// programs come from ops.js and run on BigInt registers.

import { machine, expected, asm } from './ops.js';
import { esc, $, tag } from './ui.js';

const SIZES = [8, 16, 32, 64, 128, 256];
const SPEEDS = [[2, '2/s'], [8, '8/s'], [30, '30/s'], [120, '120/s']];

const opts = { op: 'add', n: 64, speed: 8, view: null };
let xs = '0x0123456789ABCDEF', ys = '0x00FEDCBA98765432';
let ms = null;           // per chip: { chip, m, last, steps }
let playing = false, raf = 0, lastT = 0, acc = 0;
let ctxRef = null;
let error = '';

const mask = (n) => (1n << BigInt(n)) - 1n;

function parse(text, n) {
  const s = String(text).trim().replace(/[_,\s]/g, '');
  if (!s) throw new Error('empty');
  let v;
  if (/^0x[0-9a-f]+$/i.test(s)) v = BigInt(s);
  else if (/^[0-9]+$/.test(s)) v = BigInt(s);
  else throw new Error('format');
  if (v > mask(n)) throw new Error('big');
  return v;
}

export function hex(v, bits) {
  const digits = Math.max(1, Math.ceil(bits / 4));
  const raw = v.toString(16).toUpperCase().padStart(digits, '0');
  return `0x${raw.replace(/\B(?=(?:[0-9A-F]{4})+$)/g, '_')}`;
}

function operands() {
  return [parse(xs, opts.n), parse(ys, opts.n)];
}

function build(ctx) {
  stop();
  error = '';
  let x, y;
  try { [x, y] = operands(); } catch (e) {
    ms = null;
    error = e.message === 'big' ? `Both numbers must fit in ${opts.n} bits: at most ${hex(mask(opts.n), opts.n)}.`
      : 'Type a number in decimal, or in hex starting with 0x.';
    ctx.scene.setRegisters(null);
    return;
  }
  ms = ctx.chips.map((c) => ({ chip: c, m: machine(opts.op, opts.n, c.w, x, y), last: null }));
  if (!opts.view || !ms.some((r) => r.chip.key === opts.view)) opts.view = ms[0].chip.key;
  push(ctx);
}

function push(ctx) {
  if (!ms) return;
  ctx.scene.setRegisters(new Map(ms.map((r) => {
    const l = r.last;
    const note = l
      ? `<b>${l.rd || l.mem}</b> · ${r.m.pc}/${r.m.prog.length}${r.m.done ? ' ✓' : ''}`
      : `${r.m.prog.length} instructions`;
    return [r.chip.key, { value: l ? l.v : 0n, note }];
  })));
}

function stepAll() {
  let any = false;
  for (const r of ms) {
    if (r.m.done) continue;
    r.last = r.m.step();
    any = true;
  }
  return any;
}

function loop(t) {
  if (!playing) return;
  const dt = Math.min(0.25, (t - lastT) / 1000);
  lastT = t;
  acc += dt * opts.speed;
  let n = Math.floor(acc);
  acc -= n;
  let any = true;
  while (n-- > 0 && any) any = stepAll();
  if (!any || ms.every((r) => r.m.done)) playing = false;
  paint();
  if (playing) raf = requestAnimationFrame(loop);
}

function stop() {
  playing = false;
  cancelAnimationFrame(raf);
}

function paint() {
  if (!ctxRef || ctxRef.current() !== 'watch') return;
  push(ctxRef);
  const host = $('#watch-live');
  if (host) host.innerHTML = live();
  const play = $('#w-play');
  if (play) play.textContent = playing ? 'Pause' : ms && ms.every((r) => r.m.done) ? 'Replay' : 'Play';
  const cur = $('#watch-live .trace .cur');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

function live() {
  if (error) return `<p class="error" role="alert">${esc(error)}</p>`;
  if (!ms) return '';
  const [x, y] = operands();
  const want = expected(opts.op, opts.n, x, y);
  const outBits = opts.op === 'mul' ? opts.n * 2 : opts.n;
  const max = Math.max(...ms.map((r) => r.m.prog.length));
  const lanes = ms.map((r) => {
    const total = r.m.prog.length, pc = r.m.pc;
    const done = r.m.done;
    const ok = done && r.m.result() === want;
    return `<div class="lane" data-tip="${esc(`${r.chip.title}: ${total.toLocaleString('en-US')} instructions, ${(total / ms.reduce((a, q) => Math.min(a, q.m.prog.length), Infinity)).toFixed(1)}× the shortest`)}">
      <span class="bl">${esc(tag(r.chip))}</span>
      <span class="track"><span class="fill s${r.chip.key}" style="width:${(pc / max) * 100}%"></span><span class="endmark" style="left:${(total / max) * 100}%"></span></span>
      <span class="bv">${pc.toLocaleString('en-US')}<small>/${total.toLocaleString('en-US')}</small>${done ? (ok ? ' <i class="okmark" aria-label="correct">✓</i>' : ' <i class="badmark">✕</i>') : ''}</span></div>`;
  }).join('');

  const sel = ms.find((r) => r.chip.key === opts.view) || ms[0];
  const prog = sel.m.prog, pc = sel.m.pc;
  const from = Math.max(0, pc - 7), to = Math.min(prog.length, from + 15);
  const lines = [];
  for (let i = from; i < to; i++) {
    const ins = prog[i];
    const cls = i === pc - 1 ? 'cur' : i === pc ? 'next' : i < pc ? 'past' : '';
    lines.push(`<li class="${cls}"><span class="ln">${i + 1}</span><code>${esc(asm(ins))}</code><span class="cm">${esc(ins.note || '')}</span></li>`);
  }
  const regNames = [...new Set(prog.map((i) => i.rd).filter((r) => r && !/^s[bhwdq]$/.test(r)))].filter((r) => /^[ast]\d$/.test(r));
  const regs = regNames.map((r) => {
    const v = sel.m.regs.get(r);
    const hot = sel.last && sel.last.rd === r;
    return `<div class="reg${hot ? ' hot' : ''}"><span>${r}</span><code>${v === undefined ? '·' : hex(v, sel.chip.w)}</code></div>`;
  }).join('');
  const sofar = sel.m.result();

  return `
    <div class="watchlanes">${lanes}</div>
    <p class="fine">Answer: <code class="answer">${hex(want, outBits)}</code>${opts.op === 'add' && opts.n > 0 ? ' (wraps at the top, like a fixed-size integer)' : ''}</p>
    <div class="seg wrap viewpick" role="radiogroup" aria-label="Show the program for">${ms.map((r) =>
      `<button type="button" role="radio" aria-checked="${r === sel}" data-view="${r.chip.key}" id="wv-${r.chip.key}"><span class="sw s${r.chip.key}"></span>${esc(tag(r.chip))}</button>`).join('')}</div>
    <div class="tracebox">
      <div class="trace-head"><b>${esc(sel.chip.title)}</b><span>${sel.m.L > 1 ? `${opts.n}-bit numbers as ${sel.m.L} limbs of ${sel.chip.w} bits` : 'fits in one register'} · ${prog.length.toLocaleString('en-US')} instructions</span></div>
      <ol class="trace">${lines.join('')}</ol>
      <div class="regs">${regs}</div>
      <p class="fine">Result in memory so far: <code>${hex(sofar, outBits)}</code></p>
    </div>`;
}

export const watchTab = {
  render() {
    return `
      <p class="lede">One calculation, run instruction by instruction on every chip at once. Narrow chips cut the numbers into pieces and pass the carry along by hand.</p>
      <div class="row2">
        <div><h3>Operation</h3>
          <div class="seg" role="radiogroup" aria-label="Operation">
            <button type="button" role="radio" aria-checked="${opts.op === 'add'}" data-op="add" id="w-add">Add</button>
            <button type="button" role="radio" aria-checked="${opts.op === 'mul'}" data-op="mul" id="w-mul">Multiply</button>
          </div></div>
        <div><h3>Speed</h3>
          <div class="seg wrap" role="radiogroup" aria-label="Speed">${SPEEDS.map(([v, l]) =>
            `<button type="button" role="radio" aria-checked="${v === opts.speed}" data-speed="${v}" id="w-speed-${v}">${l}</button>`).join('')}</div></div>
      </div>
      <h3>Number size</h3>
      <div class="seg wrap" role="radiogroup" aria-label="Number size">${SIZES.map((n) =>
        `<button type="button" role="radio" aria-checked="${n === opts.n}" data-n="${n}" id="w-n-${n}">${n}-bit</button>`).join('')}</div>
      <div class="operands">
        <label class="field" for="w-x"><span>x</span><input type="text" id="w-x" value="${esc(xs)}" spellcheck="false" autocomplete="off"></label>
        <label class="field" for="w-y"><span>y</span><input type="text" id="w-y" value="${esc(ys)}" spellcheck="false" autocomplete="off"></label>
      </div>
      <div class="actions">
        <button type="button" class="ghost" data-act="random" id="w-random">Random</button>
        <button type="button" class="ghost" data-act="ones" id="w-ones">All ones</button>
      </div>
      <div class="actions">
        <button type="button" class="action" data-act="play" id="w-play">Play</button>
        <button type="button" class="ghost" data-act="step" id="w-step">Step</button>
        <button type="button" class="ghost" data-act="finish" id="w-finish">Finish</button>
        <button type="button" class="ghost" data-act="reset" id="w-reset">Reset</button>
      </div>
      <div id="watch-live"></div>
      <p class="fine">The programs are what a compiler emits for RISC-V, which has no carry flag: after each add, <code>sltu</code> asks whether the sum came out smaller than an input, which is exactly when it overflowed. Multiplication works column by column with a three-register accumulator. The Speed tab’s instruction counts come from these same programs. RISC-V has no 8- or 16-bit variant, so those chips use the same instructions on narrower registers.</p>`;
  },
  mount(ctx) {
    ctxRef = ctx;
    if (!ms) build(ctx);
    paint();
    const body = ctx.body;
    body.oninput = (ev) => {
      if (ev.target.id === 'w-x') xs = ev.target.value;
      else if (ev.target.id === 'w-y') ys = ev.target.value;
      else return;
      build(ctx);
      paint();
    };
    body.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.view) { opts.view = d.view; paint(); return; }
      if (d.op || d.n || d.speed) {
        if (d.op) opts.op = d.op;
        if (d.n) opts.n = +d.n;
        if (d.speed) opts.speed = +d.speed;
        for (const sib of b.parentElement.querySelectorAll('[role="radio"]')) sib.setAttribute('aria-checked', String(sib === b));
        if (!d.speed) {
          // Keep the operands but trim them to the new size.
          try { xs = hex(parse(xs, 4096) & mask(opts.n), opts.n); ys = hex(parse(ys, 4096) & mask(opts.n), opts.n); } catch { /* left as typed */ }
          $('#w-x').value = xs; $('#w-y').value = ys;
          build(ctx);
        }
        paint();
        return;
      }
      if (d.act === 'random' || d.act === 'ones') {
        const rnd = () => {
          let v = 0n;
          for (let i = 0; i < opts.n; i += 16) v = (v << 16n) | BigInt(Math.floor(Math.random() * 65536));
          return v & mask(opts.n);
        };
        xs = hex(d.act === 'ones' ? mask(opts.n) : rnd(), opts.n);
        ys = hex(d.act === 'ones' ? mask(opts.n) : rnd(), opts.n);
        $('#w-x').value = xs; $('#w-y').value = ys;
        build(ctx);
        paint();
        return;
      }
      if (!ms) return;
      if (d.act === 'play') {
        if (playing) { stop(); paint(); return; }
        if (ms.every((r) => r.m.done)) build(ctx);
        playing = true; lastT = performance.now(); acc = 1;
        raf = requestAnimationFrame(loop);
        paint();
      } else if (d.act === 'step') {
        stop(); stepAll(); paint();
      } else if (d.act === 'finish') {
        stop(); while (stepAll()); paint();
      } else if (d.act === 'reset') {
        build(ctx); paint();
      }
    };
  },
  unmount(ctx) {
    stop();
    ctx.body.oninput = ctx.body.onclick = null;
    ctx.scene.setRegisters(null);
    ms = null;
  },
};
