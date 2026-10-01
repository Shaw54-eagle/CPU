// The Showroom tab: the realistic package from blender/make_chip.py, live.
//
// The 3D view steps aside (as it does for the timeline) and showroom.js draws
// the model on a canvas of its own. A toolbar over the stage pulls the layers
// apart, takes the lid off, turns the chip over and changes the light; the
// panel holds camera views, the parts, the numbers and the Cycles renders.

import { createShowroom, PRESETS } from './showroom.js';
import { esc, $ } from './ui.js';

let sr = null;
let failed = false;
let layout = null;
let unsub = null;
let ctxRef = null;
let bar = null;
let box = null;
let lbIndex = -1;

const VIEW_LIST = [['hero', 'Hero'], ['top', 'Top'], ['edge', 'Edge on'], ['die', 'The die'], ['under', 'Underside'], ['life', 'Life size']];
const RENDERS = [
  ['hero', 'The finished package', 'The heat spreader is satin nickel with a laser-etched marking. The green is solder mask over the substrate’s copper.'],
  ['exploded', 'Pulled apart', 'Every layer lifted by the same offsets the Explode slider uses: substrate, underfill, die, indium, sealant, heat spreader.'],
  ['delid', 'Delidded', 'Heat spreader, sealant and indium removed, close in on the die and the epoxy fillet around it.'],
];

const firstSentence = (s) => (String(s).match(/^.*?[.!?](?=\s|$)/) || [s])[0];

function fmt(n, d = 1) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }); }

// --- Stage toolbar --------------------------------------------------------------

function buildBar(stage) {
  bar = document.createElement('div');
  bar.className = 'sr-bar-tools';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Showroom');
  bar.innerHTML = `
    <label class="sr-ex" for="sr-explode"><span>Explode</span><input type="range" id="sr-explode" min="0" max="1" step="0.01" value="0"></label>
    <button type="button" id="sr-lid" aria-pressed="true" title="Heat spreader on or off (L)">Lid</button>
    <button type="button" id="sr-flip" aria-pressed="false" title="Turn it over (F)">Turn over</button>
    <button type="button" id="sr-spin" aria-pressed="false" title="Turntable (R)">Turntable</button>
    <span class="sr-sep" aria-hidden="true"></span>
    <div class="sr-light" role="radiogroup" aria-label="Lighting">${Object.entries(PRESETS).map(([id, p]) =>
      `<button type="button" role="radio" aria-checked="false" data-preset="${id}" id="sr-p-${id}">${esc(p.name)}</button>`).join('')}</div>`;
  stage.appendChild(bar);
  bar.addEventListener('input', (ev) => { if (ev.target.id === 'sr-explode') sr.setExplode(+ev.target.value); });
  bar.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'sr-lid') sr.setLid(!sr.state.lid);
    else if (b.id === 'sr-flip') sr.setFlip(!sr.state.flipped);
    else if (b.id === 'sr-spin') sr.setSpin(!sr.state.spin);
    else if (b.dataset.preset) sr.preset(b.dataset.preset);
  });

  // A lightbox for the Cycles renders, over the live view so the two can be compared.
  box = document.createElement('figure');
  box.className = 'sr-lb';
  box.id = 'sr-lb';
  box.hidden = true;
  box.innerHTML = `<img id="sr-lb-img" alt=""><figcaption><b id="sr-lb-title"></b><span id="sr-lb-note"></span></figcaption>
    <button type="button" class="sr-lb-x" data-lb="close" aria-label="Close">×</button>
    <button type="button" class="sr-lb-nav prev" data-lb="prev" aria-label="Previous render">‹</button>
    <button type="button" class="sr-lb-nav next" data-lb="next" aria-label="Next render">›</button>`;
  stage.appendChild(box);
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-lb]');
    if (!b) return;
    if (b.dataset.lb === 'close') openRender(-1);
    else openRender((lbIndex + (b.dataset.lb === 'next' ? 1 : RENDERS.length - 1)) % RENDERS.length);
  });
}

function openRender(i) {
  lbIndex = i;
  if (!box) return;
  box.hidden = i < 0;
  if (bar) bar.hidden = i >= 0;
  if (sr && ctxRef) sr.pause(i >= 0);
  if (i < 0) return;
  const [id, title, note] = RENDERS[i];
  const img = box.querySelector('#sr-lb-img');
  img.src = `./blender/renders/${id}.jpg`;
  img.alt = `${title}: a Cycles render of the package`;
  box.querySelector('#sr-lb-title').textContent = `${title} · Cycles`;
  box.querySelector('#sr-lb-note').textContent = note;
}

// --- Panel ----------------------------------------------------------------------

function sync() {
  if (!sr || !ctxRef) return;
  const s = sr.state;
  if (bar) {
    bar.querySelector('#sr-explode').value = s.explode;
    bar.querySelector('#sr-lid').setAttribute('aria-pressed', String(s.lid));
    bar.querySelector('#sr-flip').setAttribute('aria-pressed', String(s.flipped));
    bar.querySelector('#sr-spin').setAttribute('aria-pressed', String(s.spin));
    for (const b of bar.querySelectorAll('[data-preset]')) b.setAttribute('aria-checked', String(b.dataset.preset === s.preset));
    for (const el of bar.querySelectorAll('input, button')) el.disabled = !s.ready;
  }
  const body = ctxRef.body;
  for (const b of body.querySelectorAll('[data-srview]')) b.setAttribute('aria-checked', String(b.dataset.srview === s.view));
  const list = $('#sr-parts');
  if (list && s.ready && !list.dataset.filled) {
    list.innerHTML = sr.parts.map((p) => `<li><button type="button" class="sr-part" data-srpart="${p.id}" id="sr-part-${p.id}">
        <b>${esc(p.label)}</b><span>${esc(firstSentence(p.info))}</span></button></li>`).join('');
    list.dataset.filled = '1';
  }
  for (const b of body.querySelectorAll('[data-srpart]')) b.classList.toggle('on', b.dataset.srpart === s.selected);
  const card = $('#sr-card');
  if (card) {
    const p = s.selected && sr.parts.find((q) => q.id === s.selected);
    card.hidden = !p;
    if (p && card.dataset.part !== p.id) {
      card.dataset.part = p.id;
      card.innerHTML = `<div class="pc-head"><b>${esc(p.label)}</b><button type="button" class="x" data-act="sr-clear" aria-label="Clear selection">×</button></div>
        <p>${esc(p.info)}</p>
        <p class="fine">${p.lid ? 'Comes off with the lid. ' : ''}${p.explode ? `Pulled apart, it moves ${fmt(Math.abs(p.explode))} mm ${p.explode > 0 ? 'up' : 'down'}.` : p.id === 'substrate' ? 'Everything else is pulled apart from this.' : 'It stays on the substrate when the layers are pulled apart.'}</p>`;
    }
    if (!p) card.dataset.part = '';
  }
  const status = $('#sr-status');
  if (status) status.innerHTML = s.error ? `<span class="badmark">✕</span> ${esc('The model could not be loaded.')}` : s.ready ? '' : 'Loading the model…';
  const spec = $('#sr-spec');
  if (spec && s.ready && !spec.dataset.filled) { spec.innerHTML = specHTML(); spec.dataset.filled = '1'; }
}

function specHTML() {
  const L = layout || {};
  const rows = [];
  if (L.sub) rows.push(['Substrate', `${fmt(L.sub)} × ${fmt(L.sub)} mm, ${fmt(L.sub_t, 2)} mm thick`]);
  if (L.die) rows.push(['Die', `${fmt(L.die[0])} × ${fmt(L.die[1])} mm, ${fmt(L.die[0] * L.die[1], 0)} mm², ${fmt(L.die_t, 2)} mm thick`]);
  if (L.pads) rows.push(['Contacts', `${L.pads.length.toLocaleString('en-US')} gold lands at ${fmt(L.pitch, 2)} mm pitch`]);
  if (L.caps_top) rows.push(['Capacitors', `${L.caps_top.length} on top, ${L.caps_bottom.length} underneath`]);
  if (L.flange) rows.push(['Heat spreader', `${fmt(L.flange)} mm flange, ${fmt(L.plateau)} mm top`]);
  const h = sr && sr.state.size;
  if (h) rows.push(['Overall height', `${fmt(h.y, 2)} mm, measured off the model`]);
  return rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('');
}

function onKey(ev) {
  if (!sr || !sr.state.ready || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  // Letters are free while a slider or button has focus; only text fields keep them.
  if (ev.target.closest('textarea, select, input:not([type="range"]):not([type="checkbox"]):not([type="radio"])')) return;
  const k = ev.key.toLowerCase();
  let handled = true;
  if (k === 'escape') { if (lbIndex >= 0) openRender(-1); else sr.select(null); }
  else if (lbIndex >= 0 && (k === 'arrowright' || k === 'arrowleft')) openRender((lbIndex + (k === 'arrowright' ? 1 : RENDERS.length - 1)) % RENDERS.length);
  else if (k === 'e') sr.setExplode(sr.state.explode > 0.5 ? 0 : 1);
  else if (k === 'l') sr.setLid(!sr.state.lid);
  else if (k === 'f' || k === 'u') sr.setFlip(!sr.state.flipped);
  else if (k === 'r') sr.setSpin(!sr.state.spin);
  else if (/^[1-6]$/.test(k)) sr.view(VIEW_LIST[+k - 1][0]);
  else if (k === '0') sr.view('hero');
  else handled = false;
  if (handled) ev.preventDefault();
}

export const showroomTab = {
  render() {
    return `
      <p class="lede">One CPU package, modelled in Blender the way real ones are built and lit like a product shot. Turn it, take the lid off, pull the layers apart, turn it over.</p>
      <p class="status" id="sr-status"></p>
      <h3>Camera</h3>
      <div class="seg wrap" role="radiogroup" aria-label="Camera">${VIEW_LIST.map(([id, name], i) =>
        `<button type="button" role="radio" aria-checked="false" data-srview="${id}" id="sr-v-${id}" title="${name} (${i + 1})">${name}</button>`).join('')}</div>
      <div class="partcard" id="sr-card" hidden></div>
      <h3>Parts, top to bottom</h3>
      <p class="fine">Click one here or on the model. Double-click on the model to fly in.</p>
      <ul class="sr-parts" id="sr-parts"><li class="fine">Loading…</li></ul>
      <h3>The package</h3>
      <table class="kv sr-spec"><tbody id="sr-spec"></tbody></table>
      <h3>Path-traced in Blender</h3>
      <p class="fine">The same model rendered offline in Cycles: light bounced until it settles, then denoised. The live view is a real-time approximation of it. Click one to see it over the live view.</p>
      <div class="sr-gallery">${RENDERS.map(([id, title], i) =>
        `<button type="button" class="sr-thumb" data-render="${i}" id="sr-r-${id}"><img src="./blender/renders/${id}.jpg" alt="${esc(title)}" loading="lazy"><span>${esc(title)}</span></button>`).join('')}</div>
      <h3>Open it in Blender</h3>
      <ol class="assume">
        <li>Open <code>blender/chip.blend</code> in Blender 5.0 or newer, which is what made it. Everything is in two collections, <i>Chip</i> and <i>Studio</i>, with three cameras and the materials set up for Cycles.</li>
        <li>Or rebuild it from nothing: in Blender's Scripting tab open <code>blender/make_chip.py</code> and press Run, or from a terminal<br><code>blender -b -P blender/make_chip.py -- --render</code></li>
        <li>The textures (marking, solder mask, die) are drawn by <code>blender/textures.py</code>, which needs Python with Pillow and NumPy. Change the engraving there.</li>
        <li><code>--export</code> rewrites <code>models/chip.glb</code>, which is what this page loads.</li>
      </ol>
      <h3>What’s real and what isn’t</h3>
      <ul class="assume">
        <li>The construction is how a desktop LGA package is made: an organic substrate under solder mask, a flip-chip die on solder bumps, underfill, an indium thermal layer, a sealant bead and a nickel-plated copper heat spreader. Sizes are typical of one.</li>
        <li>It is not a copy of any product. The name, marking and lot codes are invented.</li>
        <li>The die is drawn circuit side up so there is something to see. In a real flip chip the circuitry faces down onto the bumps, and what you would see with the lid off is the plain back of the silicon.</li>
        <li>The die pattern is an illustration of a floorplan (I/O down one edge, eight cores, shared cache between them), not a real layout.</li>
        <li>The live view approximates the renders: no bounced light, and shadows from one lamp.</li>
      </ul>`;
  },
  mount(ctx) {
    ctxRef = ctx;
    if (!sr && !failed) {
      try {
        sr = createShowroom(document.getElementById('viewport'));
        buildBar(document.getElementById('sr'));
        if (window.bitWidthLab) window.bitWidthLab.showroom = sr;
        fetch('./blender/layout.json').then((r) => (r.ok ? r.json() : null)).then((j) => { layout = j; const s = $('#sr-spec'); if (s) s.dataset.filled = ''; sync(); }).catch(() => {});
      } catch (err) {
        failed = true;
        console.error(err);
      }
    }
    if (!sr) {
      const s = $('#sr-status');
      if (s) s.textContent = 'This browser can’t draw WebGL here, so the live model is off. The renders below still work.';
    } else {
      sr.show();
      unsub = sr.onChange(sync);
      addEventListener('keydown', onKey);
    }
    ctx.body.onclick = (ev) => {
      const v = ev.target.closest('[data-srview]');
      if (v && sr) { sr.view(v.dataset.srview); return; }
      const p = ev.target.closest('[data-srpart]');
      if (p && sr) { sr.focusPart(p.dataset.srpart); return; }
      if (ev.target.closest('[data-act="sr-clear"]') && sr) { sr.select(null); return; }
      const r = ev.target.closest('[data-render]');
      if (r) {
        if (sr) openRender(+r.dataset.render);
        else window.open(r.querySelector('img').src, '_blank', 'noopener');
      }
    };
    sync();
  },
  unmount(ctx) {
    removeEventListener('keydown', onKey);
    if (unsub) { unsub(); unsub = null; }
    if (sr) sr.hide();
    openRender(-1);
    ctx.body.onclick = null;
    ctxRef = null;
  },
};
