/* Attention Storm - sustained attention and inhibitory control.
   Shapes flash one at a time; the player presses only for the star. Look-alike
   lures test holding back, a long fast stream tests staying on task, and the
   pace adapts between blocks. Scoring is based on sensitivity (d-prime: stars
   caught versus false alarms), not on speed alone. Stream building, response
   windows and scoring live in ./logic/attention-storm-logic.js (unit-tested). */

import { el } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter } from '../core/arcade.js';
import { createRng } from '../core/rng.js';
import { abilityFor } from '../core/profile.js';
import { track } from '../core/analytics.js';
import {
  createScreens, officialOf, seedFor, setupPanel, countdown, completeRound, resultsPanel, pauseOverlay, gradeFromScore
} from '../core/game-kit.js';
import {
  makeBlock, windowFor, outcomeOf, pointsFor, nextLevel, rates, summarize, timingFor, shapeMarkup,
  GRACE_MS, MAX_LEVEL, TARGET
} from './logic/attention-storm-logic.js';

const GAME_ID = 'attention-storm';
const ACCENT = '#fbbf24';
const LEAD_MS = 700;                            // blank card before a block starts
const BREAK_MS = 1700;                          // between blocks

const MODES = {
  easy: {
    key: 'easy', name: 'Easy', startLevel: 1, blocks: 3, size: 32, targets: 8, lures: 4,
    lureShapes: ['star6', 'star4'], otherShapes: ['circle', 'triangle', 'square', 'diamond'],
    meta: 'A steady stream; the look-alikes are easy to tell apart. 96 shapes.'
  },
  medium: {
    key: 'medium', name: 'Medium', startLevel: 3, blocks: 3, size: 32, targets: 8, lures: 5,
    lureShapes: ['star6', 'star5-outline'], otherShapes: ['circle', 'triangle', 'square', 'diamond', 'hexagon'],
    meta: 'Faster, with closer look-alikes. 96 shapes.'
  },
  hard: {
    key: 'hard', name: 'Hard', startLevel: 5, blocks: 3, size: 32, targets: 8, lures: 6,
    lureShapes: ['star5-outline', 'star5-inverted', 'star6'], otherShapes: ['circle', 'triangle', 'square', 'diamond', 'hexagon', 'plus'],
    meta: 'Fast, with near-identical look-alikes. 96 shapes.'
  }
};

const icon = (shape) => el('span', { class: 'as-icon', html: shapeMarkup(shape, 'currentColor', 'as-icon-svg') });

export function mount(root, ctx) {
  const setScreen = createScreens(root);
  const official = officialOf(ctx);

  /* ------------------------------------------------------------------ setup */

  async function showSetup() {
    const demo = el('div', { class: 'as-demo', 'aria-hidden': 'true' },
      ['circle', 'triangle', TARGET, 'square', 'star6'].map((s) =>
        el('span', { class: 'as-demo-shape' + (s === TARGET ? ' is-target' : ''), html: shapeMarkup(s) })),
      el('span', { class: 'demo-arrow', text: '-> press only for the star' }));
    setScreen(await setupPanel({
      gameId: GAME_ID,
      title: 'Attention Storm',
      lead: 'Stay sharp through a fast stream of shapes - and hold back for the look-alikes.',
      demo,
      rules: [
        'Shapes flash one at a time. Press <b>Space</b> (or tap) only when you see the <b>five-point star</b>.',
        'Some shapes are <b>look-alikes</b> - a six-point star, an outline star, an upside-down star. Do not press for them.',
        'Missing a star counts, and so does pressing for anything else. Speed matters less than getting both right.',
        'The stream comes in three blocks and speeds up when you are doing well.'
      ],
      modes: MODES,
      bestText: (b) => 'Best ' + b.score + (typeof b.hitRate === 'number' ? ' - ' + b.hitRate + '% caught' : ''),
      onPick: startCountdown
    }));
  }

  function startCountdown(cfg) {
    countdown(setScreen, { note: 'Press only for the five-point star', onGo: () => startGame(cfg) });
  }

  /* ------------------------------------------------------------------- play */

  function startGame(cfg) {
    const rng = createRng(seedFor(ctx));
    const seed = rng.seed;
    const all = [];                             // raw record of every stimulus, across blocks
    const blockLog = [];
    const startedAt = new Date().toISOString();
    const roundStart = performance.now();

    let level = cfg.startLevel;
    let blockNo = 0;
    let stims = [];                             // the current block
    let onsets = [];                            // actual onset of each stimulus in this block
    let cur = -1;                               // index of the shape on screen (or last shown)
    let phase = 'idle';                         // idle | stream | break | paused
    let score = 0;
    let streak = 0;
    let killed = false;
    let pauses = 0;
    let extraPresses = 0;

    const timers = new Set();
    const later = (fn, ms) => {
      const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
      timers.add(t);
    };
    const at = (when, fn) => later(fn, Math.max(0, when - performance.now()));
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

    /* --- HUD --- */
    const scoreEl = el('b', { text: '0' });
    const hitsEl = el('b', { text: '0' });
    const faEl = el('b', { text: '0' });
    const levelEl = el('b', { text: level + '/' + MAX_LEVEL });
    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box' }, hitsEl, el('span', { text: 'Stars caught' })),
      el('div', { class: 'box' }, faEl, el('span', { text: 'False alarms' })),
      el('div', { class: 'box hot' }, levelEl, el('span', { text: 'Speed' })));
    const meter = createMeter('Get ready');

    /* --- board --- */
    const promptEl = el('div', { class: 'prompt' }, 'Press only for ', icon(TARGET));
    const shapeEl = el('div', { class: 'as-shape' });
    const card = el('div', { class: 'as-card' }, shapeEl);
    const feedbackEl = el('p', { class: 'as-feedback' });
    const arena = el('div', { class: 'arena as-arena' }, card, feedbackEl);
    arena.addEventListener('pointerdown', (e) => { e.preventDefault(); respond('pointer'); });

    const stage = createStage('as');
    stage.add(promptEl, arena);
    stage.tint(ACCENT);
    const board = stage.board;
    const hint = el('p', {
      class: 'foot-hint',
      text: 'Space, J or tap for the star - P to pause' + (official ? '' : ' - Esc to quit')
    });
    const wrap = el('div', {}, hud, meter.wrap, board, hint);

    const total = cfg.blocks * cfg.size;
    function syncHud(animate) {
      if (animate) countUp(scoreEl, score, 250); else scoreEl.textContent = score;
      const done = all.filter((s) => s.kind === 'target' && s.responded && !s.voided).length;
      hitsEl.textContent = String(done);
      faEl.textContent = String(all.filter((s) => s.kind !== 'target' && s.responded).length);
      levelEl.textContent = level + '/' + MAX_LEVEL;
      const shown = all.filter((s) => s.shown).length;
      meter.set((shown / total) * 100, 'Block ' + Math.max(1, Math.min(cfg.blocks, blockNo)) + ' of ' + cfg.blocks + ' - ' + shown + ' / ' + total);
    }

    function say(text, cls) {
      feedbackEl.textContent = text;
      feedbackEl.className = 'as-feedback ' + (cls || '');
    }

    /* --- a block: shapes scheduled from one start time, so the pace never drifts --- */
    function startBlock() {
      if (killed) return;
      blockNo += 1;
      stims = makeBlock(rng, cfg).map((s, i) => ({
        ...s, block: blockNo, index: i, level: null, shown: false, onset: null,
        responded: false, rt: null, input: null, outcome: null, closed: false, voided: false
      }));
      all.push(...stims);
      onsets = [];
      cur = -1;
      promptEl.replaceChildren('Block ' + blockNo + ' of ' + cfg.blocks + ' - press only for ', icon(TARGET));
      runStream(0);
    }

    function runStream(from) {
      phase = 'stream';
      const { on, off } = timingFor(level);
      const start = performance.now() + LEAD_MS;
      if (from >= stims.length) { endBlock(); return; }
      for (let k = from; k < stims.length; k++) at(start + (k - from) * (on + off), () => show(k, on, off));
      syncHud(false);
    }

    function show(k, on, off) {
      if (killed || phase !== 'stream') return;
      const s = stims[k];
      cur = k;
      s.onset = performance.now();
      onsets[k] = s.onset;
      s.level = level;
      s.shown = true;
      shapeEl.innerHTML = shapeMarkup(s.shape);
      shapeEl.classList.remove('in');
      void shapeEl.offsetWidth;
      shapeEl.classList.add('in');
      card.classList.remove('hit', 'fa');
      // the previous shape's response window closes as this one's opens
      later(() => closeWindow(k - 1), GRACE_MS);
      later(() => { if (cur === k) shapeEl.innerHTML = ''; }, on);
      if (k === stims.length - 1) later(() => { closeWindow(k); endBlock(); }, on + off + GRACE_MS);
      syncHud(false);
    }

    function closeWindow(k) {
      const s = stims[k];
      if (!s || s.closed || !s.shown) return;
      s.closed = true;
      if (s.voided) return;
      s.outcome = outcomeOf(s);
      if (s.outcome === 'miss') {
        streak = 0;
        score = Math.max(0, score + pointsFor('miss', s.kind, null));
        say('Missed a star', 'miss');
        syncHud(true);
      }
    }

    function respond(input) {
      if (killed) return;
      if (phase === 'paused') { resume(); return; }
      if (phase !== 'stream') return;
      const t = performance.now();
      const k = windowFor(onsets, t);
      const s = stims[k];
      if (!s || s.closed || s.voided || s.responded) { extraPresses += 1; return; }
      s.responded = true;
      s.rt = Math.round(t - s.onset);
      s.input = input;
      const outcome = s.kind === 'target' ? 'hit' : 'false-alarm';
      score = Math.max(0, score + pointsFor(outcome, s.kind, s.rt));
      if (outcome === 'hit') {
        streak += 1;
        card.classList.add('hit');
        sfx.correct(Math.min(6, Math.floor(streak / 2)));
        stage.burstAt(card, ACCENT, 14);
        say('✓ Star - ' + s.rt + ' ms', 'hit');
      } else {
        streak = 0;
        card.classList.add('fa');
        sfx.wrong();
        say(s.kind === 'lure' ? '✗ Look-alike - not the star' : '✗ Not a star', 'fa');
      }
      syncHud(true);
    }

    function endBlock() {
      if (killed || phase !== 'stream') return;
      phase = 'break';
      shapeEl.innerHTML = '';
      const r = rates(stims);
      blockLog.push({ block: blockNo, level, hitRate: Math.round(r.hitRate * 100), faRate: Math.round(r.faRate * 100) });
      if (blockNo >= cfg.blocks) { finish(); return; }
      const next = nextLevel(level, r);
      stage.say(next > level ? 'FASTER' : next < level ? 'A LITTLE SLOWER' : 'SAME PACE');
      say('Block ' + blockNo + ': ' + Math.round(r.hitRate * 100) + '% of stars caught', '');
      level = next;
      syncHud(false);
      later(startBlock, BREAK_MS);
    }

    /* --- pause: the shape on screen is voided; the block carries on from the next one --- */
    let pausedCard = null;

    let resumeTo = null;

    function pause() {
      if (killed || phase === 'paused') return;
      clearTimers();
      if (phase === 'stream') {
        if (cur >= 0) {
          closeWindow(cur - 1);
          const s = stims[cur];
          if (!s.responded) s.voided = true;
          s.closed = true;
        }
        resumeTo = () => runStream(cur + 1);
      } else {
        // before the first block or between blocks: the next block waits for the player
        resumeTo = startBlock;
      }
      phase = 'paused';
      pauses += 1;
      shapeEl.innerHTML = '';
      pausedCard = pauseOverlay(resume);
      board.append(pausedCard);
    }

    function resume() {
      if (phase !== 'paused') return;
      if (pausedCard) { pausedCard.remove(); pausedCard = null; }
      const go = resumeTo;
      resumeTo = null;
      go();
    }

    const onVisibility = () => { if (document.hidden) pause(); };

    const onKey = (e) => {
      if (killed || e.repeat) return;
      if (e.key === 'Escape') {
        if (official) return;
        abandon(); return;
      }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); if (phase === 'paused') resume(); else pause(); return; }
      if (e.code === 'Space' || e.key === 'Enter' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        respond('key');
      }
    };

    function cleanup() {
      killed = true;
      clearTimers();
      stage.destroy();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    function abandon() {
      track('game_abandoned', {
        game_id: GAME_ID, difficulty: cfg.key, trials_completed: all.filter((s) => s.closed && !s.voided).length,
        duration_ms: Math.round(performance.now() - roundStart), start_time: startedAt
      });
      cleanup();
      showSetup();
    }

    function finish() {
      cleanup();
      sfx.finish();
      const stimuli = all.filter((s) => s.shown).map((s) => ({
        block: s.block, index: s.index, level: s.level, kind: s.kind, shape: s.shape,
        onset: Math.round(s.onset - roundStart), responded: s.responded, rt: s.rt, input: s.input,
        outcome: s.voided ? 'voided' : outcomeOf(s), voided: s.voided
      }));
      const result = {
        mode: cfg.key, score, ...summarize(stimuli), extraPresses, startedAt,
        raw: { seed, stimuli, blocks: blockLog, pauses, levels: cfg.blocks, graceMs: GRACE_MS }
      };
      completeRound({ ctx, gameId: GAME_ID, cfg, result, showResults: (info) => showResults(cfg, result, info) });
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    setScreen(wrap, cleanup);
    stage.ready();
    syncHud(false);
    later(startBlock, 300);
  }

  /* ---------------------------------------------------------------- results */

  function showResults(cfg, r, { isRecord, prevBest, change }) {
    const ability = abilityFor(GAME_ID);
    const grade = gradeFromScore(ability ? ability.score(r) : null);
    const verdict = {
      S: 'Sharp and steady - you caught the stars and ignored the look-alikes.',
      A: 'Strong focus through a fast stream.',
      B: 'Good. Check the points of the star before you press - the look-alikes are close.',
      C: 'Hold back a beat: a quick look at the shape beats a fast wrong press.',
      D: 'Watch for the exact star - five points, filled, pointing up - and let everything else pass.'
    }[grade];
    const { node, cleanup } = resultsPanel({
      subtitle: cfg.name + ' round complete',
      grade, score: r.score, verdict, isRecord, prevBest, cfgName: cfg.name, change,
      stats: [
        [r.hitRate + '%', 'Stars caught'],
        [r.falseAlarms, 'False alarms'],
        [typeof r.dprime === 'number' ? r.dprime.toFixed(1) : '—', 'Sensitivity d′'],
        [typeof r.medianRt === 'number' ? r.medianRt + 'ms' : '—', 'Reaction time']
      ],
      note: 'Sensitivity (d′) rewards catching stars without pressing for anything else. Above 3 is sharp; near 0 is guessing.',
      onAgain: () => startCountdown(cfg),
      onSetup: () => showSetup()
    });
    setScreen(node, cleanup);
  }

  if (official) startCountdown(MODES[official.difficulty] || MODES.medium);
  else showSetup();
}
