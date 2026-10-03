// Line charts on canvas, for the stress test. One y-axis per chart, a faint
// grid, 2px lines, a crosshair and a tooltip that lists every series at the
// hovered moment. Series colours come from the page's CSS tokens.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function niceStep(range, target = 4) {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

export function lineChart(host, { title, unit, digits = 0, yMin = null, yMax = null, refs = [] }) {
  host.innerHTML = `<div class="chart-head"><b>${title}</b><span class="chart-unit">${unit}</span></div>
    <div class="chart-body"><canvas></canvas><div class="chart-tip" hidden></div></div>`;
  const canvas = host.querySelector('canvas');
  const tipEl = host.querySelector('.chart-tip');
  const g = canvas.getContext('2d');
  let data = { series: [], xMax: 1 };
  let hoverX = null;
  const pad = { l: 34, r: 30, t: 8, b: 18 };

  function scales() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const all = data.series.flatMap((s) => s.points.map((p) => p[1])).filter((v) => isFinite(v));
    let lo = yMin ?? Math.min(...all, ...refs.map((r) => r.y));
    let hi = yMax ?? Math.max(...all, ...refs.map((r) => r.y));
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-6) hi = lo + 1;
    const step = niceStep(hi - lo);
    lo = yMin ?? Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const x = (t) => pad.l + (t / data.xMax) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
    return { w, h, lo, hi, step, x, y };
  }

  function draw() {
    const dpr = Math.min(devicePixelRatio, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const s = scales();
    const ink2 = css('--ink-2'), muted = css('--muted'), line = css('--line');
    g.font = '10.5px "JetBrains Mono", ui-monospace, monospace';
    g.textBaseline = 'middle';
    // Grid and y ticks.
    for (let v = s.lo; v <= s.hi + 1e-9; v += s.step) {
      const yy = Math.round(s.y(v)) + 0.5;
      g.strokeStyle = line; g.lineWidth = 1;
      g.beginPath(); g.moveTo(pad.l, yy); g.lineTo(w - pad.r, yy); g.stroke();
      g.fillStyle = muted; g.textAlign = 'right';
      g.fillText(v.toFixed(s.step < 1 ? 1 : 0), pad.l - 6, yy);
    }
    // x ticks in seconds.
    const xs = niceStep(data.xMax, 4);
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let t = 0; t <= data.xMax + 1e-9; t += xs) {
      g.fillStyle = muted;
      g.fillText(t >= 60 && xs >= 60 ? `${t / 60}m` : `${t}s`, s.x(t), h - pad.b + 4);
    }
    // Reference lines.
    for (const r of refs) {
      const yy = Math.round(s.y(r.y)) + 0.5;
      g.strokeStyle = ink2; g.setLineDash([4, 4]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(pad.l, yy); g.lineTo(w - pad.r, yy); g.stroke();
      g.setLineDash([]);
      g.fillStyle = ink2; g.textAlign = 'right'; g.textBaseline = 'top';
      g.fillText(r.label, w - pad.r - 2, yy + 3);
    }
    // Series, with a direct label at each line's end.
    g.lineWidth = 2; g.lineJoin = 'round';
    const ends = [];
    for (const ser of data.series) {
      if (!ser.points.length) continue;
      g.strokeStyle = css(`--s${ser.key}`);
      g.beginPath();
      ser.points.forEach(([t, v], i) => (i ? g.lineTo(s.x(t), s.y(v)) : g.moveTo(s.x(t), s.y(v))));
      g.stroke();
      const [lt, lv] = ser.points[ser.points.length - 1];
      ends.push({ y: s.y(lv), x: s.x(lt), label: ser.tag, key: ser.key });
    }
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 11) ends[i].y = ends[i - 1].y + 11;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    for (const e of ends) {
      g.fillStyle = css(`--s${e.key}`);
      g.beginPath(); g.arc(e.x, Math.min(h - pad.b, e.y), 2.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = ink2;
      g.fillText(e.label, Math.min(e.x + 5, w - pad.r + 4), Math.min(h - pad.b, e.y));
    }
    // Crosshair.
    if (hoverX != null) {
      const xx = Math.round(s.x(hoverX)) + 0.5;
      g.strokeStyle = ink2; g.lineWidth = 1;
      g.beginPath(); g.moveTo(xx, pad.t); g.lineTo(xx, h - pad.b); g.stroke();
      for (const ser of data.series) {
        const p = nearest(ser.points, hoverX);
        if (!p) continue;
        g.fillStyle = css(`--s${ser.key}`);
        g.strokeStyle = css('--panel'); g.lineWidth = 2;
        g.beginPath(); g.arc(s.x(p[0]), s.y(p[1]), 4, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
  }

  function nearest(points, t) {
    let best = null, bd = Infinity;
    for (const p of points) { const d = Math.abs(p[0] - t); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  canvas.addEventListener('pointermove', (ev) => {
    const r = canvas.getBoundingClientRect();
    const s = scales();
    const t = ((ev.clientX - r.left - pad.l) / (s.w - pad.l - pad.r)) * data.xMax;
    if (t < 0 || t > data.xMax || !data.series.some((x) => x.points.length)) { hoverX = null; tipEl.hidden = true; draw(); return; }
    hoverX = t;
    const rows = data.series.map((ser) => {
      const p = nearest(ser.points, t);
      return p ? `<span><i style="background:var(--s${ser.key})"></i>${ser.tag}<b>${p[1].toFixed(digits)}</b></span>` : '';
    }).join('');
    const p0 = nearest(data.series[0].points, t);
    tipEl.innerHTML = `<em>${p0 ? p0[0].toFixed(0) : 0} s</em>${rows}`;
    tipEl.hidden = false;
    const left = ev.clientX - r.left + 12;
    tipEl.style.left = `${Math.min(left, r.width - tipEl.offsetWidth - 4)}px`;
    tipEl.style.top = '4px';
    draw();
  });
  canvas.addEventListener('pointerleave', () => { hoverX = null; tipEl.hidden = true; draw(); });
  new ResizeObserver(draw).observe(canvas);

  return {
    update(next) { data = next; draw(); },
    draw,
  };
}
