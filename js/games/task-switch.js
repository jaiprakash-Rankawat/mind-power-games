/* Task Switch - cognitive flexibility.
   A digit appears with a question - ODD or EVEN? / LOW or HIGH? - and the
   question changes between cards. The measure is the switch cost: how much
   slower and less accurate you are right after the rule changes.
   Sequence and scoring logic lives in ./logic/task-switch-logic.js (unit-tested). */

import { el } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter } from '../core/arcade.js';
import { createRng } from '../core/rng.js';
import { abilityFor } from '../core/profile.js';
import {
  createScreens, officialOf, seedFor, setupPanel, countdown, completeRound, resultsPanel, pauseOverlay, gradeFromScore
} from '../core/game-kit.js';
import { makeSequence, summarize, pointsFor, RULES } from './logic/task-switch-logic.js';

const GAME_ID = 'task-switch';
const RULE_COLORS = { parity: '#a789ff', magnitude: '#37dcf2' };
const FEEDBACK_MS = 260;
const GAP_MS = 320;

const MODES = {
  easy: {
    key: 'easy', name: 'Easy', count: 32, predictable: true, runLength: 4, limit: 3000,
    meta: 'The question changes every 4 cards - you can see it coming. 32 cards.'
  },
  medium: {
    key: 'medium', name: 'Medium', count: 36, pSwitch: 0.35, limit: 2500,
    meta: 'The question changes without warning. 36 cards, 2.5s each.'
  },
  hard: {
    key: 'hard', name: 'Hard', count: 40, pSwitch: 0.5, limit: 2000,
    meta: 'Frequent, unpredictable changes. 40 cards, 2s each.'
  }
};

export function mount(root, ctx) {
  const setScreen = createScreens(root);
  const official = officialOf(ctx);

  /* ------------------------------------------------------------------ setup */

  async function showSetup() {
    const demo = el('div', { class: 'ts-demo', 'aria-hidden': 'true' },
      el('span', { class: 'ts-cue small', style: { background: RULE_COLORS.parity }, text: RULES.parity.question }),
      el('span', { class: 'ts-demo-digit', text: '7' }),
      el('span', { class: 'demo-arrow', text: '-> ODD' }));
    setScreen(await setupPanel({
      gameId: GAME_ID,
      title: 'Task Switch',
      lead: 'Same numbers, two different questions. Keep up as the question changes.',
      demo,
      rules: [
        'Each card asks <b>ODD or EVEN?</b> or <b>LOW or HIGH?</b> (below or above 5).',
        'Left answers <b>ODD / LOW</b>, right answers <b>EVEN / HIGH</b>. Keys <b>F</b> and <b>J</b>, or tap.',
        'The question changes from card to card - read it first, then the number.',
        'Your result is the <b>switch cost</b>: how much a change of rule slows you down.'
      ],
      modes: MODES,
      bestText: (b) => 'Best ' + b.score + (typeof b.switchCost === 'number' ? ' - cost ' + b.switchCost + 'ms' : ''),
      onPick: startCountdown
    }));
  }

  function startCountdown(cfg) {
    countdown(setScreen, { note: 'Read the question, then the number', onGo: () => startGame(cfg) });
  }

  /* ------------------------------------------------------------------- play */

  function startGame(cfg) {
    const rng = createRng(seedFor(ctx));
    const seed = rng.seed;
    const seq = makeSequence(rng, cfg);
    const log = [];                           // raw record of every card
    const startedAt = new Date().toISOString();

    let idx = -1;
    let phase = 'idle';                       // idle | go | done | paused
    let onset = 0;
    let score = 0;
    let streak = 0;
    let killed = false;
    let pauses = 0;

    const timers = new Set();
    const later = (fn, ms) => {
      const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
      timers.add(t);
    };
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

    /* --- HUD --- */
    const scoreEl = el('b', { text: '0' });
    const cardEl = el('b', { text: '0/' + seq.length });
    const accEl = el('b', { text: '—' });
    const streakEl = el('b', { text: '0' });
    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box' }, cardEl, el('span', { text: 'Card' })),
      el('div', { class: 'box' }, accEl, el('span', { text: 'Accuracy' })),
      el('div', { class: 'box hot' }, streakEl, el('span', { text: 'Streak' })));
    const meter = createMeter('Get ready');

    /* --- card and answer buttons --- */
    const cue = el('div', { class: 'ts-cue' });
    const digitEl = el('div', { class: 'ts-digit' });
    const card = el('div', { class: 'ts-card' }, digitEl);
    const option = (rule, text) => el('span', { class: 'ts-opt', 'data-rule': rule, text });
    const btnLeft = el('button', { class: 'ts-btn', type: 'button', 'aria-label': 'Odd or low' },
      el('span', { class: 'ts-opts' }, option('parity', 'ODD'), el('span', { class: 'ts-sep', text: '·' }), option('magnitude', 'LOW')),
      el('span', { class: 'ts-key', text: 'F' }));
    const btnRight = el('button', { class: 'ts-btn', type: 'button', 'aria-label': 'Even or high' },
      el('span', { class: 'ts-opts' }, option('parity', 'EVEN'), el('span', { class: 'ts-sep', text: '·' }), option('magnitude', 'HIGH')),
      el('span', { class: 'ts-key', text: 'J' }));
    btnLeft.addEventListener('pointerdown', (e) => { e.preventDefault(); respond('left', 'pointer'); });
    btnRight.addEventListener('pointerdown', (e) => { e.preventDefault(); respond('right', 'pointer'); });

    const stage = createStage('ts');
    stage.add(el('div', { class: 'arena ts-arena' }, cue, card, el('div', { class: 'ts-buttons' }, btnLeft, btnRight)));
    const board = stage.board;
    const hint = el('p', { class: 'foot-hint', text: 'F = odd / low - J = even / high - Space to pause' + (official ? '' : ' - Esc to quit') });
    const wrap = el('div', {}, hud, meter.wrap, board, hint);

    function syncHud(animate) {
      if (animate) countUp(scoreEl, score, 300); else scoreEl.textContent = score;
      cardEl.textContent = Math.max(0, idx + 1) + '/' + seq.length;
      const answered = log.length;
      accEl.textContent = answered ? Math.round((log.filter((t) => t.correct).length / answered) * 100) + '%' : '—';
      streakEl.textContent = streak;
      meter.set((log.length / seq.length) * 100, 'Card ' + Math.max(1, idx + 1) + ' of ' + seq.length);
    }

    /* --- trial flow --- */
    function blank() {
      digitEl.textContent = '';
      card.classList.remove('good', 'bad');
      cue.textContent = '';
      cue.style.background = 'transparent';
      board.querySelectorAll('.ts-opt').forEach((o) => o.classList.remove('on'));
    }

    function next() {
      if (killed) return;
      idx += 1;
      if (idx >= seq.length) { finish(); return; }
      present();
    }

    function present() {
      const t = seq[idx];
      card.classList.remove('good', 'bad');
      cue.textContent = RULES[t.rule].question;
      cue.style.background = RULE_COLORS[t.rule];
      card.style.borderColor = RULE_COLORS[t.rule];
      board.querySelectorAll('.ts-opt').forEach((o) => o.classList.toggle('on', o.dataset.rule === t.rule));
      digitEl.textContent = String(t.digit);
      stage.tint(RULE_COLORS[t.rule]);
      syncHud(false);
      phase = 'go';
      onset = performance.now();
      requestAnimationFrame(() => { if (phase === 'go') onset = performance.now(); });
      later(() => respond(null, 'none'), cfg.limit);
    }

    function respond(side, input) {
      if (killed || phase !== 'go') return;
      phase = 'done';
      clearTimers();
      const t = seq[idx];
      const rt = side === null ? null : Math.round(performance.now() - onset);
      const correct = side === t.answer;
      log.push({ ...t, response: side, correct, rt, input });
      score = Math.max(0, score + pointsFor(correct, rt, cfg.limit));

      if (correct) {
        streak += 1;
        card.classList.add('good');
        sfx.correct(Math.min(6, Math.floor(streak / 2)));
        stage.burstAt(side === 'left' ? btnLeft : btnRight, RULE_COLORS[t.rule], 12);
      } else {
        streak = 0;
        card.classList.add('bad');
        sfx.wrong();
        stage.flashBad();
        if (side === null) cue.textContent = 'Too slow';
      }
      syncHud(true);
      later(() => { blank(); later(next, GAP_MS); }, FEEDBACK_MS);
    }

    /* --- pause: an unanswered card is shown again on resume --- */
    let pausedCard = null;

    function pause() {
      if (killed || phase === 'paused') return;
      const unanswered = phase === 'go';
      clearTimers();
      blank();
      phase = 'paused';
      pauses += 1;
      pausedCard = pauseOverlay(resume);
      pausedCard.dataset.replay = unanswered ? '1' : '0';
      board.append(pausedCard);
    }

    function resume() {
      if (phase !== 'paused') return;
      const replay = pausedCard && pausedCard.dataset.replay === '1';
      if (pausedCard) { pausedCard.remove(); pausedCard = null; }
      phase = 'idle';
      if (replay && idx >= 0) present(); else next();
    }

    const onVisibility = () => { if (document.hidden) pause(); };

    const onKey = (e) => {
      if (killed || e.repeat) return;
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') {
        if (official) return;
        cleanup(); showSetup(); return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'paused') resume(); else pause();
        return;
      }
      if (phase !== 'go') return;
      if (k === 'f' || k === 'arrowleft') { e.preventDefault(); respond('left', 'key'); }
      if (k === 'j' || k === 'arrowright') { e.preventDefault(); respond('right', 'key'); }
    };

    function cleanup() {
      killed = true;
      clearTimers();
      stage.destroy();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    function finish() {
      cleanup();
      sfx.finish();
      const result = { mode: cfg.key, score, ...summarize(log), startedAt, raw: { seed, trials: log, pauses } };
      completeRound({ ctx, gameId: GAME_ID, cfg, result, showResults: (info) => showResults(cfg, result, info) });
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    setScreen(wrap, cleanup);
    stage.ready();
    blank();
    syncHud(false);
    later(next, 400);
  }

  /* ---------------------------------------------------------------- results */

  function showResults(cfg, r, { isRecord, prevBest, change }) {
    const ability = abilityFor(GAME_ID);
    const grade = gradeFromScore(ability ? ability.score(r) : null);
    const verdict = {
      S: 'Very little slowdown when the question changes.',
      A: 'You adapt quickly when the question changes.',
      B: 'A modest switch cost, with accuracy holding.',
      C: 'Changes slow you down. Read the question first, then the number.',
      D: 'Take each card in order: question first, then the number.'
    }[grade];
    const ms = (v) => (typeof v === 'number' ? v + 'ms' : '—');
    const { node, cleanup } = resultsPanel({
      subtitle: cfg.name + ' round complete',
      grade, score: r.score, verdict, isRecord, prevBest, cfgName: cfg.name, change,
      stats: [
        [ms(r.switchCost), 'Switch cost'],
        [r.accuracy + '%', 'Accuracy'],
        [ms(r.rtRepeat), 'Same question'],
        [ms(r.rtSwitch), 'After a change']
      ],
      note: `${r.switchErrors} error${r.switchErrors === 1 ? '' : 's'} right after a change, ${r.repeatErrors} on repeats.`,
      onAgain: () => startCountdown(cfg),
      onSetup: () => showSetup()
    });
    setScreen(node, cleanup);
  }

  if (official) startCountdown(MODES[official.difficulty] || MODES.medium);
  else showSetup();
}
