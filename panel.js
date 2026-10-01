// The side panel: six tabs, every number pulled from model.js.

import {
  CHIPS, WIDTHS, ASSUME, CORE_PARTS, CHIP_PARTS, GROUPS, SCALE_TEXT, WORKLOADS,
  part, race, bytesPow2, seconds, VA_BITS,
} from './model.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const $ = (sel, root = document) => root.querySelector(sel);
const C = CHIPS;
const fmt = (n, d = 1) => n.toFixed(d);
const sup = (s) => String(s).replace(/\^(\d+)/g, '<sup>$1</sup>');

// --- Small building blocks ---------------------------------------------------

function triple(label, values, { unit = '', note = '', best = null } = {}) {
  const cells = WIDTHS.map((w, i) => {
    const mark = best === w ? ' best' : '';
    return `<td class="num${mark}">${values[i]}${unit ? `<small>${unit}</small>` : ''}</td>`;
  }).join('');
  return `<tr><th scope="row">${label}${note ? `<span class="rownote">${note}</span>` : ''}</th>${cells}</tr>`;
}

function table(rows, caption) {
  return `<div class="tablewrap"><table class="cmp">
    ${caption ? `<caption>${caption}</caption>` : ''}
    <thead><tr><th></th>${WIDTHS.map((w) => `<th scope="col"><span class="sw s${w}"></span>${w}-bit</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>`;
}

// Horizontal bars, one per chip, scaled to the largest value. Text stays in ink;
// the bar carries the colour.
function bars(values, { fmt: f = (v) => v.toFixed(1), unit = '', max = null, tips = [] } = {}) {
  const top = max ?? Math.max(...values);
  return `<div class="bars">${WIDTHS.map((w, i) => {
    const pct = Math.max(1.5, (values[i] / top) * 100);
    return `<div class="bar" data-tip="${esc(tips[i] || '')}">
      <span class="bl">${w}</span>
      <span class="track"><span class="fill s${w}" style="width:${pct}%"></span></span>
      <span class="bv">${f(values[i])}${unit ? ` <small>${unit}</small>` : ''}</span>
    </div>`;
  }).join('')}</div>`;
}

// --- Tabs ------------------------------------------------------------------

const TABS = {
  overview() {
    const rows = [
      triple('Register width', WIDTHS.map((w) => `${w}`), { unit: 'bits' }),
      triple('Address space the ISA allows', WIDTHS.map((w) => sup(bytesPow2(w)))),
      triple('Die area', WIDTHS.map((w) => fmt(C[w].area)), { unit: 'mm²' }),
      triple('Transistors', WIDTHS.map((w) => fmt(C[w].transistors / 1e9, 2)), { unit: 'bn' }),
      triple('Power at full load', WIDTHS.map((w) => fmt(C[w].power)), { unit: 'W' }),
      triple('Package contacts', WIDTHS.map((w) => C[w].contacts)),
    ];
    return `
      <p class="lede">One chip design, built three times. Four RISC-V cores, ${ASSUME.clockGHz.toFixed(1)} GHz, the same caches.
      Only the width of the integer registers and addresses changes.</p>
      ${table(rows)}
      <h3>Where to look</h3>
      <ul class="looks">
        <li><b>The floating register.</b> One cube per bit. It holds the current Unix time, which needs 31 bits. The 32-bit register is nearly full. The other two are mostly empty.</li>
        <li><b>The lanes.</b> One line per byte that moves on every load: 4, 8 or 16.</li>
        <li><b>The copper-coloured blocks.</b> That is the integer datapath, and it is the only part of the die that grows much. Turn on <em>Explode</em> to lift it off the die.</li>
        <li><b>Underneath.</b> Red contacts bring power in, blue ones take it back to ground. Wider chips draw more current and need more of both.</li>
      </ul>
      <div class="callout">
        <b>Is any of this real?</b>
        <p>RV32 and RV64 ship in billions of real chips. RV128 exists as a placeholder chapter in the RISC-V specification, and no one has built a general-purpose 128-bit CPU. The 128-bit chip here is what the same scaling rules predict. Every figure on this page comes from the model under <a href="#assumptions" data-tab="speed" data-jump="assumptions">Assumptions</a>, not from measurement.</p>
      </div>`;
  },

  input() {
    const p = WIDTHS.map((w) => C[w].power);
    return `
      <p class="lede">What each chip needs fed into it: power, current, contacts, and bytes per operation.</p>
      <h3>Power at full load</h3>
      ${bars(p, { unit: 'W', tips: WIDTHS.map((w) => `${C[w].short}: ${fmt(C[w].corePower, 2)} W per core × 4 + ${fmt(C[w].uncorePower, 1)} W uncore`) })}
      <h3>Supply current at ${ASSUME.vdd} V</h3>
      ${bars(WIDTHS.map((w) => C[w].current), { unit: 'A', tips: WIDTHS.map((w) => `${fmt(C[w].power)} W ÷ ${ASSUME.vdd} V`) })}
      ${table([
        triple('Supply contacts', WIDTHS.map((w) => C[w].supplyContacts), { note: `one per ${ASSUME.ampsPerContact} A` }),
        triple('Ground contacts', WIDTHS.map((w) => C[w].groundContacts)),
        triple('Signal contacts', WIDTHS.map((w) => C[w].signalContacts), { note: 'memory, I/O, clock' }),
        triple('Decoupling capacitors', WIDTHS.map((w) => C[w].decaps), { note: 'on the substrate' }),
        triple('Bytes per register load', WIDTHS.map((w) => w / 8)),
        triple('Bytes per pointer', WIDTHS.map((w) => w / 8)),
        triple('Instruction size', WIDTHS.map(() => '32'), { unit: 'bits' }),
        triple('Clock input', WIDTHS.map(() => '100'), { unit: 'MHz ref' }),
      ])}
      <button class="action" type="button" data-act="power" id="btn-power">Show power contacts from below</button>
      <p class="fine">Signal contacts do not change. All three chips talk to RAM over the same two 64-bit DDR channels, because the memory bus stopped tracking CPU width long ago. The difference is power: a wider datapath switches more wires every cycle, so it draws more current, which needs more contacts and more capacitors to deliver it cleanly.</p>`;
  },

  usage() {
    return `
      <p class="lede">What each width is for, and how much memory it can name.</p>
      <h3>Addressable memory</h3>
      <div class="scale" role="img" aria-label="Address space on a powers-of-two axis from 2^0 to 2^128 bytes">
        ${WIDTHS.map((w) => `
          <div class="scalerow">
            <span class="bl">${w}</span>
            <span class="track"><span class="fill s${w}" style="width:${(w / 128) * 100}%"></span>
              <span class="tick" style="left:${(VA_BITS[w] / 128) * 100}%" title="Translated by this chip: ${bytesPow2(VA_BITS[w])}"></span></span>
            <span class="bv">${sup(bytesPow2(w))}</span>
          </div>`).join('')}
        <div class="scalerow axisrow" aria-hidden="true"><span></span><span class="axis">${[0, 32, 64, 96, 128].map((b) => `<span style="left:${(b / 128) * 100}%">2<sup>${b}</sup></span>`).join('')}</span><span></span></div>
      </div>
      <p class="fine">Bars are drawn on a powers-of-two axis, so each quarter of the axis is another factor of 2<sup>32</sup>. The tick marks what each chip actually translates: ${WIDTHS.map((w) => `${bytesPow2(VA_BITS[w])}`).join(', ')}.</p>

      <div class="uses">
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

  parts() {
    const all = [...CORE_PARTS, ...CHIP_PARTS];
    const byGroup = Object.keys(GROUPS).map((g) => ({ g, items: all.filter((p) => p.group === g) })).filter((x) => x.items.length);
    const area = (w, id) => {
      const c = C[w];
      const p = c.core.find((x) => x.id === id) || c.uncore.find((x) => x.id === id);
      return p.area;
    };
    const maxArea = Math.max(...CORE_PARTS.map((p) => area(128, p.id)));
    return `
      <p class="lede">Click a part here or on a die. The same part lights up on all three chips.</p>
      <p class="fine">Areas in mm² for 32 · 64 · 128-bit. Per-core parts are shown for one core; each chip has four.</p>
      <div id="partcard" class="partcard" hidden></div>
      ${byGroup.map(({ g, items }) => `
        <h3 class="grp"><span class="chipcol g-${g}"></span>${GROUPS[g].name}<small>${GROUPS[g].note}</small></h3>
        <ul class="partlist">
          ${items.map((p) => {
            const vals = WIDTHS.map((w) => area(w, p.id));
            const scaleMax = p.base > 2 ? Math.max(...vals) : maxArea;
            return `<li><button type="button" class="partrow" data-part="${p.id}" id="part-${p.id}">
              <span class="pname">${p.name}<small>${p.spec} · ${SCALE_TEXT[p.scale]}</small></span>
              <span class="minibars">${WIDTHS.map((w, i) => `<span class="mb" title="${w}-bit: ${vals[i].toFixed(2)} mm²"><span class="fill s${w}" style="width:${Math.max(3, (vals[i] / scaleMax) * 100)}%"></span></span>`).join('')}</span>
              <span class="pnum">${vals.map((v) => v.toFixed(2)).join(' · ')}</span>
            </button></li>`;
          }).join('')}
        </ul>`).join('')}`;
  },

  size() {
    const rows = [
      triple('Die edge', WIDTHS.map((w) => fmt(C[w].dieSide, 2)), { unit: 'mm', note: 'square die' }),
      triple('Die area', WIDTHS.map((w) => fmt(C[w].area)), { unit: 'mm²' }),
      triple('One core', WIDTHS.map((w) => fmt(C[w].coreArea, 2)), { unit: 'mm²' }),
      triple('Integer datapath, per core', WIDTHS.map((w) => fmt(C[w].intArea, 2)), { unit: 'mm²' }),
      triple('Package edge', WIDTHS.map((w) => fmt(C[w].pkgSide)), { unit: 'mm', note: 'square package' }),
      triple('Transistors', WIDTHS.map((w) => fmt(C[w].transistors / 1e9, 2)), { unit: 'bn' }),
      triple('Integer register bits', WIDTHS.map((w) => C[w].regBits.toLocaleString('en-US')), { note: '32 registers × width' }),
    ];
    const base = C[64];
    const delta = (w) => {
      const c = C[w];
      return { int: (c.intArea - base.intArea) * 4, rest: (c.area - base.area) - (c.intArea - base.intArea) * 4 };
    };
    return `
      <p class="lede">The chips in the view are at true relative scale. The 10 mm ruler sits in front of the 32-bit chip.</p>
      <h3>Die area</h3>
      ${bars(WIDTHS.map((w) => C[w].area), { unit: 'mm²', max: C[128].area, tips: WIDTHS.map((w) => `${C[w].short}: ${fmt(C[w].coreArea * 4)} mm² of cores + ${fmt(C[w].uncoreArea)} mm² shared`) })}
      <h3>Integer datapath, one core</h3>
      ${bars(WIDTHS.map((w) => C[w].intArea), { unit: 'mm²', fmt: (v) => v.toFixed(2), tips: WIDTHS.map((w) => `${C[w].short}: registers, ALUs, bypass and multiplier`) })}
      ${table(rows)}
      <p class="fine">Doubling the width does not double the chip. From 64 to 128 bits the die grows ${fmt(((C[128].area / base.area) - 1) * 100, 0)}%, and ${fmt((delta(128).int / (C[128].area - base.area)) * 100, 0)}% of that growth is the integer datapath. Most of a modern chip is cache and I/O, and a cache holds the same bytes at any width. The multiplier is the one part that grows faster than the width, because its array scales with width squared.</p>`;
  },

  speed() {
    return `
      <p class="lede">Six jobs, run on one core of each chip. Pick one and race it.</p>
      <div class="seg" role="radiogroup" aria-label="Measure">
        <button type="button" role="radio" aria-checked="true" data-measure="speed" id="m-speed">Speed</button>
        <button type="button" role="radio" aria-checked="false" data-measure="efficiency" id="m-eff">Work per joule</button>
      </div>
      <div class="legend">${WIDTHS.map((w) => `<span><span class="sw s${w}"></span>${w}-bit</span>`).join('')}<span class="legnote">bar = relative to the best chip on that job</span></div>
      <div id="workloads" class="workloads"></div>
      <h3 id="assumptions">Assumptions</h3>
      <ul class="assume">
        <li>Same process, same ${ASSUME.clockGHz.toFixed(1)} GHz clock, same caches. A real 128-bit design would probably clock lower: its carry chains and bypass wires are longer.</li>
        <li>One instruction per cycle on every chip, so instruction count reads directly as time. Memory waits are added where data does not fit in cache: ${ASSUME.coreBWGBs} GB/s per core from RAM, ${ASSUME.ssdGBs} GB/s from SSD.</li>
        <li>Area per part is anchored to a 64-bit core and scaled by the rule shown on the Parts tab. Power is area × activity per part plus ${ASSUME.leakWPerMm2} W/mm² leakage, at full load.</li>
        <li>Work per joule uses each chip’s full-load power. Real chips gate unused upper bits, so the efficiency gap on narrow jobs is an upper bound.</li>
        <li>The 128-bit chip translates an assumed 64 bits of virtual address. RISC-V defines no paging scheme for RV128; a full 128-bit address would need about 13 page-table levels.</li>
      </ul>`;
  },
};

const TAB_ORDER = [
  ['overview', 'Overview'], ['input', 'Input'], ['usage', 'Usage'],
  ['parts', 'Parts'], ['size', 'Size'], ['speed', 'Speed'],
];

// --- Wiring -----------------------------------------------------------------

export function createPanel(root, scene) {
  let measure = 'speed';
  let current = 'overview';
  let selectedPart = null;
  let racing = null;
  let raceView = null;

  const tabs = $('.tabs', root);
  const body = $('.panelbody', root);
  tabs.innerHTML = TAB_ORDER.map(([id, name]) =>
    `<button type="button" role="tab" id="tab-${id}" aria-controls="panelbody" aria-selected="${id === current}" data-tab="${id}">${name}</button>`).join('');

  const tip = document.createElement('div');
  tip.className = 'tip panel-tip';
  tip.hidden = true;
  document.body.appendChild(tip);

  function show(id, { jump } = {}) {
    if (!TABS[id]) id = 'overview';
    current = id;
    for (const b of tabs.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === id));
    body.innerHTML = TABS[id]();
    body.scrollTop = 0;
    if (id === 'speed') renderWorkloads();
    if (id === 'parts' && selectedPart) showPart(selectedPart, { scroll: true });
    if (id === 'input') syncPowerButton();
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
    const vals = WIDTHS.map((w) => (C[w].core.find((x) => x.id === id) || C[w].uncore.find((x) => x.id === id)));
    const perCore = CORE_PARTS.some((x) => x.id === id);
    card.innerHTML = `
      <div class="pc-head"><span class="chipcol g-${p.group}"></span><b>${p.name}</b><button type="button" class="x" data-act="clear" aria-label="Clear selection">×</button></div>
      <p>${p.what}</p>
      ${bars(vals.map((v) => v.area), { unit: 'mm²', fmt: (v) => v.toFixed(2), tips: vals.map((v, i) => `${WIDTHS[i]}-bit: ${v.area.toFixed(3)} mm²${perCore ? ' per core' : ''}, ${v.power.toFixed(2)} W`) })}
      <p class="fine">${SCALE_TEXT[p.scale][0].toUpperCase()}${SCALE_TEXT[p.scale].slice(1)}. ${perCore ? 'Per core; each chip has four.' : 'One per chip.'}</p>`;
    card.hidden = false;
    if (scroll) card.scrollIntoView({ block: 'nearest' });
  }

  function raceBlock(id) {
    if (!raceView || raceView.id !== id) return '';
    const { rows, plan, t0, done } = raceView;
    const elapsed = performance.now() - t0;
    const fastest = Math.min(...rows.map((x) => x.s));
    const capped = Math.max(...rows.map((x) => x.s)) / fastest > 7.5;
    return `<div class="racecard${done ? ' done' : ''}">
      ${rows.map((x) => {
        const ms = plan.find((p) => p.w === x.w).ms;
        const style = done ? 'width:100%' : `animation-duration:${ms}ms;animation-delay:${-elapsed}ms`;
        const vs = x.s / fastest;
        const verdict = vs < 1.005 ? 'fastest' : `${vs.toFixed(1)}× the time`;
        return `<div class="lane"><span class="bl">${x.w}</span>
          <span class="track"><span class="fill s${x.w}${done ? '' : ' run'}" style="${style}"></span></span>
          <span class="bv">${seconds(x.s)}</span></div>
          <p class="how">${done ? `<b>${verdict}</b> · ` : ''}${esc(x.how)}${x.mem ? ` · ${esc(x.mem)}` : ''}</p>`;
      }).join('')}
      <p class="fine">Each bar fills in time proportional to the modelled run time${capped ? ', with the slowest capped so it still finishes' : ''}. ${done ? '' : 'Watch the registers above the chips: only the bits this job uses are moving.'}</p>
    </div>`;
  }

  function renderWorkloads() {
    const host = $('#workloads');
    if (!host) return;
    host.innerHTML = WORKLOADS.map((wl) => {
      const r = race(wl.id);
      const vals = r.rows.map((x) => x[measure]);
      return `<article class="wl${racing === wl.id ? ' running' : ''}" data-wl="${wl.id}">
        <header>
          <div><b>${wl.name}</b><span>${wl.job}</span></div>
          <button type="button" class="race" data-race="${wl.id}" id="race-${wl.id}" ${racing ? 'disabled' : ''}>${raceView && raceView.id === wl.id && raceView.done ? 'Again' : 'Race'}</button>
        </header>
        ${raceBlock(wl.id)}
        ${bars(vals, {
          max: 1,
          fmt: (v) => `${v.toFixed(2)}×`,
          tips: r.rows.map((x) => `${x.w}-bit: ${seconds(x.s)}. ${x.how}${x.mem ? `. ${x.mem}` : ''}`),
        })}
        <p class="why">${wl.why}</p>
        <p class="seen">Seen in: ${wl.seen}</p>
      </article>`;
    }).join('');
  }

  function bitsUsed(id) {
    return (w) => ({
      int32: 32, int64: Math.min(w, 64), crypto: w, ptr: VA_BITS[w], big: VA_BITS[w], fp: 30,
    }[id]);
  }

  function startRace(id) {
    if (racing) return;
    racing = id;
    const r = race(id);
    const plan = scene.raceStart(r.rows, bitsUsed(id), () => {
      racing = null;
      if (raceView && raceView.id === id) raceView.done = true;
      if (current === 'speed') renderWorkloads();
    });
    raceView = { id, rows: r.rows, plan, t0: performance.now(), done: false };
    renderWorkloads();
    const art = body.querySelector(`[data-wl="${id}"]`);
    if (art) art.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  tabs.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tab]');
    if (b) show(b.dataset.tab);
  });
  tabs.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const ids = TAB_ORDER.map(([id]) => id);
    const next = ids[(ids.indexOf(current) + (ev.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
    show(next);
    $(`#tab-${next}`).focus();
  });

  body.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-jump]');
    if (a) { ev.preventDefault(); show(a.dataset.tab, { jump: a.dataset.jump }); return; }
    const pr = ev.target.closest('[data-part]');
    if (pr) {
      const id = pr.dataset.part === selectedPart ? null : pr.dataset.part;
      showPart(id, { scroll: !!id });
      return;
    }
    const act = ev.target.closest('[data-act]');
    if (act && act.dataset.act === 'clear') { showPart(null); return; }
    if (act && act.dataset.act === 'power') {
      const on = !scene.get('power');
      scene.set('power', on);
      document.dispatchEvent(new CustomEvent('bitwidth:sync'));
      if (on) scene.focus('under');
      syncPowerButton();
      return;
    }
    const m = ev.target.closest('[data-measure]');
    if (m) {
      measure = m.dataset.measure;
      for (const b of body.querySelectorAll('[data-measure]')) b.setAttribute('aria-checked', String(b === m));
      renderWorkloads();
      return;
    }
    const rc = ev.target.closest('[data-race]');
    if (rc) startRace(rc.dataset.race);
  });

  // Hover tips for bars: hit target is the whole row, not the thin fill.
  body.addEventListener('pointerover', (ev) => {
    const b = ev.target.closest('[data-tip]');
    if (!b || !b.dataset.tip) { tip.hidden = true; return; }
    tip.textContent = b.dataset.tip;
    tip.hidden = false;
    const r = b.getBoundingClientRect();
    const left = Math.min(r.left, innerWidth - tip.offsetWidth - 12);
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${r.top - tip.offsetHeight - 6 < 8 ? r.bottom + 6 : r.top - tip.offsetHeight - 6}px`;
  });
  body.addEventListener('pointerleave', () => { tip.hidden = true; });
  body.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

  scene.onPick((id) => {
    if (id && current !== 'parts') show('parts');
    showPart(id, { scroll: true });
  });

  let start = location.hash.slice(1);
  if (!TABS[start]) {
    try { start = localStorage.getItem('bitwidth-tab') || 'overview'; } catch { start = 'overview'; }
  }
  show(start);

  return { show, syncPowerButton };
}
