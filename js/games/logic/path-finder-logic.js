/* Path Finder - pure logic (no DOM), unit-tested in tests/games.test.mjs.

   A grid with walls, a start and a goal. The player walks from start to goal one
   square at a time, and every step counts - so the measure is planning: finding
   the best route before committing to it. On Hard some squares are mud and cost
   2 steps, so the best route is the cheapest one, not simply the shortest.

   Every puzzle is solvable by construction: a random layout is only accepted
   after a shortest-path search confirms a route, and if no acceptable layout
   turns up within a fixed number of tries, a route is carved first and walls are
   placed around it. Generation is bounded, so it can never hang the page. */

import { mean, median, round } from '../../core/stats.js';

export const OPEN = '.';
export const WALL = '#';
export const MUD = '~';
export const COST = { [OPEN]: 1, [MUD]: 2 };

/** Difficulty ladder: the grid grows and fills up. */
export const LEVELS = [
  { size: 5, walls: 0.2, minSteps: 5, alternatives: false },
  { size: 6, walls: 0.25, minSteps: 7, alternatives: false },
  { size: 7, walls: 0.24, minSteps: 8, alternatives: true },
  { size: 8, walls: 0.25, minSteps: 10, alternatives: true },
  { size: 9, walls: 0.25, minSteps: 12, alternatives: true },
  { size: 10, walls: 0.26, minSteps: 13, alternatives: true }
];
export const MAX_LEVEL = LEVELS.length;
export const MUD_SHARE = 0.18;               // of open squares, on weighted (Hard) puzzles
const TRIES = 400;

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const key = (r, c) => r + ',' + c;
export const inside = (size, r, c) => r >= 0 && c >= 0 && r < size && c < size;
export const passable = (grid, r, c) => inside(grid.length, r, c) && grid[r][c] !== WALL;
export const isAdjacent = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

/** Cost of stepping onto a square. */
export const stepCost = (grid, r, c) => COST[grid[r][c]] ?? 1;

/**
 * Cheapest route (Dijkstra; with no mud this is also the fewest steps).
 * Returns { cost, steps, path: [[r, c], ...] } or null when the goal is unreachable.
 * `blocked` optionally marks extra squares as walls.
 */
export function cheapestRoute(grid, start, goal, blocked = null) {
  // Dijkstra with a bucket queue: step costs are only 1 or 2, so distances are
  // small integers and each bucket is simply "everything at that distance".
  const size = grid.length;
  const idx = (r, c) => r * size + c;
  const dist = new Int32Array(size * size).fill(-1);
  const prev = new Int32Array(size * size).fill(-1);
  const done = new Uint8Array(size * size);
  const goalIdx = idx(goal[0], goal[1]);
  const buckets = [[idx(start[0], start[1])]];
  dist[buckets[0][0]] = 0;
  for (let d = 0; d < buckets.length; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (let b = 0; b < bucket.length; b++) {
      const cur = bucket[b];
      if (done[cur] || dist[cur] !== d) continue;
      done[cur] = 1;
      if (cur === goalIdx) {
        const path = [];
        for (let p = cur; p !== -1; p = prev[p]) path.unshift([Math.floor(p / size), p % size]);
        return { cost: d, steps: path.length - 1, path };
      }
      const r = Math.floor(cur / size);
      const c = cur % size;
      for (const [dr, dc] of STEPS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inside(size, nr, nc) || grid[nr][nc] === WALL || (blocked && blocked.has(key(nr, nc)))) continue;
        const next = idx(nr, nc);
        const nd = d + stepCost(grid, nr, nc);
        if (dist[next] === -1 || nd < dist[next]) {
          dist[next] = nd;
          prev[next] = cur;
          (buckets[nd] || (buckets[nd] = [])).push(next);
        }
      }
    }
  }
  return null;
}

/** Fewest steps, ignoring mud - used to check that the obvious route is a trap. */
export function shortestRoute(grid, start, goal) {
  const flat = grid.map((row) => row.map((ch) => (ch === MUD ? OPEN : ch)));
  const r = cheapestRoute(flat, start, goal);
  if (!r) return null;
  return { ...r, cost: r.path.slice(1).reduce((s, [a, b]) => s + stepCost(grid, a, b), 0) };
}

/** Is there a second route that shares no square with the best one (apart from start and goal)? */
export function hasAlternative(grid, start, goal, best) {
  const blocked = new Set(best.path.slice(1, -1).map((p) => key(...p)));
  return cheapestRoute(grid, start, goal, blocked) !== null;
}

function endpoints(rng, size) {
  const start = [rng.int(size), 0];
  const goal = [rng.int(size), size - 1];
  return { start, goal };
}

/** Last resort: carve a wandering route, then add walls only off it. Always solvable. */
function carved(rng, { size, walls }, weighted) {
  const { start, goal } = endpoints(rng, size);
  const route = new Set([key(...start)]);
  let [r, c] = start;
  for (let n = 0; c < size - 1; n++) {
    const move = n > 4 * size ? 2 : rng.int(3);   // wanders a little, then heads straight on
    if (move === 0 && r > 0) r -= 1;
    else if (move === 1 && r < size - 1) r += 1;
    else c += 1;
    route.add(key(r, c));
  }
  while (r !== goal[0]) { r += Math.sign(goal[0] - r); route.add(key(r, c)); }
  const grid = Array.from({ length: size }, (_, rr) => Array.from({ length: size }, (_, cc) =>
    (!route.has(key(rr, cc)) && rng.chance(walls) ? WALL : OPEN)));
  if (weighted) sprinkleMud(rng, grid, start, goal);
  return { grid, start, goal };
}

function sprinkleMud(rng, grid, start, goal) {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid.length; c++) {
      if (grid[r][c] !== OPEN || (r === start[0] && c === start[1]) || (r === goal[0] && c === goal[1])) continue;
      if (rng.chance(MUD_SHARE)) grid[r][c] = MUD;
    }
  }
}

/**
 * A puzzle for `level`, fixed by the rng. Accepted layouts are solvable, need at
 * least `minSteps` steps, offer a second route when the level asks for one, and -
 * on weighted puzzles, whenever possible - make the fewest-steps route cost more
 * than the cheapest route, so reading the mud matters.
 */
export function generatePuzzle(rng, level, weighted = false) {
  const spec = LEVELS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1];
  const { size, walls, minSteps, alternatives } = spec;
  let fallbackCandidate = null;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const { start, goal } = endpoints(rng, size);
    const grid = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) =>
      ((r === start[0] && c === start[1]) || (r === goal[0] && c === goal[1]) || !rng.chance(walls) ? OPEN : WALL)));
    if (weighted) sprinkleMud(rng, grid, start, goal);
    const best = cheapestRoute(grid, start, goal);
    if (!best || best.steps < minSteps) continue;
    if (alternatives && !hasAlternative(grid, start, goal, best)) continue;
    const puzzle = finish(grid, start, goal, best, weighted, level, 'search');
    if (!weighted || puzzle.trap) return puzzle;
    // a weighted layout without a trap is fine, but keep looking for one a while longer
    if (!fallbackCandidate) fallbackCandidate = puzzle;
    if (attempt > TRIES / 2) return fallbackCandidate;
  }
  if (fallbackCandidate) return fallbackCandidate;
  return carvedPuzzle(rng, level, weighted);
}

/** The guaranteed fallback, exported so the tests can prove it is always solvable. */
export function carvedPuzzle(rng, level, weighted = false, spec = LEVELS[Math.max(1, Math.min(MAX_LEVEL, level)) - 1]) {
  const c = carved(rng, spec, weighted);
  return finish(c.grid, c.start, c.goal, cheapestRoute(c.grid, c.start, c.goal), weighted, level, 'carved');
}

function finish(grid, start, goal, best, weighted, level, how) {
  const short = weighted ? shortestRoute(grid, start, goal) : best;
  return {
    level,
    size: grid.length,
    weighted,
    grid: grid.map((row) => row.join('')),
    start,
    goal,
    optimalCost: best.cost,
    optimalSteps: best.steps,
    bestPath: best.path,
    trap: weighted && short.cost > best.cost,        // the most direct route is not the cheapest
    how
  };
}

/** Route cost of a walked path (every step onto a square pays that square's cost). */
export const walkCost = (rows, path) => path.slice(1).reduce((s, [r, c]) => s + (COST[rows[r][c]] ?? 1), 0);

/** Staircase: a perfect route climbs, an unsolved puzzle drops, anything else holds. */
export function nextLevel(level, { solved, optimal }) {
  if (solved && optimal) return Math.min(MAX_LEVEL, level + 1);
  if (!solved) return Math.max(1, level - 1);
  return level;
}

export const timeLimit = (puzzle) => 15000 + 1500 * puzzle.optimalSteps;

export function pointsFor({ solved, optimal, level, cost, optimalCost, timeMs, limitMs }) {
  if (!solved) return 0;
  const excess = cost - optimalCost;
  const route = optimal ? 150 : Math.max(0, 100 - 25 * excess);
  const speed = Math.max(0, Math.round((limitMs - timeMs) / 200));
  return 100 * level + route + speed;
}

/** puzzles: { level, weighted, solved, optimal, cost, optimalCost, moves, optimalSteps, timeMs, planningMs }. */
export function summarize(puzzles) {
  const solved = puzzles.filter((p) => p.solved);
  const optimal = puzzles.filter((p) => p.optimal);
  const settled = puzzles.slice(Math.floor(puzzles.length / 2));
  return {
    correct: optimal.length,
    completed: solved.length,
    total: puzzles.length,
    accuracy: puzzles.length ? Math.round((optimal.length / puzzles.length) * 100) : 0,
    completionRate: puzzles.length ? Math.round((solved.length / puzzles.length) * 100) : 0,
    efficiency: solved.length ? Math.round(mean(solved.map((p) => p.optimalCost / p.cost)) * 100) : 0,
    excessMean: solved.length ? round(mean(solved.map((p) => p.cost - p.optimalCost)), 1) : null,
    moves: puzzles.reduce((s, p) => s + p.moves, 0),
    optimalMoves: puzzles.reduce((s, p) => s + p.optimalSteps, 0),
    medianTimeMs: round(median(solved.map((p) => p.timeMs))),
    medianPlanningMs: round(median(puzzles.filter((p) => typeof p.planningMs === 'number').map((p) => p.planningMs))),
    levelReached: puzzles.length ? Math.max(...puzzles.map((p) => p.level)) : 0,
    levelEstimate: settled.length ? round(mean(settled.map((p) => p.level)), 1) : null,
    weighted: puzzles.some((p) => p.weighted),
    hintsUsed: 0                                    // there are no hints in this game
  };
}
