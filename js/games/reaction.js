/* Reaction Speed - processing speed.
   Part 1: simple reaction - respond the instant the light appears.
   Part 2: choice reaction - respond with the side (or slot) that lights up.
   Timing and scoring logic lives in ./logic/reaction-logic.js (unit-tested). */

import { el } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter } from '../core/arcade.js';
import { createRng } from '../core/rng.js';
import { abilityFor } from '../core/profile.js';
import {
  createScreens, officialOf, officialConfig, seedFor, setupPanel, countdown, completeRound, resultsPanel, pauseOverlay, gradeFromScore
} from '../core/game-kit.js';
import {
  planTrials, outcomeOf, summarize, pointsFor, slotForKey, SIMPLE_FOREPERIOD, CHOICE_FOREPERIOD
} from './logic/reaction-logic.js';

const GAME_ID = 'reaction';
const ACCENT = '#34d399';
const MAX_FALSE_STARTS = 5;          // per trial, then it is scored as a miss and we move on

export const MODES = {
  easy: {
    key: 'easy', name: 'Easy', simple: 12, choice: 0, choices: 2, simpleLimit: 1500, choiceLimit: 2000,
    meta: 'Simple reaction only - 12 lights.'
  },
  medium: {
    key: 'medium', name: 'Medium', simple: 8, choice: 14, choices: 2, simpleLimit: 1500, choiceLimit: 2000,
    meta: '8 simple lights, then 14 left-or-right choices.'
  },
  hard: {
    key: 'hard', name: 'Hard', simple: 8, choice: 16, choices: 4, simpleLimit: 1500, choiceLimit: 2200,
    meta: '8 simple lights, then 16 four-way choices.'
  }
};

const KEY_LABELS = { 2: ['F', 'J'], 4: ['D', 'F', 'J', 'K'] };

export function mount(root, ctx) {
  const setScreen = createScreens(root);
  const official = officialOf(ctx);

  /* ------------------------------------------------------------------ setup */

  async function showSetup() {
    setScreen(await setupPanel({
      gameId: GAME_ID,
      title: 'Reaction Speed',
      lead: 'How fast can you see, decide and act? Part one is pure speed; part two adds a decision.',
      demo: el('div', { class: 'rx-demo', 'aria-hidden': 'true' }, el('span', { class: 'rx-demo-dot' })),
      rules: [
        'Part 1: when the circle lights up, press <b>Space</b> or tap it - as fast as you can.',
        'Pressing before it lights is a <b>false start</b>. Wait for it.',
        'Part 2: a light appears on one side. Press <b>F</b> for left or <b>J</b> for right, or tap it.',
        'Your result is your <b>median</b> time, so one slow reaction does not ruin it.'
      ],
      modes: MODES,
      bestText: (b) => 'Best ' + b.score + (b.avgRt ? ' - ' + b.avgRt + 'ms' : ''),
      onPick: startCountdown
    }));
  }

  function startCountdown(cfg) {
    countdown(setScreen, { note: 'Wait for the light - then go', onGo: () => startGame(cfg) });
  }

  /* ------------------------------------------------------------------- play */

  function startGame(cfg) {
    const rng = createRng(seedFor(ctx));
    const seed = rng.seed;
    const plan = planTrials(rng, cfg);
    const queue = [...plan.simple, ...plan.choice];
    const trials = [];                      // raw record of every trial
    const startedAt = new Date().toISOString();

    let score = 0;
    let idx = -1;
    let phase = 'idle';                     // idle | wait | go | done | intermission | paused
    let onset = 0;
    let foreperiod = 0;
    let falseStarts = 0;
    let fastest = null;
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
    const partEl = el('b', { text: 'Simple' });
    const trialEl = el('b', { text: '0/' + queue.length });
    const fastEl = el('b', { text: '—' });
    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box' }, partEl, el('span', { text: 'Part' })),
      el('div', { class: 'box' }, trialEl, el('span', { text: 'Trial' })),
      el('div', { class: 'box hot' }, fastEl, el('span', { text: 'Fastest' })));
    const meter = createMeter('Get ready');

    /* --- arena --- */
    const promptEl = el('div', { class: 'prompt' });
    const readout = el('div', { class: 'rx-readout', text: '' });
    const pad = el('button', { class: 'rx-pad', type: 'button', 'aria-label': 'Reaction light' }, 'WAIT');
    const slotsWrap = el('div', { class: 'rx-slots rx-hidden' + (cfg.choices === 4 ? ' four' : '') });
    const slots = Array.from({ length: cfg.choices }, (_, i) => {
      const b = el('button', { class: 'rx-slot', type: 'button', 'aria-label': 'Slot ' + (i + 1) },
        el('span', { class: 'rx-key', text: KEY_LABELS[cfg.choices][i] }));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(i, 'pointer'); });
      slotsWrap.append(b);
      return b;
    });
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); press(null, 'pointer'); });

    const stage = createStage('rx');
    stage.add(promptEl, el('div', { class: 'arena rx-arena' }, pad, slotsWrap), readout);
    stage.tint(ACCENT);
    const board = stage.board;
    const hint = el('p', { class: 'foot-hint', text: official ? 'Space / F / J, or tap' : 'Space / F / J, or tap - Esc to quit' });
    const wrap = el('div', {}, hud, meter.wrap, board, hint);

    function syncHud(animate) {
      if (animate) countUp(scoreEl, score, 300); else scoreEl.textContent = score;
      trialEl.textContent = Math.max(0, idx + 1) + '/' + queue.length;
      fastEl.textContent = fastest === null ? '—' : fastest + 'ms';
      meter.set((Math.max(0, idx) / queue.length) * 100, 'Trial ' + Math.max(1, idx + 1) + ' of ' + queue.length);
    }

    function resetLights() {
      pad.classList.remove('go', 'early');
      pad.textContent = 'WAIT';
      slots.forEach((s) => s.classList.remove('go', 'bad', 'hit'));
    }

    /* --- trial flow --- */
    function nextTrial() {
      if (killed) return;
      idx += 1;
      if (idx >= queue.length) { finish(); return; }
      const t = queue[idx];
      if (t.block === 'choice' && (idx === 0 || queue[idx - 1].block !== 'choice')) { intermission(); return; }
      falseStarts = 0;
      foreperiod = t.foreperiod;
      syncHud(false);
      arm();
    }

    function arm() {
      const t = queue[idx];
      phase = 'wait';
      resetLights();
      promptEl.textContent = t.block === 'simple' ? 'Wait for the light...' : 'Wait - then press the side that lights up';
      later(fire, foreperiod);
    }

    function fire() {
      const t = queue[idx];
      phase = 'go';
      if (t.block === 'simple') { pad.classList.add('go'); pad.textContent = 'NOW!'; }
      else slots[t.target].classList.add('go');
      onset = performance.now();
      // mark onset at the frame that actually paints the light, when that frame runs
      requestAnimationFrame(() => { if (phase === 'go') onset = performance.now(); });
      later(() => record(null, null, 'none'), t.block === 'simple' ? cfg.simpleLimit : cfg.choiceLimit);
    }

    function falseStart() {
      clearTimers();
      falseStarts += 1;
      sfx.wrong();
      stage.flashBad();
      pad.classList.add('early');
      pad.textContent = 'TOO SOON';
      promptEl.textContent = 'Too soon - wait for the light.';
      phase = 'done';
      if (falseStarts >= MAX_FALSE_STARTS) {
        const t = queue[idx];
        trials.push({ block: t.block, target: t.target, response: null, rt: null, outcome: 'falsestart', falseStarts, foreperiod, input: null });
        score = Math.max(0, score - 40);
        later(nextTrial, 900);
        return;
      }
      foreperiod = Math.round(rng.range(...(queue[idx].block === 'simple' ? SIMPLE_FOREPERIOD : CHOICE_FOREPERIOD)));
      later(arm, 900);
    }

    function press(slot, input) {
      if (killed) return;
      if (phase === 'wait') { falseStart(); return; }
      if (phase !== 'go') return;
      const t = queue[idx];
      if (t.block === 'simple' && slot !== null) return;       // slots are hidden in part 1
      if (t.block === 'choice' && slot === null) return;
      record(Math.round(performance.now() - onset), slot, input);
    }

    function record(rt, response, input) {
      if (phase !== 'go') return;
      phase = 'done';
      clearTimers();
      const t = queue[idx];
      const outcome = outcomeOf({ block: t.block, rt, target: t.target, response });
      trials.push({ block: t.block, target: t.target, response, rt, outcome, falseStarts, foreperiod, input });
      score = Math.max(0, score + pointsFor({ block: t.block, outcome, rt }));

      // the light goes out the moment a response lands - that is the confirmation
      pad.classList.remove('go');
      pad.textContent = outcome === 'hit' ? '✓' : '✕';
      slots.forEach((sl) => sl.classList.remove('go'));

      if (outcome === 'hit') {
        fastest = fastest === null ? rt : Math.min(fastest, rt);
        sfx.correct(Math.min(6, Math.max(0, Math.round((600 - rt) / 60))));
        readout.textContent = rt + ' ms';
        readout.className = 'rx-readout good';
        stage.burstAt(t.block === 'simple' ? pad : slots[t.target], ACCENT, 18);
        if (t.block === 'choice') slots[t.target].classList.add('hit');
      } else {
        sfx.wrong();
        stage.flashBad();
        readout.className = 'rx-readout bad';
        readout.textContent = outcome === 'timeout' ? 'Too slow'
          : outcome === 'anticipation' ? 'Too fast - that was a guess'
          : 'Wrong side';
        if (outcome === 'error' && response !== null) slots[response].classList.add('bad');
      }
      syncHud(true);
      later(() => { readout.textContent = ''; nextTrial(); }, 700);
    }

    /* --- the break before part 2 --- */
    let breakCard = null;

    function intermission() {
      phase = 'intermission';
      clearTimers();
      pad.classList.add('rx-hidden');
      slotsWrap.classList.remove('rx-hidden');
      partEl.textContent = 'Choice';
      promptEl.textContent = '';
      syncHud(false);
      const keys = KEY_LABELS[cfg.choices].join(' ');
      breakCard = el('div', { class: 'overlay' },
        el('div', {},
          el('div', { class: 'rx-break-title', text: 'Part 2 - which side?' }),
          el('div', { class: 'small', text: `A light appears in one of ${cfg.choices} places. Press its key (${keys}) or tap it - fast, but right.` }),
          el('button', { class: 'btn primary', type: 'button', style: { marginTop: '16px' }, onclick: goChoice }, 'Go')));
      board.append(breakCard);
    }

    function goChoice() {
      if (phase !== 'intermission') return;
      if (breakCard) { breakCard.remove(); breakCard = null; }
      phase = 'idle';
      falseStarts = 0;
      foreperiod = queue[idx].foreperiod;
      arm();
    }

    /* --- pause: the interrupted trial is discarded and re-run --- */
    let pausedCard = null;

    function pause() {
      if (killed || phase === 'paused' || phase === 'intermission') return;
      clearTimers();
      resetLights();
      phase = 'paused';
      pauses += 1;
      pausedCard = pauseOverlay(resume);
      board.append(pausedCard);
    }

    function resume() {
      if (phase !== 'paused') return;
      if (pausedCard) { pausedCard.remove(); pausedCard = null; }
      if (idx < 0) { nextTrial(); return; }
      foreperiod = Math.round(rng.range(...(queue[idx].block === 'simple' ? SIMPLE_FOREPERIOD : CHOICE_FOREPERIOD)));
      arm();
    }

    const onVisibility = () => { if (document.hidden) pause(); };

    const onKey = (e) => {
      if (killed || e.repeat) return;
      if (e.key === 'Escape') {
        if (official) return;
        cleanup(); showSetup(); return;
      }
      if (phase === 'paused') { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); resume(); } return; }
      if (phase === 'intermission') { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); goChoice(); } return; }
      const t = queue[idx];
      if (!t) return;
      if (t.block === 'simple') {
        if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); press(null, 'key'); }
        return;
      }
      const slot = slotForKey(e.key, cfg.choices);
      if (slot >= 0) { e.preventDefault(); press(slot, 'key'); }
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
      const result = { mode: cfg.key, score, ...summarize(trials, cfg), startedAt, raw: { seed, trials, pauses } };
      completeRound({ ctx, gameId: GAME_ID, cfg, result, showResults: (info) => showResults(cfg, result, info) });
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    setScreen(wrap, cleanup);
    stage.ready();
    syncHud(false);
    later(nextTrial, 400);
  }

  /* ---------------------------------------------------------------- results */

  function showResults(cfg, r, { isRecord, prevBest, change }) {
    const ability = abilityFor(GAME_ID);
    const grade = gradeFromScore(ability ? ability.score(r) : null);
    const verdict = {
      S: 'Very fast and accurate.',
      A: 'Quick, with decisions holding up.',
      B: 'Good speed - accuracy holding up.',
      C: 'Steady. React to the light rather than anticipating it.',
      D: 'Take it steady: wait for the light, then go.'
    }[grade];
    const ms = (v) => (typeof v === 'number' ? v + 'ms' : '—');
    const { node, cleanup } = resultsPanel({
      subtitle: cfg.name + ' round complete',
      grade, score: r.score, verdict, isRecord, prevBest, cfgName: cfg.name, change,
      stats: [
        [ms(r.simpleMedianRt), 'Simple'],
        [ms(r.choiceMedianRt), 'Choice'],
        [typeof r.choiceAccuracy === 'number' ? r.choiceAccuracy + '%' : '—', 'Choice accuracy'],
        [r.falseStarts, 'False starts']
      ],
      note: 'Median times - one slow reaction does not move them.',
      onAgain: () => startCountdown(cfg),
      onSetup: () => showSetup()
    });
    setScreen(node, cleanup);
  }

  if (official) startCountdown(officialConfig(MODES, official));
  else showSetup();
}
