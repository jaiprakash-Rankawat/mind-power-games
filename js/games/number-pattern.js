/* Number Pattern - fluid reasoning.
   Six numbers follow a rule; pick the seventh. Difficulty adapts (two right in a
   row: harder rule family; one wrong: easier), so the level the player settles at
   is the measurement. Item generation guarantees exactly one defensible answer -
   see ./logic/number-pattern-logic.js and its tests. */

import { el } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter } from '../core/arcade.js';
import { createRng } from '../core/rng.js';
import { abilityFor } from '../core/profile.js';
import {
  createScreens, officialOf, seedFor, setupPanel, countdown, completeRound, resultsPanel, pauseOverlay, gradeFromScore
} from '../core/game-kit.js';
import { generateItem, nextLevel, summarize, LEVELS } from './logic/number-pattern-logic.js';

const GAME_ID = 'number-pattern';
const ACCENT = '#fbbf24';
const REVEAL_MS = 1100;

const MODES = {
  easy: { key: 'easy', name: 'Easy', startLevel: 1, items: 10, limit: 30000, meta: 'Starts with simple steps. 10 patterns, 30s each.' },
  medium: { key: 'medium', name: 'Medium', startLevel: 2, items: 12, limit: 25000, meta: 'Starts a step up. 12 patterns, 25s each.' },
  hard: { key: 'hard', name: 'Hard', startLevel: 3, items: 14, limit: 20000, meta: 'Starts with mixed rules. 14 patterns, 20s each.' }
};

export function mount(root, ctx) {
  const setScreen = createScreens(root);
  const official = officialOf(ctx);

  /* ------------------------------------------------------------------ setup */

  async function showSetup() {
    const demo = el('div', { class: 'np-demo', 'aria-hidden': 'true' },
      ['2', '4', '8', '16', '?'].map((v) => el('span', { class: 'np-mini' + (v === '?' ? ' q' : ''), text: v })),
      el('span', { class: 'demo-arrow', text: '-> 32' }));
    setScreen(await setupPanel({
      gameId: GAME_ID,
      title: 'Number Pattern',
      lead: 'Spot the rule behind a row of numbers, then pick what comes next.',
      demo,
      rules: [
        'Six numbers follow one rule. Pick the <b>next</b> number from four options (keys <b>1-4</b>, or tap).',
        'Rules include adding, multiplying, growing steps, two patterns taking turns, and adding the previous two.',
        'Get two right in a row and the rules get harder; miss one and they ease off.',
        'Every pattern has exactly <b>one</b> answer that fits.'
      ],
      modes: MODES,
      bestText: (b) => 'Best ' + b.score + (b.levelReached ? ' - level ' + b.levelReached : ''),
      onPick: startCountdown
    }));
  }

  function startCountdown(cfg) {
    countdown(setScreen, { note: 'Find the rule, pick the next number', onGo: () => startGame(cfg) });
  }

  /* ------------------------------------------------------------------- play */

  function startGame(cfg) {
    const rng = createRng(seedFor(ctx));
    const seed = rng.seed;
    const items = [];                          // raw record of every pattern shown
    const startedAt = new Date().toISOString();

    let level = cfg.startLevel;
    let streak = 0;
    let current = null;
    let phase = 'idle';                        // idle | go | done | paused
    let shownAt = 0;
    let usedMs = 0;                            // time spent on this item before a pause
    let score = 0;
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
    const itemEl = el('b', { text: '0/' + cfg.items });
    const levelEl = el('b', { text: String(level) });
    const rightEl = el('b', { text: '0' });
    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box' }, itemEl, el('span', { text: 'Pattern' })),
      el('div', { class: 'box hot' }, levelEl, el('span', { text: 'Level' })),
      el('div', { class: 'box' }, rightEl, el('span', { text: 'Correct' })));
    const timerFill = el('div', { class: 'timer-fill' });
    const timerTrack = el('div', { class: 'timer-track' }, timerFill);
    const meter = createMeter('Get ready');

    const promptEl = el('div', { class: 'prompt', text: 'What comes next?' });
    const row = el('div', { class: 'np-row' });
    const optWrap = el('div', { class: 'np-options' });
    const stage = createStage('np');
    stage.add(promptEl, el('div', { class: 'arena np-arena' }, row, optWrap));
    stage.tint(ACCENT);
    const board = stage.board;
    const hint = el('p', { class: 'foot-hint', text: 'Keys 1-4 or tap - Space to pause' + (official ? '' : ' - Esc to quit') });
    const wrap = el('div', {}, hud, timerTrack, meter.wrap, board, hint);

    function syncHud(animate) {
      if (animate) countUp(scoreEl, score, 300); else scoreEl.textContent = score;
      itemEl.textContent = items.length + (phase === 'go' ? 1 : 0) + '/' + cfg.items;
      levelEl.textContent = String(level);
      rightEl.textContent = String(items.filter((i) => i.correct).length);
      meter.set((items.length / cfg.items) * 100, 'Pattern ' + Math.min(cfg.items, items.length + 1) + ' of ' + cfg.items);
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

    /* --- items --- */
    function next() {
      if (killed) return;
      if (items.length >= cfg.items) { finish(); return; }
      current = generateItem(rng, level);
      usedMs = 0;
      render();
      go();
    }

    function render() {
      row.replaceChildren(
        ...current.terms.map((v) => el('span', { class: 'np-num', text: String(v) })),
        el('span', { class: 'np-num q', text: '?' }));
      optWrap.replaceChildren(...current.options.map((v, i) => {
        const b = el('button', { class: 'np-opt', type: 'button', 'aria-label': 'Option ' + (i + 1) + ': ' + v },
          el('span', { class: 'np-key', text: String(i + 1) }), el('span', { class: 'np-val', text: String(v) }));
        b.addEventListener('click', () => answer(i, 'pointer'));
        return b;
      }));
    }

    function go() {
      phase = 'go';
      shownAt = performance.now();
      runTimer(cfg.limit - usedMs);
      later(() => answer(null, 'none'), cfg.limit - usedMs);
      syncHud(false);
    }

    function answer(i, input) {
      if (killed || phase !== 'go') return;
      phase = 'done';
      clearTimers();
      freezeTimer();
      const rt = i === null ? null : Math.round(usedMs + performance.now() - shownAt);
      const response = i === null ? null : current.options[i];
      const correct = response === current.answer;
      items.push({ ...current, response, correct, rt, input });

      const buttons = [...optWrap.children];
      const rightIdx = current.options.indexOf(current.answer);
      buttons.forEach((b) => { b.disabled = true; });
      buttons[rightIdx].classList.add('right');
      row.lastChild.textContent = String(current.answer);
      row.lastChild.classList.add(correct ? 'right' : 'reveal');

      if (correct) {
        score += 100 * level + Math.max(0, Math.round(((cfg.limit - rt) / cfg.limit) * 50));
        sfx.correct(level);
        stage.burstAt(buttons[rightIdx], ACCENT, 18);
      } else {
        if (i !== null) buttons[i].classList.add('wrong');
        sfx.wrong();
        stage.flashBad();
        promptEl.textContent = i === null ? 'Out of time' : 'Not quite';
      }

      const step = nextLevel(level, streak, correct);
      if (step.level > level) stage.say('LEVEL ' + step.level);
      level = step.level;
      streak = step.streak;
      syncHud(true);
      later(() => { promptEl.textContent = 'What comes next?'; next(); }, REVEAL_MS);
    }

    /* --- pause: the pattern is hidden and its clock stops --- */
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
      if (e.key === 'Escape') {
        if (official) return;
        cleanup(); showSetup(); return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'paused') resume(); else pause();
        return;
      }
      const n = Number(e.key);
      if (phase === 'go' && Number.isInteger(n) && n >= 1 && n <= 4) { e.preventDefault(); answer(n - 1, 'key'); }
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
      const result = { mode: cfg.key, score, ...summarize(items), maxLevel: LEVELS, startedAt, raw: { seed, items, pauses } };
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
      S: 'You were solving the hardest rule families.',
      A: 'Strong reasoning - you handled mixed and growing rules.',
      B: 'Solid. Try checking the differences between numbers, then the differences of those.',
      C: 'Look for how the gap between numbers changes - that is where most rules hide.',
      D: 'Start with the gaps between neighbouring numbers; the rule usually shows up there.'
    }[grade];
    const { node, cleanup } = resultsPanel({
      subtitle: cfg.name + ' round complete',
      grade, score: r.score, verdict, isRecord, prevBest, cfgName: cfg.name, change,
      stats: [
        [r.levelEstimate ?? '—', 'Level held'],
        [r.levelReached + ' / ' + r.maxLevel, 'Top level'],
        [r.correct + '/' + r.total, 'Correct'],
        [typeof r.avgRt === 'number' ? (r.avgRt / 1000).toFixed(1) + 's' : '—', 'Avg time']
      ],
      note: '"Level held" is where the difficulty settled in the second half of the round.',
      onAgain: () => startCountdown(cfg),
      onSetup: () => showSetup()
    });
    setScreen(node, cleanup);
  }

  if (official) startCountdown(MODES[official.difficulty] || MODES.medium);
  else showSetup();
}
