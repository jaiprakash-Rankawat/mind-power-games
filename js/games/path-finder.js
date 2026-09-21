/* Path Finder - planning and route finding.
   Walk from the start to the flag one square at a time; every step counts, so the
   measure is how well the route is planned before moving. On Hard, mud squares
   cost 2 steps and the best route is the cheapest, not the shortest. A perfect
   route moves the player up a level; an unsolved puzzle moves them down.
   Every puzzle is proven solvable - see ./logic/path-finder-logic.js and its tests. */

import { el } from '../core/util.js';
import { sfx, note } from '../core/audio.js';
import { countUp } from '../core/fx.js';
import { createStage, createMeter } from '../core/arcade.js';
import { createRng } from '../core/rng.js';
import { abilityFor } from '../core/profile.js';
import { track } from '../core/analytics.js';
import {
  createScreens, officialOf, seedFor, setupPanel, countdown, completeRound, resultsPanel, pauseOverlay, gradeFromScore
} from '../core/game-kit.js';
import {
  generatePuzzle, nextLevel, timeLimit, pointsFor, summarize, walkCost, isAdjacent, passable, COST, WALL, MUD, MAX_LEVEL
} from './logic/path-finder-logic.js';

const GAME_ID = 'path-finder';
const ACCENT = '#34d399';
const REVIEW_MS = { perfect: 1300, other: 2400 };
const MOVES = {
  arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1],
  w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1]
};

const MODES = {
  easy: {
    key: 'easy', name: 'Easy', startLevel: 1, weighted: false, puzzles: 8,
    meta: 'Starts on a 5x5 grid with a clear route. 8 puzzles.'
  },
  medium: {
    key: 'medium', name: 'Medium', startLevel: 2, weighted: false, puzzles: 8,
    meta: 'Bigger grids, more walls, more than one way through. 8 puzzles.'
  },
  hard: {
    key: 'hard', name: 'Hard', startLevel: 3, weighted: true, puzzles: 8,
    meta: 'Mud costs 2 steps: find the cheapest route, not the shortest. 8 puzzles.'
  }
};

export function mount(root, ctx) {
  const setScreen = createScreens(root);
  const official = officialOf(ctx);

  /* ------------------------------------------------------------------ setup */

  async function showSetup() {
    const cells = ['S', '.', '#', '.', '.', '#', '.', '.', 'G'];
    const demo = el('div', { class: 'pf-demo', 'aria-hidden': 'true' },
      el('div', { class: 'pf-grid pf-mini', style: { gridTemplateColumns: 'repeat(3, 1fr)' } },
        cells.map((ch) => el('span', {
          class: 'pf-cell' + (ch === '#' ? ' wall' : '') + (ch === 'S' ? ' here start' : '') + (ch === 'G' ? ' goal' : ''),
          text: ch === 'G' ? '⚑' : ''
        }))),
      el('span', { class: 'demo-arrow', text: '-> reach the flag in the fewest steps' }));
    setScreen(await setupPanel({
      gameId: GAME_ID,
      title: 'Path Finder',
      lead: 'Plan a route through a maze of walls, then walk it.',
      demo,
      rules: [
        'Walk from the start to the <b>flag</b> one square at a time - arrow keys, WASD, or click the next square.',
        '<b>Every step counts</b>, including steps back. Look first, then move.',
        'A perfect route takes you up a level: bigger grids, more walls, more than one way through.',
        'Hard adds <b>mud</b>: it costs 2 steps, so the best route is the cheapest one.'
      ],
      modes: MODES,
      bestText: (b) => 'Best ' + b.score + (b.levelReached ? ' - level ' + b.levelReached : ''),
      onPick: startCountdown
    }));
  }

  function startCountdown(cfg) {
    countdown(setScreen, { note: cfg.weighted ? 'Cheapest route to the flag - mud costs 2' : 'Fewest steps to the flag', onGo: () => startGame(cfg) });
  }

  /* ------------------------------------------------------------------- play */

  function startGame(cfg) {
    const rng = createRng(seedFor(ctx));
    const seed = rng.seed;
    const log = [];                             // raw record of every puzzle
    const startedAt = new Date().toISOString();
    const roundStart = performance.now();

    let level = cfg.startLevel;
    let puzzle = null;
    let rows = [];
    let pos = null;
    let path = [];
    let cellEls = [];
    let bumps = 0;
    let kinds = new Set();
    let phase = 'idle';                         // idle | play | review | paused
    let shownAt = 0;
    let usedMs = 0;                             // time on this puzzle before a pause
    let firstMoveMs = null;
    let limit = 0;
    let score = 0;
    let killed = false;
    let pauses = 0;

    const timers = new Set();
    const later = (fn, ms) => {
      const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
      timers.add(t);
    };
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
    const elapsed = () => usedMs + (phase === 'play' ? performance.now() - shownAt : 0);

    /* --- HUD --- */
    const scoreEl = el('b', { text: '0' });
    const puzzleEl = el('b', { text: '0/' + cfg.puzzles });
    const levelEl = el('b', { text: level + '/' + MAX_LEVEL });
    const movesEl = el('b', { text: '0' });
    const hud = el('div', { class: 'hud' },
      el('div', { class: 'box' }, scoreEl, el('span', { text: 'Score' })),
      el('div', { class: 'box' }, puzzleEl, el('span', { text: 'Puzzle' })),
      el('div', { class: 'box hot' }, levelEl, el('span', { text: 'Level' })),
      el('div', { class: 'box' }, movesEl, el('span', { text: cfg.weighted ? 'Cost so far' : 'Steps' })));
    const timerFill = el('div', { class: 'timer-fill' });
    const timerTrack = el('div', { class: 'timer-track' }, timerFill);
    const meter = createMeter('Get ready');

    /* --- board --- */
    const promptEl = el('div', { class: 'prompt' });
    const gridEl = el('div', { class: 'pf-grid', role: 'grid', 'aria-label': 'Maze' });
    const legend = el('div', { class: 'pf-legend', 'aria-hidden': 'true' },
      el('span', {}, el('i', { class: 'pf-cell here start' }), 'You'),
      el('span', {}, el('i', { class: 'pf-cell goal', text: '⚑' }), 'Flag'),
      el('span', {}, el('i', { class: 'pf-cell wall' }), 'Wall'),
      cfg.weighted ? el('span', {}, el('i', { class: 'pf-cell mud', text: '2' }), 'Mud: 2 steps') : null);
    const stage = createStage('pf');
    stage.add(promptEl, el('div', { class: 'arena pf-arena' }, gridEl, legend));
    stage.tint(ACCENT);
    const board = stage.board;
    const hint = el('p', {
      class: 'foot-hint',
      text: 'Arrow keys / WASD or click the next square - Space to pause' + (official ? '' : ' - Esc to quit')
    });
    const wrap = el('div', {}, hud, timerTrack, meter.wrap, board, hint);

    const setPrompt = (html) => { promptEl.innerHTML = html; };
    const basePrompt = () => (cfg.weighted
      ? 'Cheapest route to the flag - <b>mud costs 2</b>'
      : 'Reach the flag in the <b>fewest steps</b>');

    function syncHud(animate) {
      if (animate) countUp(scoreEl, score, 300); else scoreEl.textContent = score;
      puzzleEl.textContent = Math.min(cfg.puzzles, log.length + (phase === 'play' || phase === 'paused' ? 1 : 0)) + '/' + cfg.puzzles;
      levelEl.textContent = level + '/' + MAX_LEVEL;
      movesEl.textContent = puzzle ? String(walkCost(rows, path)) : '0';
      meter.set((log.length / cfg.puzzles) * 100, 'Puzzle ' + Math.min(cfg.puzzles, log.length + 1) + ' of ' + cfg.puzzles);
    }

    function runTimer(ms) {
      timerFill.style.transition = 'none';
      timerFill.style.width = (ms / limit) * 100 + '%';
      void timerFill.offsetWidth;
      timerFill.style.transition = `width ${ms}ms linear`;
      timerFill.style.width = '0%';
    }
    function freezeTimer() {
      const w = getComputedStyle(timerFill).width;
      timerFill.style.transition = 'none';
      timerFill.style.width = w;
    }

    /* --- one puzzle --- */
    function newPuzzle() {
      if (killed) return;
      if (log.length >= cfg.puzzles) { finish(); return; }
      puzzle = generatePuzzle(rng, level, cfg.weighted);
      rows = puzzle.grid;
      pos = puzzle.start.slice();
      path = [pos.slice()];
      bumps = 0;
      kinds = new Set();
      usedMs = 0;
      firstMoveMs = null;
      limit = timeLimit(puzzle);
      render();
      setPrompt(basePrompt());
      phase = 'play';
      shownAt = performance.now();
      runTimer(limit);
      later(() => resolve(false), limit);
      syncHud(false);
    }

    function render() {
      const n = puzzle.size;
      gridEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
      gridEl.style.setProperty('--pf-n', n);
      cellEls = [];
      const nodes = [];
      for (let r = 0; r < n; r++) {
        const row = [];
        for (let c = 0; c < n; c++) {
          const ch = rows[r][c];
          const isGoal = r === puzzle.goal[0] && c === puzzle.goal[1];
          const b = el('button', {
            class: 'pf-cell' + (ch === WALL ? ' wall' : ch === MUD ? ' mud' : '') + (isGoal ? ' goal' : ''),
            type: 'button', tabindex: '-1',
            'aria-label': `Row ${r + 1}, column ${c + 1}: ` + (ch === WALL ? 'wall' : isGoal ? 'flag' : ch === MUD ? 'mud, 2 steps' : 'open'),
            text: isGoal ? '⚑' : ch === MUD ? '2' : ''
          });
          b.addEventListener('click', () => clickCell(r, c));
          row.push(b);
          nodes.push(b);
        }
        cellEls.push(row);
      }
      gridEl.replaceChildren(...nodes);
      paintPosition();
    }

    function paintPosition() {
      cellEls.flat().forEach((c) => c.classList.remove('here'));
      for (const [r, c] of path) cellEls[r][c].classList.add('trail');
      cellEls[pos[0]][pos[1]].classList.add('here');
      if (path.length === 1) cellEls[pos[0]][pos[1]].classList.add('start');
    }

    function bump(r, c) {
      bumps += 1;
      const target = cellEls[r] && cellEls[r][c] ? cellEls[r][c] : cellEls[pos[0]][pos[1]];
      target.classList.remove('bump');
      void target.offsetWidth;
      target.classList.add('bump');
    }

    function step(dr, dc, kind) {
      if (killed || phase !== 'play') return;
      const r = pos[0] + dr;
      const c = pos[1] + dc;
      if (!passable(rows, r, c)) { bump(r, c); return; }
      if (firstMoveMs === null) firstMoveMs = Math.round(elapsed());
      kinds.add(kind);
      pos = [r, c];
      path.push(pos.slice());
      note(Math.min(8, path.length - 1));
      paintPosition();
      syncHud(false);
      if (r === puzzle.goal[0] && c === puzzle.goal[1]) resolve(true);
    }

    function clickCell(r, c) {
      if (phase !== 'play') return;
      if (!isAdjacent(pos, [r, c])) {
        if (r !== pos[0] || c !== pos[1]) setPrompt('One square at a time - click a square next to you');
        return;
      }
      step(r - pos[0], c - pos[1], 'pointer');
    }

    function resolve(solved) {
      if (killed || phase !== 'play') return;
      const timeMs = Math.round(elapsed());
      phase = 'review';
      clearTimers();
      freezeTimer();
      const cost = walkCost(rows, path);
      const optimal = solved && cost === puzzle.optimalCost;
      log.push({
        level: puzzle.level, size: puzzle.size, weighted: puzzle.weighted, grid: puzzle.grid,
        start: puzzle.start, goal: puzzle.goal, optimalCost: puzzle.optimalCost, optimalSteps: puzzle.optimalSteps,
        trap: puzzle.trap, solved, optimal, cost, moves: path.length - 1, path: path.map((p) => p.slice()),
        excess: solved ? cost - puzzle.optimalCost : null, timeMs, planningMs: firstMoveMs, limitMs: limit,
        bumps, input: [...kinds].join('+') || 'none'
      });
      score += pointsFor({ solved, optimal, level, cost, optimalCost: puzzle.optimalCost, timeMs, limitMs: limit });

      // the best route is outlined whenever the player's was not it
      if (!optimal) for (const [r, c] of puzzle.bestPath) cellEls[r][c].classList.add('best');
      const unit = cfg.weighted ? 'cost' : 'steps';
      if (optimal) {
        sfx.correct(Math.min(6, level + 1));
        stage.burstAt(cellEls[pos[0]][pos[1]], ACCENT, 26);
        setPrompt('✓ Perfect route - ' + cost + ' ' + unit);
      } else if (solved) {
        sfx.correct(0);
        setPrompt('Made it - ' + (cost - puzzle.optimalCost) + ' more than the best route (outlined)');
      } else {
        sfx.wrong();
        stage.flashBad();
        setPrompt('Out of time - the best route is outlined');
      }

      const next = nextLevel(level, { solved, optimal });
      if (next > level) stage.say('LEVEL ' + next);
      level = next;
      syncHud(true);
      later(newPuzzle, optimal ? REVIEW_MS.perfect : REVIEW_MS.other);
    }

    /* --- pause: the maze is covered and the clock stops; the puzzle carries on --- */
    let pausedCard = null;

    function pause() {
      if (killed || phase !== 'play') return;
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
      phase = 'play';
      shownAt = performance.now();
      const left = Math.max(0, limit - usedMs);
      runTimer(left);
      later(() => resolve(false), left);
    }

    const onVisibility = () => { if (document.hidden) pause(); };

    const onKey = (e) => {
      if (killed) return;
      if (e.key === 'Escape') {
        if (official || e.repeat) return;
        abandon(); return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (e.repeat) return;
        if (phase === 'paused') resume(); else pause();
        return;
      }
      const m = MOVES[e.key.toLowerCase()];
      if (!m) return;
      e.preventDefault();                                            // arrows never scroll the page
      if (!e.repeat) step(m[0], m[1], 'key');                        // a held key does not keep walking
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
        mode: cfg.key, score, ...summarize(log), startedAt,
        raw: { seed, puzzles: log, pauses, costs: { open: COST['.'], mud: COST[MUD] } }
      };
      completeRound({ ctx, gameId: GAME_ID, cfg, result, showResults: (info) => showResults(cfg, result, info) });
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    setScreen(wrap, cleanup);
    stage.ready();
    syncHud(false);
    later(newPuzzle, 300);
  }

  /* ---------------------------------------------------------------- results */

  function showResults(cfg, r, { isRecord, prevBest, change }) {
    const ability = abilityFor(GAME_ID);
    const grade = gradeFromScore(ability ? ability.score(r) : null);
    const verdict = {
      S: 'Excellent planning - best routes on the biggest mazes.',
      A: 'Strong planning: mostly best routes as the mazes grew.',
      B: 'Good. Trace the route with your eyes all the way to the flag before the first step.',
      C: 'Before moving, look backwards from the flag - dead ends are easier to spot from that side.',
      D: 'Take a moment first: find a route that reaches the flag, then check whether a shorter one exists.'
    }[grade];
    const { node, cleanup } = resultsPanel({
      subtitle: cfg.name + ' round complete',
      grade, score: r.score, verdict, isRecord, prevBest, cfgName: cfg.name, change,
      stats: [
        [r.completed + '/' + r.total, 'Solved'],
        [r.correct + '/' + r.total, 'Best routes'],
        [r.efficiency + '%', 'Route efficiency'],
        [r.levelEstimate ?? '—', 'Level held']
      ],
      note: 'Route efficiency compares your routes with the best possible ones - 100% means you always found the best.',
      onAgain: () => startCountdown(cfg),
      onSetup: () => showSetup()
    });
    setScreen(node, cleanup);
  }

  if (official) startCountdown(MODES[official.difficulty] || MODES.medium);
  else showSetup();
}
