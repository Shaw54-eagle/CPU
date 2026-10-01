// The Real chips tab: eleven processors from 1975 to 2021 at true scale,
// a Moore's-law plot of their transistor counts, and a wafer map.

import { REAL, SOURCES, area, density, processLabel, clockLabel } from './real.js';
import { bytesPow2 } from './model.js';
import { esc, $, sup } from './ui.js';

let selected = 'm1';

const byYear = [...REAL].sort((a, b) => a.year - b.year);
const big = (n) => (n >= 1e9 ? `${+(n / 1e9).toFixed(1)} billion` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)} million` : n.toLocaleString('en-US'));
const widthLabel = (r) => (r.simd ? '128-bit registers (SIMD)' : r.bits === 32 && r.bus === 16 ? '32-bit registers, 16-bit bus' : `${r.bits}-bit`);

// Moore's law, anchored on the 6502: doubling every two years.
const moore = (y) => 3510 * 2 ** ((y - 1975) / 2);

function chart() {
  const W = 400, H = 230, L = 46, R = 14, T = 12, B = 28;
  const x = (y) => L + ((y - 1972) / (2024 - 1972)) * (W - L - R);
  const y = (n) => T + (1 - (Math.log10(n) - 3) / 8) * (H - T - B);
  const ticks = [[1e3, '1k'], [1e5, '100k'], [1e7, '10M'], [1e9, '1B'], [1e11, '100B']];
  const years = [1975, 1985, 1995, 2005, 2015];
  const pts = byYear.filter((r) => r.transistors);
  const line = [1972, 2024].map((yr) => `${x(yr).toFixed(1)},${y(moore(yr)).toFixed(1)}`).join(' ');
  return `<svg class="moore" viewBox="0 0 ${W} ${H}" role="img" aria-label="Transistor count by year on a log scale, with a line doubling every two years">
    ${ticks.map(([n, l]) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(n)}" y2="${y(n)}"/><text class="axis" x="${L - 6}" y="${y(n) + 3.5}" text-anchor="end">${l}</text>`).join('')}
    ${years.map((yr) => `<text class="axis" x="${x(yr)}" y="${H - 9}" text-anchor="middle">${yr}</text>`).join('')}
    <line class="base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
    <polyline class="mooreline" points="${line}"/>
    <text class="mooretext" x="${x(1990)}" y="${y(moore(1990)) - 8}" text-anchor="middle" transform="rotate(-24 ${x(1990)} ${y(moore(1990)) - 8})">doubling every 2 years</text>
    ${pts.map((r) => `<g class="pt${r.id === selected ? ' on' : ''}" data-real="${r.id}" data-tip="${esc(`${r.name}, ${r.year}: ${big(r.transistors)} transistors`)}">
      <circle cx="${x(r.year)}" cy="${y(r.transistors)}" r="11" class="hit"/>
      <circle cx="${x(r.year)}" cy="${y(r.transistors)}" r="${r.id === selected ? 6.5 : 5}" class="dot s${r.bits}-fill"/>
      ${r.id === selected ? `<text class="ptlabel" x="${x(r.year) + (r.year > 2012 ? -9 : 9)}" y="${y(r.transistors) - 8}" text-anchor="${r.year > 2012 ? 'end' : 'start'}">${esc(r.name)}</text>` : ''}
    </g>`).join('')}
  </svg>`;
}

function card(r) {
  const d = density(r);
  const dens = d == null ? 'not published' : d >= 1e6 ? `${(d / 1e6).toFixed(1)} million / mm²` : `${Math.round(d).toLocaleString('en-US')} / mm²`;
  return `
    <div class="realcard">
      <div class="rc-head"><span class="sw s${r.bits}"></span><b>${esc(r.name)}</b><span>${r.year}</span></div>
      <div class="tablewrap"><table class="cmp spec"><tbody>
        <tr><th scope="row">Width</th><td>${widthLabel(r)}</td></tr>
        <tr><th scope="row">Address bus</th><td>${r.addr} bits · ${sup(bytesPow2(r.addr))}</td></tr>
        <tr><th scope="row">Transistors</th><td>${r.transistors ? big(r.transistors) : 'not published'}</td></tr>
        <tr><th scope="row">Process</th><td>${processLabel(r.process)}</td></tr>
        <tr><th scope="row">Die</th><td>${r.die[0]} × ${r.die[1]} mm · ${area(r).toFixed(area(r) < 10 ? 1 : 0)} mm²</td></tr>
        <tr><th scope="row">Density</th><td>${dens}</td></tr>
        <tr><th scope="row">Clock</th><td>${clockLabel(r)}</td></tr>
        ${r.pins ? `<tr><th scope="row">Package</th><td>${esc(r.pins)}</td></tr>` : ''}
        <tr><th scope="row">Used in</th><td>${esc(r.used)}</td></tr>
      </tbody></table></div>
      <p class="fine">${esc(r.note)}</p>
      <div class="wafer"><canvas id="wafer" width="300" height="300" aria-label="${esc(r.name)} dies on a 300 mm wafer"></canvas><p class="fine" id="wafer-note"></p></div>
    </div>`;
}

function drawWafer(r) {
  const cv = $('#wafer');
  if (!cv) return;
  const dpr = Math.min(devicePixelRatio, 2);
  const size = cv.clientWidth || 300;
  cv.width = size * dpr; cv.height = size * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const s = size / 310, c = size / 2, R = 150;
  g.clearRect(0, 0, size, size);
  g.fillStyle = css('--wafer');
  g.beginPath(); g.arc(c, c, R * s, 0, Math.PI * 2); g.fill();
  const [w, d] = r.die;
  const gap = 0.1;
  const col = css(`--s${r.bits}`);
  let count = 0;
  g.fillStyle = col;
  for (let yy = -R; yy < R; yy += d + gap) {
    for (let xx = -R; xx < R; xx += w + gap) {
      const corners = [[xx, yy], [xx + w, yy], [xx, yy + d], [xx + w, yy + d]];
      if (corners.every(([a, b]) => a * a + b * b <= (R - 3) ** 2)) {
        count++;
        g.globalAlpha = 0.85;
        g.fillRect(c + xx * s, c + yy * s, Math.max(0.5, w * s), Math.max(0.5, d * s));
      }
    }
  }
  g.globalAlpha = 1;
  g.strokeStyle = css('--ink-2'); g.lineWidth = 1;
  g.beginPath(); g.arc(c, c, R * s, 0, Math.PI * 2); g.stroke();
  // The notch that marks crystal orientation.
  g.fillStyle = css('--panel');
  g.beginPath(); g.arc(c, c + R * s, 3, 0, Math.PI * 2); g.fill();
  $('#wafer-note').innerHTML = `<b>${count.toLocaleString('en-US')}</b> whole dies fit on a 300 mm wafer if it were made today. Wafers in ${r.year} were ${r.year < 1980 ? 'three or four inches' : r.year < 1990 ? 'four to six inches' : r.year < 2002 ? '200 mm' : r.year < 2008 ? '200 or 300 mm' : '300 mm'} across.`;
}

function compare() {
  const a = REAL.find((r) => r.id === '6502'), m1 = REAL.find((r) => r.id === 'm1');
  return `${m1.name} has ${Math.round(m1.transistors / a.transistors).toLocaleString('en-US')} times the transistors of the ${a.name} on ${(area(m1) / area(a)).toFixed(0)} times the area. Its features are ${(a.process / m1.process).toLocaleString('en-US')} times smaller.`;
}

function rows() {
  return `<div class="tablewrap"><table class="cmp reallist"><thead><tr><th scope="col">Chip</th><th scope="col">Year</th><th scope="col">Bits</th><th scope="col">mm²</th><th scope="col">Transistors</th></tr></thead><tbody>
    ${byYear.map((r) => `<tr class="${r.id === selected ? 'on' : ''}" data-real="${r.id}" tabindex="0"><th scope="row"><span class="sw s${r.bits}"></span>${esc(r.name)}</th><td class="num">${r.year}</td><td class="num">${r.simd ? '128*' : r.bits}</td><td class="num">${area(r).toFixed(area(r) < 10 ? 1 : 0)}</td><td class="num">${r.transistors ? big(r.transistors).replace(' million', 'M').replace(' billion', 'B') : '—'}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function paint() {
  const r = REAL.find((x) => x.id === selected);
  $('#real-card').innerHTML = card(r);
  $('#real-chart').innerHTML = chart();
  $('#real-rows').innerHTML = rows();
  drawWafer(r);
}

export const realTab = {
  render() {
    return `
      <p class="lede">Eleven real processors, 1975 to 2021, laid out on a timeline at true relative scale. Click a die, a dot or a row.</p>
      <div id="real-card"></div>
      <h3>Transistors per chip</h3>
      <div id="real-chart" class="moorewrap"></div>
      <p class="fine">Log scale: each gridline is 100 times the one below. The line doubles every two years from the 6502, which is Gordon Moore’s 1975 prediction. ${compare()} The RP2040 is left off: its transistor count isn’t published.</p>
      <h3>All eleven</h3>
      <div id="real-rows"></div>
      <p class="fine">* The Emotion Engine is a 64-bit MIPS core with 128-bit registers for multimedia instructions. It is the closest thing to a 128-bit CPU that has shipped, and it is not one in the address sense.</p>
      <h3>Sources</h3>
      <ul class="sources">${SOURCES.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join('')}</ul>`;
  },
  mount(ctx) {
    paint();
    ctx.scene.selectReal(selected, { fly: false });
    ctx.body.onclick = (ev) => {
      const t = ev.target.closest('[data-real]');
      if (t) this.select(ctx, t.dataset.real);
    };
    ctx.body.onkeydown = (ev) => {
      const t = ev.target.closest('tr[data-real]');
      if (t && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); this.select(ctx, t.dataset.real); }
    };
  },
  unmount(ctx) {
    ctx.body.onclick = ctx.body.onkeydown = null;
    ctx.scene.selectReal(null);
  },
  select(ctx, id) {
    selected = id;
    if (ctx.current() !== 'real') return;
    paint();
    ctx.scene.selectReal(id);
    $('#real-card').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },
};
