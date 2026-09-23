/* Spatial Rotation - visuospatial reasoning.
   Two shapes: is the right one the left one turned around, or its mirror image?
   Reaction time rises with the angle to be mentally rotated - the slope of that
   rise is recorded alongside accuracy. Shape and trial logic lives in
   ./logic/spatial-logic.js (unit-tested: every trial has exactly one answer). */

import { el } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter } from '../core/arcade.js';
import { createRng } from '../core/rng.js';
import { abilityFor } from '../core/profile.js';
import {
  createScreens, officialOf, seedFor, setupPanel, countdown, completeRound, resultsPanel, pauseOverlay, gradeFromScore
} from '../core/game-kit.js';
import { makeTrials, summarize } from './logic/spatial-logic.js';

const GAME_ID = 'spatial-rotation';
const ACCENT = '#fbbf24';
const FEEDBACK_MS = 900;
const NS = 'http://www.w3.org/2000/svg';

const MODES = {
  easy: { key: 'easy', name: 'Easy', size: 5, angles: [45, 90], count: 16, limit: 8000, meta: '5-square shapes, small turns. 16 pairs.' },
  medium: { key: 'medium', name: 'Medium', size: 6, angles: [45, 90, 135, 180], count: 16, limit: 7000, meta: '6-square shapes, turns up to 180 degrees. 16 pairs.' },
  hard: { key: 'hard', name: 'Hard', size: 7, angles: [45, 90, 135, 180], count: 24, limit: 6000, meta: '7-square shapes, any turn, 6s each. 24 pairs.' }
};

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

/** A shape drawn centred in a square SVG, turned by `rotation` degrees. */
function shapeSvg(cells, rotation, fill) {
  const S = 200;
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  const cell = Math.min(28, 124 / Math.max(w, h));      // turned diagonal still fits
  const gap = cell * 0.1;
  const ox = (S - (w * cell + (w - 1) * gap)) / 2;
  const oy = (S - (h * cell + (h - 1) * gap)) / 2;
  const svg = svgEl('svg', { viewBox: `0 0 ${S} ${S}`, class: 'sr-svg', 'aria-hidden': 'true' });
  const g = svgEl('g', { transform: `rotate(${rotation} ${S / 2} ${S / 2})` });
  for (const [x, y] of cells) {
    g.append(svgEl('rect', {
      x: ox + x * (cell + gap), y: oy + y * (cell + gap), width: cell, height: cell, rx: cell * 0.18, fill
    }));
  }
  svg.append(g);
  return svg;
}

export function mount(root, ctx) {
  const setScreen = createScreens(root);
  const official = officialOf(ctx);

  /* ------------------------------------------------------------------ setup */

  async function showSetup() {
    const L = [[0, 0], [0, 1], [0, 2], [1, 2], [1, 3]];
    const demo = el('div', { class: 'sr-demo', 'aria-hidden': 'true' },
      shapeSvg(L, 0, '#60a5fa'), el('span', { class: 'demo-arrow', text: 'vs' }), shapeSvg(L.map(([x, y]) => [1 - x, y]), 90, '#fbbf24'),
      el('span', { class: 'demo-arrow', text: '-> MIRROR' }));
    setScreen(await setupPanel({
      gameId: GAME_ID,
      title: 'Spatial Rotation',
      lead: 'Turn shapes in your head. Is it the same shape, or its mirror image?',
      demo,
      rules: [
        'The right shape is the left one <b>turned around</b> - or its <b>mirror image</b>, turned.',
        'Answer <b>SAME</b> (F) or <b>MIRROR</b> (J), or tap. You cannot get there by flipping in your head - only by turning.',
        'Accuracy counts first; then speed. Bigger turns take longer - that is expected.',
        'Every shape is chosen so the answer is never ambiguous.'
      ],
      modes: MODES,
      bestText: (b) => 'Best ' + b.score + (typeof b.accuracy === 'number' ? ' - ' + b.accuracy + '%' : ''),
      onPick: startCountdown
    }));
  }

  function startCountdown(cfg) {
    countdown(setScreen, { note: 'Same shape turned - or its mirror image?', onGo: () => startGame(cfg) });
  }

  /* ------------------------------------------------------------------- play */

  function startGame(cfg) {
    const rng = createRng(seedFor(ctx));
    const seed = rng.seed;
    const plan = makeTrials(rng, cfg);
    const log = [];                           // raw record of every pair
    const startedAt = new Date().toISOString();

    let idx = -1;
    let phase = 'idle';                       // idle | go | done | paused
    let shownAt = 0;
    let usedMs = 0;
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
    const pairEl = el('b', { text: '0/' + plan.length });
    const accEl = el('b', { text: '—' });
    const streakEl = el('b', { text: '0' });
    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box' }, pairEl, el('span', { text: 'Pair' })),
      el('div', { class: 'box' }, accEl, el('span', { text: 'Accuracy' })),
      el('div', { class: 'box hot' }, streakEl, el('span', { text: 'Streak' })));
    const timerFill = el('div', { class: 'timer-fill' });
    const timerTrack = el('div', { class: 'timer-track' }, timerFill);
    const meter = createMeter('Get ready');

    const promptEl = el('div', { class: 'prompt', html: 'Same shape <b>turned</b> - or its <b>mirror image</b>?' });
    const left = el('div', { class: 'sr-panel' });
    const right = el('div', { class: 'sr-panel' });
    const btnSame = el('button', { class: 'ts-btn sr-btn', type: 'button' }, el('b', { text: 'SAME' }), el('span', { class: 'ts-key', text: 'F' }));
    const btnMirror = el('button', { class: 'ts-btn sr-btn', type: 'button' }, el('b', { text: 'MIRROR' }), el('span', { class: 'ts-key', text: 'J' }));
    btnSame.addEventListener('pointerdown', (e) => { e.preventDefault(); respond('same', 'pointer'); });
    btnMirror.addEventListener('pointerdown', (e) => { e.preventDefault(); respond('mirror', 'pointer'); });

    const stage = createStage('sr');
    stage.add(promptEl, el('div', { class: 'arena sr-arena' },
      el('div', { class: 'sr-pair' }, left, right),
      el('div', { class: 'ts-buttons' }, btnSame, btnMirror)));
    stage.tint(ACCENT);
    const board = stage.board;
    const hint = el('p', { class: 'foot-hint', text: 'F = same - J = mirror - Space to pause' + (official ? '' : ' - Esc to quit') });
    const wrap = el('div', {}, hud, timerTrack, meter.wrap, board, hint);

    function syncHud(animate) {
      if (animate) countUp(scoreEl, score, 300); else scoreEl.textContent = score;
      pairEl.textContent = Math.max(0, idx + 1) + '/' + plan.length;
      accEl.textContent = log.length ? Math.round((log.filter((t) => t.correct).length / log.length) * 100) + '%' : '—';
      streakEl.textContent = streak;
      meter.set((log.length / plan.length) * 100, 'Pair ' + Math.max(1, idx + 1) + ' of ' + plan.length);
    }

    function runTimer(ms) {
      timerFill.style.transition = 'none';
      timerFill.style.width = (ms / cfg.limit) * 100 + '%';
      void timerFill.offsetWidth;
      timerFill.style.transition = `width ${ms}ms linear`;
      timerFill.style.width = '0%';
    }
    function freezeTimer() {
      const w = getComputedStyle(timerFill).width;
      timerFill.style.transition = 'none';
      timerFill.style.width = w;
    }

    /* --- trials --- */
    function next() {
      if (killed) return;
      idx += 1;
      if (idx >= plan.length) { finish(); return; }
      const t = plan[idx];
      left.replaceChildren(shapeSvg(t.cells, 0, '#60a5fa'));
      right.replaceChildren(shapeSvg(t.probe, t.angle * t.direction, '#fbbf24'));
      left.classList.remove('good', 'bad');
      right.classList.remove('good', 'bad');
      usedMs = 0;
      go();
    }

    function go() {
      phase = 'go';
      shownAt = performance.now();
      requestAnimationFrame(() => { if (phase === 'go' && usedMs === 0) shownAt = performance.now(); });
      runTimer(cfg.limit - usedMs);
      later(() => respond(null, 'none'), cfg.limit - usedMs);
      syncHud(false);
    }

    function respond(choice, input) {
      if (killed || phase !== 'go') return;
      phase = 'done';
      clearTimers();
      freezeTimer();
      const t = plan[idx];
      const rt = choice === null ? null : Math.round(usedMs + performance.now() - shownAt);
      const correct = choice === t.answer;
      log.push({
        shape: t.cells, mirrored: t.mirrored, angle: t.angle, direction: t.direction,
        answer: t.answer, response: choice, correct, rt, input
      });

      if (correct) {
        streak += 1;
        score += 100 + Math.max(0, Math.round((cfg.limit - rt) / 60));
        right.classList.add('good');
        sfx.correct(Math.min(6, Math.floor(streak / 2)));
        stage.burstAt(choice === 'same' ? btnSame : btnMirror, ACCENT, 16);
        promptEl.innerHTML = t.mirrored ? 'Right - a <b>mirror image</b>' : 'Right - the <b>same shape</b>, turned';
      } else {
        streak = 0;
        right.classList.add('bad');
        sfx.wrong();
        stage.flashBad();
        promptEl.innerHTML = (choice === null ? 'Out of time - ' : 'Not quite - ') +
          (t.mirrored ? 'it was a <b>mirror image</b>' : 'it was the <b>same shape</b>, turned');
      }
      syncHud(true);
      later(() => {
        promptEl.innerHTML = 'Same shape <b>turned</b> - or its <b>mirror image</b>?';
        next();
      }, FEEDBACK_MS);
    }

    /* --- pause: the shapes are hidden and the clock stops --- */
    let pausedCard = null;

    function pause() {
      if (killed || phase !== 'go') return;
      clearTimers();
      freezeTimer();
      usedMs += performance.now() - shownAt;
      phase = 'paused';
      pauses += 1;
      pausedCard = pauseOverlay(resume);
      board.append(pausedCard);
    }

    function resume() {
      if (phase !== 'paused') return;
      if (pausedCard) { pausedCard.remove(); pausedCard = null; }
      go();
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
      if (k === 'f' || k === 'arrowleft' || k === 's') { e.preventDefault(); respond('same', 'key'); }
      if (k === 'j' || k === 'arrowright' || k === 'm') { e.preventDefault(); respond('mirror', 'key'); }
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
    syncHud(false);
    later(next, 300);
  }

  /* ---------------------------------------------------------------- results */

  function showResults(cfg, r, { isRecord, prevBest, change }) {
    const ability = abilityFor(GAME_ID);
    const grade = gradeFromScore(ability ? ability.score(r) : null);
    const verdict = {
      S: 'Fast and accurate rotations - even the big turns.',
      A: 'Accurate, with quick rotations.',
      B: 'Good accuracy. Speed comes with practice.',
      C: 'Pick one feature - a corner or a notch - and track where it turns to.',
      D: 'Take your time: find a distinctive corner on the left shape, then find it on the right.'
    }[grade];
    const perDeg = typeof r.rtSlope === 'number' ? Math.max(0, r.rtSlope) : null;
    const { node, cleanup } = resultsPanel({
      subtitle: cfg.name + ' round complete',
      grade, score: r.score, verdict, isRecord, prevBest, cfgName: cfg.name, change,
      stats: [
        [r.accuracy + '%', 'Accuracy'],
        [r.correct + '/' + r.total, 'Correct'],
        [typeof r.medianRt === 'number' ? (r.medianRt / 1000).toFixed(1) + 's' : '—', 'Median time'],
        [perDeg === null ? '—' : perDeg.toFixed(1) + 'ms', 'Per degree']
      ],
      note: '"Per degree" is how much longer each extra degree of turning took you.',
      onAgain: () => startCountdown(cfg),
      onSetup: () => showSetup()
    });
    setScreen(node, cleanup);
  }

  if (official) startCountdown(MODES[official.difficulty] || MODES.medium);
  else showSetup();
}
