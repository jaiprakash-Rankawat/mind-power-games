/* Visual Tracking - multiple-object tracking.
   One object is marked red, then every object turns identical and they all move.
   When they stop, the player picks the one that was red. Two right in a row
   speeds the next trial up, a miss slows it down, so the headline measure is the
   speed the player can keep up with. Motion is simulated in advance from a seed
   (./logic/visual-tracking-logic.js, unit-tested: in bounds, never overlapping,
   never stuck) and played back with requestAnimationFrame. */

import { el } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter } from '../core/arcade.js';
import { createRng, hashSeed } from '../core/rng.js';
import { abilityFor } from '../core/profile.js';
import { track } from '../core/analytics.js';
import {
  createScreens, officialOf, seedFor, setupPanel, countdown, completeRound, resultsPanel, pauseOverlay, gradeFromScore
} from '../core/game-kit.js';
import {
  simulate, positionAt, labelOrder, nextLevel, speedFor, pointsFor, summarize, ARENA, DT, LEVELS
} from './logic/visual-tracking-logic.js';

const GAME_ID = 'visual-tracking';
const ACCENT = '#fb7185';
const CUE_MS = 1500;                            // target marked, everything still
const ANSWER_MS = 10000;                        // generous: only stops a round stalling
const REVIEW_MS = { right: 900, wrong: 1600 };

const MODES = {
  easy: {
    key: 'easy', name: 'Easy', n: 3, duration: 4000, wander: 0.7, turns: 0, startLevel: 1, trials: 10,
    meta: '3 objects, gentle motion, 4 seconds. 10 rounds.'
  },
  medium: {
    key: 'medium', name: 'Medium', n: 5, duration: 5000, wander: 1.1, turns: 0.25, startLevel: 3, trials: 10,
    meta: '5 objects that cross paths, 5 seconds. 10 rounds.'
  },
  hard: {
    key: 'hard', name: 'Hard', n: 8, duration: 5000, wander: 1.4, turns: 0.5, startLevel: 4, trials: 10,
    meta: '8 objects, faster, with sudden turns. 10 rounds.'
  }
};

export function mount(root, ctx) {
  const setScreen = createScreens(root);
  const official = officialOf(ctx);

  /* ------------------------------------------------------------------ setup */

  async function showSetup() {
    const demo = el('div', { class: 'vt-demo', 'aria-hidden': 'true' },
      el('span', { class: 'vt-demo-dot cue' }), el('span', { class: 'vt-demo-dot' }), el('span', { class: 'vt-demo-dot' }),
      el('span', { class: 'demo-arrow', text: '-> all the same -> which was red?' }));
    setScreen(await setupPanel({
      gameId: GAME_ID,
      title: 'Visual Tracking',
      lead: 'Keep your eyes on one object as it moves among identical ones.',
      demo,
      rules: [
        'One object is shown in <b>red</b>. Then they all turn the <b>same colour</b> and start moving.',
        'Follow the red one with your eyes. Objects bounce off each other and the walls - they never merge.',
        'When they stop, click the one you followed, or press its <b>number</b>.',
        'Two right in a row and the next round is <b>faster</b>; a miss slows it down.'
      ],
      modes: MODES,
      bestText: (b) => 'Best ' + b.score + (b.levelReached ? ' - speed ' + b.levelReached : ''),
      onPick: startCountdown
    }));
  }

  function startCountdown(cfg) {
    countdown(setScreen, { note: 'Follow the red one', onGo: () => startGame(cfg) });
  }

  /* ------------------------------------------------------------------- play */

  function startGame(cfg) {
    const rng = createRng(seedFor(ctx));
    const seed = rng.seed;
    const log = [];                             // raw record of every trial
    const startedAt = new Date().toISOString();
    const roundStart = performance.now();

    let level = cfg.startLevel;
    let streak = 0;
    let trialNo = 0;                            // counts voided trials too, so each gets its own seed
    let sim = null;
    let target = 0;
    let labels = [];                            // labels[k] = object shown as number k + 1
    let phase = 'idle';                         // idle | cue | move | answer | review | paused
    let moveStart = 0;
    let askedAt = 0;
    let raf = 0;
    let score = 0;
    let killed = false;
    let pauses = 0;
    let voided = 0;
    let scale = 1;
    let shownFrame = 0;

    const timers = new Set();
    const later = (fn, ms) => {
      const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
      timers.add(t);
    };
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
    const stopFrames = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

    /* --- HUD --- */
    const scoreEl = el('b', { text: '0' });
    const roundEl = el('b', { text: '0/' + cfg.trials });
    const levelEl = el('b', { text: String(level) });
    const rightEl = el('b', { text: '0' });
    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box' }, roundEl, el('span', { text: 'Round' })),
      el('div', { class: 'box hot' }, levelEl, el('span', { text: 'Speed' })),
      el('div', { class: 'box' }, rightEl, el('span', { text: 'Correct' })));
    const timerFill = el('div', { class: 'timer-fill' });
    const timerTrack = el('div', { class: 'timer-track' }, timerFill);
    const meter = createMeter('Get ready');

    /* --- field: one button per object, positioned with transforms --- */
    const promptEl = el('div', { class: 'prompt', text: 'Get ready' });
    const field = el('div', { class: 'vt-field' });
    const objs = Array.from({ length: cfg.n }, (_, i) => {
      const b = el('button', { class: 'vt-obj', type: 'button', tabindex: '-1', 'aria-label': 'Object' });
      b.addEventListener('click', () => answer(i, 'pointer'));
      field.append(b);
      return b;
    });
    const stage = createStage('vt');
    stage.add(promptEl, el('div', { class: 'arena vt-arena' }, field));
    stage.tint(ACCENT);
    const board = stage.board;
    const hint = el('p', {
      class: 'foot-hint',
      text: 'Click the object or press its number - Space to pause' + (official ? '' : ' - Esc to quit')
    });
    const wrap = el('div', {}, hud, timerTrack, meter.wrap, board, hint);

    function place(frame) {
      shownFrame = frame;
      const f0 = Math.floor(frame);
      const f1 = Math.min(sim.steps, f0 + 1);
      const a = frame - f0;
      const d = 2 * ARENA.r * scale;
      for (let i = 0; i < cfg.n; i++) {
        const p = positionAt(sim, f0, i);
        const q = positionAt(sim, f1, i);
        const x = (p.x + (q.x - p.x) * a) * scale - d / 2;
        const y = (p.y + (q.y - p.y) * a) * scale - d / 2;
        objs[i].style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
    }

    // the arena is drawn at whatever size the page allows; positions scale with it
    const resize = new ResizeObserver(() => {
      scale = field.clientWidth / ARENA.w;
      field.style.setProperty('--vt-d', (2 * ARENA.r * scale).toFixed(1) + 'px');
      if (sim) place(shownFrame);
    });
    resize.observe(field);

    function syncHud(animate) {
      if (animate) countUp(scoreEl, score, 300); else scoreEl.textContent = score;
      roundEl.textContent = Math.min(cfg.trials, log.length + (phase === 'review' || phase === 'idle' ? 0 : 1)) + '/' + cfg.trials;
      levelEl.textContent = level + '/' + LEVELS;
      rightEl.textContent = String(log.filter((t) => t.correct).length);
      meter.set((log.length / cfg.trials) * 100, 'Round ' + Math.min(cfg.trials, log.length + 1) + ' of ' + cfg.trials);
    }

    function runTimer(ms) {
      timerFill.style.transition = 'none';
      timerFill.style.width = '100%';
      void timerFill.offsetWidth;
      timerFill.style.transition = `width ${ms}ms linear`;
      timerFill.style.width = '0%';
    }
    function freezeTimer() {
      const w = getComputedStyle(timerFill).width;
      timerFill.style.transition = 'none';
      timerFill.style.width = w;
    }
    function resetTimer() {
      timerFill.style.transition = 'none';
      timerFill.style.width = '100%';
    }

    /* --- one trial: cue -> move -> answer -> review --- */
    function newTrial() {
      if (killed) return;
      if (log.length >= cfg.trials) { finish(); return; }
      trialNo += 1;
      const trialSeed = hashSeed(seed, 'trial', trialNo);
      const speed = speedFor(level);
      sim = simulate(trialSeed, { n: cfg.n, speed, duration: cfg.duration, wander: cfg.wander, turns: cfg.turns });
      sim.meta = { trialSeed, speed, level };
      target = createRng(trialSeed ^ 0x9e3779b9).int(cfg.n);
      labels = labelOrder(sim);

      field.classList.remove('answering');
      objs.forEach((o, i) => {
        o.className = 'vt-obj' + (i === target ? ' cue' : '');
        o.textContent = '';
        o.setAttribute('aria-label', 'Object');
      });
      place(0);
      resetTimer();
      phase = 'cue';
      promptEl.innerHTML = 'Follow the <b>red</b> one';
      syncHud(false);
      later(startMoving, CUE_MS);
    }

    function startMoving() {
      if (killed) return;
      phase = 'move';
      objs[target].classList.remove('cue');       // from here on, they all look the same
      promptEl.textContent = 'Keep your eyes on it';
      moveStart = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function frame(now) {
      raf = 0;
      if (killed || phase !== 'move') return;
      const f = Math.min(sim.steps, (now - moveStart) / (DT * 1000));
      place(f);
      if (f >= sim.steps) { ask(); return; }
      raf = requestAnimationFrame(frame);
    }

    function ask() {
      phase = 'answer';
      place(sim.steps);
      labels.forEach((obj, k) => {
        objs[obj].textContent = String((k + 1) % 10);   // the tenth object is key 0
        objs[obj].setAttribute('aria-label', 'Object ' + ((k + 1) % 10));
      });
      field.classList.add('answering');
      promptEl.innerHTML = 'Which one was <b>red</b>? Click it or press its number';
      askedAt = performance.now();
      runTimer(ANSWER_MS);
      later(() => answer(null, 'none'), ANSWER_MS);
    }

    function answer(obj, input) {
      if (killed || phase !== 'answer') return;
      phase = 'review';
      clearTimers();
      freezeTimer();
      field.classList.remove('answering');
      const rt = obj === null ? null : Math.round(performance.now() - askedAt);
      const correct = obj === target;
      log.push({
        trialSeed: sim.meta.trialSeed, level: sim.meta.level, speed: sim.meta.speed, n: cfg.n, duration: cfg.duration,
        target, response: obj, targetLabel: (labels.indexOf(target) + 1) % 10,
        responseLabel: obj === null ? null : (labels.indexOf(obj) + 1) % 10, correct, rt, input
      });
      score += pointsFor(correct, level, rt);

      // right / wrong is shown with a mark, not by colour alone
      if (correct) {
        objs[target].classList.add('hit');
        objs[target].textContent = '✓';
        sfx.correct(Math.min(6, level));
        stage.burstAt(objs[target], ACCENT, 18);
        promptEl.textContent = 'Right - that was it';
      } else {
        if (obj !== null) { objs[obj].classList.add('miss'); objs[obj].textContent = '✗'; }
        objs[target].classList.add('reveal');
        sfx.wrong();
        stage.flashBad();
        promptEl.textContent = (obj === null ? 'Out of time' : 'Not that one') + ' - the ringed one was red';
      }

      const step = nextLevel(level, streak, correct);
      if (step.level > level) stage.say('FASTER');
      level = step.level;
      streak = step.streak;
      syncHud(true);
      later(newTrial, correct ? REVIEW_MS.right : REVIEW_MS.wrong);
    }

    /* --- pause: tracking cannot be resumed fairly, so the trial is replayed fresh --- */
    let pausedCard = null;

    function pause() {
      if (killed || !['cue', 'move', 'answer'].includes(phase)) return;
      clearTimers();
      stopFrames();
      freezeTimer();
      phase = 'paused';
      pauses += 1;
      voided += 1;
      field.classList.remove('answering');
      pausedCard = pauseOverlay(resume);
      board.append(pausedCard);
    }

    function resume() {
      if (phase !== 'paused') return;
      if (pausedCard) { pausedCard.remove(); pausedCard = null; }
      newTrial();                               // same speed, new motion
    }

    const onVisibility = () => { if (document.hidden) pause(); };

    const onKey = (e) => {
      if (killed || e.repeat) return;
      if (e.key === 'Escape') {
        if (official) return;
        abandon(); return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'paused') resume(); else pause();
        return;
      }
      if (phase !== 'answer') return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || e.key.length !== 1) return;
      const k = n === 0 ? 9 : n - 1;
      if (k < labels.length) { e.preventDefault(); answer(labels[k], 'key'); }
    };

    function cleanup() {
      killed = true;
      clearTimers();
      stopFrames();
      resize.disconnect();
      stage.destroy();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    function abandon() {
      track('game_abandoned', {
        game_id: GAME_ID, difficulty: cfg.key, trials_completed: log.length,
        duration_ms: Math.round(performance.now() - roundStart), start_time: startedAt
      });
      cleanup();
      showSetup();
    }

    function finish() {
      cleanup();
      sfx.finish();
      const result = {
        mode: cfg.key, score, objects: cfg.n, distractors: cfg.n - 1, trackingMs: cfg.duration,
        ...summarize(log), startedAt,
        raw: { seed, trials: log, pauses, voided, motion: { wander: cfg.wander, turns: cfg.turns, cueMs: CUE_MS } }
      };
      completeRound({ ctx, gameId: GAME_ID, cfg, result, showResults: (info) => showResults(cfg, result, info) });
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    setScreen(wrap, cleanup);
    stage.ready();
    syncHud(false);
    later(newTrial, 300);
  }

  /* ---------------------------------------------------------------- results */

  function showResults(cfg, r, { isRecord, prevBest, change }) {
    const ability = abilityFor(GAME_ID);
    const grade = gradeFromScore(ability ? ability.score(r) : null);
    const verdict = {
      S: 'You kept track at speeds that lose most people.',
      A: 'Steady tracking, even as things sped up.',
      B: 'Good tracking. Keep your eyes soft and on the target, not on the crowd.',
      C: 'Try following it with your eyes only - no need to look anywhere else.',
      D: 'Lock on in the red moment, then keep watching that one spot move - ignore the others.'
    }[grade];
    const { node, cleanup } = resultsPanel({
      subtitle: cfg.name + ' round complete',
      grade, score: r.score, verdict, isRecord, prevBest, cfgName: cfg.name, change,
      stats: [
        [r.levelEstimate ?? '—', 'Speed held'],
        [r.levelReached + ' / ' + LEVELS, 'Top speed'],
        [r.correct + '/' + r.total, 'Correct'],
        [r.distractors, 'Look-alikes']
      ],
      note: '"Speed held" is where the speed settled in the second half of the round.',
      onAgain: () => startCountdown(cfg),
      onSetup: () => showSetup()
    });
    setScreen(node, cleanup);
  }

  if (official) startCountdown(MODES[official.difficulty] || MODES.medium);
  else showSetup();
}
