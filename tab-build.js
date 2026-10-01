// The Build tab: your own chip, from the same rules as the lineup.
// Every slider rebuilds the chip in model.js; with "On the bench" ticked it
// also joins the 3D view, the comparison tabs, the race and the stress test.

import { CHIPS, NODES, WORKLOADS, itemTime, economics, bytesPow2 } from './model.js';
import { COOLERS, AMBIENT, TJMAX } from './stress.js';
import { esc, $, sup, fmt, app, buildCustom, benchChanged } from './ui.js';

const L2S = [128, 256, 512, 1024, 2048];
let rebuildTimer = 0;

function seg(name, list, value) {
  return `<div class="seg wrap" role="radiogroup" aria-label="${name}">${list.map(([v, label]) =>
    `<button type="button" role="radio" aria-checked="${String(v) === String(value)}" data-${name}="${v}" id="b-${name}-${v}">${label}</button>`).join('')}</div>`;
}

function slider(id, label, min, max, step, value, unit) {
  return `<label class="slider" for="b-${id}">
    <span class="sl-head"><span>${label}</span><output id="o-${id}">${value}${unit}</output></span>
    <input type="range" id="b-${id}" data-cfg="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
  </label>`;
}

// Whole-chip throughput: every core busy, memory bandwidth shared.
const chipRate = (wl, c) => {
  const it = itemTime(wl, c);
  return it.dnf ? 0 : c.cores / it.s;
};

function readout() {
  const c = app.custom;
  const ref = CHIPS[c.w];
  const e = economics(c), er = economics(ref);
  const rjc = Math.min(2, 10.5 / c.area);
  const coolerRows = Object.entries(COOLERS).map(([k, v]) => {
    const T = AMBIENT + c.power * (v.rsa + rjc);
    const ok = T < TJMAX;
    return `<li><span class="pill ${ok ? 'good' : T < TJMAX + 40 ? 'warning' : 'critical'}"><i aria-hidden="true">${ok ? '✓' : '!'}</i>${v.label}</span><span class="num">≈ ${T > 250 ? '250+' : T.toFixed(0)} °C</span></li>`;
  }).join('');
  const warn = [];
  if (c.w <= 16 && c.cfg.l3MB > 0) warn.push(`A ${c.w}-bit chip names ${bytesPow2(c.ptrBits)} with a register pair, so most of a ${c.cfg.l3MB} MB L3 holds data it can’t address directly.`);
  if (c.clockGHz > 4.5) warn.push('Above about 4.5 GHz the voltage has to climb, so power rises much faster than the clock.');
  if (c.area > 400) warn.push(`At ${fmt(c.area, 0)} mm² this die is close to the largest a lithography scanner can expose in one shot (about 850 mm²).`);
  if (c.area > 850) warn.push('Past about 850 mm² it can’t be made as one die at all; real designs this big are split into chiplets.');
  if (c.power > 300) warn.push('This draws more than most desktop sockets are built to deliver.');

  return `
    <div class="readout">
      <div class="big"><span>Die</span><b>${fmt(c.area, 1)}</b><small>mm²</small></div>
      <div class="big"><span>Transistors</span><b>${fmt(c.transistors / 1e9, 2)}</b><small>billion</small></div>
      <div class="big"><span>Full load</span><b>${fmt(c.power, c.power < 100 ? 1 : 0)}</b><small>W</small></div>
      <div class="big"><span>Cost per good die</span><b>${isFinite(e.cost) ? `$${e.cost < 10 ? e.cost.toFixed(2) : e.cost.toFixed(0)}` : '—'}</b><small>rough</small></div>
    </div>
    <div class="tablewrap"><table class="cmp two">
      <thead><tr><th></th><th scope="col"><span class="sw scustom"></span>${esc(c.short)}</th><th scope="col"><span class="sw s${ref.key}"></span>Lineup ${ref.w}-bit</th></tr></thead>
      <tbody>
        <tr><th scope="row">Cores · clock</th><td class="num">${c.cores} · ${c.clockGHz.toFixed(1)}<small>GHz</small></td><td class="num">${ref.cores} · ${ref.clockGHz.toFixed(1)}<small>GHz</small></td></tr>
        <tr><th scope="row">Process</th><td class="num">${c.node.label}</td><td class="num">${ref.node.label}</td></tr>
        <tr><th scope="row">Die edge</th><td class="num">${fmt(c.dieSide, 1)}<small>mm</small></td><td class="num">${fmt(ref.dieSide, 1)}<small>mm</small></td></tr>
        <tr><th scope="row">Supply</th><td class="num">${c.vdd.toFixed(2)}<small>V</small> ${fmt(c.current, 0)}<small>A</small></td><td class="num">${ref.vdd.toFixed(2)}<small>V</small> ${fmt(ref.current, 0)}<small>A</small></td></tr>
        <tr><th scope="row">Package</th><td class="num">${fmt(c.pkgSide, 1)}<small>mm</small> · ${c.contacts}</td><td class="num">${fmt(ref.pkgSide, 1)}<small>mm</small> · ${ref.contacts}</td></tr>
        <tr><th scope="row">Addressable<span class="rownote">one pointer</span></th><td class="num">${sup(bytesPow2(c.ptrBits))}</td><td class="num">${sup(bytesPow2(ref.ptrBits))}</td></tr>
        <tr><th scope="row">Dies per wafer<span class="rownote">300 mm, gross</span></th><td class="num">${e.dpw.toLocaleString('en-US')}</td><td class="num">${er.dpw.toLocaleString('en-US')}</td></tr>
        <tr><th scope="row">Yield<span class="rownote">0.1 defects/cm²</span></th><td class="num">${(e.yield * 100).toFixed(0)}<small>%</small></td><td class="num">${(er.yield * 100).toFixed(0)}<small>%</small></td></tr>
      </tbody></table></div>
    ${warn.length ? `<ul class="warns">${warn.map((w) => `<li>${w}</li>`).join('')}</ul>` : ''}
    <h3>All-core throughput vs the lineup ${ref.w}-bit chip</h3>
    <div class="bars">${WORKLOADS.map((wl) => {
      const mine = chipRate(wl, c), theirs = chipRate(wl, ref);
      const x = theirs ? mine / theirs : 0;
      return `<div class="bar" data-tip="${esc(`${wl.job}: ${(mine / wl.rateScale).toFixed(2)} vs ${(theirs / wl.rateScale).toFixed(2)} ${wl.rateUnit}`)}">
        <span class="bl wide">${wl.name}</span>
        <span class="track"><span class="fill scustom" style="width:${Math.min(100, (x / 4) * 100)}%"></span><span class="tick" style="left:25%"></span></span>
        <span class="bv">${mine ? `${x.toFixed(2)}×` : '<em>can’t run</em>'}</span></div>`;
    }).join('')}</div>
    <p class="fine">The tick marks 1×, the lineup chip. Bars run to 4×. Memory-bound jobs stop scaling once the cores share out the two DDR channels.</p>
    <h3>Steady temperature at full load</h3>
    <ul class="coolers">${coolerRows}</ul>
    <p class="fine">A quick estimate that ignores leakage feedback and the fan curve. Put the chip on the bench and run the stress test for the real answer.</p>`;
}

function refresh(ctx, { geometry = true } = {}) {
  buildCustom();
  const host = $('#build-readout');
  if (host) host.innerHTML = readout();
  if (app.customOn && geometry) {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => benchChanged(), 140);
  }
}

export const buildTab = {
  render() {
    const cfg = app.customCfg;
    return `
      <p class="lede">Design your own processor with the same rules as the lineup. Change anything and the numbers, the die and the package redraw.</p>
      <label class="field" for="b-name"><span>Name, engraved on the lid</span>
        <input type="text" id="b-name" maxlength="14" value="${esc(cfg.name)}" autocomplete="off" spellcheck="false"></label>
      <h3>Register width</h3>
      ${seg('w', [8, 16, 32, 64, 128].map((w) => [w, `${w}-bit`]), cfg.w)}
      <h3>Process</h3>
      ${seg('node', Object.entries(NODES).map(([k, v]) => [k, v.label]), cfg.node)}
      ${slider('cores', 'Cores', 1, 16, 1, cfg.cores, '')}
      ${slider('clockGHz', 'Clock', 0.5, 5, 0.1, cfg.clockGHz.toFixed(1), ' GHz')}
      ${slider('l3MB', 'Shared L3 cache', 0, 64, 2, cfg.l3MB, ' MB')}
      <h3>L2 cache per core</h3>
      ${seg('l2KB', L2S.map((k) => [k, k >= 1024 ? `${k / 1024} MB` : `${k} KB`]), cfg.l2KB)}
      <div class="actions">
        <label class="check" for="b-on"><input type="checkbox" id="b-on" ${app.customOn ? 'checked' : ''}> On the bench</label>
        <button type="button" class="ghost" id="b-fly" data-act="fly" ${app.customOn ? '' : 'disabled'}>Fly to it</button>
      </div>
      <div id="build-readout">${readout()}</div>
      <p class="fine">Process figures are rough: density and energy per switch relative to a 5 nm-class baseline, and wafer prices from widely reported estimates. Good for direction, not for three digits.</p>`;
  },
  mount(ctx) {
    const body = ctx.body;
    body.oninput = (ev) => {
      const el = ev.target;
      if (el.id === 'b-name') {
        app.customCfg.name = el.value.slice(0, 14) || 'My chip';
        refresh(ctx);
        return;
      }
      if (el.dataset.cfg) {
        const k = el.dataset.cfg;
        app.customCfg[k] = +el.value;
        const out = $(`#o-${k}`);
        if (out) out.textContent = k === 'clockGHz' ? `${(+el.value).toFixed(1)} GHz` : k === 'l3MB' ? `${el.value} MB` : el.value;
        refresh(ctx);
      }
    };
    body.onchange = (ev) => {
      if (ev.target.id !== 'b-on') return;
      app.customOn = ev.target.checked;
      $('#b-fly').disabled = !app.customOn;
      refresh(ctx, { geometry: false });
      benchChanged();
      if (app.customOn) setTimeout(() => ctx.scene.focus('custom'), 60);
    };
    body.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.act === 'fly') { ctx.scene.focus('custom'); return; }
      if (d.w) app.customCfg.w = +d.w;
      else if (d.node) app.customCfg.node = d.node;
      else if (d.l2KB) app.customCfg.l2KB = +d.l2KB;
      else return;
      for (const sib of b.parentElement.querySelectorAll('[role="radio"]')) sib.setAttribute('aria-checked', String(sib === b));
      refresh(ctx);
    };
  },
  unmount(ctx) {
    ctx.body.oninput = ctx.body.onchange = ctx.body.onclick = null;
  },
};
