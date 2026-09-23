/* Brain Test runner: the official, fixed-order session.

   intro -> [instructions -> game] x N -> Brain Profile

   Games are mounted with an `official` context: fixed settings, no difficulty
   screen, and an onComplete hand-off instead of their own results screen. The
   session is saved after every game starts and ends (see core/session.js), so the
   player can close the tab and resume at the next unfinished game. */

import { getGame } from './core/games.js';
import { el } from './core/util.js';
import { iconSvg } from './core/icons.js';
import { howToPlayButton, showTutorialOnce } from './core/tutorial.js';
import { wireSoundControl } from './core/sound-control.js';
import { noteFirstOpen, track } from './core/analytics.js';
import { makeResult } from './core/result.js';
import { wireThemeToggle } from './core/theme-toggle.js';
import {
  startSession, getCurrentSession, getSession, markGameStarted, recordGameResult,
  abandonSession, currentGameId, officialSettings, officialOrder, gameSeed, testMinutes, PROTOCOL_VERSION
} from './core/session.js';
import { radarChart, meter } from './core/charts.js';
import { TYPICAL } from './core/profile.js';
import { scoreRing, prefersReducedMotion } from './core/score-reveal.js';
import { resultFx, CONFETTI } from './core/arcade.js';
import { sfx } from './core/audio.js';

const stage = document.getElementById('stage');
const progressEl = document.getElementById('progress');
const stepEl = document.getElementById('stepLabel');
const leaveBtn = document.getElementById('leaveBtn');

wireSoundControl(document.getElementById('soundBtn'), document.getElementById('volSlider'));
noteFirstOpen();
wireThemeToggle(document.getElementById('themeBtn'));

/* ---------------------------------------------------------------- helpers */

let keyHandler = null;
document.addEventListener('keydown', (e) => { if (keyHandler) keyHandler(e); });

/** Swap the screen. Runner keys only apply outside games (games own the keyboard). */
function show(node, onKey = null) {
  keyHandler = onKey;
  stage.replaceChildren(node);
  window.scrollTo(0, 0);
}

const enterTo = (fn) => (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };

/* Every runner action awaits storage (and sometimes a module import) before the
   screen changes. Without this guard a double-click, or Enter plus a click, would
   run it twice - two sessions, or one game mounted twice and logged twice. */
let acting = false;
const guarded = (fn) => async (...args) => {
  if (acting) return;
  acting = true;
  try { await fn(...args); } finally { acting = false; }
};

/* ...and each screen's action fires at most once, even from a stale reference to a
   button that has already left the page. */
const once = (fn) => {
  let used = false;
  return guarded(async (...args) => { if (used) return; used = true; await fn(...args); });
};

let mountedGame = null;   // the game currently mounted on this page

let inGame = false;

function paintProgress(s) {
  const order = s ? s.order : officialOrder();
  const index = s ? s.index : -1;
  progressEl.replaceChildren(...order.map((id, i) =>
    el('span', { class: 'bt-seg' + (i < index ? ' done' : i === index && s.status === 'in_progress' ? ' now' : '') })));
  if (!s) stepEl.textContent = 'Brain Test';
  else if (s.status === 'completed') stepEl.textContent = 'Your Brain Profile';
  else stepEl.textContent = `Game ${s.index + 1} of ${s.order.length}`;
}

/* Leaving mid-game needs a second tap: the game in progress would restart. */
let leaveArmed = null;
leaveBtn.addEventListener('click', () => {
  if (inGame && !leaveArmed) {
    leaveBtn.textContent = 'Tap again to leave';
    leaveBtn.classList.add('danger');
    leaveArmed = setTimeout(() => {
      leaveArmed = null;
      leaveBtn.innerHTML = '&larr; Leave';
      leaveBtn.classList.remove('danger');
    }, 3000);
    return;
  }
  if (history.length > 1) history.back();
  else location.href = 'profile.html';
});

/* ----------------------------------------------------------------- screens */

function intro() {
  paintProgress(null);
  const games = officialOrder().map(getGame);
  const start = once(async () => instructions(await startSession()));

  show(el('div', { class: 'panel bt-intro' },
    el('h2', { text: 'Brain Test' }),
    el('p', { class: 'lead', text: `${games.length} short games, one after another. About ${testMinutes()} minutes. No account needed.` }),
    el('ol', { class: 'bt-games' },
      games.map((g, i) => el('li', {},
        el('span', { class: 'bt-num', text: String(i + 1) }),
        el('span', { class: 'bt-icon', 'aria-hidden': 'true', html: iconSvg(g.id) }),
        el('span', { class: 'bt-name', text: g.name }),
        el('span', { class: 'bt-cat', text: g.category })))
    ),
    el('ul', { class: 'bt-tips' },
      el('li', { text: 'Find a quiet moment. A game pauses if you switch tabs.' }),
      el('li', { text: 'Progress is saved after every game - you can close this tab and come back.' }),
      el('li', { text: 'Only your first Brain Test of the day counts toward rankings.' })
    ),
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary big', type: 'button', onclick: start }, 'Start Brain Test')),
    el('p', { class: 'foot-hint', text: 'Cognitive-performance games - not a medical assessment or an IQ test.' })
  ), enterTo(start));
}

function resume(s) {
  paintProgress(s);
  const gameId = currentGameId(s);
  const g = getGame(gameId);
  const interrupted = (s.attempts[gameId] || 0) > 0;
  const go = once(() => instructions(s));
  const restart = once(async () => { await abandonSession(s); instructions(await startSession()); });

  show(el('div', { class: 'panel center' },
    el('h2', { text: 'Welcome back' }),
    el('p', { class: 'lead', text: `You have completed ${s.index} of ${s.order.length} games.` }),
    interrupted
      ? el('p', { class: 'bt-note', text: `${g.name} was interrupted, so it will restart from the beginning. Your profile will still be complete, but a restarted game means this test won't count toward rankings.` })
      : null,
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary', type: 'button', onclick: go }, `Continue - game ${s.index + 1} of ${s.order.length}`),
      el('button', { class: 'btn', type: 'button', onclick: restart }, 'Start over'))
  ), enterTo(go));
}

function instructions(s, finishedName = null) {
  paintProgress(s);
  const gameId = currentGameId(s);
  const g = getGame(gameId);
  const go = once(() => play(s));

  show(el('div', { class: 'panel bt-card center' },
    finishedName ? el('span', { class: 'bt-done', text: `✓ ${finishedName} complete` }) : null,
    el('p', { class: 'bt-step', text: `GAME ${s.index + 1} / ${s.order.length}` }),
    el('div', { class: 'bt-card-icon', 'aria-hidden': 'true', html: iconSvg(g.id) }),
    el('h2', { text: g.name }),
    el('span', { class: 'pill', text: g.category }),
    el('p', { class: 'bt-rule', text: g.instruction }),
    el('p', { class: 'foot-hint', text: g.keys }),
    el('div', { class: 'actions' },
      howToPlayButton(gameId, { className: 'btn tut-open' }),
      el('button', { class: 'btn primary big', type: 'button', onclick: go }, 'Start')),
    el('p', { class: 'foot-hint', text: 'Press Enter to start' })
  ), enterTo(go));
  showTutorialOnce(gameId);          // first time this game comes up: learn it before the test starts it
}

async function play(s) {
  const gameId = currentGameId(s);
  if (mountedGame === gameId) return;          // never mount the same game twice on one page
  mountedGame = gameId;
  const g = getGame(gameId);
  const settings = officialSettings(gameId);
  keyHandler = null;                 // the game owns the keyboard from here
  inGame = true;
  await markGameStarted(s, gameId);

  const mod = await import(`./games/${g.module}`);
  let handedOff = false;

  mod.mount(stage, {
    game: g,
    official: {
      ...settings,
      sessionId: s.id,
      seed: gameSeed(s, gameId),
      onComplete: async (native) => {
        if (handedOff) return;               // a game hands off exactly once
        handedOff = true;
        inGame = false;
        mountedGame = null;
        const result = makeResult({
          gameId, mode: 'official', difficulty: settings.difficulty, native, protocolVersion: PROTOCOL_VERSION
        });
        await recordGameResult(s, gameId, result);
        if (s.status === 'completed') profile(s);
        else instructions(s, g.name);
      }
    }
  });
}

/* ------------------------------------------------------------- the profile */

function profile(s, { readOnly = false } = {}) {
  paintProgress(s);
  const sum = s.summary;
  const day = new Date(s.completedAt || s.updatedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const rows = sum.abilities.map((a) => el('div', { class: 'bt-row' },
    el('span', { class: 'bt-icon', 'aria-hidden': 'true', html: iconSvg(a.gameId) }),
    el('span', { class: 'bt-row-main' },
      el('span', { class: 'bt-row-head' },
        el('b', { text: a.name }),
        el('span', { class: 'bt-row-score', text: a.score === null ? '—' : String(a.score) })),
      meter(a.score, TYPICAL),
      el('span', { class: 'bt-row-game', text: getGame(a.gameId)?.name || a.gameId }))
  ));
  rows.forEach((r, i) => r.style.setProperty('--i', i));   // stagger order for the reveal

  const copyBtn = el('button', { class: 'btn', type: 'button' }, 'Copy result');
  copyBtn.addEventListener('click', async () => {
    const lines = [
      `My Brain Test performance score: ${sum.overall}/100`,
      sum.abilities.map((a) => `${a.name} ${a.score ?? '-'}`).join(' · '),
      'Mind Power Games - cognitive-performance games, not an IQ test'
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      copyBtn.textContent = 'Copied';
      track('result_shared', { session_id: s.id, method: 'clipboard' });
    } catch {
      copyBtn.textContent = 'Copy unavailable';
    }
  });

  const ring = scoreRing(sum.overall, { typical: TYPICAL });
  const later = (d, node) => { node.classList.add('sr-later'); node.style.setProperty('--d', d); return node; };

  const panel = el('div', { class: 'panel result-panel bt-profile' },
    el('p', { class: 'result-sub', text: (readOnly ? 'Brain Test · ' : 'Brain Test complete · ') + day }),
    el('p', { class: 'bt-kicker center', text: 'Overall performance' }),
    ring.node,
    later(0, sum.overall === null
      ? el('p', { class: 'result-sub', text: 'Not enough valid results to calculate an overall score.' })
      : el('div', {},
          el('p', { class: 'sr-headline' }, 'You scored ', el('b', { text: String(sum.overall) }), ' out of 100'),
          el('p', { class: 'result-sub', text: sum.measured === sum.total
            ? `The average of your ${sum.total} game scores.`
            : `The average of the ${sum.measured} games with a valid score (out of ${sum.total}).` }))),

    later(1, el('div', { class: 'bt-profile-grid' },
      radarChart({ axes: sum.abilities.map((a) => ({ label: a.name, value: a.score })), size: 300, typical: TYPICAL, emptyLabel: 'no valid score' }),
      el('div', { class: 'bt-rows sr-stagger' }, rows))),

    later(2, el('p', { class: 'bt-note ' + (sum.eligible ? 'ok' : '') , text: sum.eligible
      ? '✓ Counts toward rankings: your first Brain Test today, with no restarted games.'
      : 'Not counted toward rankings. ' + sum.reasons.join(' ') })),
    later(3, el('p', { class: 'honest', text: 'Scores compare your results with reference points from published research on similar tasks, on a 0-100 scale where 50 is the reference midpoint. They are not an IQ score, a comparison with other players, or a medical assessment.' })),

    later(4, el('div', { class: 'actions' },
      copyBtn,
      el('a', { class: 'btn primary', href: 'profile.html' }, 'View full profile')))
  );

  show(panel);
  if (readOnly) return;                  // viewing a past test: no replay

  /* Just finished: the ring sweeps up to the score, then lands with a chime and
     confetti (finishing all the games is the achievement), and the profile follows. */
  panel.classList.add('sr-waiting');
  const fx = resultFx(panel);
  ring.play({
    onLanded: () => {
      panel.classList.remove('sr-waiting');
      if (sum.overall === null) return;
      sfx.finish();
      if (!prefersReducedMotion()) fx.start(CONFETTI);
    }
  });
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  const pastId = new URLSearchParams(location.search).get('session');
  if (pastId) {
    const past = await getSession(pastId);
    if (past && past.status === 'completed') { profile(past, { readOnly: true }); return; }
  }
  const current = await getCurrentSession();
  if (current) resume(current);
  else intro();
}

boot();
