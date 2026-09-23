/* The big "you scored X out of 100" ring on the Brain Test and Daily Brain Check
   results. The arc sweeps round while the number counts up, then settles with a
   pulse. The faint segment on the ring is the reference range (40-60), as on
   every meter and chart. Styles live in css/test.css, which both pages load. */

import { el } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A 0-100 score ring. `play()` animates it from 0; without it the ring shows the final score. */
export function scoreRing(score, { typical = [40, 60] } = {}) {
  const has = typeof score === 'number';
  const ring = (cls) => svgEl('circle', { class: cls, cx: 100, cy: 100, r: 86, pathLength: 100 });

  const arc = ring('sr-arc');
  arc.style.strokeDashoffset = String(has ? 100 - score : 100);
  if (!has || score <= 0) arc.style.visibility = 'hidden';   // a round cap would still draw a dot

  const band = ring('sr-band');
  band.setAttribute('stroke-dasharray', `${typical[1] - typical[0]} ${100 - (typical[1] - typical[0])}`);
  band.setAttribute('stroke-dashoffset', String(-typical[0]));

  const grad = svgEl('linearGradient', { id: 'srGrad', x1: 0, y1: 0, x2: 1, y2: 1 });
  grad.append(svgEl('stop', { offset: '0%', class: 'sr-g1' }), svgEl('stop', { offset: '100%', class: 'sr-g2' }));
  const defs = svgEl('defs');
  defs.append(grad);

  const svg = svgEl('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true' });
  const turn = svgEl('g', { transform: 'rotate(-90 100 100)' });   // start at twelve o'clock
  turn.append(ring('sr-track'), arc, band);
  svg.append(defs, turn);

  const num = el('span', { class: 'sr-num', text: has ? String(score) : '—' });
  const node = el('div', {
    class: 'sr-ring' + (has ? '' : ' empty'),
    role: 'img',
    'aria-label': has ? `Score: ${score} out of 100` : 'No score'
  },
    svg,
    el('span', { class: 'sr-center', 'aria-hidden': 'true' },
      num,
      el('span', { class: 'sr-of', text: 'out of 100' })));

  return {
    node,

    /** Sweep from 0 to the score; `onLanded` runs when it arrives (at once if there is nothing to animate). */
    play({ delay = 350, ms = 1600, onLanded = null } = {}) {
      if (!has || score <= 0 || prefersReducedMotion()) {
        if (onLanded) onLanded();
        return;
      }
      const paint = (v) => {
        arc.style.strokeDashoffset = String(100 - v);
        num.textContent = String(Math.round(v));
      };
      let done = false;
      const land = () => {
        if (done) return;
        done = true;
        paint(score);
        node.classList.add('landed');
        if (onLanded) onLanded();
      };

      paint(0);
      arc.style.visibility = 'hidden';
      setTimeout(() => {
        arc.style.visibility = '';
        // rAF stops in a hidden tab, so a timer makes sure the score still lands.
        const settle = setTimeout(land, ms + 150);
        const t0 = performance.now();
        const step = (now) => {
          if (done) return;
          const k = Math.min(1, (now - t0) / ms);
          paint(score * (1 - Math.pow(1 - k, 3)));        // ease-out: fast start, gentle landing
          if (k < 1) requestAnimationFrame(step);
          else { clearTimeout(settle); land(); }
        };
        requestAnimationFrame(step);
      }, delay);
    }
  };
}
