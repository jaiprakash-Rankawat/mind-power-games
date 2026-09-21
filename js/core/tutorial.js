/* Interactive step-by-step tutorial overlay for each game.
   Shows once on first play; can be replayed from the setup screen. */

import { get, set } from './storage.js';
import { el } from './util.js';

const seenKey = (id) => `tutorial:seen:${id}`;

export async function hasSeenTutorial(gameId) {
  return !!(await get(seenKey(gameId), false));
}

export async function markTutorialSeen(gameId) {
  await set(seenKey(gameId), true);
}

/**
 * Show a multi-step tutorial overlay.
 * @param {HTMLElement} root - parent to mount the overlay on (usually document.body)
 * @param {string} gameId
 * @param {Array<{title:string, text:string, buildDemo:(container:HTMLElement)=>Function|void}>} steps
 * @returns {Promise<void>} resolves when the user finishes or skips
 */
export function showTutorial(root, gameId, steps) {
  return new Promise((resolve) => {
    let current = 0;
    let demoCleanup = null;

    const dots = steps.map((_, i) =>
      el('span', { class: 'tut-dot' + (i === 0 ? ' on' : '') })
    );
    const dotsWrap = el('div', { class: 'tut-dots' }, dots);
    const demoArea = el('div', { class: 'tut-demo' });
    const titleEl = el('h3', { class: 'tut-title' });
    const textEl = el('p', { class: 'tut-text' });
    const nextBtn = el('button', { class: 'btn primary', type: 'button' });
    const skipBtn = el('button', { class: 'tut-skip', type: 'button', text: 'Skip tutorial' });

    const card = el('div', { class: 'tut-card' },
      skipBtn, dotsWrap, demoArea, titleEl, textEl,
      el('div', { class: 'tut-nav' }, nextBtn)
    );
    const overlay = el('div', { class: 'tut-overlay' }, card);

    function renderStep() {
      const step = steps[current];
      dots.forEach((d, i) => d.classList.toggle('on', i === current));
      titleEl.textContent = step.title;
      textEl.innerHTML = step.text;
      nextBtn.textContent = current === steps.length - 1 ? 'Got it \u2014 play!' : 'Next \u2192';
      if (demoCleanup) { demoCleanup(); demoCleanup = null; }
      demoArea.textContent = '';
      if (step.buildDemo) {
        const ret = step.buildDemo(demoArea);
        if (typeof ret === 'function') demoCleanup = ret;
      }
    }

    function teardown() {
      if (demoCleanup) { demoCleanup(); demoCleanup = null; }
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }

    async function finish() {
      teardown();
      await markTutorialSeen(gameId);
      resolve();
    }

    function advance() {
      if (++current >= steps.length) { finish(); return; }
      renderStep();
    }

    function onKey(e) {
      if (e.key === 'Enter' || e.code === 'Space' || e.key === 'ArrowRight') {
        e.preventDefault(); advance();
      } else if (e.key === 'Escape') {
        e.preventDefault(); finish();
      }
    }

    nextBtn.addEventListener('click', advance);
    skipBtn.addEventListener('click', finish);
    document.addEventListener('keydown', onKey);

    renderStep();
    root.append(overlay);
  });
}
