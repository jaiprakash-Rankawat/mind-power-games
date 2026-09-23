/* Shared screens for the newer games. They reproduce the original games' setup,
   countdown and results screens exactly (same classes, same behaviour), so all
   eleven games feel like one product. The three original games keep their own
   copies of this code untouched. */

import { el } from './util.js';
import { saveBest, getBest, recordRound } from './storage.js';
import { logRun } from './profile.js';
import { sfx } from './audio.js';
import { countUp } from './fx.js';
import { gradeChip, abilityChip, resultFx, CONFETTI } from './arcade.js';
import { randomSeed } from './rng.js';
import { howToPlayButton } from './tutorial.js';

/** Screen swapper with teardown, as each original game has. */
export function createScreens(root) {
  let teardown = null;
  return function setScreen(node, cleanup) {
    if (teardown) teardown();
    teardown = cleanup || null;
    root.textContent = '';
    root.append(node);
  };
}

export const officialOf = (ctx) => (ctx && ctx.official ? ctx.official : null);

/** Test settings: a mode, plus any per-test adjustments (e.g. the Daily Brain Check's shorter rounds). */
export const officialConfig = (modes, official) =>
  ({ ...(modes[official.difficulty] || modes.medium), ...(official.overrides || {}) });

/** Official runs use the session-derived seed; practice runs get a fresh one. */
export const seedFor = (ctx) => (officialOf(ctx) && typeof ctx.official.seed === 'number' ? ctx.official.seed : randomSeed());

/** Practice setup: rules, an optional demo, and one card per difficulty. */
export async function setupPanel({ gameId, title, lead, demo, rules, modes, bestText, onPick }) {
  const bests = {};
  for (const m of Object.values(modes)) bests[m.key] = await getBest(gameId, m.key);

  return el('div', { class: 'panel setup-panel' },
    howToPlayButton(gameId, { className: 'ghost-btn tut-open corner' }),
    el('h2', { text: title }),
    el('p', { class: 'lead', text: lead }),
    el('div', { class: 'rules' },
      demo ? el('div', { class: 'demo' }, demo) : null,
      el('ul', {}, rules.map((r) => el('li', { html: r })))
    ),
    el('div', { class: 'diffs' },
      Object.values(modes).map((cfg) => el('button', { class: 'diff', type: 'button', onclick: () => onPick(cfg) },
        el('b', { class: 'd-name', text: cfg.name }),
        el('span', { class: 'd-meta', text: cfg.meta }),
        el('span', { class: 'd-best', text: bests[cfg.key] ? bestText(bests[cfg.key]) : 'No score yet' })
      ))
    )
  );
}

/** 3-2-1-GO on an arcade board, then onGo(). */
export function countdown(setScreen, { note, onGo, minHeight = '380px' }) {
  const big = el('div', { class: 'big', text: '3' });
  const board = el('div', { class: 'board arcade', style: { minHeight } },
    el('div', { class: 'overlay' }, el('div', {}, big, el('div', { class: 'small', text: note }))));
  let n = 3;
  sfx.tick();
  const timer = setInterval(() => {
    n -= 1;
    if (n > 0) {
      big.textContent = String(n);
      big.classList.remove('tick'); void big.offsetWidth; big.classList.add('tick');
      sfx.tick();
      return;
    }
    clearInterval(timer);
    big.textContent = 'GO';
    sfx.start();
    setTimeout(onGo, 350);
  }, 650);
  setScreen(board, () => clearInterval(timer));
}

/**
 * The common end of a round: save the best, count the round, log the raw result,
 * then either hand it to the Brain Test or show the practice results screen.
 */
export async function completeRound({ ctx, gameId, cfg, result, showResults }) {
  const official = officialOf(ctx);
  const prevBest = await getBest(gameId, cfg.key);
  const isRecord = await saveBest(gameId, cfg.key, result);
  await recordRound(result.score);
  const change = await logRun(gameId, result,
    official ? { source: official.source || 'official', sessionId: official.sessionId } : {});
  if (official) { official.onComplete(result); return; }
  showResults({ isRecord, prevBest, change });
}

/** Results screen matching the original games'. Returns { node, cleanup }. */
export function resultsPanel({ subtitle, grade, headline, verdict, isRecord, prevBest, cfgName, score,
  change, stats, note, onAgain, onSetup, confettiColors }) {
  const scoreEl = el('div', { class: 'result-score', text: headline === undefined ? '0' : headline });
  const panel = el('div', { class: 'panel result-panel' },
    el('p', { class: 'result-sub', text: subtitle }),
    el('div', { class: 'grade-row' }, gradeChip(grade), scoreEl),
    el('p', { class: 'result-sub', text: verdict }),
    el('div', { class: 'center' },
      isRecord && score > 0
        ? el('span', { class: 'badge', text: 'NEW PERSONAL BEST' })
        : (prevBest ? el('span', { class: 'result-sub', text: 'Best on ' + cfgName + ': ' + prevBest.score }) : null)
    ),
    el('div', { class: 'center' }, abilityChip(change)),
    el('div', { class: 'grid4' },
      stats.map(([value, label]) => el('div', { class: 'box' }, el('b', { text: String(value) }), el('span', { text: label })))),
    note ? el('p', { class: 'foot-hint', text: note }) : null,
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary', type: 'button', onclick: onAgain }, 'Play again'),
      el('button', { class: 'btn', type: 'button', onclick: onSetup }, 'Change difficulty')),
    el('p', { class: 'foot-hint', text: 'Enter to play again - Esc for difficulty' })
  );

  const onKey = (e) => {
    if (e.key === 'Escape') { onSetup(); return; }
    if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); onAgain(); }
  };
  document.addEventListener('keydown', onKey);
  const confetti = resultFx(panel);
  if (headline === undefined) countUp(scoreEl, score, 900);
  if (isRecord && score > 0) confetti.start(confettiColors || CONFETTI);
  return { node: panel, cleanup: () => { document.removeEventListener('keydown', onKey); confetti.stop(); } };
}

/** Letter grade from the 0-100 ability score, shared by the newer games. */
export function gradeFromScore(s) {
  if (typeof s !== 'number') return 'D';
  return s >= 85 ? 'S' : s >= 70 ? 'A' : s >= 55 ? 'B' : s >= 40 ? 'C' : 'D';
}

/** Pause overlay used by the newer games; resume with Space or a click. */
export function pauseOverlay(onResume) {
  const node = el('div', { class: 'overlay', style: { cursor: 'pointer' } },
    el('div', {},
      el('div', { class: 'big', text: 'II' }),
      el('div', { class: 'small', text: 'Paused - press Space or click to resume' })));
  node.addEventListener('click', onResume);
  return node;
}
