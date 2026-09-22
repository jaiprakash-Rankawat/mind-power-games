/* Brain Level display: the level badge and the XP bar to the next level. Shared by
   the popup, the profile page and the Daily Brain Check results. */

import { el } from './util.js';
import { stepXp } from './daily.js';

function paint(bar, info) {
  bar.querySelector('.lv-num').textContent = String(info.level);
  bar.querySelector('.lv-fill').style.width = Math.round((info.into / info.need) * 100) + '%';
  bar.querySelector('.lv-text').textContent = `${info.into} / ${info.need} XP to level ${info.level + 1}`;
  bar.setAttribute('aria-label', `Brain Level ${info.level}: ${info.into} of ${info.need} XP to the next level`);
}

/** info: { level, into, need } from levelFor(). */
export function levelBar(info, { compact = false } = {}) {
  const bar = el('div', { class: 'lv' + (compact ? ' compact' : ''), role: 'img' },
    el('span', { class: 'lv-badge' },
      el('span', { class: 'lv-label', text: 'Level' }),
      el('b', { class: 'lv-num' })),
    el('span', { class: 'lv-main' },
      el('span', { class: 'lv-track' }, el('span', { class: 'lv-fill' })),
      el('span', { class: 'lv-text' }))
  );
  paint(bar, info);
  return bar;
}

/**
 * Fills the bar from `from` to `to`, rolling over once per level gained.
 * onLevelUp(level) fires as each new level is reached.
 */
export function animateLevel(bar, from, to, onLevelUp) {
  const fill = bar.querySelector('.lv-fill');
  let level = from.level;
  const step = () => {
    if (level >= to.level) { paint(bar, to); return; }
    fill.style.width = '100%';
    setTimeout(() => {
      level += 1;
      fill.style.transition = 'none';
      paint(bar, { level, into: 0, need: stepXp(level) });
      void fill.offsetWidth;                  // commit the empty bar before filling again
      fill.style.transition = '';
      if (onLevelUp) onLevelUp(level);
      setTimeout(step, 250);
    }, 850);
  };
  paint(bar, from);
  setTimeout(step, 400);
}
