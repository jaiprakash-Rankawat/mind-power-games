/* Hand-built SVG charts - no chart library, since a Manifest V3 extension may not
   load remote code. Marks use the brand accent (validated against the dark card
   surface); text uses text tokens only, never the series colour. Every value a
   chart shows is also printed elsewhere on the page, so hover never gates data. */

import { el } from './util.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function svgText(x, y, text, attrs = {}) {
  const t = svgEl('text', { x, y, ...attrs });
  t.textContent = text;                 // labels are data: never innerHTML
  return t;
}

/** One tooltip per chart: value leads, label follows. */
function createTip(host) {
  const value = el('b', { class: 'viz-tip-value' });
  const label = el('span', { class: 'viz-tip-label' });
  const tip = el('div', { class: 'viz-tip', role: 'status' }, value, label);
  host.append(tip);
  return {
    show(v, l, x, y) {
      value.textContent = v;
      label.textContent = l;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
      tip.classList.add('on');
    },
    hide() { tip.classList.remove('on'); }
  };
}

/* ------------------------------------------------------------------ radar */

/**
 * Single-series radar: the "shape" of a profile across abilities.
 * axes: [{ label, value (0-100) | null }]. With a missing value the shape is not
 * drawn at all - a polygon through an invented zero would misstate the profile.
 */
export function radarChart({ axes, size = 300, typical = [40, 60], emptyLabel = 'not played' }) {
  const host = el('div', { class: 'viz radar-viz' });
  // Side labels ("Visual Memory") need horizontal room a square box does not
  // give them, so the canvas is wider than the chart rather than the chart smaller.
  const W = size + 140;
  const H = size;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = H / 2 - 50;
  const n = axes.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => [cx + Math.cos(angle(i)) * R * (v / 100), cy + Math.sin(angle(i)) * R * (v / 100)];
  const ring = (v) => axes.map((_, i) => pt(i, v).map((c) => c.toFixed(1)).join(',')).join(' ');
  const ringPath = (v) => 'M' + axes.map((_, i) => pt(i, v).map((c) => c.toFixed(1)).join(',')).join('L') + 'Z';

  const complete = axes.every((a) => typeof a.value === 'number');
  // scales down with its column; the viewBox keeps the geometry intact
  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', style: `max-width:${W}px;height:auto`,
    'aria-label': 'Ability profile: ' + axes.map((a) => `${a.label} ${a.value ?? emptyLabel}`).join(', ')
  });

  // reference band, then hairline guides and spokes
  svg.append(svgEl('path', { d: ringPath(typical[1]) + ringPath(typical[0]), 'fill-rule': 'evenodd', class: 'viz-band' }));
  for (const v of [25, 50, 75, 100]) svg.append(svgEl('polygon', { points: ring(v), class: 'viz-grid' }));
  axes.forEach((_, i) => {
    const [x, y] = pt(i, 100);
    svg.append(svgEl('line', { x1: cx, y1: cy, x2: x.toFixed(1), y2: y.toFixed(1), class: 'viz-grid' }));
  });

  if (complete) {
    const shape = axes.map((a, i) => pt(i, a.value).map((c) => c.toFixed(1)).join(',')).join(' ');
    svg.append(svgEl('polygon', { points: shape, class: 'viz-area' }));
    svg.append(svgEl('polygon', { points: shape, class: 'viz-line' }));
  }

  const tip = createTip(host);

  axes.forEach((a, i) => {
    // label outside the rim, anchored away from the centre
    const [lx, ly] = pt(i, 100 + 1800 / R);
    const cos = Math.cos(angle(i));
    const sin = Math.sin(angle(i));
    const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
    const dy = sin < -0.3 ? -8 : sin > 0.3 ? 12 : 2;
    svg.append(svgText(lx.toFixed(1), (ly + dy).toFixed(1), a.label, { class: 'viz-axis-label', 'text-anchor': anchor }));
    svg.append(svgText(lx.toFixed(1), (ly + dy + 16).toFixed(1),
      typeof a.value === 'number' ? String(a.value) : emptyLabel,
      { class: typeof a.value === 'number' ? 'viz-axis-value' : 'viz-axis-muted', 'text-anchor': anchor }));

    if (!complete || typeof a.value !== 'number') return;
    const [x, y] = pt(i, a.value);
    svg.append(svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 4.5, class: 'viz-dot' }));

    // hit target well beyond the 9px mark, reachable by keyboard too
    const hit = svgEl('circle', {
      cx: x.toFixed(1), cy: y.toFixed(1), r: 14, class: 'viz-hit', tabindex: 0,
      'aria-label': `${a.label}: ${a.value}`
    });
    const show = () => {
      // viewBox units -> px, offset by where the centred svg sits in its host
      const sr = svg.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      const k = sr.width / W;
      tip.show(String(a.value), a.label, sr.left - hr.left + x * k, sr.top - hr.top + (y - 14) * k);
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('pointerleave', tip.hide);
    hit.addEventListener('blur', tip.hide);
    svg.append(hit);
  });

  host.prepend(svg);
  return host;
}

/* ------------------------------------------------------------------- line */

const fmtDay = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Single-series score trend on a fixed 0-100 axis, with the reference band shaded.
 * points: [{ ts, value }]. Crosshair snaps to the nearest day; arrow keys walk it.
 */
export function lineChart({ points, into, height = 230, typical = [40, 60], name = 'Score' }) {
  const host = el('div', { class: 'viz line-viz' });
  const data = points.filter((p) => typeof p.value === 'number');
  into.replaceChildren(host);

  if (data.length < 2) {
    host.append(el('p', { class: 'viz-empty',
      text: data.length
        ? 'One day recorded so far - play on another day to start a trend line.'
        : 'No scores yet - finish a round to start your trend.' }));
    return host;
  }

  const tip = createTip(host);
  let focusIdx = data.length - 1;

  function render() {
    host.querySelector('svg')?.remove();

    const width = Math.max(280, host.clientWidth || 600);
    const m = { top: 14, right: 44, bottom: 30, left: 34 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const t0 = data[0].ts;
    const t1 = data[data.length - 1].ts;
    const x = (ts) => m.left + ((ts - t0) / (t1 - t0)) * w;
    const y = (v) => m.top + (1 - v / 100) * h;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', tabindex: 0,
      'aria-label': `${name} over time, from ${data[0].value} to ${data[data.length - 1].value}`
    });

    // reference band and hairline grid, both recessive
    svg.append(svgEl('rect', { x: m.left, y: y(typical[1]), width: w, height: y(typical[0]) - y(typical[1]), class: 'viz-band' }));
    for (const v of [0, 25, 50, 75, 100]) {
      svg.append(svgEl('line', { x1: m.left, x2: m.left + w, y1: y(v), y2: y(v), class: 'viz-grid' }));
      svg.append(svgText(m.left - 8, y(v) + 4, String(v), { class: 'viz-tick', 'text-anchor': 'end' }));
    }

    // sparse date labels: first, last, and a middle one when there is room
    const ticks = [0, data.length - 1];
    if (data.length > 4 && w > 360) ticks.splice(1, 0, Math.floor((data.length - 1) / 2));
    for (const i of ticks) {
      const anchor = i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle';
      svg.append(svgText(x(data[i].ts), height - 8, fmtDay(data[i].ts), { class: 'viz-tick', 'text-anchor': anchor }));
    }

    const line = data.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
    const area = `${line}L${x(t1).toFixed(1)},${y(0)}L${x(t0).toFixed(1)},${y(0)}Z`;
    svg.append(svgEl('path', { d: area, class: 'viz-area' }));
    svg.append(svgEl('path', { d: line, class: 'viz-line' }));

    // end dot + the one direct label: the latest value
    const last = data[data.length - 1];
    svg.append(svgEl('circle', { cx: x(last.ts), cy: y(last.value), r: 4.5, class: 'viz-dot' }));
    svg.append(svgText(x(last.ts) + 10, y(last.value) + 4, String(last.value), { class: 'viz-end-label' }));

    // crosshair, snapped to the nearest recorded day
    const cross = svgEl('line', { y1: m.top, y2: m.top + h, class: 'viz-cross' });
    const marker = svgEl('circle', { r: 4.5, class: 'viz-dot viz-marker' });
    svg.append(cross, marker);

    function select(i) {
      focusIdx = i;
      const p = data[i];
      const px = x(p.ts);
      const py = y(p.value);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px);
      marker.setAttribute('cx', px); marker.setAttribute('cy', py);
      svg.classList.add('hovering');
      tip.show(String(p.value), fmtDay(p.ts), px, py - 14);
    }
    function clear() { svg.classList.remove('hovering'); tip.hide(); }

    const overlay = svgEl('rect', { x: m.left, y: m.top, width: w, height: h, class: 'viz-hit' });
    overlay.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * width;
      let best = 0;
      data.forEach((p, i) => { if (Math.abs(x(p.ts) - px) < Math.abs(x(data[best].ts) - px)) best = i; });
      select(best);
    });
    overlay.addEventListener('pointerleave', clear);
    svg.addEventListener('focus', () => select(focusIdx));
    svg.addEventListener('blur', clear);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); select(Math.max(0, focusIdx - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); select(Math.min(data.length - 1, focusIdx + 1)); }
    });
    svg.append(overlay);

    host.prepend(svg);
  }

  // Draw now, at the real pixel width (the host is already attached, so it has
  // one), rather than waiting on the render loop: rAF and ResizeObserver both stall
  // in a background tab. The observer then only handles later resizes.
  render();
  let lastWidth = host.clientWidth;
  new ResizeObserver(() => {
    if (host.clientWidth !== lastWidth) { lastWidth = host.clientWidth; render(); }
  }).observe(host);
  return host;
}

/* ------------------------------------------------------------------ meter */

/** 0-100 meter with the reference band marked on the track. */
export function meter(value, typical = [40, 60]) {
  const fill = el('span', { class: 'meter-fill' });
  const track = el('span', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100,
    'aria-valuenow': typeof value === 'number' ? value : null },
    fill,
    // drawn after the fill so the reference range stays visible once you pass it
    el('span', { class: 'meter-band', style: { left: typical[0] + '%', width: (typical[1] - typical[0]) + '%' } }));
  fill.style.width = (typeof value === 'number' ? value : 0) + '%';
  if (typeof value !== 'number') track.classList.add('empty');
  return track;
}
