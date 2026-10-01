import { createScene } from './scene.js';
import { createPanel } from './panel.js';
import { benchChips, onBenchChange, tag, esc } from './ui.js';
import { HEAT_STOPS } from './stress.js';

const viewport = document.getElementById('viewport');

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

let scene;
if (webglAvailable()) {
  scene = createScene(viewport);
} else {
  viewport.insertAdjacentHTML('beforeend', '<div class="fallback"><p>This browser has WebGL turned off, so the 3D view cannot draw. The panel still works.</p></div>');
  const flags = {};
  scene = {
    setBench() {}, set(k, v) { flags[k] = !!v; }, get: (k) => !!flags[k], focus() {}, setMode() {}, mode: 'lineup',
    select() {}, selectReal() {}, setCooler() {}, setThermal() {}, setRegisters() {}, onPick() {}, keys: () => benchChips().map((c) => c.key),
    raceStart: (rows, _bits, done) => { setTimeout(done, 1600); return rows.map((r) => ({ key: r.key, ms: r.dnf ? 0 : 1600 })); },
    raceStop() {},
  };
}
scene.setBench(benchChips());
window.bitWidthLab = scene; // handy from the console, and what check.py drives

// --- Top bar -------------------------------------------------------------

const cam = { view: 'all', close: false, under: false };
const views = document.getElementById('views');
let panel = null;

function renderViews() {
  const real = scene.mode === 'real';
  const list = real ? [] : benchChips();
  if (cam.view !== 'all' && !list.some((c) => c.key === cam.view)) cam.view = 'all';
  views.innerHTML = `<span class="glabel">View</span>
    <button type="button" role="radio" aria-checked="${cam.view === 'all'}" data-view="all" id="v-all" title="Everything (0)">All</button>
    ${list.map((c, i) => `<button type="button" role="radio" aria-checked="${cam.view === c.key}" data-view="${c.key}" id="v-${c.key}" title="${esc(c.title)} (${i + 1})"><span class="sw s${c.key}"></span>${esc(tag(c))}</button>`).join('')}`;
  for (const id of ['f-close', 'f-under', 't-lid', 't-explode', 't-bus', 't-power', 't-thermal']) {
    document.getElementById(id).disabled = real;
  }
}

function applyCamera() {
  const { view, close, under } = cam;
  let name;
  if (view === 'all') name = under ? 'under' : 'all';
  else if (under) name = `under:${view}`;
  else name = close ? `die:${view}` : view;
  scene.focus(name);
  for (const b of views.querySelectorAll('[data-view]')) b.setAttribute('aria-checked', String(b.dataset.view === view));
  for (const b of document.querySelectorAll('[data-flag]')) b.setAttribute('aria-pressed', String(cam[b.dataset.flag]));
}

const legend = document.getElementById('heatlegend');
(function buildLegend() {
  const lo = 20, hi = 105;
  document.getElementById('heatramp').style.background =
    `linear-gradient(90deg, ${HEAT_STOPS.map(([t, c]) => `${c} ${((t - lo) / (hi - lo)) * 100}%`).join(', ')})`;
  document.getElementById('heatticks').innerHTML = [25, 50, 75, 100].map((t) => `<span style="left:${((t - lo) / (hi - lo)) * 100}%">${t}</span>`).join('');
})();

function syncToggles() {
  for (const b of document.querySelectorAll('[data-toggle]')) b.setAttribute('aria-pressed', String(scene.get(b.dataset.toggle)));
  legend.hidden = !scene.get('thermal') || scene.mode === 'real';
  if (panel) panel.syncPowerButton();
}

function setView(view) {
  cam.view = view;
  if (view === 'all') cam.close = false;
  applyCamera();
}

function flip(flag) {
  if (scene.mode === 'real') return;
  cam[flag] = !cam[flag];
  if (flag === 'close' && cam.close) {
    cam.under = false;
    if (cam.view === 'all') cam.view = '64';
  }
  if (flag === 'under' && cam.under) cam.close = false;
  applyCamera();
}

function toggle(key) {
  if (scene.mode === 'real' && key !== 'labels') return;
  const on = !scene.get(key);
  scene.set(key, on);
  if (key === 'power' && on && !cam.under) { cam.under = true; cam.close = false; applyCamera(); }
  if (key === 'lid' && on && cam.under) { cam.under = false; applyCamera(); }
  if (key === 'thermal' && on && scene.get('lid')) scene.set('lid', false);
  syncToggles();
}

let toastTimer = 0;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

panel = createPanel(document.getElementById('panel'), scene, {
  syncToggles,
  toast,
  onTab() { renderViews(); syncToggles(); },
});

document.querySelector('.controls').addEventListener('click', (ev) => {
  const v = ev.target.closest('[data-view]');
  if (v) return setView(v.dataset.view);
  const f = ev.target.closest('[data-flag]');
  if (f) return flip(f.dataset.flag);
  const t = ev.target.closest('[data-toggle]');
  if (t) return toggle(t.dataset.toggle);
});

// The panel's "show power contacts" button flips the same switch.
document.addEventListener('bitwidth:sync', () => {
  if (scene.get('power')) { cam.under = true; cam.close = false; applyCamera(); }
  syncToggles();
});

onBenchChange(() => {
  scene.setBench(benchChips());
  renderViews();
});

const KEY_TOGGLES = { l: 'lid', e: 'explode', b: 'bus', p: 'power', t: 'labels', h: 'thermal' };
addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.target.closest('input, textarea, select')) return;
  const k = ev.key.toLowerCase();
  const keys = scene.mode === 'real' ? [] : benchChips().map((c) => c.key);
  let handled = true;
  if (k === '0') setView('all');
  else if (/^[1-9]$/.test(k) && keys[+k - 1]) setView(keys[+k - 1]);
  else if (k === 'c') flip('close');
  else if (k === 'u') flip('under');
  else if (KEY_TOGGLES[k]) toggle(KEY_TOGGLES[k]);
  else handled = false;
  if (handled) ev.preventDefault();
});

renderViews();
syncToggles();

// A power-on self test, typed out once. It lists the chips the page just
// built, from the model, and goes away on its own.
(function post() {
  const el = document.getElementById('post');
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const lines = [
    'BIT WIDTH LAB  POST v2.0',
    'Detecting processors...',
    ...benchChips().map((c) => `  ${c.code.padEnd(9)} ${c.isa.padEnd(7)} ${c.cores}C ${c.clockGHz.toFixed(1)} GHz ${String(c.w).padStart(4)}-bit  @OK@`),
    'Thermal sensors ........ @OK@',
    'Real-chip archive ...... 11 dies @OK@',
  ];
  let i = 0;
  const tick = () => {
    if (i > lines.length) {
      setTimeout(() => el.classList.add('gone'), 1400);
      setTimeout(() => el.remove(), 2200);
      return;
    }
    el.innerHTML = lines.slice(0, i).map((l) => esc(l).replace('@OK@', '<span class="ok">OK</span>')).join('\n');
    i++;
    setTimeout(tick, 110);
  };
  tick();
})();
