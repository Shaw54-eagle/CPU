// The side panel: grouped tabs, every number pulled from model.js.

import {
  CORE_PARTS, CHIP_PARTS, GROUPS, SCALE_TEXT, WORKLOADS, ASSUME,
  part, race, bytesPow2, seconds,
} from './model.js';
import { esc, $, sup, fmt, table, bars, legend, wireTips, benchChips, onBenchChange, tag } from './ui.js';
import { stressTab, quickStress } from './tab-stress.js';
import { watchTab } from './tab-watch.js';
import { buildTab } from './tab-build.js';
import { realTab } from './tab-real.js';
import { timelineTab } from './tab-timeline.js';

const val = (c, id) => c.core.find((x) => x.id === id) || c.uncore.find((x) => x.id === id);

// --- Compare ------------------------------------------------------------------

const overviewTab = {
  render({ chips }) {
    return `
      <p class="lede">One chip design, built five times. Four RISC-V cores, ${ASSUME.clockGHz.toFixed(1)} GHz, the same caches.
      Only the width of the integer registers changes.</p>
      ${table(chips, [
        { label: 'Register width', values: chips.map((c) => c.w), unit: 'bits' },
        { label: 'Addressable memory', note: 'what one pointer can name', values: chips.map((c) => sup(bytesPow2(c.ptrBits))) },
        { label: 'Die area', values: chips.map((c) => fmt(c.area)), unit: 'mm²' },
        { label: 'Transistors', values: chips.map((c) => fmt(c.transistors / 1e9, 2)), unit: 'bn' },
        { label: 'Power at full load', values: chips.map((c) => fmt(c.power)), unit: 'W' },
        { label: 'Package contacts', values: chips.map((c) => c.contacts) },
      ])}
      <h3>Where to look</h3>
      <ul class="looks">
        <li><b>The floating register.</b> One cube per bit. It holds the current Unix time, ${Math.floor(Date.now() / 1000).toLocaleString('en-US')} seconds since 1970, which needs 31 bits. The 8- and 16-bit registers can’t hold it in one piece. The 32-bit one is nearly full. The wider ones are mostly empty.</li>
        <li><b>The lanes.</b> One line per byte that moves on every load: 1, 2, 4, 8 or 16.</li>
        <li><b>The copper-coloured blocks.</b> That is the integer datapath, and it is the only part of the die that changes much. Turn on <em>Explode</em> to lift it off the die.</li>
        <li><b>Underneath.</b> Red contacts bring power in, blue ones take it back to ground. Wider chips draw more current and need more of both.</li>
        <li><b>Under load.</b> A stress test runs every core flat out and puts live temperature, clock and power over each chip. <button type="button" class="linkbtn" data-act="quickstress" id="quick-stress">Run one now</button></li>
      </ul>
      <div class="callout">
        <b>Is any of this real?</b>
        <p>RV32 and RV64 ship in billions of real chips. RV128 is a placeholder chapter in the RISC-V specification, and nobody has built a general-purpose 128-bit CPU. RV8 and RV16 don’t exist at all; the 8- and 16-bit chips here are the same design with narrower registers, which real 8- and 16-bit chips never were (they had no caches and one core). The <a href="#real" data-goto="real">Real chips</a> tab has the real ones. Every figure on this page comes from the model under <a href="#speed" data-goto="speed" data-jump="assumptions">Assumptions</a>, not from measurement.</p>
      </div>`;
  },
};

const inputTab = {
  render({ chips }) {
    return `
      <p class="lede">What each chip needs fed into it: power, current, contacts, and bytes per operation.</p>
      <h3>Power at full load</h3>
      ${bars(chips, chips.map((c) => c.power), { unit: 'W', tips: chips.map((c) => `${c.title}: ${fmt(c.corePower, 2)} W per core × ${c.cores} + ${fmt(c.uncorePower, 1)} W uncore`) })}
      <h3>Supply current</h3>
      ${bars(chips, chips.map((c) => c.current), { unit: 'A', tips: chips.map((c) => `${fmt(c.power)} W ÷ ${c.vdd.toFixed(2)} V`) })}
      ${table(chips, [
        { label: 'Supply voltage', values: chips.map((c) => c.vdd.toFixed(2)), unit: 'V' },
        { label: 'Supply contacts', note: `one per ${ASSUME.ampsPerContact} A`, values: chips.map((c) => c.supplyContacts) },
        { label: 'Ground contacts', values: chips.map((c) => c.groundContacts) },
        { label: 'Signal contacts', note: 'memory, I/O, clock', values: chips.map((c) => c.signalContacts) },
        { label: 'Decoupling capacitors', note: 'on the substrate', values: chips.map((c) => c.decaps) },
        { label: 'Bytes per register load', values: chips.map((c) => c.w / 8) },
        { label: 'Bytes per pointer', values: chips.map((c) => c.pointerBytes) },
        { label: 'Instruction size', values: chips.map(() => '32'), unit: 'bits' },
      ])}
      <button class="action" type="button" data-act="power" id="btn-power">Show power contacts from below</button>
      <p class="fine">Signal contacts do not change. Every chip talks to RAM over the same two 64-bit DDR channels, because the memory bus stopped tracking CPU width long ago. The difference is power: a wider datapath switches more wires every cycle, so it draws more current, which needs more contacts and more capacitors to deliver it cleanly.</p>`;
  },
};

const usageTab = {
  render({ chips }) {
    const lineup = chips.filter((c) => !c.custom);
    return `
      <p class="lede">What each width is for, and how much memory it can name.</p>
      <h3>Addressable memory</h3>
      <div class="scale" role="img" aria-label="Address space on a powers-of-two axis from 2^0 to 2^128 bytes">
        ${lineup.map((c) => `
          <div class="scalerow">
            <span class="bl">${c.w}</span>
            <span class="track"><span class="fill s${c.key}" style="width:${(c.ptrBits / 128) * 100}%"></span>
              <span class="tick" style="left:${(c.vaBits / 128) * 100}%"></span></span>
            <span class="bv">${sup(bytesPow2(c.ptrBits))}</span>
          </div>`).join('')}
        <div class="scalerow axisrow" aria-hidden="true"><span></span><span class="axis">${[0, 32, 64, 96, 128].map((b) => `<span style="left:${(b / 128) * 100}%">2<sup>${b}</sup></span>`).join('')}</span><span></span></div>
      </div>
      <p class="fine">Bars are drawn on a powers-of-two axis, so each quarter of the axis is another factor of 2<sup>32</sup>. The 8- and 16-bit chips build addresses from two registers, as the 6502 and 8086 did. The tick marks what each chip actually translates.</p>

      <div class="uses">
        <section>
          <h4><span class="sw s8"></span>8-bit</h4>
          <p>The home-computer era: the 6502 in the Apple II, Commodore 64 and NES; the Z80 in the ZX Spectrum. Still made by the billion as microcontrollers, like the AVR chip on an Arduino Uno, in toys, remotes and appliances.</p>
          <p class="limit">Limit: any number above 255 needs more than one register, and 16-bit addresses reach 64 KiB. The 8 MB L3 on this chip is 128 times more memory than it can name.</p>
        </section>
        <section>
          <h4><span class="sw s16"></span>16-bit</h4>
          <p>The Intel 8086 and 286 that ran MS-DOS, the Super Nintendo, and today’s ultra-low-power microcontrollers like TI’s MSP430.</p>
          <p class="limit">Limit: numbers above 65,535 take two registers. One register addresses 64 KiB; the 8086 reached 1 MiB by adding a segment register to every address.</p>
        </section>
        <section>
          <h4><span class="sw s32"></span>32-bit</h4>
          <p>Still the most common CPU by units shipped. Microcontrollers in cars, appliances, keyboards, routers and wearables: ARM Cortex-M parts, the RISC-V cores in Espressif’s ESP32-C series, the Raspberry Pi Pico. Older PCs and phones ran 32-bit operating systems.</p>
          <p class="limit">Limit: one program sees at most 4 GiB. Systems that store Unix time as a signed 32-bit number run out at 03:14:07 UTC on 19 January 2038.</p>
        </section>
        <section>
          <h4><span class="sw s64"></span>64-bit</h4>
          <p>Every current phone, laptop, desktop, server and games console. iOS 11 (2017) and macOS Catalina (2019) stopped running 32-bit apps. Google Play has required 64-bit builds since 2019.</p>
          <p class="limit">Limit, in practice: none yet. Chips translate 48 or 57 bits of address today, 256 TiB or 128 PiB, and the format leaves room to grow to 16 EiB.</p>
        </section>
        <section>
          <h4><span class="sw s128"></span>128-bit</h4>
          <p>No general-purpose CPU uses 128-bit integer registers and addresses. The number shows up elsewhere: 128-bit SIMD registers (SSE since 1999, ARM NEON), the PlayStation 2’s Emotion Engine with its 128-bit registers for multimedia instructions, IBM i’s 128-bit pointers, and CHERI’s 128-bit capability pointers, which carry bounds and permissions on 64-bit machines. IPv6 addresses, UUIDs and AES blocks are 128-bit values that 64-bit chips handle in two halves or in vector registers.</p>
          <p class="limit">Why it isn’t built: 64-bit addressing already covers 16 EiB, hundreds of thousands of times the RAM in the largest single servers. Doubling every pointer would cost cache space and memory bandwidth on every program for a benefit almost none of them need.</p>
        </section>
      </div>`;
  },
};

const partsTab = {
  render({ chips }) {
    const all = [...CORE_PARTS, ...CHIP_PARTS];
    const byGroup = Object.keys(GROUPS).map((g) => ({ g, items: all.filter((p) => p.group === g) })).filter((x) => x.items.length);
    const coreMax = Math.max(...chips.flatMap((c) => CORE_PARTS.map((p) => val(c, p.id).area)));
    return `
      <p class="lede">Click a part here or on a die. The same part lights up on every chip.</p>
      <p class="fine">Areas in mm², ${chips.map((c) => esc(tag(c))).join(' · ')}. Per-core parts are shown for one core.</p>
      <div id="partcard" class="partcard" hidden></div>
      ${byGroup.map(({ g, items }) => `
        <h3 class="grp"><span class="chipcol g-${g}"></span>${GROUPS[g].name}<small>${GROUPS[g].note}</small></h3>
        <ul class="partlist">
          ${items.map((p) => {
            const vals = chips.map((c) => val(c, p.id)?.area ?? 0);
            const scaleMax = p.base > 2 ? Math.max(...vals) : coreMax;
            return `<li><button type="button" class="partrow" data-part="${p.id}" id="part-${p.id}">
              <span class="pname">${p.name}<small>${SCALE_TEXT[p.scale]}</small></span>
              <span class="minibars">${chips.map((c, i) => `<span class="mb"><span class="fill s${c.key}" style="width:${Math.max(3, (vals[i] / Math.max(scaleMax, 1e-9)) * 100)}%"></span></span>`).join('')}</span>
              <span class="pnum">${vals.map((v) => (v < 0.1 ? v.toFixed(3) : v.toFixed(2))).join(' · ')}</span>
            </button></li>`;
          }).join('')}
        </ul>`).join('')}`;
  },
};

const sizeTab = {
  render({ chips }) {
    const c64 = chips.find((c) => c.key === '64'), c128 = chips.find((c) => c.key === '128'), c8 = chips.find((c) => c.key === '8');
    const growth = (c128.area / c64.area - 1) * 100;
    const intShare = ((c128.intArea - c64.intArea) * 4) / (c128.area - c64.area) * 100;
    return `
      <p class="lede">The chips in the view are at true relative scale. The 10 mm ruler sits in front of the first chip.</p>
      <h3>Die area</h3>
      ${bars(chips, chips.map((c) => c.area), { unit: 'mm²', tips: chips.map((c) => `${c.title}: ${fmt(c.coreArea * c.cores)} mm² of cores + ${fmt(c.uncoreArea)} mm² shared`) })}
      <h3>Integer datapath, one core</h3>
      ${bars(chips, chips.map((c) => c.intArea), { unit: 'mm²', fmt: (v) => v.toFixed(2), tips: chips.map((c) => `${c.title}: registers, ALUs, bypass and multiplier`) })}
      ${table(chips, [
        { label: 'Die edge', note: 'square die', values: chips.map((c) => fmt(c.dieSide, 2)), unit: 'mm' },
        { label: 'One core', values: chips.map((c) => fmt(c.coreArea, 2)), unit: 'mm²' },
        { label: 'Package edge', values: chips.map((c) => fmt(c.pkgSide)), unit: 'mm' },
        { label: 'Transistors', values: chips.map((c) => fmt(c.transistors / 1e9, 2)), unit: 'bn' },
        { label: 'Register bits', note: '32 registers × width', values: chips.map((c) => c.regBits.toLocaleString('en-US')) },
      ])}
      <p class="fine">Doubling the width does not double the chip. From 64 to 128 bits the die grows ${fmt(growth, 0)}%, and ${fmt(intShare, 0)}% of that growth is the integer datapath. Going the other way, the 8-bit chip is only ${fmt((1 - c8.area / c64.area) * 100, 0)}% smaller than the 64-bit one, because most of a modern chip is cache and I/O, and a cache holds the same bytes at any width. The multiplier is the part that changes fastest, because its array scales with width squared.</p>`;
  },
};

// --- Speed ----------------------------------------------------------------

let measure = 'speed';
let racing = null;
let raceView = null;

const speedTab = {
  render({ chips }) {
    return `
      <p class="lede">Six jobs, run on one core of each chip. Pick one and race it.</p>
      <div class="seg" role="radiogroup" aria-label="Measure">
        <button type="button" role="radio" aria-checked="${measure === 'speed'}" data-measure="speed" id="m-speed">Speed</button>
        <button type="button" role="radio" aria-checked="${measure === 'efficiency'}" data-measure="efficiency" id="m-eff">Work per joule</button>
      </div>
      ${legend(chips, 'bar = relative to the best chip on that job')}
      <div id="workloads" class="workloads"></div>
      <h3 id="assumptions">Assumptions</h3>
      <ul class="assume">
        <li>Same process, same ${ASSUME.clockGHz.toFixed(1)} GHz clock, same caches. A real 128-bit design would probably clock lower: its carry chains and bypass wires are longer.</li>
        <li>One instruction per cycle on every chip, so instruction count reads directly as time. Add and multiply counts come from the real instruction sequences on the Watch tab. Memory waits are added where data does not fit in cache: ${ASSUME.coreBWGBs} GB/s per core from RAM, ${ASSUME.ssdGBs} GB/s from SSD.</li>
        <li>8- and 16-bit chips build addresses from register pairs, so their pointers are 16 and 32 bits.</li>
        <li>Area per part is anchored to a 64-bit core and scaled by the rule shown on the Parts tab. Power is area × activity per part plus ${ASSUME.leakWPerMm2} W/mm² leakage, at full load.</li>
        <li>Work per joule uses each chip’s full-load power. Real chips gate unused upper bits, so the efficiency gap on narrow jobs is an upper bound. The Stress tab models that gating.</li>
        <li>The 128-bit chip translates an assumed 64 bits of virtual address. RISC-V defines no paging scheme for RV128; a full 128-bit address would need about 13 page-table levels.</li>
      </ul>`;
  },
  mount(ctx) { renderWorkloads(ctx); },
};

function raceBlock(id) {
  if (!raceView || raceView.id !== id) return '';
  const { rows, plan, t0, done } = raceView;
  const elapsed = performance.now() - t0;
  const ran = rows.filter((x) => !x.dnf);
  const fastest = Math.min(...ran.map((x) => x.s));
  const capped = Math.max(...ran.map((x) => x.s)) / fastest > 7.5;
  return `<div class="racecard${done ? ' done' : ''}">
    ${rows.map((x) => {
      const ms = (plan.find((p) => p.key === x.key) || { ms: 0 }).ms;
      const style = x.dnf ? 'width:0' : done ? 'width:100%' : `animation-duration:${ms}ms;animation-delay:${-elapsed}ms`;
      const vs = x.s / fastest;
      const verdict = x.dnf ? 'can’t run' : vs < 1.005 ? 'fastest' : `${vs < 10 ? vs.toFixed(1) : vs.toFixed(0)}× the time`;
      return `<div class="lane"><span class="bl">${esc(tag(x.chip))}</span>
        <span class="track"><span class="fill s${x.key}${done || x.dnf ? '' : ' run'}" style="${style}"></span></span>
        <span class="bv">${seconds(x.s)}</span></div>
        <p class="how">${done || x.dnf ? `<b>${verdict}</b> · ` : ''}${esc(x.how)}${x.mem ? ` · ${esc(x.mem)}` : ''}</p>`;
    }).join('')}
    <p class="fine">Each bar fills in time proportional to the modelled run time${capped ? ', with the slowest capped so it still finishes' : ''}. ${done ? '' : 'Watch the registers above the chips: only the bits this job uses are moving.'}</p>
  </div>`;
}

function renderWorkloads(ctx) {
  const host = $('#workloads');
  if (!host) return;
  host.innerHTML = WORKLOADS.map((wl) => {
    const r = race(wl.id, ctx.chips);
    const vals = r.rows.map((x) => (x.dnf ? null : x[measure]));
    return `<article class="wl${racing === wl.id ? ' running' : ''}" data-wl="${wl.id}">
      <header>
        <div><b>${wl.name}</b><span>${wl.job}</span></div>
        <button type="button" class="race" data-race="${wl.id}" id="race-${wl.id}" ${racing ? 'disabled' : ''}>${raceView && raceView.id === wl.id && raceView.done ? 'Again' : 'Race'}</button>
      </header>
      ${raceBlock(wl.id)}
      ${bars(ctx.chips, vals, {
        max: 1,
        fmt: (v) => `${v.toFixed(2)}×`,
        empty: 'can’t run',
        tips: r.rows.map((x) => `${x.chip.title}: ${seconds(x.s)}. ${x.how}${x.mem ? `. ${x.mem}` : ''}`),
      })}
      <p class="why">${wl.why}</p>
      <p class="seen">Seen in: ${wl.seen}</p>
    </article>`;
  }).join('');
}

function startRace(ctx, id) {
  if (racing) return;
  racing = id;
  const r = race(id, ctx.chips);
  const wl = r.wl;
  const plan = ctx.scene.raceStart(r.rows, (w) => wl.bits(w), () => {
    racing = null;
    if (raceView && raceView.id === id) raceView.done = true;
    if (ctx.current() === 'speed') renderWorkloads(ctx);
  });
  raceView = { id, rows: r.rows, plan, t0: performance.now(), done: false };
  renderWorkloads(ctx);
  const art = $(`[data-wl="${id}"]`);
  if (art) art.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// --- Navigation ---------------------------------------------------------------

const TABS = {
  overview: overviewTab, input: inputTab, usage: usageTab, parts: partsTab, size: sizeTab,
  speed: speedTab, stress: stressTab, watch: watchTab, build: buildTab, real: realTab, timeline: timelineTab,
};
const NAV = [
  ['compare', 'Compare', [['overview', 'Overview'], ['input', 'Input'], ['usage', 'Usage'], ['parts', 'Parts'], ['size', 'Size']]],
  ['run', 'Run', [['speed', 'Speed'], ['stress', 'Stress test'], ['watch', 'Watch an op']]],
  ['build', 'Build', [['build', 'Build a chip']]],
  ['history', 'History', [['timeline', 'Timeline'], ['real', 'Real chips']]],
];
const groupOf = (id) => NAV.find(([, , list]) => list.some(([t]) => t === id));

export function createPanel(root, scene, hooks = {}) {
  let current = 'overview';
  let selectedPart = null;
  const groups = $('.groups', root);
  const tabs = $('.tabs', root);
  const body = $('.panelbody', root);
  wireTips(body);

  const ctx = {
    scene,
    body,
    get chips() { return benchChips(); },
    current: () => current,
    show: (id, opts) => show(id, opts),
    hooks,
  };

  groups.innerHTML = NAV.map(([id, name]) =>
    `<button type="button" data-group="${id}" id="group-${id}" aria-pressed="false">${name}</button>`).join('');

  function show(id, { jump, keepScroll } = {}) {
    if (!TABS[id]) id = 'overview';
    const prev = TABS[current];
    if (prev && prev.unmount && current !== id) prev.unmount(ctx);
    current = id;
    const [gid, , list] = groupOf(id);
    for (const b of groups.querySelectorAll('[data-group]')) b.setAttribute('aria-pressed', String(b.dataset.group === gid));
    tabs.innerHTML = list.length > 1
      ? list.map(([t, name]) => `<button type="button" role="tab" id="tab-${t}" aria-controls="panelbody" aria-selected="${t === id}" data-tab="${t}">${name}</button>`).join('')
      : `<span class="tabtitle" id="tab-${id}" aria-selected="true">${list[0][1]}</span>`;
    const scrollTop = body.scrollTop;
    body.innerHTML = TABS[id].render(ctx);
    body.scrollTop = keepScroll ? scrollTop : 0;
    scene.setMode(id === 'real' ? 'real' : id === 'timeline' ? 'timeline' : 'lineup');
    if (TABS[id].mount) TABS[id].mount(ctx);
    if (id === 'parts' && selectedPart) showPart(selectedPart, { scroll: !keepScroll });
    if (id === 'input') syncPowerButton();
    if (hooks.onTab) hooks.onTab(id);
    if (jump) {
      const el = document.getElementById(jump);
      if (el) el.scrollIntoView({ block: 'start' });
    }
    try { localStorage.setItem('bitwidth-tab', id); } catch { /* storage may be blocked */ }
    if (location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
  }

  function syncPowerButton() {
    const b = $('#btn-power');
    if (b) b.textContent = scene.get('power') ? 'Hide power contacts' : 'Show power contacts from below';
  }

  function showPart(id, { scroll = false } = {}) {
    selectedPart = id;
    scene.select(id);
    if (current !== 'parts') return;
    for (const b of body.querySelectorAll('.partrow')) b.classList.toggle('on', b.dataset.part === id);
    const card = $('#partcard');
    if (!id) { card.hidden = true; return; }
    const p = part(id);
    const chips = ctx.chips;
    const vals = chips.map((c) => val(c, id));
    const perCore = CORE_PARTS.some((x) => x.id === id);
    card.innerHTML = `
      <div class="pc-head"><span class="chipcol g-${p.group}"></span><b>${p.name}</b><button type="button" class="x" data-act="clear" aria-label="Clear selection">×</button></div>
      <p>${p.what}</p>
      ${bars(chips, vals.map((v) => v?.area ?? 0), { unit: 'mm²', fmt: (v) => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)), tips: vals.map((v, i) => (v ? `${chips[i].title}: ${v.area.toFixed(3)} mm²${perCore ? ' per core' : ''}, ${v.power.toFixed(2)} W` : '')) })}
      <p class="fine">${SCALE_TEXT[p.scale][0].toUpperCase()}${SCALE_TEXT[p.scale].slice(1)}. ${perCore ? 'Per core.' : 'One per chip.'}</p>`;
    card.hidden = false;
    if (scroll) card.scrollIntoView({ block: 'nearest' });
  }

  groups.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-group]');
    if (!b) return;
    const [, , list] = NAV.find(([g]) => g === b.dataset.group);
    if (groupOf(current)[0] !== b.dataset.group) show(list[0][0]);
  });
  tabs.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tab]');
    if (b) show(b.dataset.tab);
  });
  tabs.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const ids = groupOf(current)[2].map(([id]) => id);
    if (ids.length < 2) return;
    const next = ids[(ids.indexOf(current) + (ev.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
    show(next);
    $(`#tab-${next}`).focus();
  });

  body.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-goto]');
    if (a) { ev.preventDefault(); show(a.dataset.goto, { jump: a.dataset.jump }); return; }
    if (current === 'parts') {
      const pr = ev.target.closest('[data-part]');
      if (pr) { showPart(pr.dataset.part === selectedPart ? null : pr.dataset.part, { scroll: true }); return; }
      if (ev.target.closest('[data-act="clear"]')) { showPart(null); return; }
    }
    if (ev.target.closest('[data-act="quickstress"]')) { quickStress(ctx); return; }
    if (ev.target.closest('[data-act="power"]')) {
      scene.set('power', !scene.get('power'));
      document.dispatchEvent(new CustomEvent('bitwidth:sync'));
      syncPowerButton();
      return;
    }
    if (current === 'speed') {
      const m = ev.target.closest('[data-measure]');
      if (m) {
        measure = m.dataset.measure;
        for (const b of body.querySelectorAll('[data-measure]')) b.setAttribute('aria-checked', String(b === m));
        renderWorkloads(ctx);
        return;
      }
      const rc = ev.target.closest('[data-race]');
      if (rc) startRace(ctx, rc.dataset.race);
    }
  });

  scene.onPick((u) => {
    if (!u) {
      if (current === 'parts') showPart(null);
      return;
    }
    if (u.kind === 'real') { if (current !== 'real') show('real'); realTab.select(ctx, u.id); return; }
    if (u.kind !== 'part') return;
    if (current !== 'parts') show('parts');
    showPart(u.id, { scroll: true });
  });

  onBenchChange(() => {
    if (['overview', 'input', 'usage', 'parts', 'size', 'speed'].includes(current)) show(current, { keepScroll: true });
  });

  // Back, forward and typed links (#stress, #timeline…) switch tabs on an open page too.
  addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (TABS[id] && id !== current) show(id);
  });

  let start = location.hash.slice(1);
  if (!TABS[start]) {
    try { start = localStorage.getItem('bitwidth-tab') || 'overview'; } catch { start = 'overview'; }
  }
  if (!TABS[start]) start = 'overview';
  show(start);

  return { show, syncPowerButton, get current() { return current; } };
}
