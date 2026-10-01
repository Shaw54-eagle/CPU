// Small shared pieces for the panel: escaping, tables, bars, tooltips, state.

import { CHIPS, WIDTHS, chip, DEFAULT_CONFIG } from './model.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const sup = (s) => String(s).replace(/\^(\d+)/g, '<sup>$1</sup>');
export const fmt = (n, d = 1) => n.toFixed(d);

// --- Bench state: the five lineup chips, plus the one you build ------------

const CUSTOM_KEY = 'bitwidth-custom';
const DEFAULT_CUSTOM = { w: 64, cores: 8, l2KB: 1024, l3MB: 16, clockGHz: 3.6, node: '5nm', name: 'My chip' };

function loadCustom() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null');
    if (saved && saved.cfg) return saved;
  } catch { /* storage may be blocked */ }
  return { cfg: { ...DEFAULT_CUSTOM }, on: false };
}

const saved = loadCustom();
export const app = {
  customCfg: saved.cfg,
  customOn: saved.on,
  custom: null,
};

export function buildCustom() {
  app.custom = chip({ ...DEFAULT_CONFIG, ...app.customCfg, custom: true, key: 'custom' });
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify({ cfg: app.customCfg, on: app.customOn })); } catch { /* fine */ }
  return app.custom;
}
buildCustom();

export function benchChips() {
  const list = WIDTHS.map((w) => CHIPS[w]);
  if (app.customOn) list.push(app.custom);
  return list;
}

const listeners = new Set();
export const onBenchChange = (f) => listeners.add(f);
export const benchChanged = () => listeners.forEach((f) => f());

export const tag = (c) => (c.custom ? 'You' : String(c.w));

// --- Tables and bars ---------------------------------------------------------

export function table(chips, rows, caption = '') {
  const head = chips.map((c) => `<th scope="col"><span class="sw s${c.key}"></span>${esc(tag(c))}</th>`).join('');
  const body = rows.map((r) => {
    const cells = chips.map((c, i) => `<td class="num">${r.values[i]}${r.unit ? `<small>${r.unit}</small>` : ''}</td>`).join('');
    return `<tr><th scope="row">${r.label}${r.note ? `<span class="rownote">${r.note}</span>` : ''}</th>${cells}</tr>`;
  }).join('');
  return `<div class="tablewrap"><table class="cmp">${caption ? `<caption>${caption}</caption>` : ''}
    <thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// Horizontal bars, one per chip, scaled to the largest value. Text stays in ink;
// the bar carries the colour. A null value draws an empty track and its label.
export function bars(chips, values, { fmt: f = (v) => v.toFixed(1), unit = '', max = null, tips = [], empty = '—' } = {}) {
  const top = max ?? Math.max(...values.filter((v) => v != null && isFinite(v)));
  return `<div class="bars">${chips.map((c, i) => {
    const v = values[i];
    const ok = v != null && isFinite(v) && v > 0;
    const pct = ok ? Math.max(1.5, (v / top) * 100) : 0;
    return `<div class="bar" data-tip="${esc(tips[i] || '')}">
      <span class="bl">${esc(tag(c))}</span>
      <span class="track"><span class="fill s${c.key}" style="width:${pct}%"></span></span>
      <span class="bv">${ok || v === 0 ? `${f(v)}${unit ? ` <small>${unit}</small>` : ''}` : `<em>${empty}</em>`}</span>
    </div>`;
  }).join('')}</div>`;
}

export function legend(chips, note = '') {
  return `<div class="legend">${chips.map((c) => `<span><span class="sw s${c.key}"></span>${esc(c.custom ? c.short : c.short)}</span>`).join('')}${note ? `<span class="legnote">${note}</span>` : ''}</div>`;
}

// --- Tooltip for anything with data-tip --------------------------------------

let tipEl;
export function wireTips(root) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip panel-tip';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  root.addEventListener('pointerover', (ev) => {
    const b = ev.target.closest('[data-tip]');
    if (!b || !b.dataset.tip) { tipEl.hidden = true; return; }
    tipEl.textContent = b.dataset.tip;
    tipEl.hidden = false;
    const r = b.getBoundingClientRect();
    tipEl.style.left = `${Math.max(8, Math.min(r.left, innerWidth - tipEl.offsetWidth - 12))}px`;
    tipEl.style.top = `${r.top - tipEl.offsetHeight - 6 < 8 ? r.bottom + 6 : r.top - tipEl.offsetHeight - 6}px`;
  });
  root.addEventListener('pointerleave', () => { tipEl.hidden = true; });
  root.addEventListener('scroll', () => { tipEl.hidden = true; }, { passive: true, capture: true });
}
