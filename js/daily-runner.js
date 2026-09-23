/* Daily Brain Check runner: five short games, about five minutes.

   home -> [instructions -> game] x5 -> results

   Games are mounted with a test context, as in the Brain Test (test-runner.js),
   plus the check's shorter settings and source 'daily'. The check is saved after
   every game starts and ends (core/daily.js), so a closed tab resumes at the next
   game - on the same day. */

import { getGame } from './core/games.js';
import { el } from './core/util.js';
import { iconSvg } from './core/icons.js';
import { howToPlayButton, showTutorialOnce } from './core/tutorial.js';
import { wireSoundControl } from './core/sound-control.js';
import { noteFirstOpen, track } from './core/analytics.js';
import { makeResult } from './core/result.js';
import { wireThemeToggle } from './core/theme-toggle.js';
import { currentGameId, gameSeed } from './core/session.js';
import {
  dailyState, startCheck, getCheck, markCheckGameStarted, recordCheckResult,
  dailyOrder, dailyMinutes, dailySettings, untilNextCheck, DAILY_VERSION
} from './core/daily.js';
import { abilityFor, TYPICAL } from './core/profile.js';
import { meter } from './core/charts.js';
import { levelBar, animateLevel } from './core/level-ui.js';
import { resultFx, CONFETTI } from './core/arcade.js';
import { scoreRing } from './core/score-reveal.js';
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

let teardown = null;

/** Swap the screen. Runner keys only apply outside games (games own the keyboard). */
function show(node, onKey = null, cleanup = null) {
  if (teardown) teardown();
  teardown = cleanup;
  keyHandler = onKey;
  stage.replaceChildren(node);
  window.scrollTo(0, 0);
}

const enterTo = (fn) => (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };

/* Every action awaits storage before the screen changes, so a double-click (or
   Enter plus a click) must not run it twice - two checks, or a game mounted twice. */
let acting = false;
const guarded = (fn) => async (...args) => {
  if (acting) return;
  acting = true;
  try { await fn(...args); } finally { acting = false; }
};
const once = (fn) => {
  let used = false;
  return guarded(async (...args) => { if (used) return; used = true; await fn(...args); });
};

let mountedGame = null;
let inGame = false;

function paintProgress(s) {
  const order = s ? s.order : dailyOrder();
  const index = s ? s.index : -1;
  progressEl.replaceChildren(...order.map((id, i) =>
    el('span', { class: 'bt-seg' + (i < index ? ' done' : i === index && s.status === 'in_progress' ? ' now' : '') })));
  if (!s) stepEl.textContent = 'Daily Brain Check';
  else if (s.status === 'completed') stepEl.textContent = s.counted ? "Today's results" : 'Practice run results';
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

async function practise(gameId) {
  await track('practice_started', { game_id: gameId, from: 'daily_check', start_time: new Date().toISOString() });
  location.href = 'game.html?game=' + encodeURIComponent(gameId);
}

/** A fresh start action per screen: each screen's button may fire once. */
const startNew = () => once(async () => { const s = await startCheck(); instructions(s, await dailyState()); });

/* ----------------------------------------------------------------- screens */

function intro(st) {
  paintProgress(null);
  const first = !st.history.length;
  const start = startNew();

  show(el('div', { class: 'panel bt-intro' },
    el('h2', { text: 'Daily Brain Check' }),
    el('p', { class: 'lead', text: `${dailyOrder().length} quick games, about ${dailyMinutes()} minutes. New puzzles every day.` }),
    el('div', { class: 'dc-level' }, levelBar(st.level)),
    el('ol', { class: 'bt-games' },
      dailyOrder().map((id, i) => {
        const g = getGame(id);
        const best = st.records[id].best;
        return el('li', {},
          el('span', { class: 'bt-num', text: String(i + 1) }),
          el('span', { class: 'bt-icon', 'aria-hidden': 'true', html: iconSvg(g.id) }),
          el('span', { class: 'bt-name', text: g.name }),
          el('span', { class: 'bt-cat', text: abilityFor(id).name + (best === null ? '' : ` · best ${best}`) }));
      })
    ),
    el('ul', { class: 'bt-tips' },
      el('li', { text: first
        ? 'Your first check sets your baseline. Come back tomorrow to beat it.'
        : `Your best score is ${st.bestScore ?? '—'}. Beat a game's best and you earn extra XP.` }),
      el('li', { text: 'Your first check each day earns XP toward your Brain Level.' }),
      el('li', { text: 'Progress is saved after every game - you can close this tab and finish later today.' })
    ),
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary big', type: 'button', onclick: start }, first ? 'Take your first check' : "Start today's check")),
    el('p', { class: 'foot-hint', text: 'Cognitive-performance games - not a medical assessment or an IQ test.' })
  ), enterTo(start));
}

function resume(s, st) {
  paintProgress(s);
  const g = getGame(currentGameId(s));
  const interrupted = (s.attempts[g.id] || 0) > 0;
  const go = once(() => instructions(s, st));

  show(el('div', { class: 'panel center' },
    el('h2', { text: 'Welcome back' }),
    el('p', { class: 'lead', text: `You have finished ${s.index} of ${s.order.length} games of ${s.counted ? "today's check" : 'this practice run'}.` }),
    interrupted ? el('p', { class: 'bt-note', text: `${g.name} was interrupted, so it will restart from the beginning.` }) : null,
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary', type: 'button', onclick: go }, `Continue - game ${s.index + 1} of ${s.order.length}`))
  ), enterTo(go));
}

async function doneToday(st) {
  paintProgress(null);
  const s = await getCheck(st.today.id);
  const sum = s.summary;
  const view = once(() => results(s, st));
  const practice = startNew();

  show(el('div', { class: 'panel center dc-done' },
    el('span', { class: 'bt-done', text: "✓ Today's check is done" }),
    el('div', { class: 'bt-overall' },
      el('span', { class: 'bt-overall-num', text: sum.score === null ? '—' : String(sum.score) }),
      el('span', { class: 'bt-overall-of', text: '/ 100' })),
    scoreLine(sum, true),
    el('div', { class: 'dc-level' }, levelBar(st.level)),
    el('p', { class: 'lead', text: `A new check unlocks in ${untilNextCheck()}.` +
      (sum.score === null ? '' : ` Tomorrow's target: beat ${sum.score}.`) }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary', type: 'button', onclick: view }, "See today's results"),
      el('button', { class: 'btn', type: 'button', onclick: practice }, 'Practice run')),
    el('p', { class: 'foot-hint', text: "A practice run uses fresh puzzles. It doesn't change your level or your bests." })
  ), enterTo(view));
}

function instructions(s, st, finishedName = null) {
  paintProgress(s);
  const gameId = currentGameId(s);
  const g = getGame(gameId);
  const { best, last } = st.records[gameId];
  const go = once(() => play(s, st));

  const target =
    !s.counted ? 'Practice run - no XP, and your bests stay as they are.' :
    best === null ? 'First time: this round sets your baseline.' :
    `Your best: ${best}` + (last !== null && last !== best ? ` · last time: ${last}` : '') + ' - beat it!';

  show(el('div', { class: 'panel bt-card center' },
    finishedName ? el('span', { class: 'bt-done', text: `✓ ${finishedName} complete` }) : null,
    el('p', { class: 'bt-step', text: `GAME ${s.index + 1} / ${s.order.length}` }),
    el('div', { class: 'bt-card-icon', 'aria-hidden': 'true', html: iconSvg(g.id) }),
    el('h2', { text: g.name }),
    el('span', { class: 'pill', text: abilityFor(gameId).name }),
    el('p', { class: 'bt-rule', text: g.instruction }),
    el('p', { class: 'foot-hint', text: g.keys }),
    el('p', { class: 'dc-target' + (s.counted && best !== null ? ' beat' : ''), text: target }),
    el('div', { class: 'actions' },
      howToPlayButton(gameId, { className: 'btn tut-open' }),
      el('button', { class: 'btn primary big', type: 'button', onclick: go }, 'Start')),
    el('p', { class: 'foot-hint', text: 'Press Enter to start' })
  ), enterTo(go));
  showTutorialOnce(gameId);          // first time this game comes up: learn it before the check starts it
}

async function play(s, st) {
  const gameId = currentGameId(s);
  if (mountedGame === gameId) return;          // never mount the same game twice on one page
  mountedGame = gameId;
  const g = getGame(gameId);
  const settings = dailySettings(gameId);
  keyHandler = null;                           // the game owns the keyboard from here
  inGame = true;
  await markCheckGameStarted(s, gameId);

  const mod = await import(`./games/${g.module}`);
  let handedOff = false;

  mod.mount(stage, {
    game: g,
    official: {
      ...settings,
      source: 'daily',
      sessionId: s.id,
      seed: gameSeed(s, gameId),
      onComplete: async (native) => {
        if (handedOff) return;                 // a game hands off exactly once
        handedOff = true;
        inGame = false;
        mountedGame = null;
        const result = {
          ...makeResult({ gameId, mode: 'daily', difficulty: settings.difficulty, native }),
          settings,
          dailyVersion: DAILY_VERSION
        };
        await recordCheckResult(s, gameId, result);
        // st was read before the check began, so st.level is the level before it
        if (s.status === 'completed') results(s, await dailyState(), { before: s.counted ? st.level : null });
        else instructions(s, st, g.name);
      }
    }
  });
}

/* ----------------------------------------------------------------- results */

function scoreLine(sum, counted) {
  if (sum.score === null) return el('p', { class: 'result-sub', text: 'Not enough valid results to calculate a score.' });
  if (sum.lastScore === null) {
    return el('p', { class: 'result-sub', text: 'Your first check - this is your baseline. Come back tomorrow to beat it.' });
  }
  const d = sum.delta;
  const since = counted ? 'since your last check' : "compared with today's check";
  return el('p', { class: 'result-sub' },
    el('span', { class: 'delta' + (d > 0 ? ' up' : d < 0 ? ' down' : ''),
      text: d === 0 ? `Same as ${counted ? 'your last check' : "today's check"}` : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} ${since}` }),
    counted && sum.bestScore !== null ? ` · previous best ${sum.bestScore}` : null);
}

function deltaChip(a) {
  if (a.score === null) return null;
  if (a.last === null) return el('span', { class: 'delta', text: 'first' });
  if (a.delta === 0) return el('span', { class: 'delta', text: '=' });
  return el('span', { class: 'delta ' + (a.delta > 0 ? 'up' : 'down'), text: (a.delta > 0 ? '▲ ' : '▼ ') + Math.abs(a.delta) });
}

function abilityRow(a) {
  const g = getGame(a.gameId);
  return el('div', { class: 'bt-row' + (a.isBest ? ' dc-best' : '') },
    el('span', { class: 'bt-icon', 'aria-hidden': 'true', html: iconSvg(a.gameId) }),
    el('span', { class: 'bt-row-main' },
      el('span', { class: 'bt-row-head' },
        el('b', { text: a.name }),
        el('span', { class: 'dc-row-right' },
          a.isBest ? el('span', { class: 'pill dc-pill-best', text: 'New best' }) : null,
          deltaChip(a),
          el('span', { class: 'bt-row-score', text: a.score === null ? '—' : String(a.score) }))),
      meter(a.score, TYPICAL),
      el('span', { class: 'bt-row-game', text: g.name + (a.best === null ? '' : ` · previous best ${a.best}`) }))
  );
}

/** The biggest opportunity: the lowest ability today, and its practice game. */
function nextStep(s) {
  const scored = s.summary.abilities.filter((a) => a.score !== null);
  if (!scored.length) return null;
  const weakest = scored.reduce((w, a) => (a.score < w.score ? a : w));
  const g = getGame(weakest.gameId);
  return el('div', { class: 'dc-next' },
    el('p', { class: 'dc-next-kicker', text: 'Your next step' }),
    el('p', { class: 'dc-next-text', text: `${weakest.name} was your lowest today (${weakest.score}). Practice rounds of ${g.name} are where you have the most to gain.` }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn dc-practise', type: 'button', onclick: () => practise(g.id) },
        el('span', { class: 'bt-icon', 'aria-hidden': 'true', html: iconSvg(g.id) }), `Practise ${g.name}`)),
    s.counted && s.summary.score !== null
      ? el('p', { class: 'foot-hint', text: `Next check unlocks in ${untilNextCheck()}. Tomorrow's target: beat ${s.summary.score}.` })
      : null
  );
}

function results(s, st, { before = null } = {}) {
  paintProgress(s);
  const sum = s.summary;
  const day = new Date(s.completedAt || s.updatedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const ring = scoreRing(sum.score, { typical: TYPICAL });

  const bar = levelBar(before || st.level);
  const levelUp = el('span', { class: 'dc-levelup', 'aria-live': 'polite' });
  const levelBox = s.counted
    ? el('div', { class: 'dc-level-box' },
        el('div', { class: 'dc-xp-head' },
          el('b', { text: `+${sum.xp} XP` }),
          levelUp),
        bar,
        el('ul', { class: 'dc-xp' }, sum.xpParts.map((p) =>
          el('li', {}, el('span', { text: p.label }), el('b', { text: '+' + p.xp })))))
    : el('p', { class: 'bt-note', text: 'Practice run: XP and personal bests come only from your first check each day.' });

  const done = once(() => home());
  const panel = el('div', { class: 'panel result-panel bt-profile dc-results' },
    el('p', { class: 'result-sub', text: (s.counted ? 'Daily Brain Check · ' : 'Practice run · ') + day }),
    ring.node,
    scoreLine(sum, s.counted),
    sum.isBestScore ? el('div', { class: 'center' }, el('span', { class: 'badge', text: 'NEW BEST SCORE' })) : null,
    levelBox,
    el('div', { class: 'bt-rows dc-rows' }, sum.abilities.map(abilityRow)),
    nextStep(s),
    el('p', { class: 'honest', text: 'Each score compares your result with reference points from published research on similar tasks, on a 0-100 scale where 50 is the reference midpoint. Brain Level counts your practice and progress - it is not an IQ score or a medical assessment.' }),
    el('div', { class: 'actions' },
      el('a', { class: 'btn', href: 'profile.html' }, 'View full profile'),
      el('button', { class: 'btn primary', type: 'button', onclick: done }, 'Done'))
  );

  const fx = resultFx(panel);
  show(panel, enterTo(done), () => fx.stop());

  if (!before) return;                         // viewing a finished check: no replay
  const colors = CONFETTI;
  ring.play({ delay: 250, ms: 1300 });
  sfx.finish();
  if (sum.isBestScore || sum.abilities.some((a) => a.isBest)) fx.start(colors);
  animateLevel(bar, before, st.level, (level) => {
    levelUp.textContent = `Level up! You reached level ${level}`;
    levelUp.classList.add('on');
    sfx.start();
    fx.start(colors);
  });
}

/* -------------------------------------------------------------------- boot */

async function home() {
  const st = await dailyState();
  if (st.current) resume(st.current, st);
  else if (st.doneToday) doneToday(st);
  else intro(st);
}

async function boot() {
  const pastId = new URLSearchParams(location.search).get('check');
  if (pastId) {
    const past = await getCheck(pastId);
    if (past && past.status === 'completed') { results(past, await dailyState()); return; }
  }
  home();
}

boot();
