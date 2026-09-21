/* The shared "game feel" shell: a board with an ambient glow that tints to the
   action, a particle layer, a damage flash and a callout chip. Every game builds
   its own content on top of this, so the three of them stay visually consistent. */

import { el } from './util.js';
import { createFx } from './fx.js';

export function createStage(extraClass = '') {
  const glowEl = el('div', { class: 'fx-glow' });
  const canvas = el('canvas', { class: 'fx-canvas' });
  const flashEl = el('div', { class: 'fx-flash' });
  const calloutEl = el('div', { class: 'callout' });
  const board = el('div', { class: ('board arcade ' + extraClass).trim() },
    glowEl, canvas, flashEl, calloutEl);

  const fx = createFx(canvas);
  const onResize = () => fx.resize();
  window.addEventListener('resize', onResize);

  return {
    board,
    fx,

    add(...nodes) { board.append(...nodes.filter(Boolean)); return this; },

    ready() { fx.resize(); },

    /** Ambient light behind the board, tinted to the colour in play. */
    tint(color) {
      glowEl.style.background = color
        ? `radial-gradient(closest-side, ${color}, transparent)`
        : '';
    },

    /** Particle spray centred on an element, in its own colour. */
    burstAt(node, color, count = 20) {
      if (!node) return;
      const n = node.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      fx.burst(n.left - c.left + n.width / 2, n.top - c.top + n.height / 2, color, count);
    },

    flashBad() {
      flashEl.classList.remove('go');
      void flashEl.offsetWidth;
      flashEl.classList.add('go');
    },

    shake(ms = 340) {
      board.classList.add('wrong');
      setTimeout(() => board.classList.remove('wrong'), ms);
    },

    /** Red pulse - last seconds on the clock, or last life. */
    danger(on) { board.classList.toggle('danger', !!on); },

    /** Milestone banner that pops in and fades out. */
    say(text) {
      calloutEl.textContent = text;
      calloutEl.classList.remove('show');
      void calloutEl.offsetWidth;
      calloutEl.classList.add('show');
    },

    destroy() {
      fx.stop();
      window.removeEventListener('resize', onResize);
    }
  };
}

/** The thin progress bar used under the HUD (combo, path progress, block progress). */
export function createMeter(label = '') {
  const fill = el('div', { class: 'combo-fill' });
  const text = el('span', { class: 'combo-label', text: label });
  const wrap = el('div', { class: 'combo' }, el('div', { class: 'combo-track' }, fill), text);
  return {
    wrap,
    set(pct, label) {
      fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
      if (label != null) text.textContent = label;
    }
  };
}

/** Results-screen link showing how this round moved the ability score. */
export function abilityChip(change) {
  if (!change || change.after === null) return null;
  const d = change.before === null ? null : change.after - change.before;
  const deltaText =
    d === null ? 'first score' :
    d === 0 ? 'no change' :
    (d > 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(d);
  return el('a', { class: 'ability-chip', href: 'profile.html', title: 'Open your mind profile' },
    el('span', { class: 'ac-name', text: change.ability }),
    el('b', { class: 'ac-score', text: String(change.after) }),
    el('span', { class: 'ac-delta' + (d > 0 ? ' up' : d < 0 ? ' down' : ''), text: deltaText }),
    change.provisional ? el('span', { class: 'ac-note', text: 'provisional' }) : null,
    el('span', { class: 'ac-link', text: 'Profile \u2192' })
  );
}

export function gradeChip(letter) {
  return el('span', { class: 'grade grade-' + letter.toLowerCase(), text: letter });
}

/** Confetti layer for a results panel. Call start() once the panel is on screen. */
export function resultFx(panel) {
  const canvas = el('canvas', { class: 'fx-canvas' });
  panel.prepend(canvas);
  const fx = createFx(canvas);
  return {
    start(colors) {
      requestAnimationFrame(() => { fx.resize(); fx.confetti(colors); });
    },
    stop() { fx.stop(); }
  };
}
