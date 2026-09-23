/* The how-to-play tutorial: three steps per game.

   1. How it works - the goal in one sentence, and a worked example that shows the
      right answer next to the tempting wrong one.
   2. Try it       - a few practice questions in the game's own look. A wrong
      answer explains why, and the player tries again.
   3. Ready        - the controls and how the score works, then play.

   It opens by itself the first time a game is played (practice, Daily Brain Check
   or Brain Test) and again from any "How to play" button. Content lives in
   core/tutorials.js; this file is the overlay and the practice plumbing. */

import { get, set } from './storage.js';
import { el } from './util.js';
import { iconSvg } from './icons.js';
import { getGame } from './games.js';
import { TUTORIALS } from './tutorials.js';

const seenKey = (id) => `tutorial:seen:${id}`;

export async function hasSeenTutorial(gameId) {
  return !!(await get(seenKey(gameId), false));
}

export async function markTutorialSeen(gameId) {
  await set(seenKey(gameId), true);
}

export const hasTutorial = (gameId) => !!TUTORIALS[gameId];

/** Opens the tutorial the first time a game comes up; resolves when it closes. */
export async function showTutorialOnce(gameId) {
  if (hasTutorial(gameId) && !(await hasSeenTutorial(gameId))) await showTutorial(gameId);
}

/** A "How to play" button that reopens the tutorial. */
export function howToPlayButton(gameId, { className = 'ghost-btn tut-open' } = {}) {
  if (!hasTutorial(gameId)) return null;
  return el('button', { class: className, type: 'button', onclick: (e) => { e.currentTarget.blur(); showTutorial(gameId); } },
    el('span', { 'aria-hidden': 'true', text: '?' }), ' How to play');
}

const STEPS = ['How it works', 'Try it', 'Ready'];

/** Shows the tutorial overlay. Resolves when the player finishes or skips it. */
export function showTutorial(gameId, { root = document.body } = {}) {
  const tut = TUTORIALS[gameId];
  const game = getGame(gameId);
  if (!tut || !game) return Promise.resolve();

  return new Promise((resolve) => {
    let step = 0;
    let stepCleanup = null;
    let stepKey = null;              // the practice step's own key handler
    let timers = [];
    let practiceDone = false;
    const opener = document.activeElement;

    const stepper = el('ol', { class: 'tut-steps' },
      STEPS.map((label, i) => el('li', { class: 'tut-step' }, el('span', { class: 'tut-step-n', text: String(i + 1) }), label)));
    const body = el('div', { class: 'tut-body' });
    const backBtn = el('button', { class: 'btn tut-back', type: 'button' }, '← Back');
    const skipBtn = el('button', { class: 'link-btn tut-skip', type: 'button' });
    const nextBtn = el('button', { class: 'btn primary tut-next', type: 'button' });

    const card = el('div', { class: 'tut-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': `How to play ${game.name}` },
      el('div', { class: 'tut-head' },
        el('span', { class: 'tut-icon', 'aria-hidden': 'true', html: iconSvg(gameId) }),
        el('div', { class: 'tut-head-text' },
          el('span', { class: 'tut-kicker', text: 'How to play' }),
          el('b', { class: 'tut-game', text: game.name })),
        el('button', { class: 'tut-close', type: 'button', 'aria-label': 'Close', onclick: () => finish() }, '✕')),
      stepper,
      body,
      el('div', { class: 'tut-foot' }, backBtn, skipBtn, nextBtn)
    );
    const overlay = el('div', { class: 'tut-overlay' }, card);

    /* --- timers and cleanup, reset on every step --- */
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    function clearStep() {
      timers.forEach(clearTimeout);
      timers = [];
      stepKey = null;
      if (stepCleanup) { stepCleanup(); stepCleanup = null; }
    }

    /* --- the three steps --- */
    function learnStep() {
      const visual = el('div', { class: 'tut-visual' });
      body.replaceChildren(
        el('p', { class: 'tut-goal', html: tut.goal }),
        visual,
        el('p', { class: 'tut-text', html: tut.explain })
      );
      stepCleanup = tut.learn(visual, { later }) || null;
      skipBtn.textContent = 'Skip tutorial';
      nextBtn.textContent = 'Try it →';
      nextBtn.hidden = false;
    }

    function tryStep() {
      practiceDone = false;
      const need = tut.practice.goal;
      let got = 0;
      const pips = el('span', { class: 'tut-pips', 'aria-hidden': 'true' },
        Array.from({ length: need }, () => el('span', { class: 'tut-pip' })));
      const count = el('span', { class: 'tut-count', text: `0 of ${need} right` });
      const prompt = el('p', { class: 'tut-prompt', text: tut.practice.intro });
      const stage = el('div', { class: 'tut-visual tut-play' });
      const feedback = el('p', { class: 'tut-feedback', role: 'status', 'aria-live': 'polite' });
      body.replaceChildren(
        el('div', { class: 'tut-try-head' }, el('b', { text: 'Your turn' }), pips, count),
        prompt, stage, feedback);

      const show = (cls, html) => { feedback.className = 'tut-feedback ' + cls; feedback.innerHTML = html; };
      const api = {
        later,
        say: (html) => { prompt.innerHTML = html; },
        right(html) {
          got = Math.min(need, got + 1);
          pips.children[got - 1].classList.add('on');
          count.textContent = `${got} of ${need} right`;
          show('good', '✓ ' + html);
          if (got >= need && !practiceDone) {
            practiceDone = true;
            later(() => {
              show('good', '✓ ' + html + ' <b>You\'ve got it.</b>');
              nextBtn.hidden = false;
              skipBtn.textContent = '';
              nextBtn.focus();
            }, 250);
          }
          return got >= need;
        },
        wrong(html) { show('bad', '✗ ' + html); },
        hint(html) { show('', html); },
        onKey(fn) { stepKey = fn; },
        get done() { return practiceDone; }
      };
      nextBtn.textContent = 'Next →';
      nextBtn.hidden = true;
      skipBtn.textContent = 'Skip practice';
      stepCleanup = tut.practice.start(stage, api) || null;
    }

    function readyStep() {
      body.replaceChildren(
        el('p', { class: 'tut-goal', text: 'Ready to play' }),
        el('ul', { class: 'tut-ready' }, tut.ready.map((line) => el('li', { html: line })))
      );
      skipBtn.textContent = '';
      nextBtn.textContent = 'Start playing';
      nextBtn.hidden = false;
    }

    function render() {
      clearStep();
      [...stepper.children].forEach((li, i) => {
        li.classList.toggle('on', i === step);
        li.classList.toggle('done', i < step);
      });
      backBtn.hidden = step === 0;
      skipBtn.hidden = false;
      [learnStep, tryStep, readyStep][step]();
      skipBtn.hidden = !skipBtn.textContent;
      if (!nextBtn.hidden && step !== 1) nextBtn.focus();
    }

    function go(to) {
      step = Math.max(0, Math.min(STEPS.length - 1, to));
      render();
    }

    async function finish() {
      clearStep();
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      await markTutorialSeen(gameId);
      if (opener && opener.focus && document.contains(opener)) opener.focus();
      resolve();
    }

    /* Captured first, so the game underneath never sees these keys. */
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); return; }
      if (step === 1 && !practiceDone && stepKey) { e.stopPropagation(); stepKey(e); return; }
      if (e.key === 'Enter' && !nextBtn.hidden) { e.preventDefault(); e.stopPropagation(); nextBtn.click(); return; }
      e.stopPropagation();
    }

    nextBtn.addEventListener('click', () => { if (step >= STEPS.length - 1) finish(); else go(step + 1); });
    backBtn.addEventListener('click', () => go(step - 1));
    skipBtn.addEventListener('click', () => { if (step === 1) go(2); else finish(); });
    document.addEventListener('keydown', onKey, true);

    root.append(overlay);
    render();
  });
}
