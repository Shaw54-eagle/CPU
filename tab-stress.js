// The Stress tab: run every core flat out under a chosen cooler and watch
// temperature, clock and power settle. The simulation lives in stress.js;
// this file drives it, draws it, and keeps running if you switch tabs.

import { WORKLOADS } from './model.js';
import { createRun, COOLERS, TJMAX, AMBIENT } from './stress.js';
import { esc, $, table, legend, tag } from './ui.js';
import { lineChart } from './charts.js';

const DURATIONS = [[60, '1 min'], [180, '3 min'], [600, '10 min']];
const SPEEDS = [10, 30, 60];

const opts = { wl: 'crypto', cooler: 'passive', duration: 600, speed: 60 };
let run = null;
let running = false;
let raf = 0;
let lastReal = 0;
let lastPaint = 0;
let charts = null;
let ctxRef = null;

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function seg(name, list, value) {
  return `<div class="seg wrap" role="radiogroup" aria-label="${name}">${list.map(([v, label]) =>
    `<button type="button" role="radio" aria-checked="${String(v) === String(value)}" data-${name}="${v}" id="${name}-${v}">${label}</button>`).join('')}</div>`;
}

function statusLine() {
  if (!run) return 'Not started. Pick a job and a cooler, then start.';
  const state = running ? 'Running' : run.done ? 'Finished' : 'Paused';
  return `${state} · simulated <b>${mmss(run.t)}</b> of ${mmss(run.duration)} · ${opts.speed}× real time · room at ${AMBIENT} °C`;
}

function rateText(r) {
  if (r.dnf) return '—';
  return (r.rate / r.wl.rateScale).toFixed(r.rate / r.wl.rateScale < 10 ? 2 : 1);
}

function statsTable() {
  if (!run) return '';
  const rs = run.runs;
  const chips = rs.map((r) => r.chip);
  const pill = (r) => {
    const v = r.verdict();
    const icon = { good: '✓', warning: '!', serious: '!', critical: '✕', muted: '–' }[v.tone];
    return `<span class="pill ${v.tone}" data-tip="${esc(v.detail)}"><i aria-hidden="true">${icon}</i>${esc(v.text)}</span>`;
  };
  return table(chips, [
    { label: 'Hotspot', note: `limit ${TJMAX} °C`, values: rs.map((r) => r.hot.toFixed(0)), unit: '°C' },
    { label: 'Clock', values: rs.map((r) => (r.tripped ? 'off' : r.f.toFixed(2))), unit: 'GHz' },
    { label: 'Power', values: rs.map((r) => r.P.toFixed(1)), unit: 'W' },
    { label: 'Current', values: rs.map((r) => r.I.toFixed(1)), unit: 'A' },
    ...(run.cooler.fan ? [{ label: 'Fan', values: rs.map((r) => Math.round(r.rpm).toLocaleString('en-US')), unit: 'rpm' }] : []),
    { label: 'Throughput', note: run.wl.rateUnit, values: rs.map(rateText) },
    { label: 'Work done', note: run.wl.unit, values: rs.map((r) => (r.dnf ? '—' : compact(r.work))) },
    { label: 'Energy', values: rs.map((r) => (r.energy / 1000).toFixed(2)), unit: 'kJ' },
    { label: 'Work per joule', note: run.wl.unit, values: rs.map((r) => (r.dnf || !r.energy ? '—' : compact(r.work / r.energy))) },
  ]) + `<div class="verdicts">${rs.map((r) => `<div class="verdict"><span class="sw s${r.key}"></span><b>${esc(tag(r.chip))}</b>${pill(r)}</div>`).join('')}</div>`;
}

function compact(n) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(n < 10 ? 2 : 0);
}

function paint(force = false) {
  const now = performance.now();
  if (!force && now - lastPaint < 125) return;
  lastPaint = now;
  if (!ctxRef || ctxRef.current() !== 'stress') return;
  const st = $('#stress-status');
  if (st) st.innerHTML = statusLine();
  const tb = $('#stress-table');
  if (tb) tb.innerHTML = statsTable();
  const btn = $('#stress-go');
  if (btn) btn.textContent = running ? 'Pause' : run && !run.done ? 'Resume' : run && run.done ? 'Run again' : 'Start stress test';
  if (charts && run) {
    const series = (k) => run.runs.filter((r) => !r.dnf).map((r) => ({ key: r.key, tag: tag(r.chip), points: r.hist.map((h) => [h.t, h[k]]) }));
    charts.T.update({ xMax: run.duration, series: series('T') });
    charts.f.update({ xMax: run.duration, series: series('f') });
    charts.P.update({ xMax: run.duration, series: series('P') });
  }
}

function loop(t) {
  if (!running) return;
  const dt = Math.min(0.25, (t - lastReal) / 1000);   // a slow frame catches up, a hidden tab does not leap
  lastReal = t;
  run.advance(dt * opts.speed);
  if (run.done) {
    running = false;
    paint(true);
    ctxRef.hooks.toast && ctxRef.hooks.toast(`Stress test finished: ${run.wl.name}, ${run.cooler.label.toLowerCase()}`);
    return;
  }
  paint();
  raf = requestAnimationFrame(loop);
}

function start(ctx) {
  if (running) { running = false; cancelAnimationFrame(raf); paint(true); return; }
  if (!run || run.done) {
    run = createRun(ctx.chips, { wl: opts.wl, cooler: opts.cooler, duration: opts.duration });
    ctx.scene.setCooler(opts.cooler);
    ctx.scene.setThermal(run.runs);
    ctx.scene.set('thermal', true);
    ctx.scene.set('lid', false);
    ctx.hooks.syncToggles && ctx.hooks.syncToggles();
  }
  running = true;
  lastReal = performance.now();
  raf = requestAnimationFrame(loop);
  paint(true);
}

function reset(ctx) {
  running = false;
  cancelAnimationFrame(raf);
  run = null;
  ctx.scene.setThermal(null);
  ctx.scene.set('thermal', false);
  ctx.hooks.syncToggles && ctx.hooks.syncToggles();
  ctx.show('stress', { keepScroll: true });
}

export const stressTab = {
  render({ chips }) {
    const c = COOLERS[opts.cooler];
    return `
      <p class="lede">Every core on full load, a cooler, and physics. Heat builds, hotter silicon leaks more power, and each chip slows its own clock to stay under ${TJMAX} °C.</p>
      <h3>Job</h3>
      ${seg('wl', WORKLOADS.map((w) => [w.id, w.name]), opts.wl)}
      <h3>Cooler</h3>
      ${seg('cooler', Object.entries(COOLERS).map(([k, v]) => [k, v.label]), opts.cooler)}
      <p class="fine" id="cooler-note">${esc(c.note)} Thermal resistance ${c.rsa} °C/W${c.fan ? `, fan ${c.fan[0]}–${c.fan[1]} rpm` : ''}. Shown on the chips when the lid is on.</p>
      <div class="row2">
        <div><h3>Length</h3>${seg('dur', DURATIONS, opts.duration)}</div>
        <div><h3>Speed</h3>${seg('speed', SPEEDS.map((s) => [s, `${s}×`]), opts.speed)}</div>
      </div>
      <div class="actions">
        <button type="button" class="action" id="stress-go" data-act="go">Start stress test</button>
        <button type="button" class="ghost" id="stress-reset" data-act="reset">Reset</button>
      </div>
      <p class="status" id="stress-status">${statusLine()}</p>
      <div id="stress-table" class="stresstable"></div>
      ${legend(chips)}
      <div class="charts">
        <div class="chart" id="chart-T"></div>
        <div class="chart" id="chart-f"></div>
        <div class="chart" id="chart-P"></div>
      </div>
      <h3>How the simulation works</h3>
      <ul class="assume">
        <li>Each chip is a die on a cooler losing heat to a ${AMBIENT} °C room. A small die concentrates the same watts, so its junction runs hotter.</li>
        <li>Power is the work’s switching energy, scaled by clock × voltage², plus leakage that doubles every 30 °C. Unused upper bits of a wide register are clock-gated but the clock tree still reaches them.</li>
        <li>The governor checks ten times a second: above ${TJMAX - 1} °C it cuts the clock, below ${TJMAX - 8} °C it lets it climb back. A chip that passes 105 °C at its lowest clock shuts itself down.</li>
        <li>Fans speed up from 40 °C and cool better as they do. Coolers are drawn small; a real one would dwarf these packages.</li>
      </ul>`;
  },
  mount(ctx) {
    ctxRef = ctx;
    charts = {
      T: lineChart($('#chart-T'), { title: 'Hotspot temperature', unit: '°C', yMin: 20, refs: [{ y: TJMAX, label: `${TJMAX} °C limit` }] }),
      f: lineChart($('#chart-f'), { title: 'Clock', unit: 'GHz', digits: 2, yMin: 0 }),
      P: lineChart($('#chart-P'), { title: 'Power', unit: 'W', digits: 1, yMin: 0 }),
    };
    ctx.scene.setCooler(opts.cooler);
    const body = ctx.body;
    body.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.wl) opts.wl = d.wl;
      else if (d.cooler) { opts.cooler = d.cooler; ctx.scene.setCooler(opts.cooler); }
      else if (d.dur) opts.duration = +d.dur;
      else if (d.speed) opts.speed = +d.speed;
      else if (d.act === 'go') { start(ctx); return; }
      else if (d.act === 'reset') { reset(ctx); return; }
      else return;
      for (const sib of b.parentElement.querySelectorAll('[role="radio"]')) sib.setAttribute('aria-checked', String(sib === b));
      if (d.cooler) {
        const c = COOLERS[opts.cooler];
        $('#cooler-note').textContent = `${c.note} Thermal resistance ${c.rsa} °C/W${c.fan ? `, fan ${c.fan[0]}–${c.fan[1]} rpm` : ''}. Shown on the chips when the lid is on.`;
      }
    };
    paint(true);
  },
  unmount(ctx) {
    ctx.body.onclick = null;
    charts = null;
  },
  get running() { return running; },
};
