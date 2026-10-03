// The Timeline: eighty years of the CPU on one animated, scrubbable track.
//
// While this tab is open the 3D view steps aside and a stage takes its place:
// a rolling year counter, the era, four record counters, the track itself
// (drag it, wheel it, press play, or click an event) and a shelf of devices
// launched in the last few years, which slide in and out as time passes.
// The panel follows along with the event under the playhead.

import { EVENTS, ERAS, START, END, DEVICE_WINDOW, SOURCES, eraAt, recordsAt, devicesAt, currentEvent } from './timeline.js';
import { esc, $ } from './ui.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const KIND = { chip: 'Chip', idea: 'Architecture', process: 'Manufacturing' };
const SPEEDS = [[1, '1 yr/s'], [3, '3 yr/s'], [8, '8 yr/s']];

let T = EVENTS.find((e) => e.title === 'Intel 4004').t;
let tween = null;
let playing = false;
let speed = 3;
let filter = 'all';
let selected = null;          // an event the user picked; otherwise the one under the playhead
let stage = null;
let raf = 0, last = 0;
let PX = 72;
let ctxRef = null;
let shown = { year: null, era: null, event: null, devices: '' };
const tiles = {};

// --- Formatting --------------------------------------------------------------

const fmtTransistors = (n) => (n >= 1e9 ? `${+(n / 1e9).toFixed(n < 1e10 ? 1 : 0)} billion` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)} million` : Math.round(n).toLocaleString('en-US'));
const fmtProcess = (nm) => (nm >= 1000 ? `${+(nm / 1000).toFixed(1)} µm` : `${Math.round(nm)} nm`);
const fmtClock = (mhz) => (mhz < 1 ? `${Math.round(mhz * 1000)} kHz` : mhz < 1000 ? `${+mhz.toFixed(mhz < 10 ? 1 : 0)} MHz` : `${+(mhz / 1000).toFixed(2)} GHz`);
const dateOf = (e) => (e.m ? `${MONTHS[e.m - 1]} ${e.y}` : `${e.y}`);
const swatch = (bits) => (bits && bits !== 4 ? `s${bits}` : 'sbits4');

function shape(e) {
  const cls = e.kind === 'chip' ? `mk-chip ${swatch(e.bits)}` : `mk-${e.kind}`;
  return `<i class="mk ${cls}" aria-hidden="true"></i>`;
}

// Small line drawings of each kind of device.
const ICON = {
  calculator: '<rect x="6" y="3" width="12" height="18" rx="2"/><rect x="8.5" y="5.5" width="7" height="3"/><path d="M9 12h.01M12 12h.01M15 12h.01M9 15h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01M15 18h.01"/>',
  computer: '<rect x="3" y="3" width="18" height="12" rx="1.5"/><path d="M9 19h6M12 15v4M4 21h16"/>',
  console: '<rect x="3" y="9" width="18" height="9" rx="2"/><path d="M7 13.5h3M8.5 12v3M15 13h.01M17 15h.01"/><path d="M8 9V6h8v3"/>',
  handheld: '<rect x="6" y="2" width="12" height="20" rx="2"/><rect x="8" y="4.5" width="8" height="7"/><path d="M9 16h2M10 15v2M14.5 15.5h.01M16 17h.01"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/>',
  tablet: '<rect x="3.5" y="3" width="17" height="18" rx="2"/><path d="M11 18.5h2"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1"/><path d="M2.5 18.5h19l-2-3.5h-15z"/>',
  board: '<rect x="2.5" y="5" width="19" height="14" rx="1.5"/><rect x="9" y="9" width="6" height="6"/><path d="M10 9V7M12 9V7M14 9V7M10 17v-2M12 17v-2M14 17v-2"/>',
  player: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><rect x="8" y="4" width="8" height="6"/><circle cx="12" cy="15.5" r="3"/>',
};
const icon = (kind) => `<svg class="dev-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[kind] || ICON.computer}</svg>`;

// --- Stage --------------------------------------------------------------------

function buildStage() {
  stage = document.createElement('div');
  stage.className = 'tl';
  stage.id = 'tl';
  stage.innerHTML = `
    <div class="tl-top">
      <div class="tl-era"><span class="tl-k">Era</span><b id="tl-era"></b><span id="tl-era-note"></span></div>
      <div class="tl-year" id="tl-year" aria-live="polite" aria-label="Year">${[0, 1, 2, 3].map(() => `<span class="dg"><span class="strip">${'0123456789'.split('').map((d) => `<i>${d}</i>`).join('')}</span></span>`).join('')}</div>
      <div class="tl-ctrl">
        <button type="button" class="tl-btn" data-tl="prev" id="tl-prev" title="Previous event (←)" aria-label="Previous event">◀</button>
        <button type="button" class="tl-btn play" data-tl="play" id="tl-play" title="Play (space)">Play</button>
        <button type="button" class="tl-btn" data-tl="next" id="tl-next" title="Next event (→)" aria-label="Next event">▶</button>
        <span class="tl-speed" role="radiogroup" aria-label="Playback speed">${SPEEDS.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === speed}" data-speed="${v}" id="tl-speed-${v}">${l}</button>`).join('')}</span>
      </div>
    </div>
    <div class="tl-stats">
      ${['transistors', 'process', 'clock', 'bits'].map((k) => `<div class="tl-stat" id="tl-stat-${k}"><span class="tl-k">${{ transistors: 'Most transistors', process: 'Smallest process', clock: 'Fastest clock', bits: 'Widest integers' }[k]}</span><b>—</b><small>&nbsp;</small></div>`).join('')}
      <div class="tl-stat tl-moore"><span class="tl-k">Transistors, log scale</span><svg id="tl-moore" viewBox="0 0 200 64" preserveAspectRatio="none" aria-hidden="true"></svg></div>
    </div>
    <div class="tl-wrap" id="tl-wrap" tabindex="0" aria-label="Timeline. Drag or use the arrow keys.">
      <div class="tl-track" id="tl-track"></div>
      <div class="tl-headlabel" aria-hidden="true"><span id="tl-head-label"></span></div>
    </div>
    <div class="tl-shelf">
      <div class="tl-shelf-h"><span class="tl-k">Launched in the last ${DEVICE_WINDOW} years</span><span id="tl-shelf-count"></span></div>
      <div class="tl-devs" id="tl-devs"></div>
    </div>`;
  document.getElementById('viewport').appendChild(stage);
  for (const k of ['transistors', 'process', 'clock', 'bits']) {
    const el = stage.querySelector(`#tl-stat-${k}`);
    tiles[k] = { el, b: el.querySelector('b'), small: el.querySelector('small'), shown: null, target: null, from: null, t0: 0 };
  }
  layoutTrack();
  drawMoore();
  wireStage();
}

function layoutTrack() {
  const wrap = stage.querySelector('#tl-wrap');
  PX = Math.max(46, Math.min(96, wrap.clientWidth / 13));
  const track = stage.querySelector('#tl-track');
  const W = (END - START) * PX;
  const H = wrap.clientHeight;
  const axis = Math.round(H / 2);
  const CARD = 196, LANE = Math.max(44, Math.min(86, (H / 2 - 44) / 3));
  const lanes = [-1, 1, -2, 2, -3, 3];
  const ends = new Map(lanes.map((l) => [l, -Infinity]));
  const parts = [];
  // Era bands, with their names along the top.
  ERAS.forEach((era, i) => {
    parts.push(`<div class="tl-band${i % 2 ? ' alt' : ''}" style="left:${(era.from - START) * PX}px;width:${(era.to - era.from) * PX}px"><span>${esc(era.name)}</span></div>`);
  });
  // Year ticks.
  for (let y = START; y <= END; y++) {
    const x = (y - START) * PX;
    parts.push(`<div class="tl-tick${y % 5 ? '' : ' big'}" style="left:${x}px;top:${axis}px">${y % 5 ? '' : `<span>${y}</span>`}</div>`);
  }
  parts.push(`<div class="tl-axis" style="top:${axis}px;width:${W}px"></div>`);
  parts.push('<div class="tl-head" id="tl-head" aria-hidden="true"></div>');   // in the track, behind the cards
  // Events: a marker on the axis and a card in the first free lane.
  for (const e of EVENTS) {
    const x = (e.t - START) * PX;
    let lane = lanes.find((l) => ends.get(l) < x - 10);
    if (lane === undefined) lane = [...ends.entries()].sort((a, b) => a[1] - b[1])[0][0];
    ends.set(lane, x + CARD);
    const top = lane < 0 ? axis + lane * LANE - 26 : axis + (lane - 1) * LANE + 22;
    const stem = lane < 0 ? `top:${top + 40}px;height:${axis - top - 40}px` : `top:${axis}px;height:${top - axis}px`;
    parts.push(`<div class="tl-stem" data-e="${e.i}" style="left:${x}px;${stem}"></div>`);
    parts.push(`<div class="tl-mark" data-e="${e.i}" style="left:${x}px;top:${axis}px">${shape(e)}</div>`);
    parts.push(`<button type="button" class="tl-card k-${e.kind}" data-e="${e.i}" id="tl-ev-${e.i}" style="left:${x - 4}px;top:${top}px;width:${CARD - 16}px">
      <span class="tl-card-y">${shape(e)}${e.y}</span><span class="tl-card-t">${esc(e.title)}</span></button>`);
  }
  track.style.width = `${W}px`;
  track.innerHTML = parts.join('');
  applyFilter();
}

function drawMoore() {
  const svg = stage.querySelector('#tl-moore');
  const pts = EVENTS.filter((e) => e.chip && e.chip.transistors);
  const x = (y) => ((y - 1965) / (END - 1965)) * 200;
  const y = (n) => 60 - ((Math.log10(n) - 3) / 8) * 56;
  const line = [1971, END].map((yr) => `${x(yr).toFixed(1)},${y(2300 * 2 ** ((yr - 1971) / 2)).toFixed(1)}`).join(' ');
  svg.innerHTML = `<polyline class="ml" points="${line}"/>
    ${pts.map((e) => `<circle class="mp ${swatch(e.bits)}-fill" data-e="${e.i}" cx="${x(e.t).toFixed(1)}" cy="${y(e.chip.transistors).toFixed(1)}" r="2.2"/>`).join('')}
    <line class="mnow" id="tl-moore-now" x1="0" x2="0" y1="0" y2="64"/>`;
  svg.dataset.x0 = '1965';
}

// --- Frame ----------------------------------------------------------------------

const ease = (p) => 1 - (1 - p) ** 3;

function goTo(t, { animate = true } = {}) {
  t = Math.max(START + 0.5, Math.min(END - 0.05, t));
  if (!animate || reduce.matches) { T = t; tween = null; }
  else tween = { from: T, to: t, t0: performance.now(), dur: 700 };
  kick();
}

function kick() {
  if (!raf && stage) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

function frame(now) {
  raf = 0;
  if (!stage) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const before = T;
  if (tween) {
    const p = Math.min(1, (now - tween.t0) / tween.dur);
    T = tween.from + (tween.to - tween.from) * ease(p);
    if (p >= 1) tween = null;
  } else if (playing) {
    T += dt * speed;
    if (T >= END - 0.05) { T = END - 0.05; playing = false; }
  }
  render(before);
  const tilesMoving = Object.values(tiles).some((x) => x.target && now - x.t0 < 650);
  if (tween || playing || dragging || tilesMoving) raf = requestAnimationFrame(frame);
}

function render(before = T) {
  const wrap = stage.querySelector('#tl-wrap');
  const track = stage.querySelector('#tl-track');
  const center = wrap.clientWidth / 2;
  track.style.transform = `translateX(${center - (T - START) * PX}px)`;
  track.querySelector('#tl-head').style.left = `${(T - START) * PX}px`;

  // Rolling year digits.
  const year = Math.floor(T);
  if (year !== shown.year) {
    shown.year = year;
    String(year).padStart(4, '0').split('').forEach((d, i) => {
      stage.querySelectorAll('#tl-year .strip')[i].style.transform = `translateY(${-d}em)`;
    });
    stage.querySelector('#tl-year').setAttribute('aria-label', `Year ${year}`);
    updateDevices(year);
  }
  stage.querySelector('#tl-head-label').textContent = MONTHS[Math.min(11, Math.floor((T - year) * 12))].slice(0, 3) + ' ' + year;

  // Era, cross-faded when it changes.
  const era = eraAt(T);
  if (era !== shown.era) {
    shown.era = era;
    const b = stage.querySelector('#tl-era'), n = stage.querySelector('#tl-era-note');
    b.classList.remove('swap'); void b.offsetWidth; b.classList.add('swap');
    b.textContent = era.name;
    n.textContent = era.note;
  }

  // Cards: past, near, future; and a pop when the playhead crosses one.
  for (const e of EVENTS) {
    const near = Math.abs(e.t - T) < 1.2;
    const past = e.t <= T + 1e-6;
    const cls = `tl-card k-${e.kind}${past ? ' past' : ' future'}${near ? ' near' : ''}${selected === e ? ' sel' : ''}${filter !== 'all' && filter !== e.kind ? ' off' : ''}`;
    const card = stage.querySelector(`#tl-ev-${e.i}`);
    if (card.className !== cls) card.className = cls;
    if ((before < e.t && e.t <= T) || (before > e.t && e.t >= T)) {
      const mk = stage.querySelector(`.tl-mark[data-e="${e.i}"]`);
      mk.classList.remove('pop'); void mk.offsetWidth; mk.classList.add('pop');
    }
  }

  // Records, counted up (or down) to their new values.
  const rec = recordsAt(T);
  setTile('transistors', rec.transistors, (v) => fmtTransistors(v), true);
  setTile('process', rec.process, (v) => fmtProcess(v), true);
  setTile('clock', rec.clock, (v) => fmtClock(v), true);
  setTile('bits', rec.bits, (v) => `${Math.round(v)}-bit`, false);
  const now = performance.now();
  for (const tile of Object.values(tiles)) paintTile(tile, now);

  const svg = stage.querySelector('#tl-moore');
  const mx = ((T - 1965) / (END - 1965)) * 200;
  const ln = svg.querySelector('#tl-moore-now');
  ln.setAttribute('x1', mx); ln.setAttribute('x2', mx);
  svg.querySelectorAll('.mp').forEach((c) => c.classList.toggle('future', EVENTS[+c.dataset.e].t > T));

  // Panel follows the event under the playhead, unless one was picked.
  const cur = currentEvent(T);
  if (selected && Math.abs(selected.t - T) > 0.6 && !tween) selected = null;
  const show = selected || cur;
  if (show !== shown.event) {
    shown.event = show;
    paintPanel();
  }
}

function setTile(k, rec, format, log) {
  const tile = tiles[k];
  const v = rec ? rec.v : null;
  if (v === tile.target) return;
  tile.from = tile.shown ?? v;
  tile.target = v;
  tile.format = format;
  tile.log = log;
  tile.t0 = performance.now();
  tile.small.textContent = rec ? `${rec.e.title}, ${rec.e.y}` : 'none yet';
  tile.el.classList.remove('bump'); void tile.el.offsetWidth; if (v != null && tile.from != null && v !== tile.from) tile.el.classList.add('bump');
  kick();
}

function paintTile(tile, now) {
  if (tile.target == null) { tile.b.textContent = '—'; tile.shown = null; return; }
  const p = reduce.matches ? 1 : Math.min(1, (now - tile.t0) / 600);
  const e = ease(p);
  let v;
  if (tile.from == null || p >= 1) v = tile.target;
  else if (tile.log) v = 10 ** (Math.log10(tile.from) + (Math.log10(tile.target) - Math.log10(tile.from)) * e);
  else v = tile.from + (tile.target - tile.from) * e;
  tile.shown = v;
  tile.b.textContent = tile.format(v);
}

// Devices slide in when launched and fade out after the window closes.
function updateDevices(year) {
  const host = stage.querySelector('#tl-devs');
  const list = devicesAt(year + 0.999);
  const key = list.map((d) => d.name).join('|');
  if (key === shown.devices) return;
  shown.devices = key;
  const keep = new Set(list.map((d) => d.name));
  for (const el of [...host.children]) {
    if (!keep.has(el.dataset.name) && !el.classList.contains('leave')) {
      el.classList.add('leave');
      setTimeout(() => el.remove(), reduce.matches ? 0 : 320);
    }
  }
  list.forEach((d, i) => {
    let el = [...host.children].find((x) => x.dataset.name === d.name && !x.classList.contains('leave'));
    if (!el) {
      el = document.createElement('div');
      el.className = 'dev enter';
      el.dataset.name = d.name;
      el.innerHTML = `${icon(d.kind)}<div class="dev-t"><b>${esc(d.name)}</b><span>${d.y} · ${esc(d.cpu)}</span></div><span class="dev-w"><i class="sw ${swatch(d.bits)}"></i>${d.bits === 128 ? '128*' : d.bits}</span>`;
      el.style.transitionDelay = `${i * 40}ms`;
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('enter')));
    }
    el.style.order = String(i);
    if (el.parentElement !== host) host.appendChild(el);
  });
  stage.querySelector('#tl-shelf-count').textContent = list.length ? `${list.length} device${list.length > 1 ? 's' : ''}` : 'none yet: the microprocessor hasn’t arrived';
}

// --- Interaction ---------------------------------------------------------------

let dragging = false;

function wireStage() {
  const wrap = stage.querySelector('#tl-wrap');
  let startX = 0, startT = 0, moved = 0, downOn = null;
  wrap.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    dragging = true; moved = 0;
    downOn = ev.target.closest('[data-e]');
    startX = ev.clientX; startT = T;
    tween = null;
    wrap.setPointerCapture(ev.pointerId);
    wrap.classList.add('grabbing');
    kick();
  });
  wrap.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    moved = Math.max(moved, Math.abs(ev.clientX - startX));
    T = Math.max(START + 0.5, Math.min(END - 0.05, startT - (ev.clientX - startX) / PX));
    if (moved > 4) { playing = false; syncPlay(); }
    kick();
  });
  const end = (ev) => {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('grabbing');
    if (moved <= 4 && downOn) pick(EVENTS[+downOn.dataset.e]);
    downOn = null;
  };
  // Keyboard activation of a focused card (a real pointer click is handled above).
  wrap.addEventListener('click', (ev) => {
    if (ev.detail !== 0) return;
    const card = ev.target.closest('[data-e]');
    if (card) pick(EVENTS[+card.dataset.e]);
  });
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
  wrap.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
    tween = null;
    T = Math.max(START + 0.5, Math.min(END - 0.05, T + d / PX / 2));
    kick();
  }, { passive: false });
  stage.querySelector('.tl-ctrl').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.tl === 'play') togglePlay();
    else if (b.dataset.tl === 'prev') step(-1);
    else if (b.dataset.tl === 'next') step(1);
    else if (b.dataset.speed) {
      speed = +b.dataset.speed;
      for (const s of stage.querySelectorAll('[data-speed]')) s.setAttribute('aria-checked', String(s === b));
    }
  });
  stage.querySelector('#tl-moore').addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-e]');
    if (c) pick(EVENTS[+c.dataset.e]);
  });
  new ResizeObserver(() => { if (stage) { layoutTrack(); shown.event = null; render(); } }).observe(wrap);
}

function visible() {
  return EVENTS.filter((e) => filter === 'all' || e.kind === filter);
}

function step(dir) {
  playing = false; syncPlay();
  const list = visible();
  const ref = tween ? tween.to : T;
  const next = dir > 0 ? list.find((e) => e.t > ref + 1e-3) : [...list].reverse().find((e) => e.t < ref - 1e-3);
  if (next) pick(next);
}

function pick(e) {
  selected = e;
  shown.event = null;
  goTo(e.t + 0.001);
}

function togglePlay() {
  if (!playing && T >= END - 0.1) T = START + 0.5;
  playing = !playing;
  selected = null;
  tween = null;
  if (reduce.matches && playing) {
    // Without motion, play steps a year at a time.
    const stepYear = () => {
      if (!playing || !stage) return;
      T = Math.min(END - 0.05, Math.floor(T) + 1);
      render();
      if (T >= END - 0.05) { playing = false; syncPlay(); return; }
      setTimeout(stepYear, 900 / speed);
    };
    stepYear();
  } else kick();
  syncPlay();
}

function syncPlay() {
  const b = stage && stage.querySelector('#tl-play');
  if (b) b.textContent = playing ? 'Pause' : T >= END - 0.1 ? 'Replay' : 'Play';
}

function applyFilter() {
  if (!stage) return;
  stage.querySelectorAll('.tl-mark, .tl-stem').forEach((m) => m.classList.toggle('off', filter !== 'all' && EVENTS[+m.dataset.e].kind !== filter));
}

function onKey(ev) {
  if (!stage || ev.target.closest('input, textarea, select')) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === ' ') { ev.preventDefault(); togglePlay(); }
  else if (ev.key === 'ArrowRight' && !ev.target.closest('.tabs')) { ev.preventDefault(); step(1); }
  else if (ev.key === 'ArrowLeft' && !ev.target.closest('.tabs')) { ev.preventDefault(); step(-1); }
  else if (ev.key === 'Home') { ev.preventDefault(); pick(EVENTS[0]); }
  else if (ev.key === 'End') { ev.preventDefault(); pick(EVENTS[EVENTS.length - 1]); }
}

// --- Panel ------------------------------------------------------------------------

function paintPanel() {
  if (!ctxRef || ctxRef.current() !== 'timeline') return;
  const e = shown.event;
  const host = $('#tl-detail');
  if (!host) return;
  if (!e) {
    host.innerHTML = '<p class="fine">Before 1946. Drag the timeline or press Play.</p>';
  } else {
    const c = e.chip || {};
    const same = EVENTS.filter((x) => x.y === e.y && x !== e);
    host.innerHTML = `
      <div class="tl-event">
        <div class="tl-ev-k">${shape(e)}<span>${KIND[e.kind]}</span><span class="tl-ev-d">${dateOf(e)}</span></div>
        <h4>${esc(e.title)}</h4>
        <p class="tl-ev-who">${esc(e.who)}</p>
        <p>${esc(e.text)}</p>
        ${e.chip || e.bits ? `<div class="tablewrap"><table class="cmp spec"><tbody>
          ${e.bits ? `<tr><th scope="row">Width</th><td><span class="sw ${swatch(e.bits)}"></span> ${e.bits}-bit${e.bits === 128 ? ' registers (SIMD)' : ''}</td></tr>` : ''}
          ${c.transistors ? `<tr><th scope="row">Transistors</th><td>${fmtTransistors(c.transistors)}</td></tr>` : ''}
          ${c.process ? `<tr><th scope="row">Process</th><td>${fmtProcess(c.process)}</td></tr>` : ''}
          ${c.clockMHz ? `<tr><th scope="row">Clock</th><td>${fmtClock(c.clockMHz)}</td></tr>` : ''}
        </tbody></table></div>` : ''}
        ${same.length ? `<p class="fine">Also in ${e.y}: ${same.map((x) => `<button type="button" class="linkbtn" data-goe="${x.i}">${esc(x.title)}</button>`).join(', ')}</p>` : ''}
      </div>`;
  }
  const list = $('#tl-list');
  if (list) {
    for (const row of list.querySelectorAll('[data-goe]')) row.classList.toggle('on', e && +row.dataset.goe === e.i);
    const on = list.querySelector('.on');
    if (on && playing) on.scrollIntoView({ block: 'nearest' });
  }
}

function listHTML() {
  return ERAS.map((era) => {
    const items = EVENTS.filter((e) => e.t >= era.from && e.t < era.to && (filter === 'all' || e.kind === filter));
    if (!items.length) return '';
    return `<h3>${era.from}–${Math.min(era.to - 1, 2026)} · ${esc(era.name)}</h3>
      <ul class="tl-list">${items.map((e) => `<li><button type="button" data-goe="${e.i}" id="tl-row-${e.i}">${shape(e)}<span class="y">${e.y}</span><span class="t">${esc(e.title)}</span></button></li>`).join('')}</ul>`;
  }).join('');
}

export const timelineTab = {
  render() {
    return `
      <p class="lede">Eighty years of the CPU, from ENIAC to backside power. Drag the timeline, scroll it, press Play, or pick an event.</p>
      <div class="seg wrap" role="radiogroup" aria-label="Show">
        ${[['all', 'Everything'], ['chip', 'Chips'], ['idea', 'Architecture'], ['process', 'Manufacturing']].map(([k, l]) =>
          `<button type="button" role="radio" aria-checked="${filter === k}" data-filter="${k}" id="tl-f-${k}">${l}</button>`).join('')}
      </div>
      <div class="tl-key"><span>${shape({ kind: 'chip', bits: 64 })} Chip, coloured by width</span><span>${shape({ kind: 'idea' })} Architecture</span><span>${shape({ kind: 'process' })} Manufacturing</span></div>
      <div id="tl-detail"></div>
      <div id="tl-list">${listHTML()}</div>
      <h3>Reading the numbers</h3>
      <ul class="assume">
        <li>The four counters are records among the chips on this timeline, not every chip ever made.</li>
        <li>Process names below about 22 nm are product labels, not a length you could measure on the chip.</li>
        <li>The device shelf shows what launched in the previous ${DEVICE_WINDOW} years. Many stayed in use far longer.</li>
        <li>Dates are when a chip or device was announced or first shipped; where only the year is well documented, it sits mid-year.</li>
      </ul>
      <h3>Sources</h3>
      <ul class="sources">${SOURCES.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join('')}</ul>
      <p class="fine">Figures for the chips also on the Real chips tab come from that tab’s sources. The rest are as widely published.</p>`;
  },
  mount(ctx) {
    ctxRef = ctx;
    if (!stage) buildStage();
    stage.hidden = false;
    shown = { year: null, era: null, event: null, devices: '' };
    stage.querySelector('#tl-devs').innerHTML = '';
    for (const tile of Object.values(tiles)) { tile.target = undefined; tile.shown = null; }
    render();
    syncPlay();
    addEventListener('keydown', onKey);
    ctx.body.onclick = (ev) => {
      const f = ev.target.closest('[data-filter]');
      if (f) {
        filter = f.dataset.filter;
        for (const b of ctx.body.querySelectorAll('[data-filter]')) b.setAttribute('aria-checked', String(b === f));
        $('#tl-list').innerHTML = listHTML();
        applyFilter();
        shown.event = null;
        render();
        return;
      }
      const g = ev.target.closest('[data-goe]');
      if (g) pick(EVENTS[+g.dataset.goe]);
    };
  },
  unmount(ctx) {
    playing = false;
    cancelAnimationFrame(raf); raf = 0;
    removeEventListener('keydown', onKey);
    ctx.body.onclick = null;
    if (stage) stage.hidden = true;
  },
};
