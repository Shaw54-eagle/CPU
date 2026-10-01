import { createScene } from './scene.js';
import { createPanel } from './panel.js';

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
  viewport.insertAdjacentHTML('beforeend', '<div class="fallback"><p>This browser has WebGL turned off, so the 3D view cannot draw. The comparison panel still works.</p></div>');
  scene = { set() {}, get: () => false, focus() {}, select() {}, raceStart: (rows, _bits, done) => { setTimeout(done, 1600); return rows.map((r) => ({ w: r.w, ms: 1600 })); }, raceStop() {}, onPick() {} };
}
const panel = createPanel(document.getElementById('panel'), scene);
window.bitWidthLab = scene; // handy from the console, and what tests/check.mjs drives

// --- Top bar -------------------------------------------------------------

const cam = { view: 'all', close: false, under: false };

function applyCamera() {
  const { view, close, under } = cam;
  let name;
  if (view === 'all') name = under ? 'under' : 'all';
  else if (under) name = `under${view}`;
  else name = close ? `die${view}` : view;
  scene.focus(name);
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-checked', String(b.dataset.view === view));
  for (const b of document.querySelectorAll('[data-flag]')) b.setAttribute('aria-pressed', String(cam[b.dataset.flag]));
}

function syncToggles() {
  for (const b of document.querySelectorAll('[data-toggle]')) b.setAttribute('aria-pressed', String(scene.get(b.dataset.toggle)));
  panel.syncPowerButton();
}

function setView(view) {
  cam.view = view;
  if (view === 'all') cam.close = false;
  applyCamera();
}

function flip(flag) {
  cam[flag] = !cam[flag];
  if (flag === 'close' && cam.close) {
    cam.under = false;
    if (cam.view === 'all') cam.view = '64';
  }
  if (flag === 'under' && cam.under) cam.close = false;
  applyCamera();
}

function toggle(key) {
  const on = !scene.get(key);
  scene.set(key, on);
  if (key === 'power' && on && !cam.under) { cam.under = true; cam.close = false; applyCamera(); }
  if (key === 'lid' && on && cam.under) { cam.under = false; applyCamera(); }
  syncToggles();
}

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
  if (scene.get('power')) { cam.under = true; cam.close = false; }
  for (const b of document.querySelectorAll('[data-flag]')) b.setAttribute('aria-pressed', String(cam[b.dataset.flag]));
  syncToggles();
});

const KEYS = {
  0: () => setView('all'), 1: () => setView('32'), 2: () => setView('64'), 3: () => setView('128'),
  c: () => flip('close'), u: () => flip('under'),
  l: () => toggle('lid'), e: () => toggle('explode'), b: () => toggle('bus'), p: () => toggle('power'), t: () => toggle('labels'),
};
addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.target.closest('input, textarea, select')) return;
  const f = KEYS[ev.key.toLowerCase()];
  if (f) { f(); ev.preventDefault(); }
});

syncToggles();
